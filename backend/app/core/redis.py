from __future__ import annotations

import asyncio
from typing import Optional

import redis.asyncio as redis
from redis.asyncio import Redis

from app.core.config import get_settings

settings = get_settings()

_redis_client: Optional[Redis] = None
_redis_loop: Optional[asyncio.AbstractEventLoop] = None


async def get_redis() -> Redis:
    """Get or create the Redis client bound to the *current* event loop.

    The client is cached, but redis-py clients belong to the loop that created them: reusing one
    from another loop raises ``RuntimeError: Event loop is closed``. That happens for real in
    pytest-asyncio (a fresh loop per test) and in a restarted worker loop, so the cache is keyed on
    the running loop and a stale client is replaced instead of raising. Callers that care about
    availability (the AI cost guard) still fail closed on a genuine connection error.
    """
    global _redis_client, _redis_loop

    loop = asyncio.get_running_loop()
    if _redis_client is None or _redis_loop is not loop:
        if not settings.redis_url:
            raise RuntimeError("REDIS_URL is not configured")
        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
        )
        _redis_loop = loop
    return _redis_client


async def close_redis() -> None:
    """Release the cached client. Safe to call on shutdown, including from a different loop."""
    global _redis_client, _redis_loop

    client = _redis_client
    _redis_client = None
    _redis_loop = None
    if client is None:
        return

    try:
        # redis>=5 deprecates ``close()`` in favour of ``aclose()``.
        aclose = getattr(client, "aclose", None)
        if aclose is not None:
            await aclose()
        else:
            await client.close()
    except RuntimeError:
        # The client belongs to a loop that is already closed; there is nothing left to release.
        pass


def reset_redis_state() -> None:
    """Drop the cached client without touching the network (test isolation helper)."""
    global _redis_client, _redis_loop
    _redis_client = None
    _redis_loop = None
