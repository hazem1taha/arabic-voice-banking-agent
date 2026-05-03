"""API route handlers — all under /api/v1/."""

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from voice_agent.api.schemas import (
    ConversationHistoryResponse,
    ConversationTurnResponse,
    ErrorResponse,
    HealthResponse,
    LatencyMs,
    ToolCallItem,
    TurnResponse,
)
from voice_agent.lib.errors import SessionError, STTError, LLMError, TTSError, ToolExecutionError
from voice_agent.lib.logger import get_logger
from voice_agent.lib.timer import TimingResult, timer
from voice_agent.services import banking, llm, session, stt, tts

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["voice"])


# ─────────────────────────────────────────────────────────────────────────────
# State — initialized by main.py lifespan
# ─────────────────────────────────────────────────────────────────────────────

_stt_service: stt.STTService | None = None
_llm_service: llm.LLMService | None = None
_tts_service: tts.TTSService | None = None
_session_store: session.SessionStore | None = None


def init_services(
    stt_svc: stt.STTService | None,
    llm_svc: llm.LLMService | None,
    tts_svc: tts.TTSService,
    session_store: session.SessionStore | None,
) -> None:
    global _stt_service, _llm_service, _tts_service, _session_store
    _stt_service = stt_svc
    _llm_service = llm_svc
    _tts_service = tts_svc
    _session_store = session_store


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness check with service availability."""
    redis_ok = False
    if _session_store:
        try:
            s = await _session_store.get("__health__")
            redis_ok = True
        except Exception:
            pass

    return HealthResponse(
        status="ok" if (_llm_service and _stt_service) else "degraded",
        redis=redis_ok,
        openai_stt=_stt_service is not None,
        openai_llm=_llm_service is not None,
    )


@router.post(
    "/conversation/turn",
    response_model=ConversationTurnResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def conversation_turn(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
) -> ConversationTurnResponse:
    """Receive audio, run pipeline (STT→LLM→TTS), return response."""
    turn_id = uuid.uuid4().hex[:12]
    latency_ms: dict[str, float] = {}

    # ── STT ──────────────────────────────────────────────────────────────────
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, detail="No audio data received")

    try:
        async with timer() as t_stt:
            stt_result = await _stt_service.transcribe(audio_bytes, audio.filename or "audio.webm")
        latency_ms["stt"] = t_stt.elapsed_ms
    except STTError as e:
        logger.error("stt_failed", session_id=session_id, error=str(e))
        raise HTTPException(500, detail={
            "error": "STT_FAILED",
            "message": "I didn't catch that — could you repeat?",
            "details": e.to_dict(),
        })

    user_transcript = stt_result.transcript.strip()
    language_detected = stt_result.language

    # ── Get session and recent turns ────────────────────────────────────────
    session_turns: list[dict] = []
    if _session_store:
        try:
            s = await _session_store.get(session_id)
            if s:
                session_turns = _session_store.get_recent_turns_dict(s)
        except SessionError as e:
            logger.warning("session_read_failed", session_id=session_id, error=str(e))

    # ── LLM ─────────────────────────────────────────────────────────────────
    llm_result: llm.LLMResult | None = None
    try:
        async with timer() as t_llm:
            llm_result = await _llm_service.generate(
                user_transcript=user_transcript,
                conversation_turns=session_turns,
                language_detected=language_detected,
                stt_timing_ms=latency_ms.get("stt", 0.0),
            )
        latency_ms["llm"] = t_llm.elapsed_ms
    except LLMError as e:
        logger.error("llm_failed", session_id=session_id, error=str(e))
        raise HTTPException(500, detail={
            "error": "LLM_FAILED",
            "message": "Something went wrong on my end — please try again.",
            "details": e.to_dict(),
        })

    assistant_text = llm_result.text

    # ── TTS ─────────────────────────────────────────────────────────────────
    audio_url: str | None = None
    if _tts_service and assistant_text:
        try:
            async with timer() as t_tts:
                audio_url = await _tts_service.speak(assistant_text, turn_id)
            latency_ms["tts"] = t_tts.elapsed_ms
        except TTSError as e:
            logger.warning("tts_failed", turn_id=turn_id, error=str(e))
            audio_url = None

    # ── Tools latency ────────────────────────────────────────────────────────
    tool_calls_result = llm_result.tool_calls
    latency_ms["tools"] = 0.0  # tools are synchronous within LLM call; included in llm timing
    latency_ms["total"] = sum(latency_ms.values())

    # ── Save turn to session ─────────────────────────────────────────────────
    from voice_agent.domain.conversation import Turn

    user_turn = Turn(
        turn_id=turn_id,
        role="user",
        content=user_transcript,
        language_detected=language_detected,
    )
    assistant_turn = Turn(
        turn_id=turn_id + "_a",
        role="assistant",
        content=assistant_text,
        tool_calls=[
            ToolCallItem(name=tc["name"], args=tc.get("args", {}), result=tc.get("result"))
            for tc in tool_calls_result
        ],
        latency_ms=latency_ms,
    )

    if _session_store:
        try:
            await _session_store.append_turn(session_id, user_turn)
            await _session_store.append_turn(session_id, assistant_turn)
        except SessionError as e:
            logger.warning("session_write_failed", session_id=session_id, error=str(e))

    # ── Build response ───────────────────────────────────────────────────────
    return ConversationTurnResponse(
        session_id=session_id,
        turn_id=turn_id,
        user_transcript=user_transcript,
        user_language_detected=language_detected,
        assistant_text=assistant_text,
        assistant_audio_url=audio_url,
        tool_calls=[
            ToolCallItem(name=tc["name"], args=tc.get("args", {}), result=tc.get("result"))
            for tc in tool_calls_result
        ],
        latency_ms=LatencyMs(
            stt=latency_ms.get("stt", 0.0),
            llm=latency_ms.get("llm", 0.0),
            tools=latency_ms.get("tools", 0.0),
            tts=latency_ms.get("tts", 0.0),
            total=latency_ms.get("total", 0.0),
        ),
    )


@router.get("/audio/{turn_id}")
async def get_audio(turn_id: str) -> FileResponse:
    """Serve generated TTS audio."""
    audio_dir = Path(__file__).parent.parent.parent.parent / "static" / "audio"
    filename = f"response_{turn_id}.mp3"
    filepath = audio_dir / filename

    if not filepath.exists():
        raise HTTPException(404, detail="Audio not found")

    return FileResponse(
        filepath,
        media_type="audio/mpeg",
        filename=filename,
    )


@router.get("/conversation/{session_id}", response_model=ConversationHistoryResponse)
async def get_conversation(session_id: str) -> ConversationHistoryResponse:
    """Get full conversation history (transcripts only, no audio)."""
    if not _session_store:
        raise HTTPException(503, detail="Session store unavailable")

    s = await _session_store.get(session_id)
    if not s:
        raise HTTPException(404, detail="Session not found")

    return ConversationHistoryResponse(
        session_id=session_id,
        customer_id=s.customer_id,
        turns=[
            TurnResponse(
                turn_id=t.turn_id,
                role=t.role,
                content=t.content,
                tool_calls=[
                    ToolCallItem(name=tc.name, args=tc.args, result=tc.result)
                    for tc in t.tool_calls
                ],
                timestamp=t.timestamp.isoformat(),
                language_detected=t.language_detected,
            )
            for t in s.turns
        ],
    )


@router.delete("/conversation/{session_id}")
async def delete_conversation(session_id: str) -> dict[str, str]:
    """Clear session state."""
    if not _session_store:
        raise HTTPException(503, detail="Session store unavailable")

    deleted = await _session_store.delete(session_id)
    if not deleted:
        raise HTTPException(404, detail="Session not found")

    return {"status": "cleared", "session_id": session_id}