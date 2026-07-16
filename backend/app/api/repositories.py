from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_cache_service
from app.models.github import Repository
from app.schemas.github import RepositoryResponse

router = APIRouter()


@router.get("/", response_model=list[RepositoryResponse])
async def list_repositories(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    language: str | None = Query(default=None),
) -> list[RepositoryResponse]:
    cache = get_cache_service()

    # Try cache first
    cached = await cache.get_repositories(language, limit, offset)
    if cached is not None:
        return [RepositoryResponse(**item) for item in cached]

    query = select(Repository)
    if language:
        query = query.where(Repository.language == language)
    query = query.order_by(Repository.last_activity_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.scalars().all()
    response = [RepositoryResponse.model_validate(row) for row in rows]

    # Cache the response
    await cache.set_repositories(
        [item.model_dump(mode="json") for item in response],
        language,
        limit,
        offset,
    )

    return response


@router.get("/{repository_id}", response_model=RepositoryResponse)
async def get_repository(repository_id: str, db: AsyncSession = Depends(get_db)) -> RepositoryResponse:
    result = await db.execute(select(Repository).where(Repository.id == repository_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return RepositoryResponse.model_validate(row)
