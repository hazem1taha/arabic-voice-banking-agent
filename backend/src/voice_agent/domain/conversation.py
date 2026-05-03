"""Conversation domain models — Turn and Session for Redis storage."""

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    """A single tool call (function call) invoked by the LLM."""

    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: str | None = None


class Turn(BaseModel):
    """A single conversation turn (user or assistant)."""

    turn_id: str
    role: Literal["user", "assistant", "tool"]
    content: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    latency_ms: dict[str, float] | None = None
    language_detected: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "turn_id": self.turn_id,
            "role": self.role,
            "content": self.content,
            "tool_calls": [tc.model_dump() for tc in self.tool_calls],
            "timestamp": self.timestamp.isoformat(),
            "latency_ms": self.latency_ms,
            "language_detected": self.language_detected,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Turn":
        data = data.copy()
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        if "tool_calls" in data:
            data["tool_calls"] = [ToolCall(**tc) for tc in data["tool_calls"]]
        return cls(**data)


class Session(BaseModel):
    """A conversation session stored in Redis."""

    session_id: str
    customer_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    turns: list[Turn] = Field(default_factory=list)

    def add_turn(self, turn: Turn) -> None:
        self.turns.append(turn)

    def get_recent_turns(self, limit: int = 10) -> list[Turn]:
        """Return the most recent turns, truncated to limit."""
        return self.turns[-limit:]

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "customer_id": self.customer_id,
            "created_at": self.created_at.isoformat(),
            "turns": [t.to_dict() for t in self.turns],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Session":
        data = data.copy()
        if "created_at" in data and isinstance(data["created_at"], str):
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        if "turns" in data:
            data["turns"] = [Turn.from_dict(t) for t in data["turns"]]
        return cls(**data)