from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import (
    GitHubEvent, Repository, GitHubUser, ActivityScore, DailyAggregation,
)
from app.core.cache import get_cache_service

logger = logging.getLogger(__name__)

WEIGHTS = {
    "push_activity": 0.55,
    "developer_presence": 0.25,
    "repository_diversity": 0.20,
}


class ActivityScoreService:
    """Service for computing Developer Activity Scores.

    Formula: 55% Push Activity + 25% Developer Presence + 20% Repository Diversity
    All metrics are normalized before weighting.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.cache = get_cache_service()

    async def compute_state_scores(
        self, period_start: Optional[datetime] = None, period_end: Optional[datetime] = None
    ) -> list[ActivityScore]:
        """Compute activity scores for all states with PushEvent data."""
        end = period_end or datetime.now(timezone.utc)
        start = period_start or (end - timedelta(days=30))

        # Get raw metrics per state from enriched events
        raw_metrics = await self._get_state_raw_metrics(start, end)

        if not raw_metrics:
            return []

        # Find max values for normalization
        max_push = max((m["push_count"] for m in raw_metrics), default=1)
        max_devs = max((m["dev_count"] for m in raw_metrics), default=1)
        max_repos = max((m["repo_count"] for m in raw_metrics), default=1)

        scores = []
        for m in raw_metrics:
            # Normalize each component to 0-100
            push_norm = (m["push_count"] / max_push * 100) if max_push > 0 else 0
            dev_norm = (m["dev_count"] / max_devs * 100) if max_devs > 0 else 0
            repo_norm = (m["repo_count"] / max_repos * 100) if max_repos > 0 else 0

            activity = (
                push_norm * WEIGHTS["push_activity"]
                + dev_norm * WEIGHTS["developer_presence"]
                + repo_norm * WEIGHTS["repository_diversity"]
            )

            score = ActivityScore(
                entity_type="state",
                entity_key=m["state"],
                entity_name=m["state"],
                push_activity=round(push_norm, 2),
                developer_presence=round(dev_norm, 2),
                repository_diversity=round(repo_norm, 2),
                activity_score=round(activity, 2),
                period_start=start,
                period_end=end,
            )
            scores.append(score)

        # Save scores
        await self._save_scores(scores)

        return sorted(scores, key=lambda s: s.activity_score, reverse=True)

    async def compute_city_scores(
        self, period_start: Optional[datetime] = None, period_end: Optional[datetime] = None
    ) -> list[ActivityScore]:
        """Compute activity scores for all cities with PushEvent data."""
        end = period_end or datetime.now(timezone.utc)
        start = period_start or (end - timedelta(days=30))

        raw_metrics = await self._get_city_raw_metrics(start, end)

        if not raw_metrics:
            return []

        max_push = max((m["push_count"] for m in raw_metrics), default=1)
        max_devs = max((m["dev_count"] for m in raw_metrics), default=1)
        max_repos = max((m["repo_count"] for m in raw_metrics), default=1)

        scores = []
        for m in raw_metrics:
            if not m["city"]:
                continue
            push_norm = (m["push_count"] / max_push * 100) if max_push > 0 else 0
            dev_norm = (m["dev_count"] / max_devs * 100) if max_devs > 0 else 0
            repo_norm = (m["repo_count"] / max_repos * 100) if max_repos > 0 else 0

            activity = (
                push_norm * WEIGHTS["push_activity"]
                + dev_norm * WEIGHTS["developer_presence"]
                + repo_norm * WEIGHTS["repository_diversity"]
            )

            scores.append(ActivityScore(
                entity_type="city",
                entity_key=m["city"],
                entity_name=f"{m['city']}, {m.get('state', '')}",
                push_activity=round(push_norm, 2),
                developer_presence=round(dev_norm, 2),
                repository_diversity=round(repo_norm, 2),
                activity_score=round(activity, 2),
                period_start=start,
                period_end=end,
            ))

        await self._save_scores(scores)
        return sorted(scores, key=lambda s: s.activity_score, reverse=True)

    async def _get_state_raw_metrics(
        self, start: datetime, end: datetime
    ) -> list[dict[str, Any]]:
        """Get raw PushEvent metrics grouped by state."""
        result = await self.db.execute(
            select(
                GitHubEvent.state,
                func.count(GitHubEvent.id).label("push_count"),
                func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
                func.count(func.distinct(GitHubEvent.repo_id)).label("repo_count"),
            )
            .where(
                GitHubEvent.event_type == "PushEvent",
                GitHubEvent.created_at >= start,
                GitHubEvent.created_at < end,
                GitHubEvent.state.isnot(None),
                GitHubEvent.state != "",
            )
            .group_by(GitHubEvent.state)
        )
        return [
            {"state": row[0], "push_count": row[1], "dev_count": row[2], "repo_count": row[3]}
            for row in result.all()
        ]

    async def _get_city_raw_metrics(
        self, start: datetime, end: datetime
    ) -> list[dict[str, Any]]:
        """Get raw PushEvent metrics grouped by city."""
        # Use enriched events
        result = await self.db.execute(
            select(
                GitHubEvent.city,
                GitHubEvent.state,
                func.count(GitHubEvent.id).label("push_count"),
                func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
                func.count(func.distinct(GitHubEvent.repo_id)).label("repo_count"),
            )
            .where(
                GitHubEvent.event_type == "PushEvent",
                GitHubEvent.created_at >= start,
                GitHubEvent.created_at < end,
                GitHubEvent.city.isnot(None),
                GitHubEvent.city != "",
            )
            .group_by(GitHubEvent.city, GitHubEvent.state)
        )
        return [
            {
                "city": row[0], "state": row[1],
                "push_count": row[2], "dev_count": row[3], "repo_count": row[4],
            }
            for row in result.all()
        ]

    async def _save_scores(self, scores: list[ActivityScore]) -> None:
        """Upsert activity scores into the database."""
        for score in scores:
            existing = await self.db.execute(
                select(ActivityScore).where(
                    ActivityScore.entity_type == score.entity_type,
                    ActivityScore.entity_key == score.entity_key,
                    ActivityScore.period_start == score.period_start,
                    ActivityScore.period_end == score.period_end,
                )
            )
            old = existing.scalar_one_or_none()
            if old:
                old.push_activity = score.push_activity
                old.developer_presence = score.developer_presence
                old.repository_diversity = score.repository_diversity
                old.activity_score = score.activity_score
                old.computed_at = datetime.now(timezone.utc)
            else:
                score.id = str(uuid4())
                score.computed_at = datetime.now(timezone.utc)
                self.db.add(score)

        await self.db.flush()

    async def get_top_states(
        self, limit: int = 20, period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get top states ranked by activity score."""
        end = period_end or datetime.now(timezone.utc)
        start = period_start or (end - timedelta(days=30))

        result = await self.db.execute(
            select(ActivityScore)
            .where(
                ActivityScore.entity_type == "state",
                ActivityScore.period_start >= start,
                ActivityScore.period_end <= end,
            )
            .order_by(ActivityScore.activity_score.desc())
            .limit(limit)
        )
        scores = result.scalars().all()
        return [
            {
                "entity_key": s.entity_key,
                "entity_name": s.entity_name,
                "activity_score": s.activity_score,
                "push_activity": s.push_activity,
                "developer_presence": s.developer_presence,
                "repository_diversity": s.repository_diversity,
            }
            for s in scores
        ]

    async def get_top_cities(
        self, limit: int = 20, period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get top cities ranked by activity score."""
        end = period_end or datetime.now(timezone.utc)
        start = period_start or (end - timedelta(days=30))

        result = await self.db.execute(
            select(ActivityScore)
            .where(
                ActivityScore.entity_type == "city",
                ActivityScore.period_start >= start,
                ActivityScore.period_end <= end,
            )
            .order_by(ActivityScore.activity_score.desc())
            .limit(limit)
        )
        scores = result.scalars().all()
        return [
            {
                "entity_key": s.entity_key,
                "entity_name": s.entity_name,
                "activity_score": s.activity_score,
                "push_activity": s.push_activity,
                "developer_presence": s.developer_presence,
                "repository_diversity": s.repository_diversity,
            }
            for s in scores
        ]
