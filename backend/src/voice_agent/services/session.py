"""Redis-backed session store with TTL and history truncation."""

import json
from typing import Any

import redis.asyncio as redis

from voice_agent.config import get_settings
from voice_agent.domain.conversation import Session, Turn
from voice_agent.lib.errors import SessionError
from voice_agent.lib.logger import get_logger

logger = get_logger(__name__)


class SessionStore:
    """Async Redis-backed session store."""

    KEY_PREFIX = "session:"

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client
        self._settings = get_settings()

    def _key(self, session_id: str) -> str:
        return f"{self.KEY_PREFIX}{session_id}"

    async def get(self, session_id: str) -> Session | None:
        """Retrieve a session from Redis, or None if not found."""
        try:
            data = await self._redis.get(self._key(session_id))
            if not data:
                return None
            parsed = json.loads(data)
            return Session.from_dict(parsed)
        except json.JSONDecodeError as e:
            logger.error("session_parse_failed", session_id=session_id, error=str(e))
            raise SessionError(f"Failed to parse session: {session_id}", details={"error": str(e)})
        except Exception as e:
            logger.error("session_get_failed", session_id=session_id, error=str(e))
            raise SessionError(f"Failed to get session: {session_id}", details={"error": str(e)})

    async def save(self, session: Session) -> None:
        """Save a session to Redis with TTL."""
        try:
            data = json.dumps(session.to_dict(), ensure_ascii=False)
            await self._redis.set(
                self._key(session.session_id),
                data,
                ex=self._settings.session_ttl_seconds,
            )
        except Exception as e:
            logger.error("session_save_failed", session_id=session.session_id, error=str(e))
            raise SessionError(f"Failed to save session: {session.session_id}", details={"error": str(e)})

    async def create(self, session_id: str, customer_id: str = "cust-001") -> Session:
        """Create a new session and save it."""
        session = Session(session_id=session_id, customer_id=customer_id)
        await self.save(session)
        return session

    async def delete(self, session_id: str) -> bool:
        """Delete a session. Returns True if it existed."""
        result = await self._redis.delete(self._key(session_id))
        return result > 0

    async def append_turn(self, session_id: str, turn: Turn) -> Session:
        """Append a turn to an existing session, then save. Creates session if needed."""
        session = await self.get(session_id)
        if session is None:
            session = await self.create(session_id)
        session.add_turn(turn)
        await self.save(session)
        return session

    def get_recent_turns_dict(self, session: Session) -> list[dict[str, Any]]:
        """Get recent turns as dicts for LLM, truncated to configured limit."""
        recent = session.get_recent_turns(limit=self._settings.session_turn_limit)
        return [t.to_dict() for t in recent]


# Global client — initialized in main.py lifespan
_redis_client: redis.Redis | None = None


async def init_redis(url: str) -> redis.Redis:
    """Initialize Redis client."""
    global _redis_client
    _redis_client = redis.from_url(url, decode_responses=True)
    await _redis_client.ping()
    logger.info("redis_connected", url=url)
    return _redis_client


async def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None


def get_session_store() -> SessionStore:
    """Get the session store instance. Raises if not initialized."""
    if _redis_client is None:
        raise SessionError("Redis not initialized. Call init_redis() first.")
    return SessionStore(_redis_client)