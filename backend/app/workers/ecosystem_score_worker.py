import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import WorkerRun

logger = logging.getLogger(__name__)


async def run_ecosystem_score(ctx: dict[str, Any]) -> dict[str, Any]:
    """Ecosystem Score Computation Worker.

    Computes Ecosystem Scores (ecosystem health metrics) for states.
    Formula: 40% Activity + 20% Developer Count + 15% Tech Diversity
           + 15% Domain Diversity + 10% Growth Rate
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session_factory() as session:
        from app.services.ecosystem_score_service import EcosystemScoreService

        service = EcosystemScoreService(session)

        worker_run = WorkerRun(worker_name="ecosystem_score", status="running")
        session.add(worker_run)
        await session.flush()

        try:
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=30)

            scores = await service.compute_state_scores(start, end)

            worker_run.status = "completed"
            worker_run.items_processed = len(scores)
            worker_run.completed_at = datetime.now(timezone.utc)
            worker_run.metrics = {
                "states_scored": len(scores),
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "top_ecosystems": [
                    {"name": s.entity_name, "score": s.ecosystem_score, "rank": s.rank}
                    for s in scores[:10]
                ],
            }
            await session.commit()

            logger.info("Ecosystem scores: %d states scored", len(scores))

            return {
                "status": "success",
                "states_scored": len(scores),
                "top_ecosystems": [
                    {"name": s.entity_name, "score": s.ecosystem_score, "rank": s.rank}
                    for s in scores[:10]
                ],
            }

        except Exception as e:
            logger.exception("Ecosystem score computation failed")
            worker_run.status = "failed"
            worker_run.error_message = str(e)
            worker_run.completed_at = datetime.now(timezone.utc)
            await session.commit()
            raise
