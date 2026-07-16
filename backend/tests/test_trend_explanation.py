"""Tests for Trend Explanation Service and Comparison features."""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch


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
        from app.services.trend_explanation_service import TrendExplanation, EntityType

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
            opportunities=["Cross-state collaboration"],
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


class TestIndiaSchemasExtensions:
    """Tests for new India schema extensions."""

    def test_trend_explanation_response_schema(self):
        """Test TrendExplanationResponse schema."""
        from app.schemas.india import TrendExplanationResponse, TrendDriverSchema, UnusualObservationSchema

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
            StateComparisonResponse,
            StateComparisonDataSchema,
            ComparisonSummarySchema,
            ComparisonInsightSchema,
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
        # Missing required fields
        response = await client.post(
            "/api/v1/india/trends/explain",
            json={"entity_name": "Karnataka"},
        )
        assert response.status_code == 422

        # Invalid entity_type
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
            {" label": "Repos", "a": 500, "b": 350 },
            {" label": "Developers", "a": 200, "b": 150 },
            {" label": "Growth", "a": 15.5, "b": 12.3 },
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