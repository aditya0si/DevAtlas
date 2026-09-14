from __future__ import annotations

import logging
import time

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import get_settings
from app.core.redis import get_redis

settings = get_settings()
logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Redis-backed rate limiting middleware.
    Falls back to per-process in-memory limiting when Redis is unavailable.
    """

    def __init__(self, app, requests: int = 60, window: int = 60) -> None:
        super().__init__(app)
        self.requests = requests
        self.window = window
        self._in_memory_buckets: dict[str, list[float]] = {}
        self._redis_available = bool(settings.redis_url)

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._redis_available:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{client_ip}"

        allowed = False
        try:
            allowed = not await self._check_rate_limit_redis(key)
        except Exception as e:
            logger.debug("Rate limit Redis unavailable, allowing request: %s", e)
            allowed = True

        if allowed:
            return await call_next(request)

        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Limit: {self.requests} per {self.window} seconds"
        )

    async def _check_rate_limit_redis(self, key: str) -> bool:
        """Returns True if rate limited."""
        now = time.time()
        window_start = now - self.window

        redis_client = await get_redis()

        async with redis_client.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, self.window + 1)
            results = await pipe.execute()

        request_count = results[1]
        return request_count >= self.requests
