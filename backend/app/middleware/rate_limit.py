from __future__ import annotations

import asyncio
import ipaddress
import logging
import math
import time
import uuid

from fastapi import Request
from prometheus_client import Counter
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.routing import Match

from app.core.config import get_settings
from app.core.metrics import REQUEST_COUNT
from app.core.redis import get_redis

settings = get_settings()
logger = logging.getLogger(__name__)

# Hard cap on the number of client keys tracked by the in-process fallback. With
# Redis down and a stream of unique client addresses an uncapped dict would grow
# without bound; fully-expired keys are dropped first, then the oldest ones.
MAX_IN_MEMORY_CLIENTS = 10_000


# app/core/metrics.py has no rate-limit counter and this module must not edit it,
# so the fallback owns a counter here. Throttled responses reuse the shared
# REQUEST_COUNT: the metrics middleware sits *inside* this one, so a request
# rejected here never reaches it and there is no double counting.
RATE_LIMIT_FALLBACKS = Counter(
    "rate_limit_fallback_total",
    "Requests evaluated by the in-process limiter because Redis was unavailable",
    ["reason"],
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiting: Redis-backed, with an in-process fallback.

    Over-limit requests are answered from ``dispatch`` with a real ``429``
    response (``Retry-After`` header + JSON ``detail`` body). Raising
    ``HTTPException`` here does not work: an exception raised inside
    ``BaseHTTPMiddleware.dispatch`` bypasses FastAPI's exception handlers and
    reaches the client as a ``500``.

    When Redis is not configured or raises, the limiter degrades to a bounded
    per-process window (``_in_memory_buckets``) instead of failing open: the
    site stays up, but each worker still enforces its own copy of the limit.
    """

    def __init__(self, app, requests: int = 60, window: int = 60) -> None:
        super().__init__(app)
        self.requests = requests
        self.window = window
        self._in_memory_buckets: dict[str, list[float]] = {}
        self._in_memory_lock = asyncio.Lock()
        self._redis_available = bool(settings.redis_url)
        self._last_fallback_warning: float | None = None

    async def dispatch(self, request: Request, call_next) -> Response:
        key = f"rate_limit:{self._client_key(request)}"

        if not self._redis_available:
            limited, retry_after = await self._fall_back_to_memory(key, reason="unconfigured", error=None)
        else:
            try:
                limited, retry_after = await self._check_rate_limit_redis(key)
            except Exception as error:  # noqa: BLE001 - a Redis outage must not take the API down
                limited, retry_after = await self._fall_back_to_memory(key, reason="error", error=error)
            else:
                if self._last_fallback_warning is not None:
                    logger.info("Rate limiter Redis backend recovered; leaving in-process fallback")
                    self._last_fallback_warning = None

        if not limited:
            return await call_next(request)

        return self._throttled_response(request, retry_after)

    async def _check_rate_limit_redis(self, key: str) -> tuple[bool, float]:
        """Redis sliding window. Returns ``(limited, seconds_until_a_slot_frees)``."""
        now = time.time()
        window_start = now - self.window
        # One unique member per request: with ``str(now)`` two requests that land
        # in the same clock tick share a member, the second zadd overwrites the
        # first, and the window undercounts traffic.
        member = f"{now:.6f}:{uuid.uuid4().hex}"

        redis_client = await get_redis()
        async with redis_client.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zadd(key, {member: now})
            pipe.zcard(key)
            pipe.expire(key, self.window + 1)
            results = await pipe.execute()

        # zcard runs after zadd, so this request counts itself: the Nth request
        # in the window is the last one allowed and the limit is exact.
        request_count = results[2]
        if request_count <= self.requests:
            return False, 0.0

        oldest = await redis_client.zrange(key, 0, 0, withscores=True)
        retry_after = (oldest[0][1] + self.window) - now if oldest else float(self.window)
        return True, max(retry_after, 0.0)

    async def _check_rate_limit_memory(self, key: str) -> tuple[bool, float]:
        """Bounded in-process sliding window. Returns ``(limited, seconds_until_a_slot_frees)``."""
        now = time.monotonic()
        cutoff = now - self.window

        async with self._in_memory_lock:
            bucket = self._in_memory_buckets.get(key)
            if bucket is None:
                if len(self._in_memory_buckets) >= MAX_IN_MEMORY_CLIENTS:
                    self._prune_in_memory_buckets(cutoff)
                bucket = []
                self._in_memory_buckets[key] = bucket

            if bucket and bucket[0] <= cutoff:
                bucket[:] = [seen for seen in bucket if seen > cutoff]

            if len(bucket) < self.requests:
                bucket.append(now)
                return False, 0.0

            # At or over the limit: reject without recording another timestamp so
            # a hammering client cannot grow the bucket without bound. The oldest
            # timestamp still says when a slot frees.
            return True, max(bucket[0] + self.window - now, 0.0)

    def _prune_in_memory_buckets(self, cutoff: float) -> None:
        """Drop expired keys, then oldest-inserted ones while at the cap (caller holds the lock)."""
        expired = [key for key, bucket in self._in_memory_buckets.items() if not bucket or bucket[-1] <= cutoff]
        for key in expired:
            del self._in_memory_buckets[key]
        while len(self._in_memory_buckets) >= MAX_IN_MEMORY_CLIENTS:
            self._in_memory_buckets.pop(next(iter(self._in_memory_buckets)), None)

    async def _fall_back_to_memory(
        self, key: str, *, reason: str, error: Exception | None
    ) -> tuple[bool, float]:
        RATE_LIMIT_FALLBACKS.labels(reason=reason).inc()
        now = time.monotonic()
        if self._last_fallback_warning is None or now - self._last_fallback_warning >= self.window:
            self._last_fallback_warning = now
            logger.warning(
                "Rate limiter Redis backend unavailable (%s); throttling in-process for this worker: "
                "%s requests per %s seconds",
                error or "REDIS_URL not configured",
                self.requests,
                self.window,
            )
        else:
            logger.debug("Rate limiter in-process fallback still active (%s)", error)
        return await self._check_rate_limit_memory(key)

    def _throttled_response(self, request: Request, retry_after: float) -> JSONResponse:
        retry_after_seconds = max(1, math.ceil(retry_after))
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=self._endpoint_label(request),
            status_code="429",
        ).inc()
        return JSONResponse(
            status_code=429,
            content={"detail": f"Too many requests. Limit: {self.requests} per {self.window} seconds"},
            headers={"Retry-After": str(retry_after_seconds)},
        )

    @staticmethod
    def _endpoint_label(request: Request) -> str:
        """Route template for the metrics label, mirroring app/core/metrics.py."""
        for route in getattr(request.app, "routes", []):
            match, _ = route.matches(request.scope)
            if match == Match.FULL:
                return getattr(route, "path", request.url.path)
        return request.url.path

    @staticmethod
    def _client_key(request: Request) -> str:
        """Bucket identity: first ``X-Forwarded-For`` hop when it is a valid IP, else the socket peer."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            first_hop = forwarded_for.split(",")[0].strip()
            if first_hop:
                try:
                    ipaddress.ip_address(first_hop)
                except ValueError:
                    logger.debug("Ignoring X-Forwarded-For value that is not an IP address: %r", first_hop)
                else:
                    return first_hop
        client = request.client
        if client is not None and client.host:
            return client.host
        return "unknown"
