"""Unit tests for system prompt builder."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from voice_agent.domain.prompts import (
    build_system_prompt,
    build_llm_messages,
    ARABIC_SYSTEM_PROMPT,
    ENGLISH_SYSTEM_PROMPT,
)


class TestBuildSystemPrompt:
    def test_default_is_arabic(self):
        prompt = build_system_prompt(None)
        assert prompt == ARABIC_SYSTEM_PROMPT

    def test_arabic_explicit(self):
        prompt = build_system_prompt("ar")
        assert prompt == ARABIC_SYSTEM_PROMPT

    def test_english(self):
        prompt = build_system_prompt("en")
        assert prompt == ENGLISH_SYSTEM_PROMPT


class TestBuildLlmMessages:
    def test_includes_system_prompt(self):
        messages = build_llm_messages("test system", [])
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "test system"

    def test_includes_conversation_turns(self):
        turns = [
            {"role": "user", "content": "ما رصيدي؟"},
            {"role": "assistant", "content": "رصيدك 12,450 BHD"},
        ]
        messages = build_llm_messages("system prompt", turns)
        assert len(messages) == 3
        assert messages[1]["content"] == "ما رصيدي؟"
        assert messages[2]["content"] == "رصيدك 12,450 BHD"

    def test_empty_turns(self):
        messages = build_llm_messages("system", [])
        assert len(messages) == 1  # only system