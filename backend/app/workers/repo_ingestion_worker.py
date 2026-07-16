import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import SyncState, Repository
from app.repositories.github_repository import GitHubRepository
from app.services.github_api_client import GitHubAPIClient

logger = logging.getLogger(__name__)

async def get_sync_state(db, sync_type: str) -> SyncState:
    result = await db.execute(select(SyncState).where(SyncState.sync_type == sync_type))
    state = result.scalar_one_or_none()
    if not state:
        state = SyncState(sync_type=sync_type, last_cursor=None, status="pending", items_processed=0)
        db.add(state)
        await db.commit()
        await db.refresh(state)
    return state

async def update_sync_state(db, state: SyncState) -> None:
    db.add(state)
    await db.commit()

async def run_repo_ingestion(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Ingests India-located repositories from GitHub Search API.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    client = GitHubAPIClient()
    
    # Base query for India focused repos.
    query = "location:India OR location:Bangalore OR location:Mumbai OR location:Delhi OR location:Pune"
    
    async with async_session_factory() as session:
        repo_repo = GitHubRepository(session)
        sync_state = await get_sync_state(session, "repo_ingestion_india")
        
        sync_state.status = "in_progress"
        sync_state.started_at = datetime.now(timezone.utc)
        await update_sync_state(session, sync_state)
        
        processed_this_run = 0
        try:
            items_buffer = []
            
            async for item in client.search_repositories(query=query, sort="stars", order="desc"):
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
                processed_this_run += 1
                
                if len(items_buffer) >= 100:
                    await repo_repo.bulk_upsert_repositories(items_buffer)
                    items_buffer.clear()
                    
                    sync_state.items_processed += 100
                    sync_state.last_cursor = f"page_{processed_this_run // 100}"
                    await update_sync_state(session, sync_state)
                    
                if processed_this_run >= 1000:
                    break
                    
            if items_buffer:
                await repo_repo.bulk_upsert_repositories(items_buffer)
                sync_state.items_processed += len(items_buffer)
                sync_state.last_cursor = f"page_{(processed_this_run // 100) + 1}"
                
            sync_state.status = "completed"
            sync_state.completed_at = datetime.now(timezone.utc)
            await update_sync_state(session, sync_state)
            
            return {
                "status": "success",
                "processed": processed_this_run,
                "total_processed": sync_state.items_processed
            }
        except Exception as e:
            logger.exception("Error during repo ingestion")
            sync_state.status = "failed"
            sync_state.error_message = str(e)
            sync_state.completed_at = datetime.now(timezone.utc)
            await update_sync_state(session, sync_state)
            raise
        finally:
            await client.close()
