"""FastAPI application entry point — Arabic Voice Banking Agent."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from voice_agent.api import routes
from voice_agent.api.schemas import HealthResponse
from voice_agent.config import get_settings
from voice_agent.lib.logger import configure_logger, get_logger
from voice_agent.services import banking, llm, session, stt, tts

settings = get_settings()
configure_logger(settings.log_level)
logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan — initialize services on startup, clean up on shutdown
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, clean up on shutdown."""
    logger.info("app_starting", version="1.0.0")

    # STT
    stt_service = stt.create_stt_service(settings.openai_api_key or None)
    logger.info("stt_service_init", available=stt_service is not None)

    # LLM
    llm_service = llm.create_llm_service(settings.openai_api_key or None)
    logger.info("llm_service_init", available=llm_service is not None)

    # TTS
    tts_service = tts.create_tts_service(settings.openai_api_key or None)
    logger.info("tts_service_init", available=settings.openai_configured)

    # Redis session store
    session_store = None
    redis_available = False
    if settings.redis_available:
        try:
            redis_client = await session.init_redis(settings.redis_url)
            session_store = session.SessionStore(redis_client)
            redis_available = True
            logger.info("redis_init_ok")
        except Exception as e:
            logger.warning("redis_init_failed", error=str(e))

    # Initialize routes with service instances
    routes.init_services(
        stt_svc=stt_service,
        llm_svc=llm_service,
        tts_svc=tts_service,
        session_store=session_store,
    )

    # Cleanup old audio on startup
    if tts_service:
        deleted = tts_service.cleanup_old_audio()
        if deleted:
            logger.info("audio_cleanup", deleted=deleted)

    logger.info(
        "app_ready",
        stt=stt_service is not None,
        llm=llm_service is not None,
        redis=redis_available,
    )

    yield

    # Shutdown
    await session.close_redis()
    logger.info("app_shutdown")


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Arabic Voice Banking Agent",
    description="Browser-based Arabic voice banking assistant — STT → LLM → TTS pipeline.",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount static (frontend + audio)
root_static = Path(__file__).parent.parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(root_static)), name="static")

# API routes
app.include_router(routes.router)


@app.get("/")
async def root():
    """Serve the frontend index.html."""
    index_path = root_static / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Frontend not found. Run the frontend dev server."}


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Top-level health check."""
    return HealthResponse(
        status="ok",
        redis=True,
        openai_stt=settings.openai_configured,
        openai_llm=settings.openai_configured,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "voice_agent.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
    )