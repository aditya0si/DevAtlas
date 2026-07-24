from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import (
    GitHubEvent, GitHubUser, Repository, DailyAggregation, HourlyAggregation,
)

logger = logging.getLogger(__name__)


class AggregationService:
    """Service for maintaining precomputed daily and hourly aggregates.

    Aggregates are precomputed to avoid expensive statistics during API requests.
    """

    DIMENSIONS = ["state", "city", "domain", "language", "overall"]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def compute_daily_aggregation(
        self, target_date: Optional[datetime] = None,
    ) -> dict[str, int]:
        """Compute daily aggregates for all dimensions."""
        date = target_date or datetime.now(timezone.utc)
        day_start = datetime(date.year, date.month, date.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        aggregations_saved = 0

        for dimension in self.DIMENSIONS:
            if dimension == "overall":
                metrics = await self._compute_overall_metrics(day_start, day_end)
                agg = DailyAggregation(
                    aggregation_date=day_start.date(),
                    dimension="overall",
                    dimension_key="global",
                    dimension_value="global",
                    metrics=metrics,
                )
                await self._upsert_daily_agg(agg)
                aggregations_saved += 1
            else:
                group_results = await self._compute_dimension_metrics(
                    dimension, day_start, day_end
                )
                for row in group_results:
                    dim_key = row["key"]
                    if not dim_key or dim_key == "" or dim_key is None:
                        continue
                    agg = DailyAggregation(
                        aggregation_date=day_start.date(),
                        dimension=dimension,
                        dimension_key=str(dim_key),
                        dimension_value=str(dim_key),
                        metrics={
                            "push_events": row.get("push_events", 0),
                            "unique_developers": row.get("unique_developers", 0),
                            "unique_repositories": row.get("unique_repositories", 0),
                        },
                    )
                    await self._upsert_daily_agg(agg)
                    aggregations_saved += 1

        await self.db.flush()
        return {"aggregations_saved": aggregations_saved, "date": str(day_start.date())}

    async def compute_hourly_aggregation(
        self, target_hour: Optional[datetime] = None,
    ) -> dict[str, int]:
        """Compute hourly aggregates for real-time dashboards."""
        now = target_hour or datetime.now(timezone.utc)
        hour_start = now.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)

        aggregations_saved = 0

        for dimension in self.DIMENSIONS:
            if dimension == "overall":
                metrics = await self._compute_overall_metrics(hour_start, hour_end)
                agg = HourlyAggregation(
                    aggregation_hour=hour_start,
                    dimension="overall",
                    dimension_key="global",
                    metrics=metrics,
                )
                await self._upsert_hourly_agg(agg)
                aggregations_saved += 1
            else:
                group_results = await self._compute_dimension_metrics(
                    dimension, hour_start, hour_end
                )
                for row in group_results:
                    dim_key = row["key"]
                    if not dim_key or dim_key == "" or dim_key is None:
                        continue
                    agg = HourlyAggregation(
                        aggregation_hour=hour_start,
                        dimension=dimension,
                        dimension_key=str(dim_key),
                        metrics={
                            "push_events": row.get("push_events", 0),
                            "unique_developers": row.get("unique_developers", 0),
                            "unique_repositories": row.get("unique_repositories", 0),
                        },
                    )
                    await self._upsert_hourly_agg(agg)
                    aggregations_saved += 1

        await self.db.flush()
        return {"aggregations_saved": aggregations_saved, "hour": str(hour_start)}

    async def _compute_overall_metrics(
        self, start: datetime, end: datetime
    ) -> dict[str, Any]:
        """Compute overall PushEvent metrics for a time window."""
        result = await self.db.execute(
            select(
                func.count(GitHubEvent.id),
                func.count(func.distinct(GitHubEvent.actor_login)),
                func.count(func.distinct(GitHubEvent.repo_id)),
            ).where(
                GitHubEvent.event_type == "PushEvent",
                GitHubEvent.created_at >= start,
                GitHubEvent.created_at < end,
            )
        )
        row = result.one()
        return {
            "push_events": row[0] or 0,
            "unique_developers": row[1] or 0,
            "unique_repositories": row[2] or 0,
        }

    async def _compute_dimension_metrics(
        self, dimension: str, start: datetime, end: datetime
    ) -> list[dict[str, Any]]:
        """Compute metrics grouped by a dimension."""
        dimension_column = getattr(GitHubEvent, dimension, None)
        if dimension_column is None:
            return []

        result = await self.db.execute(
            select(
                dimension_column.label("key"),
                func.count(GitHubEvent.id).label("push_events"),
                func.count(func.distinct(GitHubEvent.actor_login)).label("unique_developers"),
                func.count(func.distinct(GitHubEvent.repo_id)).label("unique_repositories"),
            )
            .where(
                GitHubEvent.event_type == "PushEvent",
                GitHubEvent.created_at >= start,
                GitHubEvent.created_at < end,
            )
            .group_by(dimension_column)
        )
        return [
            {"key": row[0], "push_events": row[1], "unique_developers": row[2], "unique_repositories": row[3]}
            for row in result.all()
        ]

    async def _upsert_daily_agg(self, agg: DailyAggregation) -> None:
        existing = await self.db.execute(
            select(DailyAggregation).where(
                DailyAggregation.aggregation_date == agg.aggregation_date,
                DailyAggregation.dimension == agg.dimension,
                DailyAggregation.dimension_key == agg.dimension_key,
            )
        )
        old = existing.scalar_one_or_none()
        if old:
            old.metrics = agg.metrics
        else:
            agg.id = str(uuid4())
            self.db.add(agg)

    async def _upsert_hourly_agg(self, agg: HourlyAggregation) -> None:
        existing = await self.db.execute(
            select(HourlyAggregation).where(
                HourlyAggregation.aggregation_hour == agg.aggregation_hour,
                HourlyAggregation.dimension == agg.dimension,
                HourlyAggregation.dimension_key == agg.dimension_key,
            )
        )
        old = existing.scalar_one_or_none()
        if old:
            old.metrics = agg.metrics
        else:
            agg.id = str(uuid4())
            self.db.add(agg)

    async def get_daily_stats(
        self, date: datetime, dimension: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Get daily aggregated statistics."""
        day = datetime(date.year, date.month, date.day).date()
        result = await self.db.execute(
            select(DailyAggregation)
            .where(
                DailyAggregation.aggregation_date == day,
                DailyAggregation.dimension == dimension,
            )
            .order_by(
                DailyAggregation.metrics["push_events"].as_float().desc()
            )
            .limit(limit)
        )
        return [
            {
                "dimension_key": a.dimension_key,
                "dimension_value": a.dimension_value,
                "metrics": a.metrics,
                "date": str(a.aggregation_date),
            }
            for a in result.scalars().all()
        ]

    async def get_hourly_stats(
        self, hour: datetime, dimension: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Get hourly aggregated statistics."""
        result = await self.db.execute(
            select(HourlyAggregation)
            .where(
                HourlyAggregation.aggregation_hour == hour,
                HourlyAggregation.dimension == dimension,
            )
            .order_by(
                HourlyAggregation.metrics["push_events"].as_float().desc()
            )
            .limit(limit)
        )
        return [
            {
                "dimension_key": a.dimension_key,
                "metrics": a.metrics,
                "hour": a.aggregation_hour.isoformat() if a.aggregation_hour else None,
            }
            for a in result.scalars().all()
        ]
