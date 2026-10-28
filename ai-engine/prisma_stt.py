"""
prisma_stt.py — Gnani Prisma v2.5 STT Streaming Client.
Role: Ears ONLY.

Streams 16kHz 16-bit mono PCM audio frames (1024 bytes/chunk) from React
microphone WebSocket to Gnani Prisma v2.5. Supports en-IN, hi-IN, and gu-IN,
with mathematical vocabulary boosting and a safe fallback mock mode for local development.
"""

import asyncio
import inspect
import logging
import os
from typing import Any, Callable, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

# Constants
DEFAULT_MODEL: str = "gnani-prisma-v2.5"
SUPPORTED_LANGUAGES: Set[str] = {"en-IN", "hi-IN", "gu-IN"}
SAMPLE_RATE: int = 16000
SAMPLE_WIDTH: int = 2  # 16-bit = 2 bytes
CHANNELS: int = 1      # mono
FRAME_SIZE_BYTES: int = 1024

# Math Vocabulary Boosting
MATH_BIAS_LIST: List[str] = [
    "integral",
    "derivative",
    "theta",
    "cosine",
    "sine",
    "matrix",
    "quadratic",
    "factor",
    "limit",
    "minus",
]
MATH_BIAS_SCORE: float = 1.5

# Try importing the Gnani SDK
try:
    from gnani_vachana import GnaniSTTClient, GnaniSTTStreamClient  # type: ignore
    GNANI_SDK_AVAILABLE = True
except ImportError:
    GnaniSTTClient = None  # type: ignore
    GnaniSTTStreamClient = None  # type: ignore
    GNANI_SDK_AVAILABLE = False
    logger.info("gnani-vachana SDK not installed in environment; will use MockSTTStreamSession fallback.")


class MockSTTStreamSession:
    """Safe local fallback for testing without GNANI_API_KEY or gnani-vachana installed.
    Simulates speech recognition after accumulating audio frames."""

    MOCK_RESPONSES: Dict[str, List[str]] = {
        "en-IN": [
            "Can you explain the derivative here?",
            "What is the limit as x approaches zero?",
            "How do we factor this quadratic equation?",
            "Please show the steps for this integral.",
        ],
        "hi-IN": [
            "Kya aap iska derivative samjha sakte hain?",
            "Is quadratic equation ko kaise solve karein?",
            "Agla step kya hoga?",
        ],
        "gu-IN": [
            "Aa dakhlo samjhavo please.",
            "Aama aagal shu karvu?",
        ],
    }

    def __init__(
        self,
        language: str = "en-IN",
        on_transcript_callback: Optional[Callable[[str, bool], Any]] = None,
    ):
        self.language = language if language in SUPPORTED_LANGUAGES else "en-IN"
        self.on_transcript_callback = on_transcript_callback
        self.closed = False
        self.accumulated_bytes = 0
        self.sample_count = 0
        self._sim_task: Optional[asyncio.Task] = None
        self._loop = asyncio.get_event_loop()
        logger.info(
            "Initialized MockSTTStreamSession (language=%s, mock_mode=True)",
            self.language,
        )

    async def _emit_transcript(self, text: str, is_final: bool):
        if not self.on_transcript_callback:
            return
        try:
            if inspect.iscoroutinefunction(self.on_transcript_callback):
                await self.on_transcript_callback(text, is_final)
            else:
                result = self.on_transcript_callback(text, is_final)
                if inspect.isawaitable(result):
                    await result
        except Exception as exc:
            logger.error("Error invoking on_transcript_callback in MockSTT: %s", exc)

    async def send_audio_chunk(self, chunk: bytes):
        if self.closed or not chunk:
            return
        self.accumulated_bytes += len(chunk)
        self.sample_count += 1

        # Simulate progressive interim speech detection every ~16k bytes (~0.5s)
        # and a final transcript after ~48k bytes (~1.5s of speech)
        if self.accumulated_bytes == 16384:
            await self._emit_transcript("Claire, please help...", is_final=False)
        elif self.accumulated_bytes >= 49152:
            options = self.MOCK_RESPONSES.get(self.language, self.MOCK_RESPONSES["en-IN"])
            simulated_text = options[self.sample_count % len(options)]
            # Emit final transcript and reset counter for next sentence
            await self._emit_transcript(simulated_text, is_final=True)
            self.accumulated_bytes = 0

    async def close(self):
        if self.closed:
            return
        self.closed = True
        if self.accumulated_bytes > 0:
            options = self.MOCK_RESPONSES.get(self.language, self.MOCK_RESPONSES["en-IN"])
            simulated_text = options[self.sample_count % len(options)]
            await self._emit_transcript(simulated_text, is_final=True)
        logger.debug("Closed MockSTTStreamSession.")


