import asyncio
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from slicer import router as slicer_router
from solver import TutorSolutionResponse, solve_math_problem
from prisma_stt import PrismaSTTStreamSession
from laya_gatekeeper import evaluate_utterance
from timbre_tts import synthesize_speech_base64

load_dotenv()
logger = logging.getLogger(__name__)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CLIENT_ORIGINS", "http://localhost:5173,http://localhost:5000"
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="Math Homework Notebook AI Engine", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount worksheet slicer router
app.include_router(slicer_router, prefix="/slice-worksheet")


# ---------------------------------------------------------------------------
# HTTP Health & Direct Solve Endpoint
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-engine", "version": "0.2.0"}


class HttpSolveRequest(BaseModel):
    action: str = Field(default="solve")
    query: str = Field(default="")
    cropped_target_base64: str = Field(default="")
    full_page_base64: str = Field(default="")
    preferred_language: str = Field(default="en-IN")


@app.post("/solve", response_model=TutorSolutionResponse)
async def http_solve(request: HttpSolveRequest):
    """Direct HTTP POST fallback for math solving and verification."""
    try:
        solution = await solve_math_problem(
            action=request.action,
            query=request.query,
            cropped_target_base64=request.cropped_target_base64,
            full_page_base64=request.full_page_base64,
            preferred_language=request.preferred_language,
        )
        return solution
    except Exception as exc:
        logger.error("HTTP /solve failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Streaming WebSocket Tutor
# ---------------------------------------------------------------------------


@app.websocket("/ws/tutor")
async def tutor_socket(websocket: WebSocket):
    # Origin validation for WebSocket connection security
    origin = websocket.headers.get("origin")
    if origin and origin.rstrip("/") not in {item.rstrip("/") for item in allowed_origins}:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()
    await websocket.send_json({"type": "ready", "service": "ai-engine", "status": "connected"})

    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                continue

            msg_type = message.get("type", "solve_request")
            req_id = message.get("requestId")

            # Handle heartbeat/ping
            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "requestId": req_id})
                continue

            # Handle math tutor request
            action = message.get("action", "solve")
            query = message.get("query", "")
            page_id = message.get("pageId", "page_1")
            notebook_id = message.get("notebookId", "")
            preferred_language = message.get("preferredLanguage", "en-IN")
            cropped_b64 = message.get("croppedTargetBase64", "")
            full_page_b64 = message.get("fullPageBase64", "")

            # 1. Notify analyzing status
            await websocket.send_json({
                "type": "status",
                "requestId": req_id,
                "status": "analyzing",
                "message": "Claire is reading the handwritten math problem...",
            })

            # Define asynchronous status callback
            def on_status_update(status_key: str, status_msg: str):
                asyncio.create_task(
                    websocket.send_json({
                        "type": "status",
                        "requestId": req_id,
                        "status": status_key,
                        "message": status_msg,
                    })
                )

            try:
                # 2. Execute System 2 Math Reasoning with Gemini + SymPy
                solution = await solve_math_problem(
                    action=action,
                    query=query,
                    cropped_target_base64=cropped_b64,
                    full_page_base64=full_page_b64,
                    preferred_language=preferred_language,
                    on_status=on_status_update,
                )

                # 3. Stream problem statement and mistake detection
                await websocket.send_json({
                    "type": "problem_detected",
                    "requestId": req_id,
                    "pageId": page_id,
                    "notebookId": notebook_id,
                    "detected_problem_latex": solution.detected_problem_latex,
                    "student_mistake_note": solution.student_mistake_note,
                })

                # 4. Stream each individual solution step with Timbre TTS audio
                for step in solution.steps:
                    step_dict = step.model_dump()
                    try:
                        tts_b64 = await synthesize_speech_base64(
                            text=step.tts_speech,
                            language=preferred_language,
                            voice="Nalini",
                        )
                        step_dict["tts_audio_base64"] = tts_b64
                    except Exception as tts_err:
                        logger.warning("Timbre TTS synthesis failed for step %s: %s", step.step_number, tts_err)
                        step_dict["tts_audio_base64"] = None

                    await websocket.send_json({
                        "type": "step",
                        "requestId": req_id,
                        "pageId": page_id,
                        "notebookId": notebook_id,
                        "step": step_dict,
                    })
                    # Brief breath between steps so Ghost Pen and client can render
                    await asyncio.sleep(0.04)

                # 5. Emit complete payload
                await websocket.send_json({
                    "type": "complete",
                    "requestId": req_id,
                    "pageId": page_id,
                    "notebookId": notebook_id,
                    "solution": solution.model_dump(),
                })

            except Exception as exc:
                logger.error("Error solving math problem over WebSocket: %s", exc, exc_info=True)
                await websocket.send_json({
                    "type": "error",
                    "requestId": req_id,
                    "pageId": page_id,
                    "error": f"Claire could not solve this step: {str(exc)}",
                })

    except WebSocketDisconnect:
        logger.info("Tutor WebSocket disconnected normally.")
    except Exception as exc:
        logger.error("Unexpected WebSocket error: %s", exc)


