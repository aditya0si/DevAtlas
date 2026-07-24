import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import WorkerRun

logger = logging.getLogger(__name__)


async def run_activity_score(ctx: dict[str, Any]) -> dict[str, Any]:
    """Developer Activity Score Computation Worker.

    Computes Activity Scores for states and cities based on PushEvent data.
    Formula: 55% Push Activity + 25% Developer Presence + 20% Repository Diversity
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session_factory() as session:
        from app.services.activity_score_service import ActivityScoreService

        service = ActivityScoreService(session)

        worker_run = WorkerRun(worker_name="activity_score", status="running")
        session.add(worker_run)
        await session.flush()

        try:
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=30)

            state_scores = await service.compute_state_scores(start, end)
            city_scores = await service.compute_city_scores(start, end)

            worker_run.status = "completed"
            worker_run.items_processed = len(state_scores) + len(city_scores)
            worker_run.completed_at = datetime.now(timezone.utc)
            worker_run.metrics = {
                "state_scores_computed": len(state_scores),
                "city_scores_computed": len(city_scores),
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "top_states": [
                    {"name": s.entity_name, "score": s.activity_score}
                    for s in state_scores[:5]
                ],
            }
            await session.commit()

            logger.info(
                "Activity scores: %d states, %d cities",
                len(state_scores), len(city_scores),
            )

            return {
                "status": "success",
                "state_scores": len(state_scores),
                "city_scores": len(city_scores),
                "top_states": [
                    {"name": s.entity_name, "score": s.activity_score}
                    for s in state_scores[:5]
                ],
            }

        except Exception as e:
            logger.exception("Activity score computation failed")
            worker_run.status = "failed"
            worker_run.error_message = str(e)
            worker_run.completed_at = datetime.now(timezone.utc)
            await session.commit()
            raise
