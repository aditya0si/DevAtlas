"""Tests for Trend Explanation Service and Comparison features."""

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import get_settings


@pytest.fixture(autouse=True)
def _relax_ai_rate_limits(monkeypatch):
    """POST /api/v1/india/trends/explain sits behind the LLM cost guard (S-01).

    These tests are about trend explanations, not throttling, and the whole
    suite shares one test-client IP under CI's real Redis, so they run with a
    large budget. The limiter itself is covered in tests/test_authz_guards.py.
    """
    monkeypatch.setattr(get_settings(), "ai_rate_limit_requests", 100_000)
    monkeypatch.setattr(get_settings(), "ai_daily_requests", 10_000_000)


class TestTrendExplanationService:
    """Tests for TrendExplanationService."""

    def test_entity_type_enum(self):
        """Test EntityType enum values."""
        from app.services.trend_explanation_service import EntityType

        assert EntityType.NATIONAL.value == "national"
        assert EntityType.STATE.value == "state"
        assert EntityType.CITY.value == "city"
        assert EntityType.TECHNOLOGY.value == "technology"
        assert EntityType.ORGANIZATION.value == "organization"
        assert EntityType.REPOSITORY.value == "repository"

    def test_trend_direction_enum(self):
        """Test TrendDirection enum values."""
        from app.services.trend_explanation_service import TrendDirection

        assert TrendDirection.UP.value == "up"
        assert TrendDirection.DOWN.value == "down"
        assert TrendDirection.STABLE.value == "stable"

    def test_trend_driver_model(self):
        """Test TrendDriver model validation."""
        from app.services.trend_explanation_service import TrendDriver

        driver = TrendDriver(
            factor="AI/ML frameworks",
            impact="high",
            description="Strong growth in AI repositories",
            evidence=["200+ new AI repos", "FastAPI adoption increasing"],
        )

        assert driver.factor == "AI/ML frameworks"
        assert driver.impact == "high"
        assert len(driver.evidence) == 2

    def test_unusual_observation_model(self):
        """Test UnusualObservation model validation."""
        from app.services.trend_explanation_service import UnusualObservation

        obs = UnusualObservation(
            observation="Cybersecurity repos doubled",
            significance="Indicates growing security focus",
            deviation="+100% from expected",
        )

        assert obs.observation == "Cybersecurity repos doubled"
        assert obs.significance == "Indicates growing security focus"

    def test_trend_explanation_model(self):
        """Test TrendExplanation model validation."""
        from app.services.trend_explanation_service import EntityType, TrendExplanation

        explanation = TrendExplanation(
            summary="AI repository growth increased significantly.",
            key_drivers=[],
            unusual_observations=[],
            notable_changes=["FastAPI adoption increased"],
            confidence_score=0.85,
            entity_type=EntityType.STATE,
            entity_name="Karnataka",
            time_range="month",
        )

        assert explanation.summary == "AI repository growth increased significantly."
        assert explanation.confidence_score == 0.85
        assert explanation.entity_type == EntityType.STATE

    def test_comparison_summary_model(self):
        """Test ComparisonSummary model validation."""
        from app.services.trend_explanation_service import ComparisonSummary

        summary = ComparisonSummary(
            entity_a="Karnataka",
            entity_b="Maharashtra",
            summary="Karnataka leads in AI ecosystem maturity.",
            winner="Karnataka",
            score_difference=15.5,
            strengths_a=["Repository diversity", "Developer activity"],
            strengths_b=["Cybersecurity focus", "Healthcare AI"],
            weaknesses_a=["Growth rate"],
            weaknesses_b=["Open source participation"],
            opportunities=["Larger shared developer pool"],
            recommendations=["Focus on developer engagement"],
            confidence_score=0.9,
        )

        assert summary.winner == "Karnataka"
        assert summary.score_difference == 15.5
        assert len(summary.strengths_a) == 2

    def test_comparison_insight_model(self):
        """Test ComparisonInsight model validation."""
        from app.services.trend_explanation_service import ComparisonInsight

        insight = ComparisonInsight(
            insight_type="growth",
            metric="repository_count",
            winner="Karnataka",
            entity_a_value=500,
            entity_b_value=350,
            difference_percent=30.0,
            insight_text="Karnataka leads with 500 repositories",
            confidence="high",
        )

        assert insight.winner == "Karnataka"
        assert insight.difference_percent == 30.0

    def test_state_comparison_data_model(self):
        """Test StateComparisonData model validation."""
        from app.services.trend_explanation_service import StateComparisonData

        data = StateComparisonData(
            state_a="Karnataka",
            state_b="Maharashtra",
            repository_count_a=500,
            repository_count_b=350,
            developer_activity_a=200,
            developer_activity_b=150,
            growth_rate_a=15.5,
            growth_rate_b=12.3,
            top_languages_a=[{"language": "Python", "count": 150}],
            top_languages_b=[{"language": "Python", "count": 100}],
            top_domains_a=[{"domain": "ai", "count": 100}],
            top_domains_b=[{"domain": "ai", "count": 75}],
            ai_repos_a=100,
            ai_repos_b=75,
            cybersecurity_repos_a=25,
            cybersecurity_repos_b=40,
            healthcare_repos_a=30,
            healthcare_repos_b=20,
            robotics_repos_a=15,
            robotics_repos_b=10,
            opensource_repos_a=200,
            opensource_repos_b=150,
            avg_stars_a=45.5,
            avg_stars_b=38.2,
            innovation_score_a=78.5,
            innovation_score_b=65.3,
            growth_score_a=82.1,
            growth_score_b=70.4,
            top_organizations_a=["org1", "org2"],
            top_organizations_b=["org3", "org4"],
        )

        assert data.state_a == "Karnataka"
        assert data.repository_count_a == 500
        assert data.ai_repos_a == 100

    def test_init_does_not_construct_ai_client(self, db_session):
        """The service must NOT build a raw AsyncOpenAI client.

        AI generation is routed through AIServiceFactory/FallbackChainProvider,
        so no-key environments still work via the deterministic fallback.
        """
        from app.services.trend_explanation_service import TrendExplanationService

        service = TrendExplanationService(db_session)
        assert not hasattr(service, "client")

    def test_extract_json_strips_markdown_fences(self):
        """Provider text may wrap JSON in code fences/prose; extraction must cope."""
        from app.services.trend_explanation_service import TrendExplanationService

        text = (
            'Here is the result:\n```json\n'
            '{"summary": "Growth driven by AI", "confidence_score": 0.5}\n'
            '```\nThat is all.'
        )
        data = TrendExplanationService._extract_json(text)
        assert data["summary"] == "Growth driven by AI"
        assert data["confidence_score"] == 0.5

    @pytest.mark.asyncio
    async def test_explanation_parses_provider_json(self):
        """Valid JSON from the provider chain is parsed into a TrendExplanation."""
        from app.services.trend_explanation_service import (
            EntityType,
            TrendDirection,
            TrendExplanationService,
        )

        service = TrendExplanationService.__new__(TrendExplanationService)

        valid_json = json.dumps({
            "summary": "Growth driven by AI framework adoption.",
            "key_drivers": [
                {
                    "factor": "AI frameworks",
                    "impact": "high",
                    "description": "More AI repos",
                    "evidence": ["150 new repos"],
                }
            ],
            "unusual_observations": [],
            "notable_changes": ["FastAPI adoption"],
            "confidence_score": 0.8,
        })

        with patch(
            "app.services.ai_service.generate_text",
            new=AsyncMock(return_value=f"```json\n{valid_json}\n```"),
        ):
            explanation = await service._generate_explanation(
                entity_type=EntityType.STATE,
                entity_name="Karnataka",
                metric_name="repository_count",
                current_value=500,
                previous_value=400,
                pct_change=25.0,
                direction=TrendDirection.UP,
                time_range="month",
                context={},
            )

        assert explanation.summary == "Growth driven by AI framework adoption."
        assert explanation.confidence_score == 0.8
        assert explanation.key_drivers[0].factor == "AI frameworks"

    @pytest.mark.asyncio
    async def test_explanation_falls_back_to_structured_for_non_json(self):
        """If the provider returns unparseable prose, the structured explanation
        is used and its confidence is derived from the counts (never a canned
        literal)."""
        from app.services.trend_explanation_service import (
            EntityType,
            TrendDirection,
            TrendExplanationService,
        )

        service = TrendExplanationService.__new__(TrendExplanationService)

        with patch(
            "app.services.ai_service.generate_text",
            new=AsyncMock(return_value="Analysis without any JSON payload."),
        ):
            explanation = await service._generate_explanation(
                entity_type=EntityType.STATE,
                entity_name="Karnataka",
                metric_name="repository_count",
                current_value=500,
                previous_value=400,
                pct_change=25.0,
                direction=TrendDirection.UP,
                time_range="month",
                context={},
            )

        # Counts-only structured fallback: low, derived confidence.
        assert explanation.confidence_score == 0.25
        assert "increase" in explanation.summary.lower()
        assert explanation.entity_name == "Karnataka"

    @pytest.mark.asyncio
    async def test_explanation_falls_back_when_ai_is_unavailable(self):
        """AIUnavailableError (no provider configured) degrades to the
        structured explanation instead of inventing an AI narrative."""
        from app.services.ai_service import AIUnavailableError
        from app.services.trend_explanation_service import (
            EntityType,
            TrendDirection,
            TrendExplanationService,
        )

        service = TrendExplanationService.__new__(TrendExplanationService)
        context = {
            "repository_categories": [{"domain": "ai", "count": 120}],
            "language_adoption": [{"language": "Python", "count": 200}],
            "organization_activity": [],
            "creation_rate": 42,
        }

        with patch(
            "app.services.ai_service.generate_text",
            new=AsyncMock(side_effect=AIUnavailableError("no provider available")),
        ):
            explanation = await service._generate_explanation(
                entity_type=EntityType.STATE,
                entity_name="Karnataka",
                metric_name="repository_count",
                current_value=500,
                previous_value=400,
                pct_change=25.0,
                direction=TrendDirection.UP,
                time_range="month",
                context=context,
            )

        # Counts + supporting breakdown rows -> slightly above counts-only, but
        # still far below the AI-narrative baseline.
        assert explanation.confidence_score == 0.3
        assert explanation.key_drivers[0].factor == "ai"

    @pytest.mark.asyncio
    async def test_ai_narrative_without_self_reported_confidence_gets_baseline(self):
        """A provider that wrote the narrative but omitted confidence_score gets
        the AI-narrative baseline (0.5), not a hardcoded 'confident' value."""
        from app.services.trend_explanation_service import (
            EntityType,
            TrendDirection,
            TrendExplanationService,
        )

        service = TrendExplanationService.__new__(TrendExplanationService)
        payload = json.dumps({"summary": "Provider narrative without a confidence field."})

        with patch("app.services.ai_service.generate_text", new=AsyncMock(return_value=payload)):
            explanation = await service._generate_explanation(
                entity_type=EntityType.STATE,
                entity_name="Karnataka",
                metric_name="repository_count",
                current_value=500,
                previous_value=400,
                pct_change=25.0,
                direction=TrendDirection.UP,
                time_range="month",
                context={},
            )

        assert explanation.summary == "Provider narrative without a confidence field."
        assert explanation.confidence_score == 0.5

    @pytest.mark.asyncio
    async def test_comparison_summary_routes_through_provider(self):
        """Comparison summaries must be generated via the provider chain, not a
        directly-constructed OpenAI client."""
        from app.services.trend_explanation_service import (
            ComparisonSummary,
            StateComparisonData,
            TrendExplanationService,
        )

        service = TrendExplanationService.__new__(TrendExplanationService)

        comparison = StateComparisonData(
            state_a="Karnataka",
            state_b="Maharashtra",
            repository_count_a=500,
            repository_count_b=350,
            developer_activity_a=200,
            developer_activity_b=150,
            growth_rate_a=15.5,
            growth_rate_b=12.3,
            top_languages_a=[],
            top_languages_b=[],
            top_domains_a=[],
            top_domains_b=[],
            ai_repos_a=100,
            ai_repos_b=75,
            cybersecurity_repos_a=25,
            cybersecurity_repos_b=40,
            healthcare_repos_a=30,
            healthcare_repos_b=20,
            robotics_repos_a=15,
            robotics_repos_b=10,
            opensource_repos_a=200,
            opensource_repos_b=150,
            avg_stars_a=45.5,
            avg_stars_b=38.2,
            innovation_score_a=78.5,
            innovation_score_b=65.3,
            growth_score_a=82.1,
            growth_score_b=70.4,
            top_organizations_a=[],
            top_organizations_b=[],
        )

        valid_json = json.dumps({
            "entity_a": "Karnataka",
            "entity_b": "Maharashtra",
            "summary": "Karnataka leads the comparison.",
            "winner": "Karnataka",
            "score_difference": 5.0,
            "confidence_score": 0.85,
        })

        with patch("app.services.ai_service.generate_text", new=AsyncMock(return_value=valid_json)):
            summary = await service._generate_comparison_summary(comparison)

        assert isinstance(summary, ComparisonSummary)
        assert summary.summary == "Karnataka leads the comparison."
        assert summary.winner == "Karnataka"


