"""Pydantic request/response schemas for the API."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ConversationTurnRequest(BaseModel):
    """Form request for /conversation/turn (multipart, not JSON)."""

    pass  # Uses FastAPI's UploadFile, not JSON body


class LatencyMs(BaseModel):
    """Per-stage latency breakdown."""

    stt: float
    llm: float
    tools: float
    tts: float
    total: float


class ToolCallItem(BaseModel):
    """A single tool call result in the response."""

    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: str | None = None


class ConversationTurnResponse(BaseModel):
    """Response for /conversation/turn."""

    session_id: str
    turn_id: str
    user_transcript: str
    user_language_detected: Literal["ar", "en"] | None = None
    assistant_text: str
    assistant_audio_url: str | None = None
    tool_calls: list[ToolCallItem] = Field(default_factory=list)
    latency_ms: LatencyMs


class TurnResponse(BaseModel):
    """A single turn in conversation history."""

    turn_id: str
    role: Literal["user", "assistant", "tool"]
    content: str
    tool_calls: list[ToolCallItem] = Field(default_factory=list)
    timestamp: str
    language_detected: str | None = None


class ConversationHistoryResponse(BaseModel):
    """Response for GET /conversation/{session_id}."""

    session_id: str
    customer_id: str
    turns: list[TurnResponse]


class HealthResponse(BaseModel):
    """Response for GET /health."""

    status: Literal["ok", "degraded", "unavailable"]
    redis: bool
    openai_stt: bool
    openai_llm: bool
    version: str = "1.0.0"


class ErrorResponse(BaseModel):
    """Structured error response."""

    error: str
    message: str
    details: dict[str, Any] | None = None
    retry_after_ms: int | None = None  # For rate-limit type errors