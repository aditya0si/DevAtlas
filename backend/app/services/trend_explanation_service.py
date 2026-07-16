"""Trend Explanation Engine for DevAtlas.

Generates human-readable explanations of WHY trends changed,
not just what changed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.repositories.github_repository import GitHubRepository

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()


class EntityType(str, Enum):
    """Types of entities that can be explained."""
    NATIONAL = "national"
    STATE = "state"
    CITY = "city"
    TECHNOLOGY = "technology"
    ORGANIZATION = "organization"
    REPOSITORY = "repository"


class TrendDirection(str, Enum):
    """Direction of a trend."""
    UP = "up"
    DOWN = "down"
    STABLE = "stable"


class TrendDriver(BaseModel):
    """A key driver behind a trend."""
    factor: str = Field(description="The factor driving the trend")
    impact: str = Field(description="High, medium, or low impact")
    description: str = Field(description="Detailed explanation of the driver")
    evidence: list[str] = Field(default_factory=list, description="Supporting evidence")


class UnusualObservation(BaseModel):
    """An unusual observation in the data."""
    observation: str = Field(description="What was observed")
    significance: str = Field(description="Why this matters")
    deviation: str = Field(description="How much it deviates from expected")


class TrendExplanation(BaseModel):
    """Complete explanation of a trend."""
    summary: str = Field(description="2-3 sentence executive summary")
    key_drivers: list[TrendDriver] = Field(default_factory=list, description="Top 3-5 drivers")
    unusual_observations: list[UnusualObservation] = Field(default_factory=list, description="Any anomalies")
    notable_changes: list[str] = Field(default_factory=list, description="Key changes noted")
    confidence_score: float = Field(ge=0.0, le=1.0, description="AI confidence in explanation")
    entity_type: EntityType = Field(description="Type of entity analyzed")
    entity_name: str = Field(description="Name of the entity")
    time_range: str = Field(description="Time period analyzed")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ComparisonSummary(BaseModel):
    """Summary comparing two or more entities."""
    entity_a: str = Field(description="First entity name")
    entity_b: str = Field(description="Second entity name")
    summary: str = Field(description="2-3 sentence comparison summary")
    winner: str | None = Field(description="Which entity leads overall")
    score_difference: float = Field(description="Difference in scores")
    strengths_a: list[str] = Field(default_factory=list, description="Strengths of entity A")
    strengths_b: list[str] = Field(default_factory=list, description="Strengths of entity B")
    weaknesses_a: list[str] = Field(default_factory=list, description="Weaknesses of entity A")
    weaknesses_b: list[str] = Field(default_factory=list, description="Weaknesses of entity B")
    opportunities: list[str] = Field(default_factory=list, description="Emerging opportunities")
    recommendations: list[str] = Field(default_factory=list, description="Data-driven recommendations")
    confidence_score: float = Field(ge=0.0, le=1.0, description="AI confidence in comparison")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ComparisonInsight(BaseModel):
    """A specific insight from comparing entities."""
    insight_type: str = Field(description="Type: growth, dominance, emerging, closing_gap")
    metric: str = Field(description="The metric being compared")
    winner: str | None = Field(description="Which entity wins this metric")
    entity_a_value: float | None = Field(description="Value for entity A")
    entity_b_value: float | None = Field(description="Value for entity B")
    difference_percent: float = Field(description="Percentage difference")
    insight_text: str = Field(description="Human-readable insight")
    confidence: str = Field(description="high, medium, low")


class StateComparisonData(BaseModel):
    """Comprehensive comparison data between two states."""
    state_a: str
    state_b: str
    repository_count_a: int
    repository_count_b: int
    developer_activity_a: int
    developer_activity_b: int
    growth_rate_a: float
    growth_rate_b: float
    top_languages_a: list[dict[str, Any]]
    top_languages_b: list[dict[str, Any]]
    top_domains_a: list[dict[str, Any]]
    top_domains_b: list[dict[str, Any]]
    ai_repos_a: int
    ai_repos_b: int
    cybersecurity_repos_a: int
    cybersecurity_repos_b: int
    healthcare_repos_a: int
    healthcare_repos_b: int
    robotics_repos_a: int
    robotics_repos_b: int
    opensource_repos_a: int
    opensource_repos_b: int
    avg_stars_a: float
    avg_stars_b: float
    innovation_score_a: float
    innovation_score_b: float
    growth_score_a: float
    growth_score_b: float
    top_organizations_a: list[str]
    top_organizations_b: list[str]


class TrendExplanationService:
    """Service for generating trend explanations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def explain_trend(
        self,
        entity_type: EntityType,
        entity_name: str,
        metric_name: str,
        current_value: float,
        previous_value: float,
        time_range: str = "month",
        domain: str | None = None,
    ) -> TrendExplanation:
        """Generate a detailed explanation of a trend.

        Args:
            entity_type: Type of entity (national, state, technology)
            entity_name: Name of the entity
            metric_name: The metric being explained (e.g., "repository_count", "developer_activity")
            current_value: Current period value
            previous_value: Previous period value
            time_range: Time period (week, month, quarter, year)
            domain: Optional domain filter (ai, cybersecurity, etc.)
        """
        # Calculate trend direction and percentage change
        if previous_value > 0:
            pct_change = ((current_value - previous_value) / previous_value) * 100
        else:
            pct_change = 100.0 if current_value > 0 else 0.0

        if abs(pct_change) < 1:
            direction = TrendDirection.STABLE
        elif pct_change > 0:
            direction = TrendDirection.UP
        else:
            direction = TrendDirection.DOWN

        # Gather supporting data
        context = await self._gather_context(entity_type, entity_name, domain)

        # Generate explanation using AI
        explanation = await self._generate_explanation(
            entity_type=entity_type,
            entity_name=entity_name,
            metric_name=metric_name,
            current_value=current_value,
            previous_value=previous_value,
            pct_change=pct_change,
            direction=direction,
            time_range=time_range,
            context=context,
        )

        return explanation

    async def _gather_context(
        self,
        entity_type: EntityType,
        entity_name: str,
        domain: str | None,
    ) -> dict[str, Any]:
        """Gather supporting context for trend explanation."""
        from sqlalchemy import func, select
        from app.models.github import Repository, GitHubEvent

        context: dict[str, Any] = {
            "repository_categories": [],
            "dominant_technologies": [],
            "language_adoption": [],
            "organization_activity": [],
            "creation_rate": 0,
            "historical_comparison": {},
        }

        # Build query filters
        filters = []
        if domain:
            filters.append(Repository.classification["domain"].astext.ilike(f"%{domain}%"))

        # Get repository categories
        if entity_type == EntityType.STATE:
            filters.append(Repository.owner_login.ilike(f"%{entity_name}%"))

        if filters:
            cat_result = await self.db.execute(
                select(Repository.classification["domain"].astext, func.count(Repository.id).label("count"))
                .where(*filters)
                .group_by(Repository.classification["domain"].astext)
                .order_by(func.count(Repository.id).desc())
                .limit(5)
            )
            context["repository_categories"] = [
                {"domain": row.domain or "unknown", "count": row.count}
                for row in cat_result.fetchall()
            ]

            # Get language adoption
            lang_result = await self.db.execute(
                select(Repository.language, func.count(Repository.id).label("count"))
                .where(*filters)
                .group_by(Repository.language)
                .order_by(func.count(Repository.id).desc())
                .limit(5)
            )
            context["language_adoption"] = [
                {"language": row.language, "count": row.count}
                for row in lang_result.fetchall()
            ]

            # Get top organizations
            org_result = await self.db.execute(
                select(Repository.owner_login, func.count(Repository.id).label("count"))
                .where(*filters)
                .group_by(Repository.owner_login)
                .order_by(func.count(Repository.id).desc())
                .limit(5)
            )
            context["organization_activity"] = [
                {"organization": row.owner_login, "count": row.count}
                for row in org_result.fetchall()
            ]

        # Get creation rate
        now = datetime.now(timezone.utc)
        if entity_type == EntityType.STATE:
            creation_result = await self.db.execute(
                select(func.count(Repository.id))
                .where(Repository.owner_login.ilike(f"%{entity_name}%"))
                .where(Repository.created_at >= now - timedelta(days=30))
            )
        else:
            creation_result = await self.db.execute(
                select(func.count(Repository.id))
                .where(Repository.created_at >= now - timedelta(days=30))
            )
        context["creation_rate"] = creation_result.scalar() or 0

        return context

    async def _generate_explanation(
        self,
        entity_type: EntityType,
        entity_name: str,
        metric_name: str,
        current_value: float,
        previous_value: float,
        pct_change: float,
        direction: TrendDirection,
        time_range: str,
        context: dict[str, Any],
    ) -> TrendExplanation:
        """Generate explanation using AI."""
        prompt = self._build_explanation_prompt(
            entity_type=entity_type,
            entity_name=entity_name,
            metric_name=metric_name,
            current_value=current_value,
            previous_value=previous_value,
            pct_change=pct_change,
            direction=direction,
            time_range=time_range,
            context=context,
        )

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are an expert AI analyst specializing in developer ecosystems.
Your explanations should:
- Explain the LIKELY CAUSES of trends, not just describe numbers
- Reference specific technologies, organizations, and patterns
- Be confident and definitive
- Use data-driven reasoning
- Highlight unusual observations
- Provide actionable insights""",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=800,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "TrendExplanation",
                        "schema": TrendExplanation.model_json_schema(),
                    },
                },
            )

            import json

            explanation_data = json.loads(response.choices[0].message.content)
            return TrendExplanation(**explanation_data)

        except Exception as e:
            # Fallback to structured explanation without AI
            return self._generate_structured_explanation(
                entity_type=entity_type,
                entity_name=entity_name,
                metric_name=metric_name,
                current_value=current_value,
                previous_value=previous_value,
                pct_change=pct_change,
                direction=direction,
                time_range=time_range,
                context=context,
            )

    def _build_explanation_prompt(
        self,
        entity_type: EntityType,
        entity_name: str,
        metric_name: str,
        current_value: float,
        previous_value: float,
        pct_change: float,
        direction: TrendDirection,
        time_range: str,
        context: dict[str, Any],
    ) -> str:
        """Build prompt for trend explanation."""
        categories = context.get("repository_categories", [])
        languages = context.get("language_adoption", [])
        orgs = context.get("organization_activity", [])
        creation_rate = context.get("creation_rate", 0)

        categories_str = ", ".join([f"{c['domain']} ({c['count']})" for c in categories[:5]]) or "None"
        languages_str = ", ".join([f"{l['language']} ({l['count']})" for l in languages[:5]]) or "None"
        orgs_str = ", ".join([f"{o['organization']} ({o['count']})" for o in orgs[:5]]) or "None"

        return f"""Explain WHY the {metric_name} for {entity_name} changed by {pct_change:.1f}% ({direction.value}).

