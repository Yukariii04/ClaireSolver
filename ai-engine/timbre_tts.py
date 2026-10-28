"""
Voice Output Engine: Gnani Timbre v2.5 / v3.0 TTS Client.

Synthesizes high-fidelity pedagogical speech for math solution steps,
specifically tuned for Indian-accented English/Hinglish math explanations.
Supports real-time streaming to frontend canvas via WebSockets.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import math
import os
import struct
import wave
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gnani SDK Import with Graceful Fallback
# ---------------------------------------------------------------------------
try:
    from gnani.tts import AudioConfig, GnaniTTSRealtimeClient, GnaniTTSStreamClient
    HAS_GNANI_SDK = True
except ImportError:
    try:
        from gnani_vachana.tts import AudioConfig, GnaniTTSRealtimeClient, GnaniTTSStreamClient
        HAS_GNANI_SDK = True
    except ImportError:
        GnaniTTSRealtimeClient = None
        GnaniTTSStreamClient = None
        AudioConfig = None
        HAS_GNANI_SDK = False
        logger.info(
            "Gnani TTS SDK not installed in local environment. Safe fallback mock synthesizer activated."
        )

# ---------------------------------------------------------------------------
# Configuration & Voice Profile Defaults
# ---------------------------------------------------------------------------
DEFAULT_MODEL = os.getenv("GNANI_MODEL", "timbre-v2.5")
DEFAULT_VOICE = "Nalini"  # Warm, clear Indian-accented math educator
DEFAULT_SAMPLE_RATE = 24000
DEFAULT_LANGUAGE = "en-IN"

# Supported language codes
SUPPORTED_LANGUAGES = {"en-IN", "hi-IN", "gu-IN"}


def get_gnani_api_key() -> Optional[str]:
    """Retrieve Gnani API key from environment."""
    key = os.getenv("GNANI_API_KEY", "").strip()
    return key if key and key != "your-gnani-api-key" else None


# ---------------------------------------------------------------------------
# Safe Fallback WAV Generator (Zero external dependencies)
# ---------------------------------------------------------------------------
def generate_fallback_wav(sample_rate: int = 24000, duration_seconds: float = 0.5) -> bytes:
    """
    Generate a valid 16-bit PCM mono WAV file containing gentle silence/subtle chime.
    Ensures that WebSocket clients receive decodable audio even without external network/keys.
    """
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_out:
        wav_out.setnchannels(1)  # Mono
        wav_out.setsampwidth(2)  # 16-bit
        wav_out.setframerate(sample_rate)
        total_frames = int(sample_rate * duration_seconds)
        frame_data = bytearray()
        
        # Soft 440Hz ping decaying to silence to indicate active fallback
        for i in range(total_frames):
            decay = math.exp(-i / (sample_rate * 0.15))
            sample_val = int(800 * decay * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
            frame_data.extend(struct.pack("<h", sample_val))
            
        wav_out.writeframes(frame_data)
    
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Core Synthesis Implementations
# ---------------------------------------------------------------------------
def _synthesize_with_sdk_sync(
    api_key: str,
    text: str,
    language: str,
    voice: str,
    model: str,
) -> bytes:
    """Synchronous worker invoking the Gnani Timbre client."""
    if not HAS_GNANI_SDK:
        raise RuntimeError("Gnani TTS SDK is not installed")

    # Configure audio stream parameters for browser playback
    audio_config = AudioConfig(
        sample_rate=DEFAULT_SAMPLE_RATE,
        encoding="linear_pcm",
        container="wav",
    )

    # Instantiate client with API Key
    client = None
    if GnaniTTSRealtimeClient is not None:
        client = GnaniTTSRealtimeClient(api_key=api_key)
    elif GnaniTTSStreamClient is not None:
        client = GnaniTTSStreamClient(api_key=api_key)
    else:
        raise RuntimeError("No compatible Gnani client class found")

    # Perform synthesis
    # Gnani Timbre accepts text, model, voice, language, and audio_config
    if hasattr(client, "synthesize"):
        result = client.synthesize(
            text=text,
            voice=voice,
            language=language,
            model=model,
            audio_config=audio_config,
        )
        if isinstance(result, bytes):
            return result
        elif hasattr(result, "audio_content"):
            return result.audio_content
        elif hasattr(result, "read"):
            return result.read()
    elif hasattr(client, "synthesize_stream"):
        audio_chunks = []
        for chunk in client.synthesize_stream(
            text=text,
            voice=voice,
            language=language,
            model=model,
            audio_config=audio_config,
        ):
            if isinstance(chunk, bytes):
                audio_chunks.append(chunk)
            elif hasattr(chunk, "audio_content"):
                audio_chunks.append(chunk.audio_content)
        return b"".join(audio_chunks)

    raise RuntimeError("Unrecognized Gnani TTS client interface")


async def synthesize_speech(
    text: str,
    language: str = DEFAULT_LANGUAGE,
    voice: str = DEFAULT_VOICE,
    model: Optional[str] = None,
) -> bytes:
    """
    Synthesize text into raw WAV audio bytes using Gnani Timbre v2.5 / v3.0.
    
    Gracefully falls back to valid in-memory audio if the API key is not
    configured or synthesis fails, ensuring the system never crashes during demo/dev.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return generate_fallback_wav(sample_rate=DEFAULT_SAMPLE_RATE, duration_seconds=0.1)

    # Normalize language
    target_lang = language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    target_model = model or DEFAULT_MODEL
    api_key = get_gnani_api_key()

    if not api_key:
        logger.info(
            "GNANI_API_KEY is not configured or set to placeholder. Using fallback WAV audio."
        )
        return generate_fallback_wav(sample_rate=DEFAULT_SAMPLE_RATE, duration_seconds=0.5)

    if not HAS_GNANI_SDK:
        logger.warning(
            "Gnani TTS SDK unavailable. Using fallback WAV audio for text: '%s'",
            clean_text[:40],
        )
        return generate_fallback_wav(sample_rate=DEFAULT_SAMPLE_RATE, duration_seconds=0.5)

    try:
        # Offload sync SDK call to asyncio executor to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        audio_bytes = await loop.run_in_executor(
            None,
            _synthesize_with_sdk_sync,
            api_key,
            clean_text,
            target_lang,
            voice,
            target_model,
        )
        if audio_bytes and len(audio_bytes) > 0:
            return audio_bytes
        else:
            logger.warning("Gnani returned empty audio bytes; generating fallback audio.")
            return generate_fallback_wav(sample_rate=DEFAULT_SAMPLE_RATE, duration_seconds=0.5)
    except Exception as exc:
        logger.error(
            "Gnani Timbre TTS synthesis error (%s): %s. Falling back to local audio.",
            type(exc).__name__,
            exc,
        )
        return generate_fallback_wav(sample_rate=DEFAULT_SAMPLE_RATE, duration_seconds=0.5)


async def synthesize_speech_base64(
    text: str,
    language: str = DEFAULT_LANGUAGE,
    voice: str = DEFAULT_VOICE,
    model: Optional[str] = None,
) -> str:
    """
    Synthesizes speech and returns a base64-encoded WAV audio string
    suitable for immediate transport via WebSocket JSON payloads.
    """
    audio_bytes = await synthesize_speech(
        text=text,
        language=language,
        voice=voice,
        model=model,
    )
    return base64.b64encode(audio_bytes).decode("ascii")
