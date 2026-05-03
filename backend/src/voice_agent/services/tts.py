"""TTS service — OpenAI TTS (tts-1) with audio file caching."""

import os
import time
import uuid
from pathlib import Path

from openai import AsyncOpenAI

from voice_agent.config import get_settings
from voice_agent.lib.errors import TTSError
from voice_agent.lib.logger import get_logger
from voice_agent.lib.timer import timer

logger = get_logger(__name__)


class TTSService:
    """OpenAI TTS service — generates audio and serves via file URL."""

    def __init__(self, client: AsyncOpenAI | None) -> None:
        self._client = client
        self._settings = get_settings()

    def _audio_dir(self) -> Path:
        """Get the audio directory, ensuring it exists."""
        root = Path(__file__).parent.parent.parent.parent / "static" / "audio"
        root.mkdir(parents=True, exist_ok=True)
        return root

    async def speak(self, text: str, turn_id: str) -> str | None:
        """Generate audio for text and return the audio URL path. Returns None on failure."""
        if self._client is None:
            logger.warning("TTS client not configured — returning None (frontend uses fallback)")
            return None

        try:
            audio_dir = self._audio_dir()
            filename = f"response_{turn_id}.mp3"
            filepath = audio_dir / filename

            async with timer() as t:
                response = await self._client.audio.speech.create(
                    model=self._settings.tts_model,
                    voice=self._settings.tts_voice,
                    input=text,
                    response_format="mp3",
                )
                audio_bytes = response.read()

            with open(filepath, "wb") as f:
                f.write(audio_bytes)

            logger.info("tts_generated", turn_id=turn_id, text_len=len(text), timing_ms=t.elapsed_ms)
            return f"/api/v1/audio/{turn_id}"

        except Exception as e:
            logger.error("tts_failed", turn_id=turn_id, error=str(e))
            return None

    def cleanup_old_audio(self) -> int:
        """Remove audio files older than max_age_seconds. Returns count deleted."""
        try:
            audio_dir = self._audio_dir()
            now = time.time()
            deleted = 0
            for f in audio_dir.iterdir():
                if f.is_file() and (now - f.stat().st_mtime) > self._settings.audio_max_age_seconds:
                    f.unlink()
                    deleted += 1
            return deleted
        except Exception as e:
            logger.warning("audio_cleanup_failed", error=str(e))
            return 0


def create_tts_service(api_key: str | None) -> TTSService:
    """Factory: return TTSService (always returns a service, even if key is missing)."""
    client = AsyncOpenAI(api_key=api_key) if api_key else None
    return TTSService(client)