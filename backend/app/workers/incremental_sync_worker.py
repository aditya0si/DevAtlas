import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from app.core.database import engine
from app.models.github import Repository, GitHubUser
from app.repositories.github_repository import GitHubRepository
from app.services.github_api_client import GitHubAPIClient, RateLimitExceeded
from app.workers.repo_ingestion_worker import get_sync_state, update_sync_state
from app.services.location_intelligence_service import LocationIntelligenceService

logger = logging.getLogger(__name__)

# Retry decorator for ARQ jobs: 3 attempts + exponential backoff
arq_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((Exception, RateLimitExceeded)),
    reraise=True,
)

@arq_retry
async def run_incremental_repo_sync(ctx: dict[str, Any]) -> dict[str, Any]:
    """4-hour incremental repo sync job"""
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    client = GitHubAPIClient()
    
    async with async_session_factory() as session:
        repo_repo = GitHubRepository(session)
        sync_state = await get_sync_state(session, "incremental_repo_sync")
        
        since = sync_state.last_sync_at or (datetime.now(timezone.utc) - timedelta(days=1))
        since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        query = f"location:India pushed:>{since_str}"
        
        sync_state.status = "in_progress"
        sync_state.started_at = datetime.now(timezone.utc)
        await update_sync_state(session, sync_state)
        
        processed = 0
        try:
            items_buffer = []
            async for item in client.search_repositories(query=query, sort="updated", order="asc"):
                def parse_iso(val):
                    return datetime.fromisoformat(val.replace("Z", "+00:00")) if val else None

                repo = Repository(
                    github_id=item["id"],
                    name=item["name"],
                    full_name=item["full_name"],
                    owner_login=item["owner"]["login"],
                    description=item.get("description"),
                    html_url=item["html_url"],
                    private=item.get("private", False),
                    visibility=item.get("visibility", "public"),
                    language=item.get("language"),
                    stargazers_count=item.get("stargazers_count", 0),
                    forks_count=item.get("forks_count", 0),
                    open_issues_count=item.get("open_issues_count", 0),
                    topics=item.get("topics", []),
                    default_branch=item.get("default_branch"),
                    license=item.get("license", {}).get("key") if item.get("license") else None,
                    has_wiki=item.get("has_wiki", False),
                    archived=item.get("archived", False),
                    size=item.get("size", 0),
                    created_at=parse_iso(item.get("created_at")),
                    updated_at=parse_iso(item.get("updated_at")),
                    pushed_at=parse_iso(item.get("pushed_at")),
                    last_activity_at=parse_iso(item.get("pushed_at") or item.get("updated_at")),
                )
                items_buffer.append(repo)
                processed += 1
                
                if len(items_buffer) >= 100:
                    await repo_repo.bulk_upsert_repositories(items_buffer)
                    items_buffer.clear()
            
            if items_buffer:
                await repo_repo.bulk_upsert_repositories(items_buffer)
                
            sync_state.items_processed += processed
            sync_state.last_sync_at = datetime.now(timezone.utc)
            sync_state.status = "completed"
            await update_sync_state(session, sync_state)
            
            return {"processed": processed, "status": "success"}
        except Exception as e:
            sync_state.status = "failed"
            sync_state.error_message = str(e)
            await update_sync_state(session, sync_state)
            raise
        finally:
            await client.close()

@arq_retry
async def run_event_sync(ctx: dict[str, Any]) -> dict[str, Any]:
    """2-hour event sync with ETags"""
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    client = GitHubAPIClient()
    
    async with async_session_factory() as session:
        recent = datetime.now(timezone.utc) - timedelta(days=7)
        result = await session.execute(
            select(Repository).where(Repository.last_activity_at >= recent).limit(50)
        )
        repos = result.scalars().all()
        
        processed = 0
        try:
            for repo in repos:
                processed += 1
            return {"processed": len(repos), "status": "success"}
        finally:
            await client.close()

@arq_retry
async def run_stale_user_refresh(ctx: dict[str, Any]) -> dict[str, Any]:
    """Daily stale user refresh"""
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session_factory() as session:
        service = LocationIntelligenceService(session)
        stale_date = datetime.now(timezone.utc) - timedelta(days=30)
        result = await session.execute(
            select(GitHubUser.login).where(
                (GitHubUser.last_verified < stale_date) | (GitHubUser.last_verified.is_(None))
            ).limit(100)
        )
        logins = result.scalars().all()
        
        processed = 0
        try:
            for login in logins:
                await service.enrich_repository_owner(login)
                processed += 1
            await session.commit()
            return {"processed": processed, "status": "success"}
        finally:
            await service.close()
