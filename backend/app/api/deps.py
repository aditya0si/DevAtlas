from __future__ import annotations

import logging
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decode_access_token
from app.models.user import User
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

DbDep = Annotated[AsyncSession, Depends(get_db)]

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency to get the current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None or payload.sub is None:
        raise credentials_exception

    repository = UserRepository(db)
    user = await repository.get_by_id(payload.sub)

    if user is None:
        raise credentials_exception

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_verified_user(
    current_user: CurrentUser,
) -> User:
    """Dependency to require a verified email."""
    if not current_user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required",
        )
    return current_user


VerifiedUser = Annotated[User, Depends(get_verified_user)]


# ─────────────────────────────────────────────────────────────
# Admin API key guard (mutating / operational endpoints)
# ─────────────────────────────────────────────────────────────

ADMIN_API_KEY_HEADER = "X-Admin-Key"


def _constant_time_equals(provided: str, expected: str) -> bool:
    """Constant-time string comparison that never raises on hostile input."""
    try:
        return secrets.compare_digest(provided, expected)
    except TypeError:
        # ``compare_digest`` only accepts ASCII str/bytes values; a header with
        # non-ASCII bytes can never match a configured API key.
        return False


async def require_admin_key(request: Request) -> None:
    """Require the shared admin key (``X-Admin-Key``) on operational endpoints.

    * ``ADMIN_API_KEY`` unset or empty -> **503**: the endpoints stay closed
      instead of silently degrading to anonymous access.
    * Header missing, blank or wrong -> **401**.
    """
    admin_api_key = get_settings().admin_api_key

    if not admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API is not configured (set ADMIN_API_KEY)",
        )

    provided_key = request.headers.get(ADMIN_API_KEY_HEADER, "")
    if not provided_key or not _constant_time_equals(provided_key, admin_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or missing {ADMIN_API_KEY_HEADER} header",
        )


# ─────────────────────────────────────────────────────────────
# LLM cost guard (per-IP sliding window + global daily budget)
# ─────────────────────────────────────────────────────────────

AI_RATE_LIMIT_WINDOW_SECONDS = 60
AI_BUDGET_TTL_SECONDS = 48 * 60 * 60


def get_client_ip(request: Request) -> str:
    """Rate-limit bucket key: first ``X-Forwarded-For`` hop, else the peer IP."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        first_hop = forwarded_for.split(",")[0].strip()
        if first_hop:
            return first_hop
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def enforce_ai_rate_limit(request: Request) -> None:
    """Strict, Redis-backed cost guard in front of every LLM-backed endpoint.

    Buckets:
    * ``ai_rl:<client ip>`` — sliding 60 s window of ``ai_rate_limit_requests``
      LLM calls per client IP (429 when exceeded).
    * ``ai_budget:<YYYY-MM-DD>`` — global daily budget of ``ai_daily_requests``
      LLM calls. The UTC date suffix rolls the budget over at midnight UTC and
      the key expires after 48 h (429 when exceeded).

    The guard **fails closed**: if Redis is unreachable or misconfigured the
    request is rejected with 503 instead of being served, because every call
    behind it costs money.
    """
    settings = get_settings()
    client_ip = get_client_ip(request)
    now = time.time()
    window_start = now - AI_RATE_LIMIT_WINDOW_SECONDS
    ip_key = f"ai_rl:{client_ip}"
    budget_key = f"ai_budget:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"

    try:
        redis_client = await get_redis()
        await redis_client.zremrangebyscore(ip_key, 0, window_start)
        window_count = int(await redis_client.zcard(ip_key))
        budget_count = int(await redis_client.get(budget_key) or 0)
    except Exception as exc:
        logger.error("AI cost guard unavailable (failing closed): %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI rate limiter unavailable, request rejected",
        ) from exc

    if window_count >= settings.ai_rate_limit_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Too many AI requests from this client. "
                f"Limit: {settings.ai_rate_limit_requests} per {AI_RATE_LIMIT_WINDOW_SECONDS} seconds"
            ),
            headers={"Retry-After": str(AI_RATE_LIMIT_WINDOW_SECONDS)},
        )

    if budget_count >= settings.ai_daily_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Daily AI request budget exhausted ({settings.ai_daily_requests} per UTC day). "
                "Try again after 00:00 UTC"
            ),
        )

    try:
        await redis_client.zadd(ip_key, {f"{now}:{uuid.uuid4().hex[:8]}": now})
        await redis_client.expire(ip_key, AI_RATE_LIMIT_WINDOW_SECONDS + 1)
        await redis_client.incr(budget_key)
        await redis_client.expire(budget_key, AI_BUDGET_TTL_SECONDS)
    except Exception as exc:
        logger.error("AI cost guard could not record usage (failing closed): %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI rate limiter unavailable, request rejected",
        ) from exc
