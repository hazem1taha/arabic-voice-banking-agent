# Architecture Deep Dive

## System Overview

The Arabic Voice Banking Agent is a browser-based voice AI system demonstrating a full STT → LLM → TTS pipeline with function calling and session state. It's architected to show senior engineering judgment: clean separation of concerns, explicit trade-offs, observability built in from day one.

---

## Frontend Architecture

### Tech: React 18 + Vite + TypeScript + Tailwind

No UI component library, no router, no state management library. This is intentional. A portfolio demo doesn't need the overhead of a full React SPA framework — useState + TanStack Query is sufficient for the interaction model.

**Why TanStack Query over plain fetch?** It handles loading/error states automatically, retries failed requests, and manages the async lifecycle cleanly. It also makes testing easier (you can mock the query client).

**Why Tailwind?** Fast iteration, consistent dark theme, no CSS files to maintain. The design is minimal intentionally — the UI's job is to show the latency panel and tool call inspector, not to impress with elaborate animations.

### Key Frontend Components

**`VoiceButton.tsx`** — Hold-to-talk button. Uses MediaRecorder API to capture audio in chunks (every 100ms). Visual states: idle → recording (pulsing red ring + audio level) → processing (spinner) → speaking (green pulse + waveform). Touch events supported.

**`Transcript.tsx`** — Scrolling conversation view. RTL for Arabic content, auto-detected per-turn. Shows speaker label + content bubble + collapsed tool call badges. Click-to-copy on any turn.

**`LatencyPanel.tsx`** — Per-stage latency bar chart. STT / LLM / Tools / TTS / Total with proportional bar widths. Monospace numbers. Updates after each turn.

**`ToolCallView.tsx`** — Collapsible tool call inspector. Shows function name as a badge, click to expand args JSON and result JSON. This is the single most "senior engineer" UI element — exactly what a Sarj.ai engineer debugging their own system would want.

### Audio Flow

