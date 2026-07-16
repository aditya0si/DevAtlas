import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import Repository, GitHubUser, AnalyticsSnapshot
from app.workers.repo_ingestion_worker import get_sync_state, update_sync_state

logger = logging.getLogger(__name__)

async def run_analytics_worker(ctx: dict[str, Any]) -> dict[str, Any]:
    """Analytics and Insights Worker"""
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session_factory() as session:
        sync_state = await get_sync_state(session, "analytics_generation")
        sync_state.status = "in_progress"
        sync_state.started_at = datetime.now(timezone.utc)
        await update_sync_state(session, sync_state)
        
        today = datetime.now(timezone.utc).date()
        
        try:
            # 1. Total Repositories Count
            repo_count_query = await session.execute(select(func.count(Repository.id)))
            repo_count = repo_count_query.scalar_one_or_none() or 0
            
            # 2. Top Languages
            # Using raw SQL for JSONB aggregation or simple fetch for this demo
            top_lang_query = await session.execute(text(
                "SELECT language, COUNT(*) FROM repositories WHERE language IS NOT NULL GROUP BY language ORDER BY count DESC LIMIT 5"
            ))
            top_languages = {row[0]: row[1] for row in top_lang_query.all()}
            
            # 3. Top Cities (India)
            top_city_query = await session.execute(text(
                "SELECT city, COUNT(*) FROM github_users WHERE country = 'India' AND city IS NOT NULL GROUP BY city ORDER BY count DESC LIMIT 5"
            ))
            top_cities = {row[0]: row[1] for row in top_city_query.all()}
            
            # 4. Save Daily Snapshot
            snapshot = await session.execute(
                select(AnalyticsSnapshot).where(
                    AnalyticsSnapshot.snapshot_date == today,
                    AnalyticsSnapshot.snapshot_type == "daily"
                )
            )
            existing = snapshot.scalar_one_or_none()
            
            metrics = {
                "total_repositories": repo_count,
                "top_languages": top_languages,
                "top_cities": top_cities,
                "insights": [
                    f"Top City: {list(top_cities.keys())[0] if top_cities else 'N/A'}",
                    f"Trending Language: {list(top_languages.keys())[0] if top_languages else 'N/A'}",
                ]
            }
            
            if existing:
                existing.metrics = metrics
            else:
                new_snapshot = AnalyticsSnapshot(
                    snapshot_date=today,
                    snapshot_type="daily",
                    metrics=metrics
                )
                session.add(new_snapshot)
                
            await session.commit()
            
            sync_state.items_processed = 1
            sync_state.status = "completed"
            sync_state.completed_at = datetime.now(timezone.utc)
            await update_sync_state(session, sync_state)
            
            return {
                "status": "success",
                "metrics": metrics,
            }
        except Exception as e:
            logger.exception("Error generating analytics")
            sync_state.status = "failed"
            sync_state.error_message = str(e)
            sync_state.completed_at = datetime.now(timezone.utc)
            await update_sync_state(session, sync_state)
            raise
