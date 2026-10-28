"""
Worksheet Slicer — converts uploaded worksheets into individually cropped
question images using Gemini vision with structured outputs.

Mount this router in main.py:
    from slicer import router as slicer_router
    app.include_router(slicer_router, prefix="/slice-worksheet")
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import tempfile
from typing import Optional

import fitz  # PyMuPDF
import ffmpeg
from docx import Document as DocxDocument
from fastapi import APIRouter, File, HTTPException, UploadFile
from google import genai
from google.genai import types as genai_types
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class DetectedQuestion(BaseModel):
    """A single question detected on the worksheet page."""

    question_number: int
    question_summary: str
    box_2d: list[int] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="[ymin, xmin, ymax, xmax] on a 0-1000 scale",
    )


class SliceResponse(BaseModel):
    """Structured output returned by Gemini."""

    questions: list[DetectedQuestion]


class SlicedQuestion(BaseModel):
    """One cropped question sent back to the caller."""

    question_number: int
    question_summary: str
    image_base64: str  # base64-encoded PNG


# ---------------------------------------------------------------------------
# File → PIL images
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".webm",
}


def _ext(filename: str) -> str:
    return os.path.splitext(filename.lower())[-1]


def _pdf_to_images(file_bytes: bytes) -> list[Image.Image]:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    images: list[Image.Image] = []
    mat = fitz.Matrix(2, 2)  # 2× DPI for high-res rendering
    for page in doc:
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        images.append(img)
    doc.close()
    return images


def _docx_to_images(file_bytes: bytes) -> list[Image.Image]:
    doc = DocxDocument(io.BytesIO(file_bytes))
    images: list[Image.Image] = []
    for rel in doc.part.rels.values():
        if "image" in (rel.reltype or ""):
            blob = rel.target_part.blob
            try:
                img = Image.open(io.BytesIO(blob)).convert("RGB")
                images.append(img)
            except Exception:
                logger.warning("Skipping unreadable embedded image in DOCX")
    if not images:
        raise HTTPException(
            status_code=400,
            detail="The DOCX file contains no embedded images to slice.",
        )
    return images


def _image_to_images(file_bytes: bytes) -> list[Image.Image]:
    img = Image.open(io.BytesIO(file_bytes))
    img = ImageOps.exif_transpose(img)
    return [img.convert("RGB")]


def _webm_to_images(file_bytes: bytes) -> list[Image.Image]:
    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        # Probe duration and seek to middle for the sharpest frame
        probe = ffmpeg.probe(tmp_path)
        video_stream = next(
            (s for s in probe["streams"] if s["codec_type"] == "video"), None
        )
        duration = (
            float(video_stream["duration"])
            if video_stream and "duration" in video_stream
            else 0
        )
        seek_time = duration / 2 if duration > 0 else 0

        out_bytes, _ = (
            ffmpeg.input(tmp_path, ss=seek_time)
            .output("pipe:", vframes=1, format="image2", vcodec="png")
            .run(capture_stdout=True, capture_stderr=True)
        )
        img = Image.open(io.BytesIO(out_bytes)).convert("RGB")
        return [img]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to extract frame from .webm: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Could not extract a frame from the uploaded video.",
        ) from exc
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def file_to_images(file_bytes: bytes, filename: str) -> list[Image.Image]:
    """Convert any supported upload into a list of RGB PIL images."""
    ext = _ext(filename)
    if ext == ".pdf":
        return _pdf_to_images(file_bytes)
    if ext == ".docx":
        return _docx_to_images(file_bytes)
    if ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return _image_to_images(file_bytes)
    if ext == ".webm":
        return _webm_to_images(file_bytes)
    raise HTTPException(
        status_code=400,
        detail=(
            f"Unsupported file type: {ext}. "
            f"Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        ),
    )


# ---------------------------------------------------------------------------
# Gemini vision — detect questions with bounding boxes
# ---------------------------------------------------------------------------

DETECTION_PROMPT = (
    "You are analyzing a photograph or scan of a math worksheet page. "
    "Detect every distinct math question visible on this page. "
    "For each question, return:\n"
    "  • question_number — sequential integer starting from the provided offset\n"
    "  • question_summary — a concise one-sentence description of what the "
    "question asks\n"
    "  • box_2d — [ymin, xmin, ymax, xmax] coordinates on a 0–1000 scale "
    "representing the bounding box that encloses the entire question, including "
    "any diagrams, figures, tables, graphs, or sub-parts that belong to it.\n\n"
    "Be precise with bounding boxes — include ALL visual content belonging to "
    "each question but minimize overlap between adjacent questions. "
    "If there is only a single question on the page, return its bounding box "
    "covering the entire question area."
)


def _pil_to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _build_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured on the AI engine.",
        )
    return genai.Client(api_key=api_key)


async def detect_questions(
    page_image: Image.Image,
    question_offset: int = 1,
) -> list[DetectedQuestion]:
    """Call Gemini vision to detect math questions with bounding boxes."""
    client = _build_genai_client()
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    img_bytes = _pil_to_png_bytes(page_image)

    image_part = genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png")
    prompt_with_offset = (
        f"{DETECTION_PROMPT}\n\nStart question_number from {question_offset}."
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=[image_part, prompt_with_offset],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SliceResponse,
            ),
        )
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="The AI model could not process this worksheet page.",
        ) from exc

    # Parse the structured JSON response
    try:
        parsed = SliceResponse.model_validate_json(response.text)
    except Exception:
        try:
            data = json.loads(response.text)
            parsed = SliceResponse.model_validate(data)
        except Exception as exc:
            logger.error(
                "Failed to parse Gemini response: %s", response.text[:500]
            )
            raise HTTPException(
                status_code=502,
                detail="The AI model returned an unparseable response.",
            ) from exc

    return parsed.questions


# ---------------------------------------------------------------------------
# Crop helper
# ---------------------------------------------------------------------------


def crop_question(
    page_image: Image.Image,
    box: list[int],
    padding_pct: float = 0.15,
) -> bytes:
    """Crop a bounding box from the page image and return PNG bytes.

    ``box`` is [ymin, xmin, ymax, xmax] on a 0–1000 scale.
    Applies ``padding_pct`` expansion on each edge, clamped to image bounds.
    """
    w, h = page_image.size
    ymin, xmin, ymax, xmax = box

    # Convert from 0-1000 scale to pixel coordinates
    x0 = int(xmin / 1000 * w)
    y0 = int(ymin / 1000 * h)
    x1 = int(xmax / 1000 * w)
    y1 = int(ymax / 1000 * h)

    # Apply padding buffer
    pad_x = int((x1 - x0) * padding_pct)
    pad_y = int((y1 - y0) * padding_pct)
    x0 = max(0, x0 - pad_x)
    y0 = max(0, y0 - pad_y)
    x1 = min(w, x1 + pad_x)
    y1 = min(h, y1 + pad_y)

    cropped = page_image.crop((x0, y0, x1, y1))
    return _pil_to_png_bytes(cropped)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/")
async def slice_worksheet(file: UploadFile = File(...)):
    """Accept a worksheet file, detect questions via Gemini vision, crop each
    one, and return base64-encoded PNGs with metadata."""

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = _ext(file.filename)
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: {ext}. "
                f"Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            ),
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail="The file exceeds the 25 MB limit."
        )

    # 1. Convert file to page images
    try:
        page_images = file_to_images(file_bytes, file.filename)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("file_to_images failed: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Could not read the uploaded file. It may be corrupted.",
        ) from exc

    if not page_images:
        raise HTTPException(
            status_code=400, detail="No pages or images found in the file."
        )

    # 2. Detect questions on each page with global numbering
    all_sliced: list[SlicedQuestion] = []
    question_offset = 1

    for page_idx, page_img in enumerate(page_images):
        logger.info(
            "Processing page %d/%d (%dx%d)",
            page_idx + 1,
            len(page_images),
            page_img.width,
            page_img.height,
        )

        detected = await detect_questions(page_img, question_offset=question_offset)

        if not detected:
            logger.warning("No questions detected on page %d", page_idx + 1)
            continue

        for q in detected:
            # Validate box_2d bounds
            if len(q.box_2d) != 4 or any(
                v < 0 or v > 1000 for v in q.box_2d
            ):
                logger.warning(
                    "Skipping question %d with invalid box_2d: %s",
                    q.question_number,
                    q.box_2d,
                )
                continue

            # 3. Crop the question region
            try:
                png_bytes = crop_question(page_img, q.box_2d)
            except Exception as exc:
                logger.error(
                    "Cropping failed for Q%d: %s", q.question_number, exc
                )
                continue

            all_sliced.append(
                SlicedQuestion(
                    question_number=q.question_number,
                    question_summary=q.question_summary,
                    image_base64=base64.b64encode(png_bytes).decode("ascii"),
                )
            )

        # Advance offset for next page
        if detected:
            question_offset = max(q.question_number for q in detected) + 1

    if not all_sliced:
        raise HTTPException(
            status_code=422,
            detail="The AI could not detect any questions in this worksheet.",
        )

    return {"questions": [q.model_dump() for q in all_sliced]}
