from __future__ import annotations

from typing import Any

from arq import ArqRedis
from arq.connections import RedisSettings
from fastapi import APIRouter, HTTPException

from app.core.cache import get_cache_service
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()


async def get_arq_redis() -> ArqRedis:
    """Get ARQ Redis connection."""
    return ArqRedis.from_url(settings.redis_url or "redis://localhost:6379/0")


@router.post("/sync/full")
async def enqueue_full_sync() -> dict[str, str]:
    """
    Enqueue a full GitHub repository ingestion job.

    This triggers a complete sync of repositories from GitHub.
    """
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_repo_ingestion")

    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")

    return {
        "message": "Full repo ingestion enqueued",
        "job_id": str(job.job_id),
    }


@router.post("/sync/incremental")
async def enqueue_incremental_sync() -> dict[str, str]:
    """
    Enqueue an incremental GitHub sync job.

    This syncs only recent events and stale users.
    """
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_incremental_sync")

    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")

    return {
        "message": "Incremental sync enqueued",
        "job_id": str(job.job_id),
    }


@router.post("/sync/enrich-users")
async def enqueue_user_enrichment() -> dict[str, str]:
    """Enqueue user enrichment (geocoding + org fetch)."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_user_enrichment")

    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")

    return {
        "message": "User enrichment enqueued",
        "job_id": str(job.job_id),
    }


@router.post("/sync/classify")
async def enqueue_ai_classification() -> dict[str, str]:
    """Enqueue AI classification + embedding worker."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_ai_classification")

    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")

    return {
        "message": "AI classification enqueued",
        "job_id": str(job.job_id),
    }


@router.post("/sync/analytics")
async def enqueue_analytics() -> dict[str, str]:
    """Enqueue analytics snapshot generation."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_analytics_worker")

    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")

    return {
        "message": "Analytics snapshot enqueued",
        "job_id": str(job.job_id),
    }


@router.post("/sync/pipeline")
async def enqueue_full_pipeline() -> dict[str, Any]:
    """
    Enqueue the full ingestion pipeline in sequence:
    1. Repo ingestion
    2. User enrichment
    3. AI classification
    4. Analytics snapshot
    """
    redis = await get_arq_redis()
    jobs = {}

    for func_name in [
        "run_repo_ingestion",
        "run_user_enrichment",
        "run_ai_classification",
        "run_analytics_worker",
    ]:
        job = await redis.enqueue_job(func_name)
        if job:
            jobs[func_name] = str(job.job_id)

    return {
        "message": "Full pipeline enqueued",
        "jobs": jobs,
    }


@router.get("/sync/status/{job_id}")
async def get_sync_status(job_id: str) -> dict[str, Any]:
    """Get the status of a sync job."""
    redis = await get_arq_redis()
    job = await redis.get_job_result(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job_id,
        "status": "completed" if job.success else "failed",
        "result": job.result,
        "enqueued_at": job.enqueue_time_ms,
        "finished_at": job.finish_time_ms,
    }


@router.post("/sync/cache/invalidate")
async def invalidate_cache() -> dict[str, Any]:
    """
    Invalidate all cached data.

    Call this after sync jobs complete to ensure fresh data.
    """
    cache = get_cache_service()

    repos_deleted = await cache.invalidate_repositories()
    geo_deleted = await cache.invalidate_geospatial()
    events_deleted = await cache.invalidate_events()

    return {
        "message": "Cache invalidated",
        "repositories_cache_keys_deleted": repos_deleted,
        "geospatial_cache_keys_deleted": geo_deleted,
        "events_cache_keys_deleted": events_deleted,
    }

