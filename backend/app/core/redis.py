from __future__ import annotations

from typing import Optional

import redis.asyncio as redis
from redis.asyncio import Redis

from app.core.config import get_settings

settings = get_settings()

_redis_client: Optional[Redis] = None


async def get_redis() -> Redis:
    """Get or create Redis client connection. Raises if redis_url is not set."""
    global _redis_client
    if _redis_client is None:
        if not settings.redis_url:
            raise RuntimeError("REDIS_URL is not configured")
        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
        )
    return _redis_client


async def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
