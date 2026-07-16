from __future__ import annotations

import time
from typing import Optional

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import get_settings
from app.core.redis import get_redis

settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Redis-backed rate limiting middleware.
    
    Uses a sliding window algorithm with Redis sorted sets to track
    request timestamps per client IP.
    """

    def __init__(self, app, requests: int = 60, window: int = 60) -> None:
        super().__init__(app)
        self.requests = requests
        self.window = window

    async def dispatch(self, request: Request, call_next) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{client_ip}"
        
        if not await self._check_rate_limit(key):
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Limit: {self.requests} per {self.window} seconds"
            )
        
        return await call_next(request)

    async def _check_rate_limit(self, key: str) -> bool:
        """
        Check if request is within rate limit using sliding window.
        Returns True if allowed, False if rate limited.
        """
        now = time.time()
        window_start = now - self.window
        
        redis_client = await get_redis()
        
        # Use pipeline for atomic operations
        async with redis_client.pipeline(transaction=True) as pipe:
            # Remove old entries outside the window
            pipe.zremrangebyscore(key, 0, window_start)
            # Count requests in current window
            pipe.zcard(key)
            # Add current request
            pipe.zadd(key, {str(now): now})
            # Set expiry on the key
            pipe.expire(key, self.window + 1)
            results = await pipe.execute()
        
        request_count = results[1]  # zcard result
        
        return request_count < self.requests
