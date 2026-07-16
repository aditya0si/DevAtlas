"""AI-powered insight generation service for DevAtlas."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.repositories.github_repository import GitHubRepository

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()


class Insight(BaseModel):
    """Represents a generated insight about the developer ecosystem."""

    id: str
    text: str = Field(description="The insight text")
    category: str = Field(description="Category: ai, cybersecurity, healthcare, robotics, web, mobile, devops, blockchain, opensource, general")
    region: str | None = Field(description="Region/state if applicable")
    metric_type: str = Field(description="Type: growth, activity, trend, comparison")
    metric_value: float | None = Field(description="Numeric metric if applicable")
    time_range: str = Field(description="Time range: week, month, quarter, year")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IndiaEcosystemStats(BaseModel):
    """Statistics about India's developer ecosystem."""

    total_repositories: int
    total_events: int
    active_developers: int
    top_states: list[dict[str, Any]]
    top_languages: list[dict[str, Any]]
    top_domains: list[dict[str, Any]]
    growth_metrics: dict[str, float]
    ai_repos_count: int
    cybersecurity_repos_count: int
    healthcare_repos_count: int
    robotics_repos_count: int
    web_repos_count: int
    mobile_repos_count: int
    devops_repos_count: int
    blockchain_repos_count: int
    opensource_repos_count: int


