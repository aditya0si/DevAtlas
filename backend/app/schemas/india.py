"""Pydantic schemas for India intelligence features."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class InsightResponse(BaseModel):
    """Schema for an insight."""

    id: str
    text: str
    category: str
    region: Optional[str] = None
    metric_type: str
    metric_value: Optional[float] = None
    time_range: str
    generated_at: datetime


class EcosystemStatsResponse(BaseModel):
    """Schema for ecosystem statistics."""

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


class StateDashboardResponse(BaseModel):
    """Schema for state dashboard data."""

    state: str
    repository_count: int
    active_developers: int
    top_languages: list[dict[str, Any]]
    fastest_growing_technologies: list[dict[str, Any]]
    ai_summary: str
    monthly_growth_percent: float
    weekly_growth_percent: float
    trending_projects: list[dict[str, Any]]
    top_organizations: list[dict[str, Any]]
    activity_graph: list[dict[str, Any]]


class IndiaOverviewResponse(BaseModel):
    """Schema for India overview homepage."""

    top_growing_state: dict[str, Any]
    fastest_growing_technology: dict[str, Any]
    most_active_city: dict[str, Any]
    newest_trend: dict[str, Any]
    largest_community: dict[str, Any]
    repositories_today: int
    ai_summary: str
    insights: list[InsightResponse]


class EcosystemScoreResponse(BaseModel):
    """Schema for ecosystem scores."""

    state: str
    developer_activity_score: float
    innovation_score: float
    open_source_score: float
    ai_score: float
    cybersecurity_score: float
    growth_score: float
    overall_score: float
    rank: int


class DiscoveryResponse(BaseModel):
    """Schema for discovery endpoints."""

    trending_repositories: list[dict[str, Any]]
    trending_technologies: list[dict[str, Any]]
    trending_states: list[dict[str, Any]]
    trending_organizations: list[dict[str, Any]]
    newest_ai_projects: list[dict[str, Any]]
    fastest_growing_domains: list[dict[str, Any]]


class RepositoryCardResponse(BaseModel):
    """Schema for repository cards with AI summaries."""

    id: str
    name: str
    full_name: str
    description: Optional[str]
    purpose: str
    difficulty: str
    tech_stack: list[str]
    industry: str
    repository_health: str
    community_size: str
    stars: int
    languages: list[str]
    frameworks: list[str]
    growth_trend: str
    topics: list[str]
    html_url: str


class TimeSeriesDataPoint(BaseModel):
    """Schema for time series data."""

    date: str
    value: float


class AnalyticsGraphResponse(BaseModel):
    """Schema for analytics graphs."""

    repositories_over_time: list[TimeSeriesDataPoint]
    technology_growth: list[dict[str, Any]]
    language_popularity: list[dict[str, Any]]
    top_domains: list[dict[str, Any]]
    growth_trend: list[TimeSeriesDataPoint]
    state_comparison: list[dict[str, Any]]


class SemanticSearchRequest(BaseModel):
    """Schema for semantic search requests."""

    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=100)
    domain: Optional[str] = None


class SemanticSearchResult(BaseModel):
    """Schema for a semantic search result."""

    repository_id: str
    name: str
    full_name: str
    description: Optional[str]
    similarity: float
    language: Optional[str]
    topics: list[str]
    stars: int
    html_url: str


class SemanticSearchResponse(BaseModel):
    """Schema for semantic search response."""

    query: str
    results: list[SemanticSearchResult]
    total: int


# Trend Explanation Schemas

class TrendDriverSchema(BaseModel):
    """Schema for a trend driver."""

    factor: str
    impact: str
    description: str
    evidence: list[str] = Field(default_factory=list)


class UnusualObservationSchema(BaseModel):
    """Schema for an unusual observation."""

    observation: str
    significance: str
    deviation: str


class TrendExplanationResponse(BaseModel):
    """Schema for trend explanation response."""

    summary: str
    key_drivers: list[TrendDriverSchema] = Field(default_factory=list)
    unusual_observations: list[UnusualObservationSchema] = Field(default_factory=list)
    notable_changes: list[str] = Field(default_factory=list)
    confidence_score: float = Field(ge=0.0, le=1.0)
    entity_type: str
    entity_name: str
    time_range: str
    generated_at: datetime


class TrendExplainRequest(BaseModel):
    """Schema for requesting a trend explanation."""

    entity_type: str = Field(default="state", description="national, state, city, technology, organization, repository")
    entity_name: str = Field(..., description="Name of the entity")
    metric_name: str = Field(default="repository_count", description="Metric to explain")
    current_value: float = Field(..., description="Current period value")
    previous_value: float = Field(..., description="Previous period value")
    time_range: str = Field(default="month", description="Time period: week, month, quarter, year")
    domain: Optional[str] = Field(None, description="Optional domain filter")


# State Comparison Schemas

class StateComparisonDataSchema(BaseModel):
    """Schema for state comparison data."""

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


class ComparisonSummarySchema(BaseModel):
    """Schema for comparison summary."""

    entity_a: str
    entity_b: str
    summary: str
    winner: Optional[str]
    score_difference: float
    strengths_a: list[str] = Field(default_factory=list)
    strengths_b: list[str] = Field(default_factory=list)
    weaknesses_a: list[str] = Field(default_factory=list)
    weaknesses_b: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    confidence_score: float = Field(ge=0.0, le=1.0)
    generated_at: datetime


class ComparisonInsightSchema(BaseModel):
    """Schema for a comparison insight."""

    insight_type: str
    metric: str
    winner: Optional[str]
    entity_a_value: Optional[float]
    entity_b_value: Optional[float]
    difference_percent: float
    insight_text: str
    confidence: str


class StateComparisonResponse(BaseModel):
    """Schema for state comparison response."""

    comparison: StateComparisonDataSchema
    summary: ComparisonSummarySchema
    insights: list[ComparisonInsightSchema] = Field(default_factory=list)


class StateCompareRequest(BaseModel):
    """Schema for state comparison request."""

    state_a: str = Field(..., description="First state to compare")
    state_b: str = Field(..., description="Second state to compare")
    domain: Optional[str] = Field(None, description="Optional domain filter")
