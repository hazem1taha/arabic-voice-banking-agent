"""Integration tests for the full conversation pipeline — mocked OpenAI."""

import pytest
from unittest.mock import MagicMock, AsyncMock

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from voice_agent.services.llm import LLMService
from voice_agent.domain.prompts import build_system_prompt


class MockChatCompletion:
    def choices(self):
        return [MockChoice()]


class MockChoice:
    message = MagicMock(content="رصيدك: 52,000 BHD في حساب التوفير")


class MockResponse:
    choices = [MagicMock(message=MagicMock(content="رصيدك 12,450 BHD", tool_calls=None))]


class MockToolCall:
    def __init__(self, name: str, arguments: str):
        self.function = MagicMock()
        self.function.name = name
        self.function.arguments = arguments
        self.id = f"call_{name}"


@pytest.fixture
def mock_openai_client():
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=MockResponse())
    return client


@pytest.fixture
def llm_service(mock_openai_client):
    return LLMService(mock_openai_client)


class TestLLMPipeline:
    @pytest.mark.asyncio
    async def test_generate_returns_text(self, llm_service):
        result = await llm_service.generate(
            user_transcript="ما رصيدي؟",
            conversation_turns=[],
            language_detected="ar",
        )
        assert result.text == "رصيدك 12,450 BHD"
        assert result.language_detected == "ar"
        assert result.tool_calls == []

    @pytest.mark.asyncio
    async def test_generate_passes_conversation_history(self, llm_service, mock_openai_client):
        await llm_service.generate(
            user_transcript="كم رصيدي؟",
            conversation_turns=[
                {"role": "user", "content": "أريد معرفة رصيدي"},
                {"role": "assistant", "content": "حسابك فيه 12,450 BHD"},
            ],
            language_detected="ar",
        )

        # Check that history was passed to the API
        call_kwargs = mock_openai_client.chat.completions.create.call_args
        messages = call_kwargs[1]["messages"]
        assert len(messages) == 4  # system + 2 history + user

    @pytest.mark.asyncio
    async def test_generate_handles_tool_calls(self, llm_service, mock_openai_client):
        # Set up mock to return a tool call
        mock_response = MagicMock()
        mock_message = MagicMock()
        mock_message.content = ""
        mock_message.tool_calls = [
            MockToolCall("get_account_balance", "{}")
        ]
        mock_response.choices = [mock_message]
        mock_openai_client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await llm_service.generate(
            user_transcript="ما رصيدي؟",
            conversation_turns=[],
            language_detected="ar",
        )

        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["name"] == "get_account_balance"

    @pytest.mark.asyncio
    async def test_generate_no_client_returns_error(self):
        service = LLMService(None)
        result = await service.generate(
            user_transcript="test",
            conversation_turns=[],
        )
        assert result.text == ""  # or error handling
        assert result.tool_calls == []