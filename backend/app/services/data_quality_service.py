from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional, List

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import (
    GitHubEvent, GitHubUser, Repository, DataQualityMetric, WorkerRun,
)

logger = logging.getLogger(__name__)


class DataQualityService:
    """Tracks operational data quality metrics for visibility and debugging."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record_metric(
        self, name: str, value: float, metadata: Optional[dict[str, Any]] = None
    ) -> DataQualityMetric:
        """Record a data quality metric point."""
        metric = DataQualityMetric(
            metric_name=name,
            metric_value=value,
            metric_metadata=metadata,
        )
        self.db.add(metric)
        await self.db.flush()
        return metric

    async def collect_snapshot(self) -> dict[str, Any]:
        """Collect a comprehensive data quality snapshot."""
        now = datetime.now(timezone.utc)
        metrics: dict[str, Any] = {}

        # GitHub users statistics
        total_users_result = await self.db.execute(
            select(func.count(GitHubUser.login))
        )
        metrics["github_users_total"] = total_users_result.scalar() or 0

        enriched_result = await self.db.execute(
            select(func.count(GitHubUser.login)).where(
                GitHubUser.enrichment_status == "enriched"
            )
        )
        metrics["github_users_enriched"] = enriched_result.scalar() or 0

        pending_result = await self.db.execute(
            select(func.count(GitHubUser.login)).where(
                GitHubUser.enrichment_status == "pending"
            )
        )
        metrics["github_users_pending"] = pending_result.scalar() or 0

        failed_result = await self.db.execute(
            select(func.count(GitHubUser.login)).where(
                GitHubUser.enrichment_status == "failed"
            )
        )
        metrics["github_users_failed"] = failed_result.scalar() or 0

        # Mapped locations
        mapped_result = await self.db.execute(
            select(func.count(GitHubUser.login)).where(
                GitHubUser.latitude.isnot(None),
                GitHubUser.longitude.isnot(None),
            )
        )
        metrics["mapped_locations"] = mapped_result.scalar() or 0

        unknown_result = await self.db.execute(
            select(func.count(GitHubUser.login)).where(
                GitHubUser.latitude.is_(None),
                GitHubUser.longitude.is_(None),
                GitHubUser.raw_location.isnot(None),
            )
        )
        metrics["unknown_locations"] = unknown_result.scalar() or 0

        # Average geocoding confidence
        confidence_result = await self.db.execute(
            select(func.avg(GitHubUser.confidence_score)).where(
                GitHubUser.confidence_score.isnot(None),
            )
        )
        avg_conf = confidence_result.scalar()
        metrics["avg_geocoding_confidence"] = round(float(avg_conf), 2) if avg_conf else 0

        # Repository stats
        repo_total_result = await self.db.execute(
            select(func.count(Repository.id))
        )
        metrics["repositories_synchronized"] = repo_total_result.scalar() or 0

        # PushEvent stats
        push_total_result = await self.db.execute(
            select(func.count(GitHubEvent.id)).where(
                GitHubEvent.event_type == "PushEvent"
            )
        )
        metrics["push_events_processed"] = push_total_result.scalar() or 0

        # Pending enrichments
        pending_enrich_result = await self.db.execute(
            select(func.count(GitHubEvent.id)).where(
                GitHubEvent.enrichment_status.in_(["pending", "pending_enrichment"])
            )
        )
        metrics["pending_event_enrichments"] = pending_enrich_result.scalar() or 0

        failed_enrich_result = await self.db.execute(
            select(func.count(GitHubEvent.id)).where(
                GitHubEvent.enrichment_status == "failed"
            )
        )
        metrics["failed_event_enrichments"] = failed_enrich_result.scalar() or 0

        # Worker execution stats
        worker_result = await self.db.execute(
            select(WorkerRun).order_by(WorkerRun.started_at.desc()).limit(10)
        )
        recent_workers = worker_result.scalars().all()
        metrics["recent_worker_runs"] = [
            {
                "worker": w.worker_name,
                "status": w.status,
                "items_processed": w.items_processed,
                "duration": w.duration_seconds,
                "started": w.started_at.isoformat() if w.started_at else None,
            }
            for w in recent_workers
        ]

        # Save each metric individually
        for key, val in metrics.items():
            if isinstance(val, (int, float)):
                await self.record_metric(key, float(val))

        return {
            "snapshot_time": now.isoformat(),
            "metrics": metrics,
        }

    async def get_latest_metric(self, name: str) -> Optional[dict[str, Any]]:
        """Get the latest recorded value for a metric."""
        result = await self.db.execute(
            select(DataQualityMetric)
            .where(DataQualityMetric.metric_name == name)
            .order_by(DataQualityMetric.recorded_at.desc())
            .limit(1)
        )
        metric = result.scalar_one_or_none()
        if metric:
            return {
                "name": metric.metric_name,
                "value": metric.metric_value,
                "metadata": metric.metric_metadata,
                "recorded_at": metric.recorded_at.isoformat() if metric.recorded_at else None,
            }
        return None

    async def get_metrics_history(
        self, name: str, limit: int = 30
    ) -> list[dict[str, Any]]:
        """Get history for a metric."""
        result = await self.db.execute(
            select(DataQualityMetric)
            .where(DataQualityMetric.metric_name == name)
            .order_by(DataQualityMetric.recorded_at.desc())
            .limit(limit)
        )
        return [
            {
                "value": m.metric_value,
                "recorded_at": m.recorded_at.isoformat() if m.recorded_at else None,
            }
            for m in result.scalars().all()
        ]
