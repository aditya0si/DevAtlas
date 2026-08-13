"""AI-powered insight generation service for DevAtlas."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from app.repositories.github_repository import GitHubRepository

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


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
    total_developers: int
    total_stars: int
    total_forks: int
    ai_repo_percentage: float
    top_language: str
    top_state: str
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
        # No direct AI client: AI generation is routed through
        # AIServiceFactory/FallbackChainProvider so no-key environments fall
        # back to deterministic mock output instead of erroring on init.

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

    async def get_ecosystem_stats(self, year: int | None = None) -> IndiaEcosystemStats:
        """Get comprehensive statistics about India's developer ecosystem.

        When ``year`` is provided, all repository/event metrics are restricted to
        repositories created / events occurring within that calendar year so the
        frontend Time Machine can query historical years.
        """
        from sqlalchemy import func, select
        from app.models.github import GitHubEvent, Repository

        year_start, year_end = self._year_bounds(year)

        # Get total counts
        repo_count_query = select(func.count(Repository.id))
        if year_start is not None:
            repo_count_query = repo_count_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
        repo_count_result = await self.db.execute(repo_count_query)
        total_repos = repo_count_result.scalar() or 0

        event_count_query = select(func.count(GitHubEvent.id))
        if year_start is not None:
            event_count_query = event_count_query.where(
                GitHubEvent.created_at >= year_start, GitHubEvent.created_at < year_end
            )
        event_count_result = await self.db.execute(event_count_query)
        total_events = event_count_result.scalar() or 0

        # Get active developers (unique actors in last 30 days, or within the year)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        active_devs_query = select(func.count(func.distinct(GitHubEvent.actor_login))).where(
            GitHubEvent.actor_login.isnot(None)
        )
        if year_start is not None:
            active_devs_query = active_devs_query.where(
                GitHubEvent.created_at >= year_start, GitHubEvent.created_at < year_end
            )
        else:
            active_devs_query = active_devs_query.where(GitHubEvent.created_at >= thirty_days_ago)
        active_developers = (await self.db.execute(active_devs_query)).scalar() or 0

        # Total distinct developers (all time, or within the year)
        total_devs_query = select(func.count(func.distinct(GitHubEvent.actor_login))).where(
            GitHubEvent.actor_login.isnot(None)
        )
        if year_start is not None:
            total_devs_query = total_devs_query.where(
                GitHubEvent.created_at >= year_start, GitHubEvent.created_at < year_end
            )
        total_developers = (await self.db.execute(total_devs_query)).scalar() or 0

        # Total stars / forks
        stars_query = select(func.coalesce(func.sum(Repository.stargazers_count), 0))
        forks_query = select(func.coalesce(func.sum(Repository.forks_count), 0))
        if year_start is not None:
            stars_query = stars_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
            forks_query = forks_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
        total_stars = int((await self.db.execute(stars_query)).scalar() or 0)
        total_forks = int((await self.db.execute(forks_query)).scalar() or 0)

        # Get top languages
        lang_query = select(Repository.language, func.count(Repository.id).label("count")).where(
            Repository.language.isnot(None)
        )
        if year_start is not None:
            lang_query = lang_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
        lang_result = await self.db.execute(
            lang_query.group_by(Repository.language)
            .order_by(func.count(Repository.id).desc())
            .limit(10)
        )
        top_languages = [{"language": row.language, "count": row.count} for row in lang_result.fetchall()]

        # Get domain distribution from classification
        domain_expr = Repository.classification.op("->>")("domain").label("domain")
        domain_query = select(
            domain_expr, func.count(Repository.id).label("count")
        ).where(Repository.classification.isnot(None))
        if year_start is not None:
            domain_query = domain_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
        domain_result = await self.db.execute(
            domain_query.group_by(domain_expr)
            .order_by(func.count(Repository.id).desc())
            .limit(10)
        )
        top_domains = [{"domain": row.domain or "unknown", "count": row.count} for row in domain_result.fetchall()]

        # Get growth metrics
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        quarter_ago = now - timedelta(days=90)

        week_count_query = select(func.count(Repository.id)).where(Repository.created_at >= week_ago)
        month_count_query = select(func.count(Repository.id)).where(Repository.created_at >= month_ago)
        quarter_count_query = select(func.count(Repository.id)).where(Repository.created_at >= quarter_ago)
        if year_start is not None:
            # Apply the calendar-year bounds to each growth query. Note: the
            # ``.where()`` call returns a NEW statement, so it must be reassigned
            # to the original variable (a plain ``for`` loop rebinding ``query``
            # would silently discard the year bounds).
            week_count_query = week_count_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
            month_count_query = month_count_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )
            quarter_count_query = quarter_count_query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )

        week_repos = (await self.db.execute(week_count_query)).scalar() or 0
        month_repos = (await self.db.execute(month_count_query)).scalar() or 0
        quarter_repos = (await self.db.execute(quarter_count_query)).scalar() or 0

        growth_metrics = {
            "weekly_growth": round((week_repos / max(total_repos, 1)) * 100, 2),
            "monthly_growth": round((month_repos / max(total_repos, 1)) * 100, 2),
            "quarterly_growth": round((quarter_repos / max(total_repos, 1)) * 100, 2),
            "repos_this_week": week_repos,
            "repos_this_month": month_repos,
        }

        # Get domain-specific counts
        domain_counts = await self._get_domain_counts(year)

        # Get top states (from location data if available)
        top_states = await self._get_top_states(year)

        ai_repos_count = domain_counts["ai_repos_count"]
        ai_repo_percentage = round((ai_repos_count / max(total_repos, 1)) * 100, 2)

        return IndiaEcosystemStats(
            total_repositories=total_repos,
            total_events=total_events,
            active_developers=active_developers,
            total_developers=total_developers,
            total_stars=total_stars,
            total_forks=total_forks,
            ai_repo_percentage=ai_repo_percentage,
            top_language=top_languages[0]["language"] if top_languages else "",
            top_state=top_states[0]["state"] if top_states else "",
            top_states=top_states,
            top_languages=top_languages,
            top_domains=top_domains,
            growth_metrics=growth_metrics,
            **domain_counts,
        )

    @staticmethod
    def _year_bounds(year: int | None) -> tuple[datetime | None, datetime | None]:
        """Return (start, end) UTC datetimes for a calendar year, or (None, None)."""
        if year is None:
            return None, None
        return datetime(year, 1, 1, tzinfo=timezone.utc), datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    async def _get_domain_counts(self, year: int | None = None) -> dict[str, int]:
        """Get repository counts by domain."""
        from sqlalchemy import func, select
        from app.models.github import Repository

        year_start, year_end = self._year_bounds(year)
        domains = ["ai/ml", "cybersecurity", "healthcare", "robotics", "web", "mobile", "devops", "blockchain", "opensource"]
        counts = {}

        for domain in domains:
            query = (
                select(func.count(Repository.id))
                .where(Repository.classification.isnot(None))
                .where(Repository.classification.op("->>")("domain").ilike(f"%{domain}%"))
            )
            if year_start is not None:
                query = query.where(
                    Repository.created_at >= year_start, Repository.created_at < year_end
                )
            result = await self.db.execute(query)
            key = domain.split("/")[0].replace("-", "_")
            counts[f"{key}_repos_count"] = result.scalar() or 0

        return counts

    async def _get_top_states(self, year: int | None = None) -> list[dict[str, Any]]:
        """Get top Indian states by repository count using real location data.

        Repositories are attributed to a state via their linked ``GitHubUser``
        (``github_users.state``), which is resolved from the owner's location.
        """
        from sqlalchemy import func, select
        from app.models.github import GitHubUser, Repository

        year_start, year_end = self._year_bounds(year)
        query = (
            select(GitHubUser.state, func.count(Repository.id).label("count"))
            .join(Repository, Repository.github_user_login == GitHubUser.login)
            .where(GitHubUser.state.isnot(None), GitHubUser.state != "")
            .group_by(GitHubUser.state)
            .order_by(func.count(Repository.id).desc())
            .limit(10)
        )
        if year_start is not None:
            query = query.where(
                Repository.created_at >= year_start, Repository.created_at < year_end
            )

        result = await self.db.execute(query)

        return [
            {
                "state": row.state,
                "repositories": row.count,
                "rank": i + 1,
            }
            for i, row in enumerate(result.fetchall())
        ]

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
        """Generate an AI summary of the ecosystem or a specific region.

        Generation is routed through ``AIServiceFactory`` / the fallback
        provider chain rather than a directly-constructed OpenAI client, so the
        service remains functional without API keys (deterministic fallback).
        """
        from app.services.ai_service import generate_text

        stats = await self.get_ecosystem_stats()

        prompt = self._build_summary_prompt(stats, region)

        try:
            response = await generate_text(
                system_prompt=(
                    "You are an expert analyst of Indian developer ecosystems. "
                    "Provide concise, data-driven insights."
                ),
                user_prompt=prompt,
            )
            return response or "Unable to generate summary."
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
