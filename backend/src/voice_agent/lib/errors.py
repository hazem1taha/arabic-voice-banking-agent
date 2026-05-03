"""Custom exception taxonomy for the voice agent pipeline."""

from typing import Any


class VoiceAgentError(Exception):
    """Base exception for all voice agent errors."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "details": self.details,
        }


class STTError(VoiceAgentError):
    """Failed to transcribe audio. User-facing, recoverable."""

    pass


class LLMError(VoiceAgentError):
    """LLM provider failed (rate limit, 5xx, etc.). Retry with backoff, then fail."""

    pass


class TTSError(VoiceAgentError):
    """TTS generation failed. Fall back to browser speechSynthesis if possible."""

    pass


class ToolExecutionError(VoiceAgentError):
    """A banking tool (function) failed to execute."""

    pass


class SessionError(VoiceAgentError):
    """Session store read/write failed."""

    pass


class ValidationError(VoiceAgentError):
    """Request validation failed."""

    pass


class ConfigurationError(VoiceAgentError):
    """Missing or invalid configuration at startup. Fail fast."""

    pass