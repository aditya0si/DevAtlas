from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_cache_service
from app.models.github import GitHubEvent
from app.schemas.github import GitHubEventResponse

router = APIRouter()


@router.get("/", response_model=list[GitHubEventResponse])
async def list_events(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    event_type: str | None = Query(default=None),
) -> list[GitHubEventResponse]:
    cache = get_cache_service()

    # Try cache first
    cached = await cache.get_events(event_type, limit, offset)
    if cached is not None:
        return [GitHubEventResponse(**item) for item in cached]

    query = select(GitHubEvent)
    if event_type:
        query = query.where(GitHubEvent.event_type == event_type)
    query = query.order_by(GitHubEvent.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.scalars().all()
    response = [GitHubEventResponse.model_validate(row) for row in rows]

    # Cache the response
    await cache.set_events(
        [item.model_dump(mode="json") for item in response],
        event_type,
        limit,
        offset,
    )

    return response
