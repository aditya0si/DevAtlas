import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import WorkerRun

logger = logging.getLogger(__name__)


async def run_event_enrichment(ctx: dict[str, Any]) -> dict[str, Any]:
    """Event Enrichment Worker.

    Resolves actor location, repository domain, and language for PushEvents.
    Implements eventual consistency: events are enriched asynchronously.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session_factory() as session:
        from app.services.push_event_service import PushEventService

        service = PushEventService(session)

        worker_run = WorkerRun(worker_name="event_enrichment", status="running")
        session.add(worker_run)
        await session.flush()

        try:
            # Get counts before
            before_counts = await service.count_pending_enrichments()

            # Enrich pending events
            enriched = await service.enrich_pending_events(limit=500)

            # Get counts after
            after_counts = await service.count_pending_enrichments()

            worker_run.status = "completed"
            worker_run.items_processed = enriched
            worker_run.completed_at = datetime.now(timezone.utc)
            worker_run.metrics = {
                "events_enriched": enriched,
                "pending_before": before_counts.get("pending", 0),
                "pending_after": after_counts.get("pending", 0),
            }
            await session.commit()

            await service.close()

            logger.info("Event enrichment: %d events enriched", enriched)

            return {
                "status": "success",
                "events_enriched": enriched,
                "pending_before": before_counts,
                "pending_after": after_counts,
            }

        except Exception as e:
            logger.exception("Event enrichment failed")
            worker_run.status = "failed"
            worker_run.error_message = str(e)
            worker_run.completed_at = datetime.now(timezone.utc)
            await session.commit()
            await service.close()
            raise
