from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import (
    ActivityScore,
    EcosystemScore,
    GitHubEvent,
)

logger = logging.getLogger(__name__)

ECOSYSTEM_WEIGHTS = {
    "developer_activity_score": 0.40,
    "developer_count": 0.20,
    "technology_diversity": 0.15,
    "domain_diversity": 0.15,
    "growth_rate": 0.10,
}


class EcosystemScoreService:
    """Service for computing Ecosystem Scores.

    Formula: 40% Developer Activity Score + 20% Developer Count
           + 15% Technology Diversity + 15% Domain Diversity + 10% Growth Rate

    Unlike Activity Score, Ecosystem Score measures ecosystem health.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def compute_state_scores(
        self, period_start: Optional[datetime] = None, period_end: Optional[datetime] = None
    ) -> list[EcosystemScore]:
        """Compute ecosystem scores for all states."""
        end = period_end or datetime.now(timezone.utc)
        start = period_start or (end - timedelta(days=30))

        # For growth rate, compare with previous period
        prev_start = start - (end - start)

        raw_metrics = await self._get_state_ecosystem_metrics(start, end)
        prev_metrics = await self._get_state_ecosystem_metrics(prev_start, start)
        prev_lookup = {m["state"]: m for m in prev_metrics}

        if not raw_metrics:
            return []

        # Normalization maxima
        max_activity = max((m.get("activity_score", 0) for m in raw_metrics), default=1)
        max_devs = max((m.get("dev_count", 0) for m in raw_metrics), default=1)
        max_tech = max((m.get("tech_diversity", 0) for m in raw_metrics), default=1)
        max_domain = max((m.get("domain_diversity", 0) for m in raw_metrics), default=1)

        scores = []
        for m in raw_metrics:
            state = m["state"]
            if not state:
                continue

            activity_norm = (m.get("activity_score", 0) / max_activity * 100) if max_activity > 0 else 0
            dev_norm = (m.get("dev_count", 0) / max_devs * 100) if max_devs > 0 else 0
            tech_norm = (m.get("tech_diversity", 0) / max_tech * 100) if max_tech > 0 else 0
            domain_norm = (m.get("domain_diversity", 0) / max_domain * 100) if max_domain > 0 else 0

            # Growth rate: compare push counts between periods
            prev = prev_lookup.get(state, {})
            growth = self._compute_growth(
                m.get("push_count", 0),
                prev.get("push_count", 0),
            )

            ecosystem = (
                activity_norm * ECOSYSTEM_WEIGHTS["developer_activity_score"]
                + dev_norm * ECOSYSTEM_WEIGHTS["developer_count"]
                + tech_norm * ECOSYSTEM_WEIGHTS["technology_diversity"]
                + domain_norm * ECOSYSTEM_WEIGHTS["domain_diversity"]
                + growth * ECOSYSTEM_WEIGHTS["growth_rate"]
            )

            scores.append(EcosystemScore(
                entity_type="state",
                entity_key=state,
                entity_name=state,
                developer_activity_score=round(activity_norm, 2),
                developer_count=round(dev_norm, 2),
                technology_diversity=round(tech_norm, 2),
                domain_diversity=round(domain_norm, 2),
                growth_rate=round(growth, 2),
                ecosystem_score=round(ecosystem, 2),
                period_start=start,
                period_end=end,
            ))

        # Sort and assign ranks
        scores.sort(key=lambda s: s.ecosystem_score, reverse=True)
        for i, score in enumerate(scores):
            score.rank = i + 1

        await self._save_scores(scores)
        return scores

    async def _get_state_ecosystem_metrics(
        self, start: datetime, end: datetime
    ) -> list[dict[str, Any]]:
        """Get comprehensive ecosystem metrics per state."""
        result = await self.db.execute(
            select(
                GitHubEvent.state,
                func.count(GitHubEvent.id).label("push_count"),
                func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
                func.count(func.distinct(GitHubEvent.repo_id)).label("repo_count"),
                func.count(func.distinct(GitHubEvent.language)).label("tech_diversity"),
                func.count(func.distinct(GitHubEvent.domain)).label("domain_diversity"),
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
        rows = result.all()

        # Also get activity scores for this period
        activity_result = await self.db.execute(
            select(ActivityScore)
            .where(
                ActivityScore.entity_type == "state",
                ActivityScore.period_start >= start,
                ActivityScore.period_end <= end,
            )
        )
        activity_lookup = {
            s.entity_key: s.activity_score
            for s in activity_result.scalars().all()
        }

        return [
            {
                "state": row[0],
                "push_count": row[1],
                "dev_count": row[2],
                "repo_count": row[3],
                "tech_diversity": row[4],
                "domain_diversity": row[5],
                "activity_score": activity_lookup.get(row[0], 0),
            }
            for row in rows
        ]

    def _compute_growth(self, current: float, previous: float) -> float:
        """Compute growth rate as 0-100 normalized value."""
        if previous == 0:
            return 50.0  # Neutral when no previous data
        raw_growth = ((current - previous) / previous) * 100
        # Clamp between 0 and 100
        return max(0.0, min(100.0, raw_growth + 50.0))

    async def _save_scores(self, scores: list[EcosystemScore]) -> None:
        """Upsert ecosystem scores."""
        for score in scores:
            existing = await self.db.execute(
                select(EcosystemScore).where(
                    EcosystemScore.entity_type == score.entity_type,
                    EcosystemScore.entity_key == score.entity_key,
                    EcosystemScore.period_start == score.period_start,
                    EcosystemScore.period_end == score.period_end,
                )
            )
            old = existing.scalar_one_or_none()
            if old:
                old.developer_activity_score = score.developer_activity_score
                old.developer_count = score.developer_count
                old.technology_diversity = score.technology_diversity
                old.domain_diversity = score.domain_diversity
                old.growth_rate = score.growth_rate
                old.ecosystem_score = score.ecosystem_score
                old.rank = score.rank
                old.computed_at = datetime.now(timezone.utc)
            else:
                score.id = str(uuid4())
                score.computed_at = datetime.now(timezone.utc)
                self.db.add(score)

        await self.db.flush()

    async def get_rankings(
        self, limit: int = 20, entity_type: str = "state",
        period_start: Optional[datetime] = None, period_end: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get ecosystem rankings."""
        end = period_end or datetime.now(timezone.utc)
        start = period_start or (end - timedelta(days=30))

        result = await self.db.execute(
            select(EcosystemScore)
            .where(
                EcosystemScore.entity_type == entity_type,
                EcosystemScore.period_start >= start,
                EcosystemScore.period_end <= end,
            )
            .order_by(EcosystemScore.rank.asc())
            .limit(limit)
        )
        scores = result.scalars().all()
        return [
            {
                "entity_key": s.entity_key,
                "entity_name": s.entity_name,
                "ecosystem_score": s.ecosystem_score,
                "developer_activity_score": s.developer_activity_score,
                "developer_count": s.developer_count,
                "technology_diversity": s.technology_diversity,
                "domain_diversity": s.domain_diversity,
                "growth_rate": s.growth_rate,
                "rank": s.rank,
            }
            for s in scores
        ]
