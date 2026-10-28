import os

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CLIENT_ORIGINS", "http://localhost:5173,http://localhost:5000"
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="Math Homework Notebook AI Engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Worksheet slicer — question detection + cropping pipeline
from slicer import router as slicer_router  # noqa: E402

app.include_router(slicer_router, prefix="/slice-worksheet")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-engine"}


@app.websocket("/ws/tutor")
async def tutor_socket(websocket: WebSocket):
    # CORS middleware does not validate WebSocket origins, so check the browser
    # origin explicitly before accepting the connection.
    origin = websocket.headers.get("origin")
    if origin and origin.rstrip("/") not in {item.rstrip("/") for item in allowed_origins}:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()
    await websocket.send_json({"type": "ready", "service": "ai-engine"})

    try:
        while True:
            message = await websocket.receive_json()
            # Placeholder acknowledgement; the tutor pipeline will be wired in
            # after the intent gatekeeper and solver are implemented.
            await websocket.send_json(
                {
                    "type": "received",
                    "requestId": message.get("requestId") if isinstance(message, dict) else None,
                    "status": "not_implemented",
                }
            )
    except WebSocketDisconnect:
        pass

