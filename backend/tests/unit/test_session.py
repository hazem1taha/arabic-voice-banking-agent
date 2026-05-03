"""Unit tests for session store using fakeredis."""

import json
import pytest
from unittest.mock import MagicMock

from voice_agent.services.session import SessionStore
from voice_agent.domain.conversation import Session, Turn


class MockRedis:
    def __init__(self):
        self._store = {}

    async def get(self, key):
        return self._store.get(key)

    async def set(self, key, value, ex=None):
        self._store[key] = value

    async def delete(self, key):
        if key in self._store:
            del self._store[key]
            return 1
        return 0


@pytest.fixture
def mock_redis():
    return MockRedis()


@pytest.fixture
def session_store(mock_redis):
    return SessionStore(mock_redis)


class TestSessionStore:
    @pytest.mark.asyncio
    async def test_create_and_get(self, session_store):
        session = await session_store.create("test-session-1", "cust-001")
        assert session.session_id == "test-session-1"
        assert session.customer_id == "cust-001"

        retrieved = await session_store.get("test-session-1")
        assert retrieved is not None
        assert retrieved.session_id == "test-session-1"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, session_store):
        result = await session_store.get("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, session_store):
        await session_store.create("delete-test")
        deleted = await session_store.delete("delete-test")
        assert deleted is True

        result = await session_store.get("delete-test")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, session_store):
        deleted = await session_store.delete("nonexistent")
        assert deleted is False

    @pytest.mark.asyncio
    async def test_append_turn(self, session_store):
        turn = Turn(
            turn_id="t1",
            role="user",
            content="ما رصيدي؟",
            language_detected="ar",
        )
        session = await session_store.append_turn("turn-test", turn)
        assert len(session.turns) == 1
        assert session.turns[0].content == "ما رصيدي؟"

    @pytest.mark.asyncio
    async def test_get_recent_turns_dict_respects_limit(self, session_store):
        for i in range(15):
            turn = Turn(turn_id=f"t{i}", role="user", content=f"msg {i}")
            await session_store.append_turn("limit-test", turn)

        session = await session_store.get("limit-test")
        assert session is not None
        # Default limit is 10
        recent = session_store.get_recent_turns_dict(session)
        assert len(recent) == 10