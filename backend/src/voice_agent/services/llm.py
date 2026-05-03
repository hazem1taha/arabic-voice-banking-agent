"""LLM service — GPT-4o with function calling and two-turn pattern."""

import json
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from voice_agent.config import get_settings
from voice_agent.domain.banking_models import TOOL_SCHEMAS
from voice_agent.domain.prompts import build_llm_messages, build_system_prompt
from voice_agent.lib.errors import LLMError
from voice_agent.lib.logger import get_logger
from voice_agent.lib.timer import TimingResult, timer
from voice_agent.services import banking

logger = get_logger(__name__)


@dataclass
class LLMResult:
    """Result of an LLM turn."""

    text: str
    tool_calls: list[dict] = field(default_factory=list)  # [{"name": ..., "args": {...}, "result": ...}]
    language_detected: str | None = None
    timing_ms: float = 0.0
    stt_timing_ms: float = 0.0  # passed in from pipeline


@dataclass
class ToolCallResult:
    """Result of executing a single tool."""

    name: str
    args: dict
    result: str  # JSON string of result
    success: bool
    error: str | None = None


class LLMService:
    """GPT-4o with function calling — handles two-turn pattern."""

    def __init__(self, client: AsyncOpenAI | None) -> None:
        self._client = client
        self._settings = get_settings()

    async def generate(
        self,
        user_transcript: str,
        conversation_turns: list[dict],
        language_detected: str | None = None,
        stt_timing_ms: float = 0.0,
    ) -> LLMResult:
        """Generate assistant response using two-turn LLM pattern.

        Turn 1: user transcript → LLM (may fire tools)
        Turn 2 (if tools): tool results → LLM → final text
        """
        if self._client is None:
            raise LLMError("OpenAI client not configured")

        system_prompt = build_system_prompt(language_detected)
        messages = build_llm_messages(system_prompt, conversation_turns)
        messages.append({"role": "user", "content": user_transcript})

        total_timing = TimingResult()
        async with total_timing:
            # First LLM call
            async with timer() as llm_t:
                response = await self._client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    tools=TOOL_SCHEMAS,
                    tool_choice="auto",
                )

            choice = response.choices[0]
            assistant_message = choice.message

            # Handle tool calls
            if assistant_message.tool_calls:
                tool_results = await self._execute_tools(assistant_message.tool_calls)

                # Second LLM call — send tool results back
                messages.append({
                    "role": "assistant",
                    "content": assistant_message.content or "",
                    "tool_calls": [
                        {"id": tc.id, "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                        for tc in assistant_message.tool_calls
                    ],
                })
                for tr in tool_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tr.name,  # will be fixed below
                        "content": tr.result,
                    })

                # Second call
                async with timer():
                    follow_up = await self._client.chat.completions.create(
                        model="gpt-4o",
                        messages=messages,
                    )
                final_text = follow_up.choices[0].message.content or assistant_message.content or ""
            else:
                final_text = assistant_message.content or ""
                tool_results = []

        # Serialize tool calls for response
        serialized_tool_calls = [
            {
                "name": tr.name,
                "args": tr.args,
                "result": tr.result,
            }
            for tr in tool_results
        ]

        return LLMResult(
            text=final_text,
            tool_calls=serialized_tool_calls,
            language_detected=language_detected,
            timing_ms=total_timing.elapsed_ms,
            stt_timing_ms=stt_timing_ms,
        )

    async def _execute_tools(self, tool_calls: list) -> list[ToolCallResult]:
        """Execute all tool calls and return results."""
        results = []
        for tc in tool_calls:
            func_name = tc.function.name
            try:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
            except json.JSONDecodeError:
                args = {}

            try:
                result = banking.execute_tool(func_name, args)
                result_str = json.dumps(result, ensure_ascii=False)
                results.append(ToolCallResult(name=func_name, args=args, result=result_str, success=True))
            except Exception as e:
                logger.error("tool_execution_failed", function=func_name, error=str(e))
                error_result = {"error": str(e), "function": func_name}
                results.append(ToolCallResult(
                    name=func_name,
                    args=args,
                    result=json.dumps(error_result),
                    success=False,
                    error=str(e),
                ))

        return results


def create_llm_service(api_key: str | None) -> LLMService | None:
    """Factory: return LLMService if API key present, else None."""
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — LLM unavailable")
        return None
    return LLMService(AsyncOpenAI(api_key=api_key))