1. `navigator.mediaDevices.getUserMedia({ audio: true })` — request mic
2. `MediaRecorder` captures as WebM/Opus (browser's native format, no transcoding needed)
3. On release: `recorder.stop()` → blob created from chunks
4. `fetch(POST /api/v1/conversation/turn, FormData)` — sends blob directly
5. On response: if `audio_url` present → play via `new Audio(url)`, else fallback to `speechSynthesis`

**Why WebM/Opus, not WAV?** WAV is ~3x larger for the same audio. No benefit to client-side transcoding — Whisper accepts WebM directly.

---

## Backend Architecture

### Tech: FastAPI + Python 3.11 + uv + Redis

**Why FastAPI?** Async handlers, Pydantic native support, automatic OpenAPI docs. The async is overkill for this scope (the heavy work is in external API calls, not in FastAPI itself) but it's the modern standard.

**Why uv?** Fast, modern, lockfile-first. Better than pip + requirements.txt. `uv sync --dev` installs everything including dev deps.

**Why Python 3.11?** Match statements, better async performance, type hints everywhere. The project uses match statements where idiomatic (see error taxonomy in `lib/errors.py`).

### Service Layer

```
main.py (lifespan: init services)
  ↓
api/routes.py (endpoints)
  ↓
services/
  ├── stt.py      — Whisper API, returns transcript + language
  ├── llm.py      — GPT-4o, two-turn with function calling
  ├── tts.py      — OpenAI tts-1, generates MP3 file
  ├── banking.py  — Mock banking actions (pure functions)
  └── session.py  — Redis-backed session store
  ↓
domain/
  ├── conversation.py — Turn + Session models
  ├── banking_models.py — Account, Card, Transaction, Dispute + tool schemas
  └── prompts.py     — Arabic + English system prompts
  ↓
lib/
  ├── errors.py  — Custom exception taxonomy
  ├── timer.py   — Async timer context manager
  └── logger.py  — Structured JSON logger (structlog)
```

### The Two-Turn LLM Pattern

```
User: "ما رصيدي؟"
  ↓ (STT)
Turn 1 → GPT-4o: [system] [history] [user_transcript]
  ↓ GPT-4o decides to call get_account_balance
  ↓ execute_tool("get_account_balance", {})
  ↓ returns {accounts: [...], customer_name: "Hazem Taha"}
  ↓
Turn 2 → GPT-4o: [system] [history] [user_transcript] [assistant_msg] [tool_result]
  ↓ GPT-4o returns: "رصيدك: حساب التوفير 38,200 BHD..."
```

This is the standard production pattern. It's debuggable: each turn is logged separately. The alternative (streaming) would reduce latency but add significant complexity.

### Function Calling Schema

Five tools defined in `banking_models.py`:

```python
TOOL_SCHEMAS = [
    {"name": "get_account_balance", "parameters": {...}},
    {"name": "get_recent_transactions", "parameters": {...}},
    {"name": "update_card_status", "parameters": {...}},
    {"name": "file_dispute", "parameters": {...}},
]
```

Pydantic models (`GetAccountBalanceArgs`, etc.) define the args for each tool. The docstrings become the tool descriptions sent to the LLM — they're written to be clear and TTS-friendly.

### Session State

Redis stores sessions as JSON with a 1-hour TTL:

```json
{
  "session_id": "sess_abc123",
  "customer_id": "cust-001",
  "created_at": "2026-05-03T...",
  "turns": [
    {"turn_id": "...", "role": "user", "content": "ما رصيدي؟", ...},
    {"turn_id": "...", "role": "assistant", "content": "رصيدك...", ...}
  ]
}
```

When sending to the LLM: `session.get_recent_turns(limit=10)` → last 10 turns only. Full history not sent (cost + latency + LLM context relevance).

### Error Taxonomy

```
VoiceAgentError (base)
  ├── STTError          — Transcription failed (user-facing, recoverable)
  ├── LLMError          — Provider failed (retry with backoff)
  ├── TTSError          — TTS generation failed (fallback to speechSynthesis)
  ├── ToolExecutionError — Banking tool failed
  ├── SessionError      — Redis read/write failed
  ├── ValidationError   — Request validation failed
  └── ConfigurationError — Missing config at startup (fail fast)
```

User-facing errors return friendly messages that the frontend speaks aloud. Provider errors (rate limits, 5xx) retry twice with exponential backoff, then fail with a message asking the user to try again.

---

## Data Flow: One Turn

```
1. User presses+holds mic button
2. Frontend: navigator.mediaDevices.getUserMedia → MediaRecorder.start()
3. User releases → MediaRecorder.stop() → audio chunks → Blob
4. Frontend: POST /api/v1/conversation/turn (FormData: audio + session_id)
5. Backend:
   a. STT: Whisper API → transcript + detected_language
   b. Session: Redis GET session:{session_id} → last 10 turns
   c. LLM: GPT-4o([system] [history] [transcript]) → text OR tool_calls
   d. If tools: execute each → tool results → GPT-4o second call
   e. TTS: tts-1 nova → MP3 file → path /api/v1/audio/{turn_id}
   f. Session: Redis APPEND user_turn + assistant_turn
6. Backend response: {transcript, text, audio_url, latency_ms, tool_calls}
7. Frontend: play audio (or speechSynthesis fallback) → update transcript → update latency panel
```

Total time: 1.5–2.5s on a good laptop + connection.

---

## Configuration

All config via environment variables + pydantic-settings:

```python
class Settings(BaseSettings):
    openai_api_key: str
    redis_url: str = "redis://localhost:6379/0"
    session_ttl_seconds: int = 3600
    session_turn_limit: int = 10  # turns sent to LLM
    tts_model: str = "tts-1"
    tts_voice: str = "nova"  # handles Arabic well
```

No hardcoded values. No config files. Environment variables only.

---

## Testing Strategy

**Unit tests** (`tests/unit/`):
- `test_banking.py` — Pure domain functions, no I/O, no API calls
- `test_session.py` — Session store behavior with MockRedis
- `test_prompts.py` — Prompt builder output validation

**Integration tests** (`tests/integration/`):
- `test_conversation.py` — Full pipeline with mocked OpenAI client. Tests: audio → transcript → LLM → tools → LLM2 → TTS → response shape. Also tests one failure path (rate limit retry).

**Frontend tests**:
- `conversation.test.tsx` — useConversation hook mock test (light, as designed)

No integration tests against the real OpenAI API in CI. Mock everything.

---

## Performance Considerations

**Latency** is the hardest problem in voice AI. The pipeline measures it at every stage:

```python
async with timer() as t:
    result = await stt_service.transcribe(audio)
latency_ms["stt"] = t.elapsed_ms
```

The latency panel in the UI makes this observable — a senior engineer can't *not* measure latency in a voice system.

**What dominates:** STT (audio upload) and TTS (audio generation) are the bottlenecks. LLM is fast with gpt-4o-mini/gpt-4o. Improvements would come from streaming TTS, parallel STT/LLM, and edge deployment — all documented as next steps.

**Where complexity would hurt:** WebSocket streaming, VAD, local Whisper, Celery for async tool execution — all would add meaningful complexity with marginal benefit for this scope. Choosing restraint is itself a senior signal.