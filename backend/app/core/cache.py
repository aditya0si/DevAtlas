"""
Redis caching service for hot data.

Caches:
- Repository lists (TTL: 5 minutes)
- Geospatial activity queries (TTL: 2 minutes)
- User sessions (TTL: 30 minutes)
- Rate limit counters (TTL: 1 minute)
"""

from __future__ import annotations

import hashlib
import json
from datetime import timedelta
from typing import Any, Optional

import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()


class CacheService:
    """Redis-backed caching service with automatic serialization."""

    # Default TTLs
    DEFAULT_TTL = 300  # 5 minutes
    GEOSPATIAL_TTL = 120  # 2 minutes
    SESSION_TTL = 1800  # 30 minutes

    def __init__(self) -> None:
        self._client: Optional[redis.Redis] = None

    async def get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(
                settings.redis_url or "redis://localhost:6379/0",
                encoding="utf-8",
                decode_responses=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    def _make_key(self, namespace: str, *args: Any) -> str:
        """Generate a cache key from namespace and arguments."""
        parts = [namespace] + [str(arg) for arg in args]
        return ":".join(parts)

    def _make_hash_key(self, namespace: str, data: dict[str, Any]) -> str:
        """Generate a hash-based cache key from a dictionary."""
        data_str = json.dumps(data, sort_keys=True)
        hash_val = hashlib.md5(data_str.encode()).hexdigest()[:12]
        return f"{namespace}:{hash_val}"

    async def get(self, key: str) -> Optional[Any]:
        """Get a value from cache."""
        client = await self.get_client()
        value = await client.get(key)
        if value is None:
            return None
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int = DEFAULT_TTL,
    ) -> None:
        """Set a value in cache with TTL."""
        client = await self.get_client()
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        await client.setex(key, timedelta(seconds=ttl), value)

    async def delete(self, key: str) -> None:
        """Delete a key from cache."""
        client = await self.get_client()
        await client.delete(key)

    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern."""
        client = await self.get_client()
        keys = []
        async for key in client.scan_iter(match=pattern):
            keys.append(key)
        if keys:
            return await client.delete(*keys)
        return 0

    async def get_or_set(
        self,
        key: str,
        factory: Any,
        ttl: int = DEFAULT_TTL,
    ) -> Any:
        """
        Get from cache or execute factory and cache the result.
        Factory should be an async callable.
        """
        cached = await self.get(key)
        if cached is not None:
            return cached
        value = await factory()
        await self.set(key, value, ttl)
        return value

    # ─────────────────────────────────────────────────────────────
    # Domain-specific cache operations
    # ─────────────────────────────────────────────────────────────

    async def get_repositories(
        self,
        language: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached repository list."""
        key = self._make_key(
            "repos",
            f"lang:{language or 'all'}",
            f"limit:{limit}",
            f"offset:{offset}",
        )
        return await self.get(key)

    async def set_repositories(
        self,
        repositories: list[dict[str, Any]],
        language: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> None:
        """Cache repository list."""
        key = self._make_key(
            "repos",
            f"lang:{language or 'all'}",
            f"limit:{limit}",
            f"offset:{offset}",
        )
        await self.set(key, repositories, ttl=self.DEFAULT_TTL)

    async def invalidate_repositories(self) -> int:
        """Invalidate all repository caches."""
        return await self.delete_pattern("repos:*")

    async def get_geospatial_activity(
        self,
        bbox: str,
        limit: int = 100,
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached geospatial activity data."""
        key = self._make_key("geo", f"bbox:{bbox}", f"limit:{limit}")
        return await self.get(key)

    async def set_geospatial_activity(
        self,
        activity: list[dict[str, Any]],
        bbox: str,
        limit: int = 100,
    ) -> None:
        """Cache geospatial activity data."""
        key = self._make_key("geo", f"bbox:{bbox}", f"limit:{limit}")
        await self.set(key, activity, ttl=self.GEOSPATIAL_TTL)

    async def invalidate_geospatial(self) -> int:
        """Invalidate all geospatial caches."""
        return await self.delete_pattern("geo:*")

    async def get_github_user(self, login: str) -> Optional[dict[str, Any]]:
        key = self._make_key("github_user", login)
        return await self.get(key)

    async def set_github_user(self, login: str, data: dict[str, Any]) -> None:
        key = self._make_key("github_user", login)
        await self.set(key, data, ttl=86400)  # 24 hours

    async def get_geocode(self, normalized_location: str) -> Optional[dict[str, Any]]:
        key = self._make_key("geocode", normalized_location)
        return await self.get(key)

    async def set_geocode(self, normalized_location: str, data: dict[str, Any]) -> None:
        key = self._make_key("geocode", normalized_location)
        await self.set(key, data, ttl=86400 * 7)  # 7 days

    async def invalidate_location(self, normalized_location: str) -> None:
        key = self._make_key("geocode", normalized_location)
        await self.delete(key)

    async def get_user_session(self, user_id: str) -> Optional[dict[str, Any]]:
        """Get cached user session data."""
        key = self._make_key("session", user_id)
        return await self.get(key)

    async def set_user_session(
        self,
        user_id: str,
        session_data: dict[str, Any],
    ) -> None:
        """Cache user session data."""
        key = self._make_key("session", user_id)
        await self.set(key, session_data, ttl=self.SESSION_TTL)

    async def invalidate_user_session(self, user_id: str) -> None:
        """Invalidate a user session."""
        key = self._make_key("session", user_id)
        await self.delete(key)

    async def get_events(
        self,
        event_type: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached events list."""
        key = self._make_key(
            "events",
            f"type:{event_type or 'all'}",
            f"limit:{limit}",
            f"offset:{offset}",
        )
        return await self.get(key)

    async def set_events(
        self,
        events: list[dict[str, Any]],
        event_type: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> None:
        """Cache events list."""
        key = self._make_key(
            "events",
            f"type:{event_type or 'all'}",
            f"limit:{limit}",
            f"offset:{offset}",
        )
        await self.set(key, events, ttl=self.DEFAULT_TTL)

    async def invalidate_events(self) -> int:
        """Invalidate all event caches."""
        return await self.delete_pattern("events:*")

    async def cache_health_status(self, status: dict[str, Any]) -> None:
        """Cache health check status (short TTL for freshness)."""
        await self.set("health:status", status, ttl=30)

    async def get_health_status(self) -> Optional[dict[str, Any]]:
        """Get cached health status."""
        return await self.get("health:status")


# Singleton instance
_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get or create the cache service singleton."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service


async def close_cache_service() -> None:
    """Close the cache service connection."""
    global _cache_service
    if _cache_service is not None:
        await _cache_service.close()
        _cache_service = None