class TestIndiaSchemasExtensions:
    """Tests for new India schema extensions."""

    def test_trend_explanation_response_schema(self):
        """Test TrendExplanationResponse schema."""
        from app.schemas.india import (
            TrendDriverSchema,
            TrendExplanationResponse,
            UnusualObservationSchema,
        )

        response = TrendExplanationResponse(
            summary="Test summary",
            key_drivers=[
                TrendDriverSchema(
                    factor="Test factor",
                    impact="high",
                    description="Test description",
                    evidence=["evidence1"],
                )
            ],
            unusual_observations=[
                UnusualObservationSchema(
                    observation="Test observation",
                    significance="Test significance",
                    deviation="+10%",
                )
            ],
            notable_changes=["change1"],
            confidence_score=0.85,
            entity_type="state",
            entity_name="Karnataka",
            time_range="month",
            generated_at=datetime.now(timezone.utc),
        )

        assert response.summary == "Test summary"
        assert len(response.key_drivers) == 1
        assert response.confidence_score == 0.85

    def test_state_comparison_response_schema(self):
        """Test StateComparisonResponse schema."""
        from app.schemas.india import (
            ComparisonInsightSchema,
            ComparisonSummarySchema,
            StateComparisonDataSchema,
            StateComparisonResponse,
        )

        response = StateComparisonResponse(
            comparison=StateComparisonDataSchema(
                state_a="Karnataka",
                state_b="Maharashtra",
                repository_count_a=500,
                repository_count_b=350,
                developer_activity_a=200,
                developer_activity_b=150,
                growth_rate_a=15.5,
                growth_rate_b=12.3,
                top_languages_a=[],
                top_languages_b=[],
                top_domains_a=[],
                top_domains_b=[],
                ai_repos_a=100,
                ai_repos_b=75,
                cybersecurity_repos_a=25,
                cybersecurity_repos_b=40,
                healthcare_repos_a=30,
                healthcare_repos_b=20,
                robotics_repos_a=15,
                robotics_repos_b=10,
                opensource_repos_a=200,
                opensource_repos_b=150,
                avg_stars_a=45.5,
                avg_stars_b=38.2,
                innovation_score_a=78.5,
                innovation_score_b=65.3,
                growth_score_a=82.1,
                growth_score_b=70.4,
                top_organizations_a=[],
                top_organizations_b=[],
            ),
            summary=ComparisonSummarySchema(
                entity_a="Karnataka",
                entity_b="Maharashtra",
                summary="Test summary",
                winner="Karnataka",
                score_difference=15.5,
                confidence_score=0.9,
                generated_at=datetime.now(timezone.utc),
            ),
            insights=[
                ComparisonInsightSchema(
                    insight_type="growth",
                    metric="repository_count",
                    winner="Karnataka",
                    entity_a_value=500.0,
                    entity_b_value=350.0,
                    difference_percent=30.0,
                    insight_text="Karnataka leads",
                    confidence="high",
                )
            ],
        )

        assert response.comparison.state_a == "Karnataka"
        assert response.summary.winner == "Karnataka"
        assert len(response.insights) == 1

    def test_trend_explain_request_schema(self):
        """Test TrendExplainRequest schema validation."""
        from app.schemas.india import TrendExplainRequest

        request = TrendExplainRequest(
            entity_type="state",
            entity_name="Karnataka",
            metric_name="repository_count",
            current_value=500,
            previous_value=400,
            time_range="month",
        )

        assert request.entity_type == "state"
        assert request.current_value == 500

    def test_state_compare_request_schema(self):
        """Test StateCompareRequest schema validation."""
        from app.schemas.india import StateCompareRequest

        request = StateCompareRequest(
            state_a="Karnataka",
            state_b="Maharashtra",
            domain="ai",
        )

        assert request.state_a == "Karnataka"
        assert request.domain == "ai"


