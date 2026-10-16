"""Per-key sliding-window rate limiter (pure, in-memory, per instance)."""

from __future__ import annotations

import time
from collections import deque

_MAX_KEYS = 10_000


class SlidingWindow:
    def __init__(self, limit: int = 30, window_s: int = 600, now=time.monotonic):
        self.limit = limit
        self.window_s = window_s
        self._now = now
        self._hits: dict[str, deque] = {}  # insertion-ordered: oldest key first

    def allow(self, key: str) -> bool:
        t = self._now()
        hits = self._hits.get(key)
        if hits is None:
            if len(self._hits) >= _MAX_KEYS:
                del self._hits[next(iter(self._hits))]
            hits = self._hits[key] = deque()
        while hits and hits[0] <= t - self.window_s:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(t)
        return True
