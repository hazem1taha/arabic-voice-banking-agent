# Arabic Voice Banking Agent

A browser-based Arabic voice banking assistant demonstrating a production voice-AI pipeline architecture.

**Stack:** React + Vite (frontend) · FastAPI + Python 3.11 + Redis (backend) · OpenAI (Whisper + GPT-4o + TTS)

**What it does:** User holds a mic button, speaks Arabic (or English), and gets a spoken Arabic response for one of four banking flows: balance inquiry, recent transactions, card status, or dispute filing. The UI shows per-turn latency breakdown and expandable tool-call inspector.

---

## Why this exists

I built this ahead of an interview at [Sarj.ai](https://sarj.ai) — a company building Arabic-first voice AI agents for banks, hospitals, and government. The repo demonstrates that I understand voice-AI pipeline architecture (STT → LLM → TTS with function calling and session state), not that I'm a Python ML expert. The Python may not be the most idiomatic (I'm ramping on Python), but the structure, type hints, error taxonomy, and tests speak to engineering competence.

---

## What it demonstrates

- **Browser-based voice pipeline**: Web Audio API → STT (Whisper) → LLM (GPT-4o with function calling) → TTS (OpenAI tts-1) → browser audio playback
- **Multi-turn conversation**: Redis-backed session state with 1-hour TTL; last 10 turns sent to LLM (cost + latency optimization)
- **Banking-domain function calling**: 4 tools (account balance, transactions, card status, dispute filing) with typed Pydantic schemas and two-turn execution
- **Per-turn latency observability**: Timer context manager traces STT / LLM / tools / TTS / total; rendered in the UI as a breakdown panel
- **Arabic-first behavior with English support**: Whisper auto-detects language, LLM responds in same language (Arabic default)
- **Senior engineering touches**: typed schemas throughout, custom exception taxonomy (STTError / LLMError / TTSError / ToolExecutionError / SessionError), tests with mocked external calls

---

## Run locally in 2 minutes

```bash
# 1. Clone
git clone https://github.com/hazem1taha/arabic-voice-banking-agent.git
cd arabic-voice-banking-agent

# 2. Start Redis (requires Docker)
docker compose up -d redis

# 3. Backend
cd backend
cp ../.env.example .env   # add your OPENAI_API_KEY
uv sync
uv run uvicorn voice_agent.main:app --reload --port 8000

# 4. Frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — click and hold the mic button, speak Arabic.

---

## Architecture

```
Browser (mic + speakers)
  ↓ hold-to-talk
Frontend (React 18 + Vite + Tailwind)
  ↓ POST /api/v1/conversation/turn
Backend (FastAPI + Python 3.11)
  1. Whisper STT → transcript + detected language
  2. Load last 10 turns from Redis
  3. GPT-4o with function calling (may fire tools)
  4. Execute banking tools → results
  5. GPT-4o second turn if tools fired (tool results → final text)
  6. OpenAI TTS (tts-1, nova voice)
  7. Append turns to Redis session
  ↓ returns: transcript, response, audio_url, latency_ms, tool_calls
Frontend plays audio, updates transcript, renders latency panel + tool inspector
```

See `docs/architecture-diagram.mmd` and `docs/sequence-diagram.mmd` for Mermaid source.

---

## Voice-AI design decisions

**Hold-to-talk instead of VAD.** I chose push-to-talk over voice activity detection. VAD adds complexity (threshold tuning per microphone, ambient noise handling, overlapping speech) for a marginal UX improvement. In a portfolio context, reliability > convenience.

**Two-turn LLM with tools.** When GPT-4o fires a tool, I execute it, then call the LLM again with the results to get the final response text. This is the standard production pattern — it's debuggable (you can log each turn), and the latency cost is acceptable for a banking agent where responses are 10-30 words.

**OpenAI Whisper API.** Self-hosted Whisper requires a ~2GB model + GPU/CPU infrastructure. The API handles Arabic well, auto-detects dialect, and has a simple SDK. Per-request cost is ~$0.006/min — negligible for a demo.

**Redis for session state.** Sessions are ephemeral JSON with a 1-hour TTL. Redis fits this shape better than a relational DB, handles multi-process sharing (uvicorn workers), and TTL-based expiry is cleaner than a cleanup job. In-memory was rejected because multiple workers don't share memory.

**No LangChain.** Direct OpenAI SDK + manual function calling. LangChain would abstract the primitives I want to demonstrate — showing `chain.invoke()` isn't the signal. Hand-rolling the two-turn pattern shows actual understanding.

**Last-10-turns truncation.** Sending full history to the LLM is expensive and slow. 10 turns covers most banking scenarios (balance, transactions, card — all 1-2 turns). The number is configurable via `SESSION_TURN_LIMIT`. Production would use semantic retrieval for longer contexts.

---

## Latency budget

Measured on my laptop with a good connection, Arabic input:

| Stage | Typical | Notes |
|-------|---------|-------|
| **STT** (Whisper) | 300–500ms | Dominated by audio upload + Whisper processing |
| **LLM** (GPT-4o) | 400–800ms | First token is the bottleneck; full response ~600ms |
| **Tools** | 50–150ms | Mock data, no real I/O |
| **TTS** (tts-1) | 300–600ms | Audio generation + MP3 encoding |
| **Total** | **1.1–2.1s** | End-to-end on good connection |

STT and TTS dominate. Production improvements:
- Streaming TTS (chunked playback reduces perceived latency significantly)
- Smaller/faster STT model at edge (self-hosted Whisper on GPU)
- Parallel STT/LLM (send audio off, start LLM processing while STT runs)
- Edge deployment (move Whisper + TTS to a region near the user)

All of these are out of scope for this repo. They're documented as clear next steps, not hidden limitations.

---

## Arabic + dialect handling

**MSA works end-to-end.** The system prompt and TTS voice use Modern Standard Arabic. This is the shared register that all Arabic speakers understand, even if they speak dialectally in daily life.

**Whisper handles dialect transcription well.** Trained on large MENA datasets, Whisper auto-detects Arabic dialect (Egyptian, Khaleeji, Levantine) and transcribes it accurately. The LLM understands dialect text natively.

**TTS responds in MSA.** The `nova` voice from OpenAI is trained on MSA — it reads digits naturally and handles formal Arabic well. Using a dialect TTS voice would feel more natural for Egyptian or Khaleeji speakers, but that's a production addition.

**Production dialect handling would add:**
1. A lightweight dialect classifier upstream of the LLM (rule-based or small model)
2. Dialect-aware system prompt (switch Arabic flavor based on detected dialect)
3. Dialect-matched TTS voice (one of several Arabic voices on ElevenLabs or OpenAI)

This is a known gap, not a bug. I addressed it in the decision log so the Sarj.ai reviewer knows I've thought about it.

---

## What's not here

Explicit out of scope — not hidden, just documented:

- **Telephony** (Twilio integration). Next step for a phone-based version.
- **Real authentication** (PIN/OTP/biometric). Every session starts as "Hazem Taha, cust-001."
- **Real banking integration**. All data is mocked in `backend/data/mock_banking.json`.
- **Streaming TTS**. Out of scope; document in design decisions.
- **VAD** (voice activity detection). Hold-to-talk is intentional.
- **Production-grade dialect handling**. MSA is the baseline; dialect-specific is a next step.
- **Multi-tenancy** with role-based access. Single customer mock.
- **Mobile app** version. Browser-only for this scope.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, TypeScript, Tailwind, TanStack Query |
| **Backend** | FastAPI, Python 3.11, uv, Pydantic v2, structlog |
| **Session** | Redis (TTL-backed JSON, 1hr TTL) |
| **AI** | OpenAI: Whisper (STT), GPT-4o (LLM), tts-1 (TTS) |
| **Tooling** | ruff, mypy --strict, pytest, pytest-asyncio |
| **Infra** | Docker Compose (Redis), GitHub Actions CI |

---

## Repository structure

```
arabic-voice-banking-agent/
├── README.md
├── ARCHITECTURE.md
├── Makefile
├── docker-compose.yml
├── .env.example
├── .github/workflows/ci.yml
├── docs/
│   ├── architecture-diagram.mmd
│   ├── sequence-diagram.mmd
│   └── decision-log.md
├── backend/
│   ├── pyproject.toml          # uv + all deps
│   ├── src/voice_agent/
│   │   ├── main.py             # FastAPI app + lifespan
│   │   ├── config.py           # pydantic-settings
│   │   ├── api/routes.py       # /api/v1/* endpoints
│   │   ├── api/schemas.py      # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── stt.py          # Whisper wrapper
│   │   │   ├── llm.py          # GPT-4o + two-turn function calling
│   │   │   ├── tts.py          # OpenAI TTS wrapper
│   │   │   ├── banking.py      # Mock banking actions
│   │   │   └── session.py      # Redis-backed session store
│   │   ├── domain/
│   │   │   ├── conversation.py # Turn + Session models
│   │   │   ├── banking_models.py # Account, Card, Transaction, Dispute + tool schemas
│   │   │   └── prompts.py       # Arabic + English system prompts
│   │   └── lib/
│   │       ├── errors.py        # STTError, LLMError, TTSError, etc.
│   │       ├── timer.py         # Async timer context manager
│   │       └── logger.py         # Structured JSON logger
│   ├── data/mock_banking.json
│   └── tests/
│       ├── unit/
│       │   ├── test_banking.py
│       │   ├── test_session.py
│       │   └── test_prompts.py
│       └── integration/
│           └── test_conversation.py  # Full pipeline, mocked OpenAI
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── VoiceButton.tsx
    │   │   ├── Transcript.tsx
    │   │   ├── LatencyPanel.tsx
    │   │   └── ToolCallView.tsx
    │   ├── hooks/
    │   │   ├── useAudioRecording.ts
    │   │   └── useConversation.ts
    │   ├── lib/api.ts
    │   └── styles/globals.css
    └── tests/
        └── conversation.test.tsx
```

---

## Deploy guide

A guide, not an automated workflow. No live demo is hosted — OpenAI API costs would accumulate on a portfolio repo.

**Backend:**
```bash
# Dockerfile provided. Build and run anywhere.
docker build -t voice-agent .
docker run -p 8000:8000 --env-file .env voice-agent

# Or one-command deploy to Render/Fly.io/Railway:
# Render: connect GitHub repo → Dockerfile → automatic deploys
```

**Frontend:**
```bash
npm run build   # produces dist/
# Deploy dist/ to Vercel, Netlify, or Cloudflare Pages
# Zero-config: Vercel and Netlify auto-detect static SPA
```

**Redis:**
- Local: `docker compose up -d redis`
- Managed: [Upstash](https://upstash.com) free tier works fine
- Render: add a Redis add-on to the backend service

**API cost estimate:** At current rates (Whisper ~$0.006/min, GPT-4o ~$0.003/input turn, tts-1 ~$0.015/1k chars), a 5-minute conversation costs roughly **$0.05–$0.10**. Negligible for a demo, meaningful at scale.

---

## License

MIT — [Hazem Taha](https://github.com/hazem1taha)