# ---------------------------------------------------------------------------
# Hands-Free Voice & System 1 Gatekeeper WebSocket (/ws/voice)
# ---------------------------------------------------------------------------


@app.websocket("/ws/voice")
async def voice_socket(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if origin and origin.rstrip("/") not in {item.rstrip("/") for item in allowed_origins}:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()

    # Track student and tutor states sent from React
    voice_state = {
        "language": "en-IN",
        "is_student_writing": False,
        "is_tutor_explaining": False,
    }

    # Queue for delivering transcripts from Gnani Prisma
    transcript_queue: asyncio.Queue[tuple[str, bool]] = asyncio.Queue()

    async def on_transcript(transcript: str, is_final: bool):
        await transcript_queue.put((transcript, is_final))

    stt_session = PrismaSTTStreamSession(
        language=voice_state["language"],
        on_transcript_callback=on_transcript,
    )

    await websocket.send_json({
        "type": "ready",
        "service": "ai-engine",
        "component": "voice-gatekeeper",
        "status": "connected",
    })

    # Background task forwarding STT transcripts & evaluating gatekeeper
    async def process_transcripts():
        try:
            while True:
                transcript, is_final = await transcript_queue.get()
                if not transcript:
                    continue

                # Forward live interim/final transcript to browser
                await websocket.send_json({
                    "type": "transcript",
                    "text": transcript,
                    "is_final": is_final,
                })

                # If final segment, evaluate with TypeSafe Jev System 1 Gatekeeper
                if is_final and len(transcript.strip()) > 0:
                    decision = await evaluate_utterance(
                        transcript=transcript,
                        is_pen_moving=voice_state["is_student_writing"],
                        is_ai_speaking=voice_state["is_tutor_explaining"],
                    )

                    logger.info(
                        "Gatekeeper decision: action=%s, mode=%s, conf=%.2f, reason=%s",
                        decision.action,
                        decision.mode,
                        decision.confidence,
                        decision.reason,
                    )

                    await websocket.send_json({
                        "type": "gatekeeper_decision",
                        "decision": decision.action,
                        "mode": decision.mode,
                        "confidence": decision.confidence,
                        "reason": decision.reason,
                        "transcript": transcript,
                    })
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Error in voice transcript processor: %s", exc)

    transcript_task = asyncio.create_task(process_transcripts())

    try:
        while True:
            # Receive either binary PCM audio bytes or JSON metadata
            raw_message = await websocket.receive()

            if "bytes" in raw_message and raw_message["bytes"]:
                # Stream 16kHz PCM audio chunk to Gnani Prisma STT
                await stt_session.send_audio_chunk(raw_message["bytes"])

            elif "text" in raw_message and raw_message["text"]:
                import json
                try:
                    data = json.loads(raw_message["text"])
                    msg_type = data.get("type")

                    if msg_type == "config":
                        new_lang = data.get("language")
                        if new_lang and new_lang != voice_state["language"]:
                            voice_state["language"] = new_lang
                            await stt_session.close()
                            stt_session = PrismaSTTStreamSession(
                                language=new_lang,
                                on_transcript_callback=on_transcript,
                            )
                    elif msg_type == "pen_state":
                        voice_state["is_student_writing"] = bool(data.get("is_writing", False))
                    elif msg_type == "tutor_state":
                        voice_state["is_tutor_explaining"] = bool(data.get("is_speaking", False))
                    elif msg_type == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception as parse_err:
                    logger.debug("Failed to parse JSON voice frame: %s", parse_err)

    except WebSocketDisconnect:
        logger.info("Voice WebSocket disconnected.")
    except Exception as exc:
        logger.error("Unexpected Voice WebSocket error: %s", exc)
    finally:
        transcript_task.cancel()
        await stt_session.close()
