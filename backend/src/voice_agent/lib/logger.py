"""Structured JSON logger — thin wrapper over structlog."""

import structlog
from structlog.types import EventDict, Processor


def add_log_level(event: EventDict) -> EventDict:
    """Add 'level' key from structlog's built-in."""
    return event


def configure_logger(log_level: str = "INFO") -> None:
    """Configure structlog with JSON output for production."""
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a bound logger for a module."""
    return structlog.get_logger(name)