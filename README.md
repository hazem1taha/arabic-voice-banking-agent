# Arabic Voice Banking Agent

A browser-based Arabic voice banking assistant demonstrating a production voice-AI pipeline architecture.

**Stack:** React + Vite (frontend) · **Fastify + TypeScript + Node.js** (backend) · OpenAI (Whisper + GPT-4o + TTS)

**What it does:** User holds a mic button, speaks Arabic (or English), and gets a spoken Arabic response for one of four banking flows: balance inquiry, recent transactions, card status, or dispute filing. The UI shows per-turn latency breakdown and expandable tool-call inspector.

---

## Why this exists

Built to demonstrate a production voice-AI pipeline (STT → LLM → TTS with function calling and session state). The architecture, type safety, error taxonomy, and tests speak to engineering competence.

---

## What it demonstrates

- **Browser-based voice pipeline**: Web Audio API → STT (Whisper) → LLM (GPT-4o with function calling) → TTS (OpenAI tts-1) → browser audio playback
- **Multi-turn conversation**: Redis-backed session state with 1-hour TTL; last 10 turns sent to LLM (cost + latency optimization)
- **Banking-domain function calling**: 4 tools (account balance, transactions, card status, dispute filing) with typed Zod schemas and two-turn execution
- **Per-turn latency observability**: Timer utility traces STT / LLM / tools / TTS / total; rendered in the UI as a breakdown panel
- **Arabic-first behavior with English support**: Whisper auto-detects language, LLM responds in same language (Arabic default)
- **Senior engineering touches**: fully typed TypeScript throughout, custom error taxonomy (STTError / LLMError / TTSError / ToolExecutionError / SessionError), unit + integration tests

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
cp .env.example .env   # add your OPENAI_API_KEY
npm install --legacy-peer-deps
npm run dev

# 4. Frontend (new terminal)
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
Frontend (React 18 + Vite + TypeScript + Tailwind)
  ↓ POST /api/v1/conversation/turn
Backend (Fastify + TypeScript + Node.js)
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

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, TypeScript, Tailwind, TanStack Query |
| **Backend** | Fastify, TypeScript, Node.js 20, Zod, Pino |
| **Session** | Redis (TTL-backed JSON, 1hr TTL) |
| **AI** | OpenAI: Whisper (STT), GPT-4o (LLM), tts-1 (TTS) |
| **Tooling** | Jest, ts-jest, ESLint, TypeScript strict mode |
| **Infra** | Docker Compose (Redis), GitHub Actions CI |

---

## Repository structure

```
arabic-voice-banking-agent/
├── README.md
├── README.python.md         # Python/FastAPI version
├── docker-compose.yml
├── docs/
│   ├── architecture-diagram.mmd
│   ├── sequence-diagram.mmd
│   └── decision-log.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── jest.config.ts
│   ├── .env.example
│   └── src/
│       ├── main.ts              # Fastify app entry
│       ├── config.ts             # Zod-powered env validation
│       ├── routes/
│       │   └── conversation.ts   # /api/v1/* endpoints
│       ├── services/
│       │   ├── banking.ts       # Mock banking actions
│       │   ├── llm.ts           # GPT-4o + two-turn function calling
│       │   ├── session.ts       # Redis session store
│       │   ├── stt.ts           # Whisper transcription
│       │   └── tts.ts           # OpenAI TTS
│       ├── domain/
│       │   ├── conversation.ts  # Turn + Session models
│       │   └── banking-models.ts # Tool schemas for GPT-4o
│       └── lib/
│           ├── errors.ts          # STTError, LLMError, TTSError, etc.
│           ├── timer.ts           # Performance timing
│           ├── logger.ts          # Pino structured logger
│           └── error-schemas.ts   # Fastify error schemas
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx
        ├── components/{VoiceButton,Transcript,LatencyPanel}.tsx
        ├── hooks/{useAudioRecording,useConversation}.ts
        └── lib/api.ts
```

---

## Deploy guide

**Backend:**
```bash
# Production build
npm run build
npm start

# Docker
docker build -t voice-agent-backend -f Dockerfile ..
docker run -p 8000:8000 --env-file .env voice-agent-backend
```

**Frontend:**
```bash
npm run build   # produces dist/
# Deploy to Vercel, Netlify, or Cloudflare Pages
```

---

## License

MIT — [Hazem Taha](https://github.com/hazem1taha)
