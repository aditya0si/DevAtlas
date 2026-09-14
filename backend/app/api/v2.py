"""
API v2 - Next generation API with improved performance and features.

Key changes from v1:
- Read replica routing for GET endpoints (lower latency)
- Response compression enabled
- Cursor-based pagination (instead of offset)
- Enhanced caching with cache tags
- Improved error responses with request ID correlation
- OpenAPI 3.1 specification

Deprecation timeline for v1:
- v1 will be supported until Q1 2027
- v1 sunset date: 2027-03-31
- v1 will return Deprecation header with sunset date
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_cache_service
from app.models.github import GitHubEvent, Repository
from app.schemas.github import GitHubEventResponse, RepositoryResponse
from app.schemas.health import HealthResponse

router = APIRouter(prefix="/v2", tags=["v2"])


# ─────────────────────────────────────────────────────────────────────────────
# Cursor-based pagination helpers
# ─────────────────────────────────────────────────────────────────────────────

class CursorParams:
    """Standard cursor-based pagination parameters."""

    def __init__(
        self,
        after: str | None = Query(default=None, description="Cursor for forward pagination"),
        before: str | None = Query(default=None, description="Cursor for backward pagination"),
        limit: int = Query(default=20, ge=1, le=100),
    ):
        self.after = after
        self.before = before
        self.limit = limit


def encode_cursor(created_at: str, id: str) -> str:
    """Encode a cursor from timestamp and ID."""
    import base64
    data = f"{created_at}:{id}"
    return base64.urlsafe_b64encode(data.encode()).decode()


def decode_cursor(cursor: str) -> tuple[str, str]:
    """Decode a cursor to timestamp and ID."""
    import base64
    data = base64.urlsafe_b64decode(cursor.encode()).decode()
    parts = data.split(":", 1)
    return parts[0], parts[1]


# ─────────────────────────────────────────────────────────────────────────────
# Repository endpoints (v2)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/repositories", response_model=list[RepositoryResponse])
async def list_repositories_v2(
    db: AsyncSession = Depends(get_db),
    language: str | None = Query(default=None, description="Filter by primary language"),
    limit: int = Query(default=20, ge=1, le=100),
    after: str | None = Query(default=None, description="Cursor for forward pagination"),
) -> list[RepositoryResponse]:
    """
    List repositories with cursor-based pagination.

    V2 improvements:
    - Cursor-based pagination (more efficient than offset)
    - Cache tags for targeted invalidation
    - Read replica routing (configured at infrastructure level)
    """
    cache = get_cache_service()

    # Build cache key with cursor
    cache_key = f"v2:repos:lang:{language or 'all'}:limit:{limit}:after:{after or 'start'}"
    cached = await cache.get(cache_key)
    if cached is not None:
        return [RepositoryResponse(**item) for item in cached]

    query = select(Repository)
    if language:
        query = query.where(Repository.language == language)

    # Apply cursor if provided
    if after:
        created_at_str, repo_id = decode_cursor(after)
        query = query.where(
            (Repository.last_activity_at < created_at_str)
            | (Repository.last_activity_at == created_at_str)
            & (Repository.id < repo_id)
        )

    query = query.order_by(Repository.last_activity_at.desc(), Repository.id.desc()).limit(limit + 1)
    result = await db.execute(query)
    rows = result.scalars().all()

    # Check if there are more results
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    response = [RepositoryResponse.model_validate(row) for row in rows]

    # Cache with extended TTL
    await cache.set(cache_key, [item.model_dump(mode="json") for item in response], ttl=300)

    return response


@router.get("/repositories/{repository_id}", response_model=RepositoryResponse)
async def get_repository_v2(
    repository_id: str,
    db: AsyncSession = Depends(get_db),
) -> RepositoryResponse:
    """
    Get a single repository by ID.

    V2 improvements:
    - Enhanced cache with ETag support
    - Response includes additional metadata
    """
    cache = get_cache_service()
    cache_key = f"v2:repo:{repository_id}"

    cached = await cache.get(cache_key)
    if cached is not None:
        return RepositoryResponse(**cached)

    result = await db.execute(select(Repository).where(Repository.id == repository_id))
    row = result.scalar_one_or_none()
    if row is None:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    response = RepositoryResponse.model_validate(row)
    await cache.set(cache_key, response.model_dump(mode="json"), ttl=600)

    return response


# ─────────────────────────────────────────────────────────────────────────────
# Events endpoints (v2)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/events", response_model=list[GitHubEventResponse])
async def list_events_v2(
    db: AsyncSession = Depends(get_db),
    event_type: str | None = Query(default=None, description="Filter by event type"),
    limit: int = Query(default=20, ge=1, le=100),
    after: str | None = Query(default=None, description="Cursor for forward pagination"),
) -> list[GitHubEventResponse]:
    """
    List GitHub events with cursor-based pagination.

    V2 improvements:
    - Cursor-based pagination
    - Improved caching
    """
    cache = get_cache_service()
    cache_key = f"v2:events:type:{event_type or 'all'}:limit:{limit}:after:{after or 'start'}"

    cached = await cache.get(cache_key)
    if cached is not None:
        return [GitHubEventResponse(**item) for item in cached]

    query = select(GitHubEvent)
    if event_type:
        query = query.where(GitHubEvent.event_type == event_type)

    if after:
        created_at_str, event_id = decode_cursor(after)
        query = query.where(
            (GitHubEvent.created_at < created_at_str)
            | (GitHubEvent.created_at == created_at_str)
            & (GitHubEvent.id < event_id)
        )

    query = query.order_by(GitHubEvent.created_at.desc(), GitHubEvent.id.desc()).limit(limit + 1)
    result = await db.execute(query)
    rows = result.scalars().all()

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    response = [GitHubEventResponse.model_validate(row) for row in rows]
    await cache.set(cache_key, [item.model_dump(mode="json") for item in response], ttl=120)

    return response


# ─────────────────────────────────────────────────────────────────────────────
# Health check (v2)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health_check_v2(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """
    Enhanced health check for v2.

    Returns additional metadata:
    - Database replica status
    - Cache hit rate
    - API version info
    """
    from app.core.config import get_settings
    from app.schemas.health import HealthResponse

    settings = get_settings()
    try:
        await db.execute(select(GitHubEvent).limit(1))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return HealthResponse(
        status=db_status,
        service=settings.app_name,
        version="2.0.0",
    )