class PrismaSTTStreamSession:
    """Gnani Prisma v2.5 STT Streaming Client Session.

    Streams 16kHz 16-bit mono PCM audio chunks from React microphone
    WebSocket to Gnani Prisma STT with math vocabulary boosting.
    """

    def __init__(
        self,
        language: str = "en-IN",
        on_transcript_callback: Optional[Callable[[str, bool], Any]] = None,
    ):
        self.language: str = language if language in SUPPORTED_LANGUAGES else "en-IN"
        self.on_transcript_callback: Optional[Callable[[str, bool], Any]] = on_transcript_callback
        self.api_key: Optional[str] = os.getenv("GNANI_API_KEY")
        self.closed: bool = False

        self._audio_queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
        self._stream_task: Optional[asyncio.Task] = None
        self._mock_session: Optional[MockSTTStreamSession] = None
        self._client: Any = None
        self._stream: Any = None

        # Decide whether to use real Gnani SDK or mock fallback
        if not self.api_key or not GNANI_SDK_AVAILABLE:
            if not GNANI_SDK_AVAILABLE:
                logger.warning("Gnani SDK not available. Running STT in mock mode.")
            else:
                logger.warning("GNANI_API_KEY not configured. Running STT in mock mode.")
            self._mock_session = MockSTTStreamSession(
                language=self.language,
                on_transcript_callback=self.on_transcript_callback,
            )
        else:
            self._init_sdk_stream()

    def _init_sdk_stream(self):
        """Initializes the Gnani SDK stream and consumer task."""
        try:
            # Instantiate client
            if GnaniSTTStreamClient is not None:
                self._client = GnaniSTTStreamClient(api_key=self.api_key)
            elif GnaniSTTClient is not None:
                self._client = GnaniSTTClient(api_key=self.api_key)
            else:
                raise RuntimeError("No suitable Gnani STT client class found.")

            # Start streaming worker
            self._stream_task = asyncio.create_task(self._process_stream_loop())
            logger.info("Gnani Prisma v2.5 STT streaming session started (lang=%s).", self.language)
        except Exception as exc:
            logger.error("Failed to initialize Gnani SDK stream: %s. Falling back to mock.", exc)
            self._mock_session = MockSTTStreamSession(
                language=self.language,
                on_transcript_callback=self.on_transcript_callback,
            )

    async def _emit_transcript(self, text: str, is_final: bool):
        """Invokes the callback with transcript text and finality flag."""
        if not self.on_transcript_callback or not text:
            return
        try:
            if inspect.iscoroutinefunction(self.on_transcript_callback):
                await self.on_transcript_callback(text, is_final)
            else:
                result = self.on_transcript_callback(text, is_final)
                if inspect.isawaitable(result):
                    await result
        except Exception as exc:
            logger.error("Error in on_transcript_callback: %s", exc)

    async def _process_stream_loop(self):
        """Worker task that pipes audio chunks to Gnani and yields transcripts."""
        try:
            # Prepare configuration
            config = {
                "model": DEFAULT_MODEL,
                "language": self.language,
                "sample_rate": SAMPLE_RATE,
                "encoding": "pcm_s16le",
                "channels": CHANNELS,
                "bias_list": MATH_BIAS_LIST,
                "bias_score": MATH_BIAS_SCORE,
                "interim_results": True,
            }

            # Adapter for Gnani streaming client API variants
            if hasattr(self._client, "start_stream"):
                self._stream = await self._client.start_stream(**config)
            elif hasattr(self._client, "stream"):
                self._stream = self._client.stream(**config)
            else:
                self._stream = self._client

            # Sender loop and receiver loop
            async def sender():
                while not self.closed:
                    chunk = await self._audio_queue.get()
                    if chunk is None:
                        break
                    if hasattr(self._stream, "send_audio"):
                        if inspect.iscoroutinefunction(self._stream.send_audio):
                            await self._stream.send_audio(chunk)
                        else:
                            self._stream.send_audio(chunk)
                    elif hasattr(self._stream, "send"):
                        if inspect.iscoroutinefunction(self._stream.send):
                            await self._stream.send(chunk)
                        else:
                            self._stream.send(chunk)

            async def receiver():
                # Read transcripts from stream
                if hasattr(self._stream, "__aiter__"):
                    async for response in self._stream:
                        self._parse_and_dispatch(response)
                elif hasattr(self._stream, "responses"):
                    async for response in self._stream.responses():
                        self._parse_and_dispatch(response)
                elif hasattr(self._stream, "recv"):
                    while not self.closed:
                        res = await self._stream.recv()
                        if not res:
                            break
                        self._parse_and_dispatch(res)

            await asyncio.gather(sender(), receiver(), return_exceptions=True)

        except asyncio.CancelledError:
            logger.debug("Prisma STT stream task cancelled.")
        except Exception as exc:
            logger.error("Error during Gnani STT streaming: %s", exc)
            # Seamless fallback to mock session
            if not self._mock_session:
                self._mock_session = MockSTTStreamSession(
                    language=self.language,
                    on_transcript_callback=self.on_transcript_callback,
                )

    def _parse_and_dispatch(self, response: Any):
        """Parses response packet for transcript string and is_final status."""
        try:
            transcript = ""
            is_final = False

            if isinstance(response, dict):
                transcript = (
                    response.get("transcript")
                    or response.get("text")
                    or (response.get("results", [{}])[0].get("transcript", "") if response.get("results") else "")
                )
                is_final = bool(response.get("is_final", response.get("final", False)))
            elif hasattr(response, "transcript"):
                transcript = getattr(response, "transcript", "")
                is_final = getattr(response, "is_final", False)
            elif hasattr(response, "text"):
                transcript = getattr(response, "text", "")
                is_final = getattr(response, "is_final", False)

            if transcript:
                asyncio.create_task(self._emit_transcript(transcript.strip(), is_final))
        except Exception as err:
            logger.debug("Failed parsing response item: %s", err)

    async def send_audio_chunk(self, chunk: bytes):
        """Accepts a 16kHz 16-bit mono PCM audio chunk (typically 1024 bytes)

        and streams it to the STT provider.
        """
        if self.closed or not chunk:
            return

        if self._mock_session is not None:
            await self._mock_session.send_audio_chunk(chunk)
            return

        await self._audio_queue.put(chunk)

    async def close(self):
        """Gracefully closes audio streaming session and flushes buffers."""
        if self.closed:
            return
        self.closed = True

        if self._mock_session is not None:
            await self._mock_session.close()
            return

        await self._audio_queue.put(None)
        if self._stream and hasattr(self._stream, "close"):
            try:
                if inspect.iscoroutinefunction(self._stream.close):
                    await self._stream.close()
                else:
                    self._stream.close()
            except Exception as err:
                logger.debug("Exception while closing stream: %s", err)

        if self._stream_task and not self._stream_task.done():
            self._stream_task.cancel()
            try:
                await self._stream_task
            except asyncio.CancelledError:
                pass


def get_stt_stream_session(
    language: str = "en-IN",
    on_transcript_callback: Optional[Callable[[str, bool], Any]] = None,
) -> PrismaSTTStreamSession:
    """Convenience factory function for instantiating a PrismaSTTStreamSession."""
    return PrismaSTTStreamSession(
        language=language,
        on_transcript_callback=on_transcript_callback,
    )
