"""STT service — Whisper API via OpenAI SDK."""

import io
from dataclasses import dataclass

from openai import AsyncOpenAI

from voice_agent.lib.errors import STTError
from voice_agent.lib.logger import get_logger
from voice_agent.lib.timer import TimingResult, timer

logger = get_logger(__name__)


@dataclass
class STTResult:
    """Result of a transcription."""

    transcript: str
    language: str | None  # Detected language code ("ar" or "en")
    confidence: float | None
    timing_ms: float


class STTService:
    """Whisper API transcription service."""

    def __init__(self, client: AsyncOpenAI, model: str = "whisper-1") -> None:
        self._client = client
        self._model = model

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.webm") -> STTResult:
        """Transcribe audio bytes using Whisper API. Detects language."""
        if self._client is None:
            raise STTError("OpenAI client not configured", details={"hint": "Set OPENAI_API_KEY"})

        async with timer() as t:
            try:
                file_obj = io.BytesIO(audio_bytes)
                file_obj.name = filename

                response = await self._client.audio.transcriptions.create(
                    model=self._model,
                    file=file_obj,
                    language=None,  # Let Whisper auto-detect
                    response_format="verbose_json",
                )

                # OpenAI Whisper verbose_json response has:
                # text, language, duration, words (optional)
                transcript = response.text or ""
                detected_lang = getattr(response, "language", None)
                # confidence is not directly available from Whisper API
                # we use None as a placeholder; in production you'd use word timing data

            except Exception as e:
                logger.error("stt_failed", error=str(e))
                raise STTError(f"STT transcription failed: {e}")

        return STTResult(
            transcript=transcript,
            language=detected_lang,
            confidence=None,
            timing_ms=t.elapsed_ms,
        )


def create_stt_service(api_key: str | None) -> STTService | None:
    """Factory: return STTService if API key present, else None."""
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — STT unavailable")
        return None
    return STTService(AsyncOpenAI(api_key=api_key))