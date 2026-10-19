"""LLM call counter, persisted to `<data_dir>/usage.json` so it survives restarts."""

import json
import logging
import threading
import time
from collections import deque
from datetime import UTC, datetime
from pathlib import Path

from server.schemas import UsageStats

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60.0


class UsageTracker:
    def __init__(self, path: Path, rate_limit_per_minute: int):
        self.path = path
        self.rate_limit_per_minute = rate_limit_per_minute
        self._lock = threading.Lock()
        self._total = 0
        self._since = datetime.now(UTC).isoformat()
        # Unix timestamps of calls in the last minute, oldest first.
        self._recent: deque[float] = deque()
        self._load()

    def record(self) -> None:
        """Count one LLM call."""
        with self._lock:
            now = time.time()
            self._total += 1
            self._recent.append(now)
            self._prune(now)
            self._save()

    def snapshot(self) -> UsageStats:
        with self._lock:
            self._prune(time.time())
            return UsageStats(
                llm_calls_last_minute=len(self._recent),
                llm_calls_total=self._total,
                rate_limit_per_minute=self.rate_limit_per_minute,
                tracking_since=self._since,
            )

    def _prune(self, now: float) -> None:
        while self._recent and self._recent[0] <= now - WINDOW_SECONDS:
            self._recent.popleft()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text())
            self._total = int(data["total"])
            self._since = str(data["since"])
            self._recent = deque(float(t) for t in data.get("recent", []))
            self._prune(time.time())
        except (ValueError, KeyError, TypeError) as exc:
            # A corrupt file shouldn't stop the server; start counting afresh.
            logger.warning("Ignoring unreadable usage file: %s", exc)

    def _save(self) -> None:
        # Write then rename, so a crash mid-write never leaves a truncated file.
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps({"total": self._total, "since": self._since, "recent": list(self._recent)})
        )
        tmp.replace(self.path)
