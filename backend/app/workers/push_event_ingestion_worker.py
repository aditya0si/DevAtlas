import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import WorkerRun
from app.services.push_event_service import PushEventService

logger = logging.getLogger(__name__)


async def run_push_event_ingestion(ctx: dict[str, Any]) -> dict[str, Any]:
    """Push Event Ingestion Worker.

    Activity-aware repository selection: prioritizes repos by recent engineering
    activity (pushed_at) rather than popularity. Dynamically scales according
    to GitHub API rate limits.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session_factory() as session:
        service = PushEventService(session)

        worker_run = WorkerRun(worker_name="push_event_ingestion", status="running")
        session.add(worker_run)
        await session.flush()

        total_stored = 0
        total_repos_processed = 0
        repos_with_events = 0

        try:
            # Activity-aware selection: repos sorted by pushed_at (recent push = priority)
            active_repos = await service.get_active_repositories(limit=200)

            if not active_repos:
                worker_run.status = "completed"
                worker_run.items_processed = 0
                worker_run.completed_at = datetime.now(timezone.utc)
                worker_run.metrics = {"message": "No active repositories found"}
                await session.commit()
                return {"status": "no_data", "message": "No active repositories found"}

            total_repos_processed = len(active_repos)

            for repo in active_repos:
                owner = repo.owner_login
                repo_name = repo.name

                if not owner or not repo_name:
                    continue

                # Dynamic page limit based on remaining quota
                max_pages = max(1, min(3, service.rate_limit_remaining // 100))

                events = await service.fetch_push_events(
                    owner, repo_name,
                    max_pages=max_pages,
                    min_quota=10,
                )

                if events:
                    stored = await service.store_push_events(events, repo.id)
                    total_stored += stored
                    repos_with_events += 1

                # Small delay to be nice to GitHub API
                await asyncio.sleep(0.2)

                # Stop if rate limit is getting low
                if service.rate_limit_remaining < 20:
                    logger.warning(
                        "Rate limit low (%d remaining), stopping ingestion",
                        service.rate_limit_remaining,
                    )
                    break

            worker_run.status = "completed"
            worker_run.items_processed = total_stored
            worker_run.completed_at = datetime.now(timezone.utc)
            worker_run.metrics = {
                "push_events_stored": total_stored,
                "repositories_processed": total_repos_processed,
                "repositories_with_events": repos_with_events,
                "rate_limit_remaining": service.rate_limit_remaining,
            }
            await session.commit()

            await service.close()

            logger.info(
                "Push event ingestion: %d events from %d/%d repos",
                total_stored, repos_with_events, total_repos_processed,
            )

            return {
                "status": "success",
                "push_events_stored": total_stored,
                "repositories_processed": total_repos_processed,
                "repositories_with_events": repos_with_events,
                "rate_limit_remaining": service.rate_limit_remaining,
            }

        except Exception as e:
            logger.exception("Push event ingestion failed")
            worker_run.status = "failed"
            worker_run.error_message = str(e)
            worker_run.completed_at = datetime.now(timezone.utc)
            worker_run.metrics = {"error": str(e)}
            await session.commit()
            await service.close()
            raise
