from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import asyncio
import redis.asyncio as redis
from arq import cron
from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.database import engine
from app.repositories.github_repository import GitHubRepository
from app.services.github_service import GitHubService
from app.services.location_intelligence_service import LocationIntelligenceService

settings = get_settings()


async def run_github_sync(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    ARQ job to sync GitHub repositories and events.
    
    This runs as a background task managed by ARQ/Redis.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session_factory() as session:
        service = GitHubService(session)
        repository = GitHubRepository(session)
        
        # Sync repositories
        await service.sync_repositories_since()
        
        # Sync recent events for top repositories
        repositories = await repository.get_recent_repositories(limit=50)
        
        for repo in repositories:
            await service.sync_repo_events(
                owner=repo.owner_login,
                repo=repo.name,
                max_pages=5,
            )
            await asyncio.sleep(0.5)  # Rate limiting between repos
        
        await session.commit()
        
        # Enqueue location enrichment
        ctx_redis = ctx.get("redis")
        if ctx_redis:
            await ctx_redis.enqueue_job("run_location_enrichment")
        
        return {
            "repositories_synced": len(repositories),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }


async def run_incremental_sync(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    ARQ job for incremental event sync - faster, less resource intensive.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session_factory() as session:
        service = GitHubService(session)
        repository = GitHubRepository(session)
        
        # Only sync events for recently active repositories
        recent_repos = await repository.get_recent_repositories(limit=25)
        
        for repo in recent_repos:
            await service.sync_repo_events(
                owner=repo.owner_login,
                repo=repo.name,
                max_pages=2,
            )
            await asyncio.sleep(0.3)
        
        await session.commit()
        
        return {
            "repositories_synced": len(recent_repos),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }


async def run_location_enrichment(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    ARQ job to enrich GitHub user locations.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session_factory() as session:
        service = LocationIntelligenceService(session)
        result = await service.run_batch_enrichment(limit=200)
        await service.close()
        
        return {
            "processed": result.processed,
            "enriched": result.enriched,
            "errors": result.errors,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

class WorkerSettings:
    """ARQ worker configuration."""
    
    redis_settings = RedisSettings.from_dsn(settings.redis_url or "redis://localhost:6379/0")
    
    # Job timeouts
    job_timeout = 3600  # 1 hour max for full sync
    keep_result = 3600 * 24  # Keep results for 24 hours
    
    # Scheduled jobs
    cron_jobs = [
        cron(run_github_sync, hour=2, minute=0),  # Daily full sync at 2 AM
        cron(run_incremental_sync, hour="*/4"),   # Every 4 hours
        cron(run_location_enrichment, hour="*/6"), # Every 6 hours
    ]
    
    # Functions that can be called as jobs
    functions = [run_github_sync, run_incremental_sync, run_location_enrichment]


class GitHubSyncWorker:
    """Worker class for GitHub sync operations."""
    
    def __init__(self) -> None:
        self.settings = WorkerSettings
    
    async def run(self) -> None:
        """Run the worker (placeholder for actual worker startup)."""
        # Worker startup would be handled by ARQ CLI
        pass


async def enqueue_github_sync(redis_url: str | None = None) -> dict[str, Any]:
    """
    Enqueue a GitHub sync job.
    
    Returns job metadata for tracking.
    """
    import json
    from arq import ArqRedis
    
    url = redis_url or settings.redis_url or "redis://localhost:6379/0"
    redis = ArqRedis.from_dsn(url)
    
    job = await redis.enqueue_job("run_github_sync")
    
    return {
        "job_id": job.job_id,
        "status": "enqueued",
    }
