import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import WorkerRun

logger = logging.getLogger(__name__)


async def run_aggregation(ctx: dict[str, Any]) -> dict[str, Any]:
    """Aggregation Worker.

    Computes daily and hourly precomputed metrics for PushEvents.
    Daily aggregates power analytics. Hourly aggregates power live dashboards.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session_factory() as session:
        from app.services.aggregation_service import AggregationService

        service = AggregationService(session)

        worker_run = WorkerRun(worker_name="aggregation", status="running")
        session.add(worker_run)
        await session.flush()

        results = {"daily": {}, "hourly": {}}

        try:
            daily_result = await service.compute_daily_aggregation()
            results["daily"] = daily_result

            hourly_result = await service.compute_hourly_aggregation()
            results["hourly"] = hourly_result

            worker_run.status = "completed"
            worker_run.items_processed = (
                daily_result.get("aggregations_saved", 0)
                + hourly_result.get("aggregations_saved", 0)
            )
            worker_run.completed_at = datetime.now(timezone.utc)
            worker_run.metrics = results
            await session.commit()

            logger.info(
                "Aggregation: %d daily, %d hourly saved",
                daily_result.get("aggregations_saved", 0),
                hourly_result.get("aggregations_saved", 0),
            )

            return {"status": "success", "daily": daily_result, "hourly": hourly_result}

        except Exception as e:
            logger.exception("Aggregation failed")
            worker_run.status = "failed"
            worker_run.error_message = str(e)
            worker_run.completed_at = datetime.now(timezone.utc)
            await session.commit()
            raise