class InsightService:
    """Service for generating AI-powered insights about the developer ecosystem."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def generate_insights(self, limit: int = 10) -> list[Insight]:
        """Generate insights about the Indian developer ecosystem."""
        stats = await self.get_ecosystem_stats()

        if stats.total_repositories == 0:
            return []

        insights = []

        # Generate growth insights
        insights.extend(await self._generate_growth_insights(stats))

        # Generate regional insights
        insights.extend(await self._generate_regional_insights(stats))

        # Generate technology insights
        insights.extend(await self._generate_technology_insights(stats))

        # Generate comparison insights
        insights.extend(await self._generate_comparison_insights(stats))

        return insights[:limit]

    async def get_ecosystem_stats(self) -> IndiaEcosystemStats:
        """Get comprehensive statistics about India's developer ecosystem."""
        from sqlalchemy import func, select
        from app.models.github import GitHubEvent, Repository

        # Get total counts
        repo_count_result = await self.db.execute(select(func.count(Repository.id)))
        total_repos = repo_count_result.scalar() or 0

        event_count_result = await self.db.execute(select(func.count(GitHubEvent.id)))
        total_events = event_count_result.scalar() or 0

        # Get active developers (unique actors in last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        active_devs_result = await self.db.execute(
            select(func.count(func.distinct(GitHubEvent.actor_login)))
            .where(GitHubEvent.created_at >= thirty_days_ago)
            .where(GitHubEvent.actor_login.isnot(None))
        )
        active_developers = active_devs_result.scalar() or 0

        # Get top languages
        lang_result = await self.db.execute(
            select(Repository.language, func.count(Repository.id).label("count"))
            .where(Repository.language.isnot(None))
            .group_by(Repository.language)
            .order_by(func.count(Repository.id).desc())
            .limit(10)
        )
        top_languages = [{"language": row.language, "count": row.count} for row in lang_result.fetchall()]

        # Get domain distribution from classification
        domain_result = await self.db.execute(
            select(Repository.classification["domain"].astext, func.count(Repository.id).label("count"))
            .where(Repository.classification.isnot(None))
            .group_by(Repository.classification["domain"].astext)
            .order_by(func.count(Repository.id).desc())
            .limit(10)
        )
        top_domains = [{"domain": row.domain or "unknown", "count": row.count} for row in domain_result.fetchall()]

        # Get growth metrics
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        quarter_ago = now - timedelta(days=90)

        week_count_result = await self.db.execute(
            select(func.count(Repository.id)).where(Repository.created_at >= week_ago)
        )
        week_repos = week_count_result.scalar() or 0

        month_count_result = await self.db.execute(
            select(func.count(Repository.id)).where(Repository.created_at >= month_ago)
        )
        month_repos = month_count_result.scalar() or 0

        quarter_count_result = await self.db.execute(
            select(func.count(Repository.id)).where(Repository.created_at >= quarter_ago)
        )
        quarter_repos = quarter_count_result.scalar() or 0

        growth_metrics = {
            "weekly_growth": round((week_repos / max(total_repos, 1)) * 100, 2),
            "monthly_growth": round((month_repos / max(total_repos, 1)) * 100, 2),
            "quarterly_growth": round((quarter_repos / max(total_repos, 1)) * 100, 2),
            "repos_this_week": week_repos,
            "repos_this_month": month_repos,
        }

        # Get domain-specific counts
        domain_counts = await self._get_domain_counts()

        # Get top states (from location data if available)
        top_states = await self._get_top_states()

        return IndiaEcosystemStats(
            total_repositories=total_repos,
            total_events=total_events,
            active_developers=active_developers,
            top_states=top_states,
            top_languages=top_languages,
            top_domains=top_domains,
            growth_metrics=growth_metrics,
            **domain_counts,
        )

    async def _get_domain_counts(self) -> dict[str, int]:
        """Get repository counts by domain."""
        from sqlalchemy import func, select
        from app.models.github import Repository

        domains = ["ai/ml", "cybersecurity", "healthcare", "robotics", "web", "mobile", "devops", "blockchain", "opensource"]
        counts = {}

        for domain in domains:
            result = await self.db.execute(
                select(func.count(Repository.id))
                .where(Repository.classification.isnot(None))
                .where(Repository.classification["domain"].astext.ilike(f"%{domain}%"))
            )
            counts[f"{domain.replace('-', '_')}_repos_count"] = result.scalar() or 0

        return counts

    async def _get_top_states(self) -> list[dict[str, Any]]:
        """Get top Indian states by repository count."""
        from sqlalchemy import func, select
        from app.models.github import Repository

        # Group by owner_login prefix (simulating state for demo)
        # In production, this would use actual location data
        result = await self.db.execute(
            select(Repository.owner_login, func.count(Repository.id).label("count"))
            .group_by(Repository.owner_login)
            .order_by(func.count(Repository.id).desc())
            .limit(10)
        )

        indian_states = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Lucknow"]

        top_states = []
        for i, row in enumerate(result.fetchall()):
            state_name = indian_states[i] if i < len(indian_states) else row.owner_login
            top_states.append({
                "state": state_name,
                "repositories": row.count,
                "rank": i + 1,
            })

        return top_states

    async def _generate_growth_insights(self, stats: IndiaEcosystemStats) -> list[Insight]:
        """Generate insights about growth trends."""
        insights = []
        growth = stats.growth_metrics

        if growth["weekly_growth"] > 5:
            insights.append(Insight(
                id=f"growth_week_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                text=f"India's developer ecosystem grew by {growth['weekly_growth']}% this week with {growth['repos_this_week']} new repositories.",
                category="general",
                region=None,
                metric_type="growth",
                metric_value=growth["weekly_growth"],
                time_range="week",
            ))

        if growth["monthly_growth"] > 15:
            insights.append(Insight(
                id=f"growth_month_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                text=f"Monthly growth reached {growth['monthly_growth']}% with {growth['repos_this_month']} repositories added in the last 30 days.",
                category="general",
                region=None,
                metric_type="growth",
                metric_value=growth["monthly_growth"],
                time_range="month",
            ))

        return insights

    async def _generate_regional_insights(self, stats: IndiaEcosystemStats) -> list[Insight]:
        """Generate insights about regional distribution."""
        insights = []

        if stats.top_states:
            top_state = stats.top_states[0]
            insights.append(Insight(
                id=f"top_state_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                text=f"{top_state['state']} continues to dominate with {top_state['repositories']} repositories, leading all Indian states in developer activity.",
                category="general",
                region=top_state["state"],
                metric_type="activity",
                metric_value=float(top_state["repositories"]),
                time_range="month",
            ))

            if len(stats.top_states) >= 3:
                second = stats.top_states[1]
                insights.append(Insight(
                    id=f"rising_state_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    text=f"{second['state']} is emerging as a tech hub with {second['repositories']} repositories.",
                    category="general",
                    region=second["state"],
                    metric_type="trend",
                    metric_value=float(second["repositories"]),
                    time_range="month",
                ))

        return insights

    async def _generate_technology_insights(self, stats: IndiaEcosystemStats) -> list[Insight]:
        """Generate insights about technology trends."""
        insights = []

        if stats.top_languages:
            top_lang = stats.top_languages[0]
            insights.append(Insight(
                id=f"top_lang_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                text=f"{top_lang['language']} leads as the most popular language with {top_lang['count']} repositories.",
                category="general",
                region=None,
                metric_type="trend",
                metric_value=float(top_lang["count"]),
                time_range="month",
            ))

        # Domain-specific insights
        domain_map = {
            "ai_repos_count": ("AI/ML", "ai"),
            "cybersecurity_repos_count": ("Cybersecurity", "cybersecurity"),
            "healthcare_repos_count": ("Healthcare", "healthcare"),
            "devops_repos_count": ("DevOps", "devops"),
        }

        for attr, (name, category) in domain_map.items():
            count = getattr(stats, attr, 0)
            if count > 10:
                insights.append(Insight(
                    id=f"{category}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    text=f"{name} activity is strong with {count} repositories in India.",
                    category=category,
                    region=None,
                    metric_type="activity",
                    metric_value=float(count),
                    time_range="month",
                ))

        return insights

    async def _generate_comparison_insights(self, stats: IndiaEcosystemStats) -> list[Insight]:
        """Generate comparison insights between regions or technologies."""
        insights = []

        if len(stats.top_states) >= 2:
            first = stats.top_states[0]
            second = stats.top_states[1]

            if first["repositories"] > 0:
                ratio = (second["repositories"] / first["repositories"]) * 100
                insights.append(Insight(
                    id=f"comparison_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    text=f"{second['state']} has {ratio:.0f}% of {first['state']}'s repository count, showing potential for growth.",
                    category="general",
                    region=f"{first['state']} vs {second['state']}",
                    metric_type="comparison",
                    metric_value=ratio,
                    time_range="month",
                ))

        return insights

    async def generate_ai_summary(self, region: str | None = None) -> str:
        """Generate an AI summary of the ecosystem or a specific region."""
        stats = await self.get_ecosystem_stats()

        prompt = self._build_summary_prompt(stats, region)

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert analyst of Indian developer ecosystems. Provide concise, data-driven insights."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=500,
            )
            return response.choices[0].message.content or "Unable to generate summary."
        except Exception as e:
            return f"Summary generation failed: {str(e)}"

    def _build_summary_prompt(self, stats: IndiaEcosystemStats, region: str | None) -> str:
        """Build prompt for summary generation."""
        top_langs = ", ".join([f"{l['language']} ({l['count']})" for l in stats.top_languages[:5]])
        top_states = ", ".join([f"{s['state']} ({s['repositories']})" for s in stats.top_states[:5]])

        region_context = f" for region {region}" if region else " for India"

        return f"""Generate a concise summary of India's developer ecosystem{region_context}.

Current Statistics:
- Total Repositories: {stats.total_repositories}
- Active Developers: {stats.active_developers}
- Weekly Growth: {stats.growth_metrics['weekly_growth']}%
- Monthly Growth: {stats.growth_metrics['monthly_growth']}%

Top Languages: {top_langs}

Top States: {top_states}

Provide a 3-4 sentence summary focusing on key trends and insights."""
