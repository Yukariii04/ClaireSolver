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

                # 4. Stream each individual solution step
                for step in solution.steps:
                    await websocket.send_json({
                        "type": "step",
                        "requestId": req_id,
                        "pageId": page_id,
                        "notebookId": notebook_id,
                        "step": step.model_dump(),
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
