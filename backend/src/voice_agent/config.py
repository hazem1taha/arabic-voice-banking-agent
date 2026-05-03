"""Application configuration via pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration for the voice agent backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # OpenAI
    openai_api_key: str = Field(default="", description="OpenAI API key for GPT-4o and Whisper")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis connection URL")

    # Session
    session_ttl_seconds: int = Field(default=3600, description="TTL for session data in Redis")
    session_turn_limit: int = Field(default=10, description="Max turns to send to LLM")

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")

    # Server
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    reload: bool = Field(default=False)

    # Audio
    audio_dir: str = Field(default="static/audio", description="Directory to store generated audio")
    audio_max_age_seconds: int = Field(default=3600, description="Clean up audio files older than this")

    # TTS
    tts_model: str = Field(default="tts-1", description="OpenAI TTS model")
    tts_voice: str = Field(default="nova", description="OpenAI TTS voice (nova handles Arabic well)")

    @property
    def redis_available(self) -> bool:
        """Check if Redis URL is configured."""
        return bool(self.redis_url) and self.redis_url != "redis://localhost:6379/0"

    @property
    def openai_configured(self) -> bool:
        """Check if OpenAI API key is set."""
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()