Entity Type: {entity_type.value}
Time Range: {time_range}
Current Value: {current_value}
Previous Value: {previous_value}
Change: {pct_change:.1f}%

Repository Categories: {categories_str}

Dominant Technologies: {languages_str}

Organization Activity: {orgs_str}

Repository Creation Rate (last 30 days): {creation_rate}

Provide a JSON response with:
1. summary: 2-3 sentence executive summary explaining the LIKELY CAUSES
2. key_drivers: Top 3-5 factors driving this change with impact (high/medium/low) and description
3. unusual_observations: Any anomalies or unexpected patterns
4. notable_changes: Key changes to highlight
5. confidence_score: 0.0-1.0 based on data quality

Focus on explaining WHY this happened, not just WHAT happened."""

    def _generate_structured_explanation(
        self,
        entity_type: EntityType,
        entity_name: str,
        metric_name: str,
        current_value: float,
        previous_value: float,
        pct_change: float,
        direction: TrendDirection,
        time_range: str,
        context: dict[str, Any],
    ) -> TrendExplanation:
        """Generate structured explanation without AI (fallback)."""
        categories = context.get("repository_categories", [])
        languages = context.get("language_adoption", [])

        # Build summary
        if direction == TrendDirection.UP:
            summary = f"{entity_name} saw a {pct_change:.1f}% increase in {metric_name} over the past {time_range}."
        elif direction == TrendDirection.DOWN:
            summary = f"{entity_name} experienced a {abs(pct_change):.1f}% decrease in {metric_name} over the past {time_range}."
        else:
            summary = f"{entity_name}'s {metric_name} remained stable over the past {time_range}."

        # Build key drivers
        key_drivers = []
        if categories:
            top_cat = categories[0]
            key_drivers.append(TrendDriver(
                factor=top_cat["domain"],
                impact="high",
                description=f"{top_cat['domain']} repositories are the primary driver",
                evidence=[f"{top_cat['count']} repositories in this category"],
            ))

        if languages:
            top_lang = languages[0]
            key_drivers.append(TrendDriver(
                factor=f"{top_lang['language']} adoption",
                impact="medium",
                description=f"{top_lang['language']} is the dominant technology",
                evidence=[f"{top_lang['count']} repositories using {top_lang['language']}"],
            ))

        return TrendExplanation(
            summary=summary,
            key_drivers=key_drivers,
            unusual_observations=[],
            notable_changes=[f"{direction.value.title()} trend of {abs(pct_change):.1f}%"],
            confidence_score=0.6,
            entity_type=entity_type,
            entity_name=entity_name,
            time_range=time_range,
        )

    async def compare_states(
        self,
        state_a: str,
        state_b: str,
        domain: str | None = None,
    ) -> tuple[StateComparisonData, ComparisonSummary, list[ComparisonInsight]]:
        """Generate comprehensive comparison between two states.

        Returns:
            Tuple of (comparison_data, summary, insights)
        """
        # Gather data for both states
        data_a = await self._gather_state_data(state_a, domain)
        data_b = await self._gather_state_data(state_b, domain)

        # Create comparison data object
        comparison = StateComparisonData(
            state_a=state_a,
            state_b=state_b,
            repository_count_a=data_a["repo_count"],
            repository_count_b=data_b["repo_count"],
            developer_activity_a=data_a["developer_count"],
            developer_activity_b=data_b["developer_count"],
            growth_rate_a=data_a["growth_rate"],
            growth_rate_b=data_b["growth_rate"],
            top_languages_a=data_a["top_languages"],
            top_languages_b=data_b["top_languages"],
            top_domains_a=data_a["top_domains"],
            top_domains_b=data_b["top_domains"],
            ai_repos_a=data_a["domain_counts"].get("ai", 0),
            ai_repos_b=data_b["domain_counts"].get("ai", 0),
            cybersecurity_repos_a=data_a["domain_counts"].get("cybersecurity", 0),
            cybersecurity_repos_b=data_b["domain_counts"].get("cybersecurity", 0),
            healthcare_repos_a=data_a["domain_counts"].get("healthcare", 0),
            healthcare_repos_b=data_b["domain_counts"].get("healthcare", 0),
            robotics_repos_a=data_a["domain_counts"].get("robotics", 0),
            robotics_repos_b=data_b["domain_counts"].get("robotics", 0),
            opensource_repos_a=data_a["domain_counts"].get("opensource", 0),
            opensource_repos_b=data_b["domain_counts"].get("opensource", 0),
            avg_stars_a=data_a["avg_stars"],
            avg_stars_b=data_b["avg_stars"],
            innovation_score_a=data_a["innovation_score"],
            innovation_score_b=data_b["innovation_score"],
            growth_score_a=data_a["growth_score"],
            growth_score_b=data_b["growth_score"],
            top_organizations_a=data_a["top_orgs"],
            top_organizations_b=data_b["top_orgs"],
        )

        # Generate summary and insights
        summary = await self._generate_comparison_summary(comparison)
        insights = await self._generate_comparison_insights(comparison)

        return comparison, summary, insights

    async def _gather_state_data(
        self,
        state: str,
        domain: str | None,
    ) -> dict[str, Any]:
        """Gather comprehensive data for a state."""
        from sqlalchemy import func, select
        from app.models.github import Repository, GitHubEvent

        now = datetime.now(timezone.utc)
        month_ago = now - timedelta(days=30)
        two_months_ago = now - timedelta(days=60)

        # Build filters
        base_filters = [Repository.owner_login.ilike(f"%{state}%")]
        if domain:
            base_filters.append(Repository.classification["domain"].astext.ilike(f"%{domain}%"))

        # Repository count
        repo_result = await self.db.execute(
            select(func.count(Repository.id)).where(*base_filters)
        )
        repo_count = repo_result.scalar() or 0

        # Developer activity
        dev_result = await self.db.execute(
            select(func.count(func.distinct(GitHubEvent.actor_login)))
            .join(Repository, GitHubEvent.repository_id == Repository.id)
            .where(Repository.owner_login.ilike(f"%{state}%"))
            .where(GitHubEvent.created_at >= month_ago)
        )
        developer_count = dev_result.scalar() or 0

        # Growth rate
        current_month_result = await self.db.execute(
            select(func.count(Repository.id))
            .where(Repository.owner_login.ilike(f"%{state}%"))
            .where(Repository.created_at >= month_ago)
        )
        current_month = current_month_result.scalar() or 0

        prev_month_result = await self.db.execute(
            select(func.count(Repository.id))
            .where(Repository.owner_login.ilike(f"%{state}%"))
            .where(Repository.created_at >= two_months_ago)
            .where(Repository.created_at < month_ago)
        )
        prev_month = prev_month_result.scalar() or 0

        growth_rate = ((current_month - prev_month) / max(prev_month, 1)) * 100

        # Top languages
        lang_result = await self.db.execute(
            select(Repository.language, func.count(Repository.id).label("count"))
            .where(*base_filters)
            .where(Repository.language.isnot(None))
            .group_by(Repository.language)
            .order_by(func.count(Repository.id).desc())
            .limit(5)
        )
        top_languages = [{"language": row.language, "count": row.count} for row in lang_result.fetchall()]

        # Top domains
        domain_result = await self.db.execute(
            select(Repository.classification["domain"].astext, func.count(Repository.id).label("count"))
            .where(*base_filters)
            .where(Repository.classification.isnot(None))
            .group_by(Repository.classification["domain"].astext)
            .order_by(func.count(Repository.id).desc())
            .limit(5)
        )
        top_domains = [{"domain": row.domain or "unknown", "count": row.count} for row in domain_result.fetchall()]

        # Domain counts
        domain_counts = {}
        for dom in ["ai", "cybersecurity", "healthcare", "robotics", "opensource"]:
            count_result = await self.db.execute(
                select(func.count(Repository.id))
                .where(*base_filters)
                .where(Repository.classification["domain"].astext.ilike(f"%{dom}%"))
            )
            domain_counts[dom] = count_result.scalar() or 0

        # Average stars
        stars_result = await self.db.execute(
            select(func.avg(Repository.stargazers_count))
            .where(*base_filters)
        )
        avg_stars = stars_result.scalar() or 0.0

        # Top organizations
        org_result = await self.db.execute(
            select(Repository.owner_login, func.count(Repository.id).label("count"))
            .where(*base_filters)
            .group_by(Repository.owner_login)
            .order_by(func.count(Repository.id).desc())
            .limit(5)
        )
        top_orgs = [row.owner_login for row in org_result.fetchall()]

        # Calculate scores
        innovation_score = min(100, (repo_count * 0.1) + (avg_stars * 0.5) + (len(top_orgs) * 2))
        growth_score = min(100, max(0, growth_rate * 2))

        return {
            "repo_count": repo_count,
            "developer_count": developer_count,
            "growth_rate": growth_rate,
            "top_languages": top_languages,
            "top_domains": top_domains,
            "domain_counts": domain_counts,
            "avg_stars": avg_stars,
            "innovation_score": innovation_score,
            "growth_score": growth_score,
            "top_orgs": top_orgs,
        }

    async def _generate_comparison_summary(
        self,
        comparison: StateComparisonData,
    ) -> ComparisonSummary:
        """Generate AI-powered comparison summary."""
        prompt = self._build_comparison_prompt(comparison)

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are an expert analyst comparing developer ecosystems.
Provide data-driven comparisons that:
- Highlight strengths and weaknesses objectively
- Identify emerging opportunities
- Make actionable recommendations
- Avoid hallucination - only use provided data
- Be confident and definitive""",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=600,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "ComparisonSummary",
                        "schema": ComparisonSummary.model_json_schema(),
                    },
                },
            )

            import json

            summary_data = json.loads(response.choices[0].message.content)
            return ComparisonSummary(**summary_data)

        except Exception:
            # Fallback to structured summary
            return self._generate_structured_summary(comparison)

    def _build_comparison_prompt(self, comparison: StateComparisonData) -> str:
        """Build prompt for comparison summary."""
        return f"""Compare the developer ecosystems of {comparison.state_a} and {comparison.state_b}.

{comparison.state_a}:
- Repositories: {comparison.repository_count_a}
- Active Developers: {comparison.developer_activity_a}
- Growth Rate: {comparison.growth_rate_a:.1f}%
- AI Repos: {comparison.ai_repos_a}
- Cybersecurity Repos: {comparison.cybersecurity_repos_a}
- Healthcare Repos: {comparison.healthcare_repos_a}
- Avg Stars: {comparison.avg_stars_a:.1f}
- Innovation Score: {comparison.innovation_score_a:.1f}
- Top Languages: {', '.join([l['language'] for l in comparison.top_languages_a[:3]])}
- Top Organizations: {', '.join(comparison.top_organizations_a[:3])}

{comparison.state_b}:
- Repositories: {comparison.repository_count_b}
- Active Developers: {comparison.developer_activity_b}
- Growth Rate: {comparison.growth_rate_b:.1f}%
- AI Repos: {comparison.ai_repos_b}
- Cybersecurity Repos: {comparison.cybersecurity_repos_b}
- Healthcare Repos: {comparison.healthcare_repos_b}
- Avg Stars: {comparison.avg_stars_b:.1f}
- Innovation Score: {comparison.innovation_score_b:.1f}
- Top Languages: {', '.join([l['language'] for l in comparison.top_languages_b[:3]])}
- Top Organizations: {', '.join(comparison.top_organizations_b[:3])}

Provide a JSON response with:
1. summary: 2-3 sentence comparison summary
2. winner: Which state leads overall (or "tie")
3. score_difference: Difference in overall scores
4. strengths_a: List of {comparison.state_a}'s strengths
5. strengths_b: List of {comparison.state_b}'s strengths
6. weaknesses_a: List of {comparison.state_a}'s weaknesses
7. weaknesses_b: List of {comparison.state_b}'s weaknesses
8. opportunities: Emerging opportunities for both
9. recommendations: Data-driven recommendations
10. confidence_score: 0.0-1.0 based on data completeness"""

    def _generate_structured_summary(
        self,
        comparison: StateComparisonData,
    ) -> ComparisonSummary:
        """Generate structured summary without AI (fallback)."""
        # Calculate overall scores
        score_a = (
            comparison.repository_count_a * 0.1 +
            comparison.developer_activity_a * 0.2 +
            comparison.avg_stars_a * 0.3 +
            comparison.innovation_score_a * 0.2 +
            comparison.growth_score_a * 0.2
        )
        score_b = (
            comparison.repository_count_b * 0.1 +
            comparison.developer_activity_b * 0.2 +
            comparison.avg_stars_b * 0.3 +
            comparison.innovation_score_b * 0.2 +
            comparison.growth_score_b * 0.2
        )

        winner = comparison.state_a if score_a > score_b else comparison.state_b
        if abs(score_a - score_b) < 5:
            winner = "tie"

        summary = f"{comparison.state_a} and {comparison.state_b} show distinct developer ecosystem patterns. "
        if score_a > score_b:
            summary += f"{comparison.state_a} leads with stronger repository diversity and developer activity."
        else:
            summary += f"{comparison.state_b} leads with higher innovation metrics and community engagement."

        return ComparisonSummary(
            entity_a=comparison.state_a,
            entity_b=comparison.state_b,
            summary=summary,
            winner=winner,
            score_difference=abs(score_a - score_b),
            strengths_a=[f"{comparison.repository_count_a} repositories", f"{comparison.developer_activity_a} active developers"],
            strengths_b=[f"{comparison.repository_count_b} repositories", f"{comparison.developer_activity_b} active developers"],
            weaknesses_a=["Growth rate below potential"],
            weaknesses_b=["Growth rate below potential"],
            opportunities=["Cross-state collaboration", "Shared technology栈"],
            recommendations=["Focus on developer engagement", "Increase open source participation"],
            confidence_score=0.7,
        )

    async def _generate_comparison_insights(
        self,
        comparison: StateComparisonData,
    ) -> list[ComparisonInsight]:
        """Generate specific comparison insights."""
        insights = []

        # Repository count comparison
        if comparison.repository_count_a > 0 or comparison.repository_count_b > 0:
            max_repo = max(comparison.repository_count_a, comparison.repository_count_b)
            diff = abs(comparison.repository_count_a - comparison.repository_count_b) / max_repo * 100
            winner = comparison.state_a if comparison.repository_count_a > comparison.repository_count_b else comparison.state_b
            insights.append(ComparisonInsight(
                insight_type="dominance",
                metric="repository_count",
                winner=winner,
                entity_a_value=float(comparison.repository_count_a),
                entity_b_value=float(comparison.repository_count_b),
                difference_percent=diff,
                insight_text=f"{winner} leads in total repositories with {max_repo} projects",
                confidence="high",
            ))

        # Growth rate comparison
        if comparison.growth_rate_a != comparison.growth_rate_b:
            faster = comparison.state_a if comparison.growth_rate_a > comparison.growth_rate_b else comparison.state_b
            diff = abs(comparison.growth_rate_a - comparison.growth_rate_b)
            insights.append(ComparisonInsight(
                insight_type="growth",
                metric="growth_rate",
                winner=faster,
                entity_a_value=comparison.growth_rate_a,
                entity_b_value=comparison.growth_rate_b,
                difference_percent=diff,
                insight_text=f"{faster} is growing faster with {max(comparison.growth_rate_a, comparison.growth_rate_b):.1f}% monthly growth",
                confidence="high",
            ))

        # AI comparison
        if comparison.ai_repos_a > 0 or comparison.ai_repos_b > 0:
            leader = comparison.state_a if comparison.ai_repos_a > comparison.ai_repos_b else comparison.state_b
            insights.append(ComparisonInsight(
                insight_type="emerging",
                metric="ai_projects",
                winner=leader,
                entity_a_value=float(comparison.ai_repos_a),
                entity_b_value=float(comparison.ai_repos_b),
                difference_percent=abs(comparison.ai_repos_a - comparison.ai_repos_b) / max(comparison.ai_repos_a, comparison.ai_repos_b, 1) * 100,
                insight_text=f"{leader} has more AI/ML projects, indicating stronger AI ecosystem maturity",
                confidence="medium",
            ))

        # Cybersecurity comparison
        if comparison.cybersecurity_repos_a > 0 or comparison.cybersecurity_repos_b > 0:
            leader = comparison.state_a if comparison.cybersecurity_repos_a > comparison.cybersecurity_repos_b else comparison.state_b
            insights.append(ComparisonInsight(
                insight_type="emerging",
                metric="cybersecurity_projects",
                winner=leader,
                entity_a_value=float(comparison.cybersecurity_repos_a),
                entity_b_value=float(comparison.cybersecurity_repos_b),
                difference_percent=abs(comparison.cybersecurity_repos_a - comparison.cybersecurity_repos_b) / max(comparison.cybersecurity_repos_a, comparison.cybersecurity_repos_b, 1) * 100,
                insight_text=f"{leader} leads in cybersecurity projects",
                confidence="medium",
            ))

        # Language dominance
        if comparison.top_languages_a and comparison.top_languages_b:
            lang_a = comparison.top_languages_a[0]["language"] if comparison.top_languages_a else None
            lang_b = comparison.top_languages_b[0]["language"] if comparison.top_languages_b else None
            if lang_a and lang_b and lang_a == lang_b:
                insights.append(ComparisonInsight(
                    insight_type="dominance",
                    metric="language",
                    winner="both",
                    entity_a_value=comparison.top_languages_a[0]["count"],
                    entity_b_value=comparison.top_languages_b[0]["count"],
                    difference_percent=0,
                    insight_text=f"Both states share {lang_a} as their primary language",
                    confidence="high",
                ))

        return insights