class TestComparisonEndpoints:
    """Tests for comparison API endpoints."""

    @pytest.mark.asyncio
    async def test_compare_states_endpoint(self, client, db_session):
        """Test GET /api/v1/india/compare endpoint."""
        response = await client.get(
            "/api/v1/india/compare",
            params={"state_a": "Bengaluru", "state_b": "Mumbai"},
        )

        # Should return 200 with comparison data
        assert response.status_code == 200
        data = response.json()
        assert "comparison" in data
        assert "summary" in data
        assert "insights" in data
        assert data["comparison"]["state_a"] == "Bengaluru"
        assert data["comparison"]["state_b"] == "Mumbai"

    @pytest.mark.asyncio
    async def test_compare_states_validation(self, client, db_session):
        """Test compare endpoint validation."""
        # Missing state_a
        response = await client.get("/api/v1/india/compare", params={"state_b": "Mumbai"})
        assert response.status_code == 422

        # Missing state_b
        response = await client.get("/api/v1/india/compare", params={"state_a": "Bengaluru"})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_compare_states_accepts_validated_year(self, client, db_session):
        """Test that /india/compare accepts and validates the historical year."""
        # A valid Time Machine year is accepted.
        response = await client.get(
            "/api/v1/india/compare",
            params={"state_a": "Bengaluru", "state_b": "Mumbai", "year": 2024},
        )
        assert response.status_code == 200
        data = response.json()
        assert "comparison" in data
        assert "summary" in data
        assert "insights" in data

        # Years outside the supported range are rejected (422).
        for invalid_year in (1999, 2101):
            response = await client.get(
                "/api/v1/india/compare",
                params={"state_a": "Bengaluru", "state_b": "Mumbai", "year": invalid_year},
            )
            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_compare_insights_accepts_validated_year(self, client, db_session):
        """Test that /india/compare/insights also accepts a validated year."""
        response = await client.get(
            "/api/v1/india/compare/insights",
            params={"state_a": "Bengaluru", "state_b": "Mumbai", "year": 2023},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_compare_insights_endpoint(self, client, db_session):
        """Test GET /api/v1/india/compare/insights endpoint."""
        response = await client.get(
            "/api/v1/india/compare/insights",
            params={"state_a": "Bengaluru", "state_b": "Mumbai"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_trend_explain_endpoint(self, client, db_session):
        """Test POST /api/v1/india/trends/explain endpoint."""
        response = await client.post(
            "/api/v1/india/trends/explain",
            json={
                "entity_type": "state",
                "entity_name": "Karnataka",
                "metric_name": "repository_count",
                "current_value": 500,
                "previous_value": 400,
                "time_range": "month",
            },
        )

        # Should return 200 with explanation
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "confidence_score" in data
        assert "key_drivers" in data

    @pytest.mark.asyncio
    async def test_trend_explain_validation(self, client, db_session):
        """Test trend explain endpoint validation."""
        # The request body is typed with the TrendExplainRequest schema, so the
        # required fields (entity_name, current_value, previous_value) are
        # enforced at the API boundary.
        response = await client.post(
            "/api/v1/india/trends/explain",
            json={"entity_name": "Karnataka"},
        )
        assert response.status_code == 422

        # Invalid entity_type is still tolerated: the field is a free string in
        # the schema and the endpoint falls back to STATE.
        response = await client.post(
            "/api/v1/india/trends/explain",
            json={
                "entity_type": "invalid",
                "entity_name": "Karnataka",
                "metric_name": "repository_count",
                "current_value": 500,
                "previous_value": 400,
            },
        )
        # Should still work - defaults to STATE
        assert response.status_code == 200


class TestCompareStatesComponent:
    """Tests for CompareStates frontend component logic."""

    def test_state_comparison_bar_calculation(self):
        """Test bar chart percentage calculation logic."""
        # Simulate the bar calculation from CompareStates component
        def calculate_bar_percentages(value_a: int, value_b: int, max_value: int):
            percent_a = (value_a / max_value) * 100
            percent_b = (value_b / max_value) * 100
            return percent_a, percent_b

        percent_a, percent_b = calculate_bar_percentages(500, 350, 500)
        assert percent_a == 100.0
        assert percent_b == 70.0

        percent_a, percent_b = calculate_bar_percentages(100, 100, 100)
        assert percent_a == 100.0
        assert percent_b == 100.0

    def test_radar_chart_metrics_normalization(self):
        """Test radar chart metrics normalization."""
        metrics = [
            {"label": "Repos", "a": 500, "b": 350},
            {"label": "Developers", "a": 200, "b": 150},
            {"label": "Growth", "a": 15.5, "b": 12.3},
        ]

        max_val = max(max(m["a"], m["b"]) for m in metrics)

        normalized = []
        for m in metrics:
            normalized.append({
                "label": m["label"],
                "height_a": (m["a"] / max_val) * 100,
                "height_b": (m["b"] / max_val) * 100,
            })

        assert normalized[0]["height_a"] == 100.0
        assert normalized[0]["height_b"] == 70.0

    def test_insight_type_classification(self):
        """Test insight type classification logic."""
        insight_types = {
            "growth": "bg-green-100 text-green-700",
            "dominance": "bg-purple-100 text-purple-700",
            "emerging": "bg-blue-100 text-blue-700",
        }

        assert "growth" in insight_types
        assert "dominance" in insight_types
        assert "emerging" in insight_types

    def test_confidence_score_display(self):
        """Test confidence score to percentage conversion."""
        confidence_score = 0.85
        percentage = round(confidence_score * 100)

        assert percentage == 85

    def test_swap_states_logic(self):
        """Test state swap logic."""
        state_a = "Bengaluru"
        state_b = "Mumbai"

        # Swap
        temp = state_a
        state_a = state_b
        state_b = temp

        assert state_a == "Mumbai"
        assert state_b == "Bengaluru"


class TestDeterministicFallbackHonesty:
    """S-04: the no-AI fallbacks compute confidence from the data used and
    claim only what the data supports (no canned strings, no magic literals)."""

    @staticmethod
    def _comparison(**overrides):
        from app.services.trend_explanation_service import StateComparisonData

        data = dict(
            state_a="Karnataka",
            state_b="Maharashtra",
            repository_count_a=500,
            repository_count_b=350,
            developer_activity_a=200,
            developer_activity_b=150,
            growth_rate_a=15.5,
            growth_rate_b=12.3,
            top_languages_a=[{"language": "Python", "count": 150}],
            top_languages_b=[{"language": "Python", "count": 100}],
            top_domains_a=[{"domain": "ai", "count": 100}],
            top_domains_b=[{"domain": "ai", "count": 75}],
            ai_repos_a=100,
            ai_repos_b=75,
            cybersecurity_repos_a=25,
            cybersecurity_repos_b=40,
            healthcare_repos_a=30,
            healthcare_repos_b=20,
            robotics_repos_a=15,
            robotics_repos_b=10,
            opensource_repos_a=200,
            opensource_repos_b=150,
            avg_stars_a=45.5,
            avg_stars_b=38.2,
            innovation_score_a=78.5,
            innovation_score_b=65.3,
            growth_score_a=82.1,
            growth_score_b=70.4,
            top_organizations_a=["org1"],
            top_organizations_b=["org3"],
        )
        data.update(overrides)
        return StateComparisonData(**data)

    def test_structured_confidence_is_derived_from_the_data_used(self):
        from app.services.trend_explanation_service import TrendExplanationService

        estimate = TrendExplanationService._estimate_structured_confidence
        # Counts available, no breakdown rows -> the "counts only" level.
        assert estimate({}, 500, 400) == 0.25
        # Thin sample -> lower.
        assert estimate({}, 5, 4) == 0.15
        # Nothing to explain -> lower still.
        assert estimate({}, 0, 0) == 0.1
        # Breakdown rows backing the key drivers add a small amount.
        context = {"repository_categories": [{"domain": "ai", "count": 120}]}
        assert estimate(context, 500, 400) == 0.3

    def test_structured_comparison_confidence_is_derived_from_the_data_used(self):
        from app.services.trend_explanation_service import TrendExplanationService

        estimate = TrendExplanationService._estimate_comparison_confidence
        assert estimate(self._comparison()) == 0.25
        assert estimate(self._comparison(repository_count_b=5)) == 0.15
        assert estimate(self._comparison(repository_count_a=0, repository_count_b=0)) == 0.1

    def test_structured_summary_drops_fabricated_claims(self):
        """The deterministic comparison fallback reports only measured gaps,
        never canned weaknesses/opportunities (or mojibake placeholders)."""
        from app.services.trend_explanation_service import TrendExplanationService

        service = TrendExplanationService.__new__(TrendExplanationService)
        summary = service._generate_structured_summary(self._comparison())

        assert summary.confidence_score == 0.25
        assert summary.opportunities == []
        assert summary.recommendations == []
        assert all(
            "below potential" not in w.lower()
            for w in summary.weaknesses_a + summary.weaknesses_b
        )
        # Only the measured repository gap is reported, for the trailing state.
        assert summary.weaknesses_a == []
        assert "Fewer repositories than Karnataka" in summary.weaknesses_b[0]
        assert "350 vs 500" in summary.weaknesses_b[0]
        # No CJK characters (the old mojibake literal is gone).
        rendered = " ".join(
            summary.opportunities + summary.recommendations + summary.weaknesses_a + summary.weaknesses_b
        )
        assert not any("\u3000" <= ch <= "\u9fff" for ch in rendered)

    def test_structured_summary_confidence_on_empty_data(self):
        from app.services.trend_explanation_service import TrendExplanationService

        service = TrendExplanationService.__new__(TrendExplanationService)
        summary = service._generate_structured_summary(
            self._comparison(
                repository_count_a=0,
                repository_count_b=0,
                developer_activity_a=0,
                developer_activity_b=0,
                avg_stars_a=0.0,
                avg_stars_b=0.0,
            )
        )

        assert summary.confidence_score == 0.1

    @pytest.mark.asyncio
    async def test_comparison_ai_narrative_without_confidence_gets_baseline(self):
        """Provider JSON lacking confidence_score gets the AI-narrative
        baseline (0.5) instead of failing into the deterministic fallback."""
        from app.services.trend_explanation_service import TrendExplanationService

        service = TrendExplanationService.__new__(TrendExplanationService)
        payload = json.dumps({
            "summary": "Karnataka leads the comparison.",
            "winner": "Karnataka",
            "score_difference": 5.0,
        })

        with patch("app.services.ai_service.generate_text", new=AsyncMock(return_value=payload)):
            summary = await service._generate_comparison_summary(self._comparison())

        assert summary.summary == "Karnataka leads the comparison."
        assert summary.confidence_score == 0.5
