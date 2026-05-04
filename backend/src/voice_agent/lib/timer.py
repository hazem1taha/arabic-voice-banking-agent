"""Async timer context manager for latency tracking."""

import time
from dataclasses import dataclass, field


@dataclass
class TimingResult:
    """Result from a timed block."""

    elapsed_ms: float = 0.0

    def __enter__(self) -> "TimingResult":
        self._start = time.perf_counter()
        return self

    def __exit__(self, *args: object) -> None:
        self.elapsed_ms = (time.perf_counter() - self._start) * 1000.0

    async def __aenter__(self) -> "TimingResult":
        self._start = time.perf_counter()
        return self

    async def __aexit__(self, *args: object) -> None:
        self.elapsed_ms = (time.perf_counter() - self._start) * 1000.0


def timer() -> TimingResult:
    """Returns a TimingResult usable as sync or async context manager."""
    return TimingResult()


def sync_timer() -> TimingResult:
    """Synchronous timer for non-async contexts."""
    return TimingResult()