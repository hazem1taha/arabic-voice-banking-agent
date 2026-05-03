# Changelog

All notable changes to this project.

## [1.0.0] — 2026-05-03

### Added
- Full monorepo: FastAPI backend + React frontend
- STT → LLM → TTS voice pipeline with Whisper + GPT-4o + OpenAI tts-1
- Four banking flows: balance inquiry, recent transactions, card status, dispute filing
- Two-turn LLM pattern with function calling
- Redis-backed session state (1hr TTL, last-10-turns truncation)
- Per-turn latency observability (STT / LLM / Tools / TTS / Total)
- Arabic-first with English support (Whisper auto-detects language)
- Dark-theme React UI with RTL support, latency panel, tool call inspector
- Typed Pydantic schemas throughout backend
- Custom exception taxonomy (STTError / LLMError / TTSError / ToolExecutionError / SessionError)
- Async timer context manager for latency tracking
- Structured JSON logging via structlog
- ADR decision log (7 entries)
- Mermaid architecture + sequence diagrams
- GitHub Actions CI (parallel backend + frontend jobs)
- Docker Compose for Redis
- Makefile for common dev tasks