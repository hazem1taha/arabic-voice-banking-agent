# Arabic Voice Banking Agent (Python / FastAPI)

> **You are on the `python-backend` branch.** For the TypeScript version, see the `main` branch.

A browser-based Arabic voice banking assistant demonstrating a production voice-AI pipeline architecture.

**Stack:** React + Vite (frontend) · **FastAPI + Python 3.11** + Redis (backend) · OpenAI (Whisper + GPT-4o + TTS)

---

## Run locally

```bash
# 1. Clone
git clone https://github.com/hazem1taha/arabic-voice-banking-agent.git
cd arabic-voice-banking-agent

# 2. Start Redis (requires Docker)
docker compose up -d redis

# 3. Backend
cd backend
cp .env.example .env   # add your OPENAI_API_KEY
uv sync
uv run uvicorn voice_agent.main:app --reload --port 8000

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — click and hold the mic, speak Arabic.

---

## Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, TypeScript, Tailwind |
| **Backend** | FastAPI, Python 3.11, uv, Pydantic v2, structlog |
| **Session** | Redis (TTL-backed JSON, 1hr TTL) |
| **AI** | OpenAI: Whisper (STT), GPT-4o (LLM), tts-1 (TTS) |
| **Tooling** | ruff, mypy --strict, pytest, pytest-asyncio |

---

## Repository structure

```
backend/
├── pyproject.toml
├── src/voice_agent/
│   ├── main.py
│   ├── config.py
│   ├── api/routes.py
│   ├── api/schemas.py
│   ├── services/{stt,llm,tts,banking,session}.py
│   ├── domain/{conversation,banking_models,prompts}.py
│   └── lib/{errors,timer,logger}.py
├── data/mock_banking.json
└── tests/unit/ + integration/
```

---

## License

MIT — [Hazem Taha](https://github.com/hazem1taha)
