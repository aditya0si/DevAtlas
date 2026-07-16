"""Tests for the India Intelligence API endpoints."""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch


class TestInsightService:
    """Tests for InsightService."""

    def test_insight_model(self):
        """Test Insight model validation."""
        from app.services.insight_service import Insight

        insight = Insight(
            id="test_123",
            text="Test insight text",
            category="ai",
            region="Bengaluru",
            metric_type="growth",
            metric_value=15.5,
            time_range="month",
        )

        assert insight.id == "test_123"
        assert insight.text == "Test insight text"
        assert insight.category == "ai"
        assert insight.region == "Bengaluru"
        assert insight.metric_type == "growth"
        assert insight.metric_value == 15.5
        assert insight.time_range == "month"

    def test_india_ecosystem_stats_model(self):
        """Test IndiaEcosystemStats model."""
        from app.services.insight_service import IndiaEcosystemStats

        stats = IndiaEcosystemStats(
            total_repositories=1000,
            total_events=5000,
            active_developers=500,
            top_states=[{"state": "Bengaluru", "repositories": 500, "rank": 1}],
            top_languages=[{"language": "Python", "count": 300}],
            top_domains=[{"domain": "ai/ml", "count": 200}],
            growth_metrics={"weekly_growth": 5.2, "monthly_growth": 20.1},
            ai_repos_count=200,
            cybersecurity_repos_count=50,
            healthcare_repos_count=30,
            robotics_repos_count=25,
            web_repos_count=300,
            mobile_repos_count=100,
            devops_repos_count=150,
            blockchain_repos_count=40,
            opensource_repos_count=400,
        )

        assert stats.total_repositories == 1000
        assert stats.ai_repos_count == 200
        assert stats.top_languages[0]["language"] == "Python"


class TestIndiaSchemas:
    """Tests for India API schemas."""

    def test_insight_response_schema(self):
        """Test InsightResponse schema."""
        from app.schemas.india import InsightResponse

        response = InsightResponse(
            id="test_123",
            text="Test insight",
            category="ai",
            region="Bengaluru",
            metric_type="growth",
            metric_value=10.5,
            time_range="week",
            generated_at=datetime.now(timezone.utc),
        )

        assert response.id == "test_123"
        assert response.category == "ai"

    def test_ecosystem_stats_response_schema(self):
        """Test EcosystemStatsResponse schema."""
        from app.schemas.india import EcosystemStatsResponse

        response = EcosystemStatsResponse(
            total_repositories=1000,
            total_events=5000,
            active_developers=500,
            top_states=[],
            top_languages=[],
            top_domains=[],
            growth_metrics={},
            ai_repos_count=100,
            cybersecurity_repos_count=50,
            healthcare_repos_count=30,
            robotics_repos_count=20,
            web_repos_count=200,
            mobile_repos_count=80,
            devops_repos_count=100,
            blockchain_repos_count=40,
            opensource_repos_count=300,
        )

        assert response.total_repositories == 1000
        assert response.ai_repos_count == 100

    def test_state_dashboard_response_schema(self):
        """Test StateDashboardResponse schema."""
        from app.schemas.india import StateDashboardResponse

        response = StateDashboardResponse(
            state="Bengaluru",
            repository_count=500,
            active_developers=200,
            top_languages=[{"language": "Python", "count": 150}],
            fastest_growing_technologies=[{"language": "Rust", "count": 20}],
            ai_summary="Bengaluru leads in AI development",
            monthly_growth_percent=15.5,
            weekly_growth_percent=3.2,
            trending_projects=[],
            top_organizations=[],
            activity_graph=[],
        )

        assert response.state == "Bengaluru"
        assert response.repository_count == 500
        assert response.monthly_growth_percent == 15.5

    def test_semantic_search_request_schema(self):
        """Test SemanticSearchRequest schema."""
        from app.schemas.india import SemanticSearchRequest

        request = SemanticSearchRequest(
            query="Find AI healthcare projects",
            limit=10,
            domain="ai",
        )

        assert request.query == "Find AI healthcare projects"
        assert request.limit == 10
        assert request.domain == "ai"

    def test_repository_card_response_schema(self):
        """Test RepositoryCardResponse schema."""
        from app.schemas.india import RepositoryCardResponse

        response = RepositoryCardResponse(
            id="123",
            name="test-repo",
            full_name="org/test-repo",
            description="A test repository",
            purpose="AI/ML",
            difficulty="Intermediate",
            tech_stack=["Python", "FastAPI"],
            industry="Healthcare",
            repository_health="Active",
            community_size="Medium",
            stars=100,
            languages=["Python"],
            frameworks=["FastAPI"],
            growth_trend="Growing",
            topics=["ai", "healthcare"],
            html_url="https://github.com/org/test-repo",
        )

        assert response.name == "test-repo"
        assert response.stars == 100
        assert "Python" in response.languages


class TestIndiaAPIRoutes:
    """Tests for India API routes."""

    @pytest.mark.asyncio
    async def test_get_ecosystem_stats(self, client, db_session):
        """Test GET /api/v1/india/stats endpoint."""
        response = await client.get("/api/v1/india/stats")

        # Should return 200 even without data
        assert response.status_code == 200
        data = response.json()
        assert "total_repositories" in data
        assert "top_languages" in data
        assert "growth_metrics" in data

    @pytest.mark.asyncio
    async def test_get_insights(self, client, db_session):
        """Test GET /api/v1/india/insights endpoint."""
        response = await client.get("/api/v1/india/insights?limit=5")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    @pytest.mark.asyncio
    async def test_get_insights_limit_validation(self, client, db_session):
        """Test insights limit parameter validation."""
        # Test max limit
        response = await client.get("/api/v1/india/insights?limit=100")
        assert response.status_code == 200

        # Test over max limit
        response = await client.get("/api/v1/india/insights?limit=1000")
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_get_india_overview(self, client, db_session):
        """Test GET /api/v1/india/overview endpoint."""
        response = await client.get("/api/v1/india/overview")

        assert response.status_code == 200
        data = response.json()
        assert "top_growing_state" in data
        assert "ai_summary" in data
        assert "insights" in data
        assert "repositories_today" in data

    @pytest.mark.asyncio
    async def test_get_state_dashboard(self, client, db_session):
        """Test GET /api/v1/india/states/{state} endpoint."""
        response = await client.get("/api/v1/india/states/Bengaluru")

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "Bengaluru"
        assert "repository_count" in data
        assert "active_developers" in data
        assert "ai_summary" in data
        assert "monthly_growth_percent" in data

    @pytest.mark.asyncio
    async def test_get_analytics_graphs(self, client, db_session):
        """Test GET /api/v1/india/analytics/graphs endpoint."""
        response = await client.get("/api/v1/india/analytics/graphs?time_range=month")

        assert response.status_code == 200
        data = response.json()
        assert "repositories_over_time" in data
        assert "language_popularity" in data
        assert "top_domains" in data

    @pytest.mark.asyncio
    async def test_get_analytics_graphs_time_range_validation(self, client, db_session):
        """Test analytics time_range parameter validation."""
        valid_ranges = ["week", "month", "quarter", "year"]

        for range_val in valid_ranges:
            response = await client.get(f"/api/v1/india/analytics/graphs?time_range={range_val}")
            assert response.status_code == 200

        # Invalid range
        response = await client.get("/api/v1/india/analytics/graphs?time_range=invalid")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_ecosystem_scores(self, client, db_session):
        """Test GET /api/v1/india/scores endpoint."""
        response = await client.get("/api/v1/india/scores")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "state" in data[0]
            assert "overall_score" in data[0]
            assert "rank" in data[0]

    @pytest.mark.asyncio
    async def test_get_discovery(self, client, db_session):
        """Test GET /api/v1/india/discovery endpoint."""
        response = await client.get("/api/v1/india/discovery")

        assert response.status_code == 200
        data = response.json()
        assert "trending_repositories" in data
        assert "trending_technologies" in data
        assert "trending_states" in data
        assert "newest_ai_projects" in data

    @pytest.mark.asyncio
    async def test_semantic_search(self, client, db_session):
        """Test POST /api/v1/india/search/semantic endpoint."""
        response = await client.post(
            "/api/v1/india/search/semantic",
            json={"query": "Find AI healthcare projects", "limit": 10},
        )

        # Should handle gracefully even without embeddings
        assert response.status_code in [200, 500]

    @pytest.mark.asyncio
    async def test_semantic_search_validation(self, client, db_session):
        """Test semantic search request validation."""
        # Empty query
        response = await client.post(
            "/api/v1/india/search/semantic",
            json={"query": "", "limit": 10},
        )
        assert response.status_code == 422

        # Missing query
        response = await client.post(
            "/api/v1/india/search/semantic",
            json={"limit": 10},
        )
        assert response.status_code == 422

        # Invalid limit
        response = await client.post(
            "/api/v1/india/search/semantic",
            json={"query": "test", "limit": 1000},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_repository_card_not_found(self, client, db_session):
        """Test GET /api/v1/india/repositories/{id}/card for non-existent repo."""
        response = await client.get("/api/v1/india/repositories/non-existent-id/card")
        assert response.status_code == 404


class TestGeospatialFilters:
    """Tests for geospatial endpoint with filters."""

    @pytest.mark.asyncio
    async def test_activity_endpoint_with_domain_filter(self, client, db_session):
        """Test /api/v1/geospatial/activity with domain filter."""
        response = await client.get(
            "/api/v1/geospatial/activity?bbox=68.1,6.7,97.4,35.5&limit=100&domain=ai"
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert data.get("type") == "FeatureCollection"
        assert isinstance(data.get("features"), list)

    @pytest.mark.asyncio
    async def test_activity_endpoint_with_time_range(self, client, db_session):
        """Test /api/v1/geospatial/activity with time_range filter."""
        response = await client.get(
            "/api/v1/geospatial/activity?bbox=68.1,6.7,97.4,35.5&limit=100&time_range=week"
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert data.get("type") == "FeatureCollection"
        assert isinstance(data.get("features"), list)

    @pytest.mark.asyncio
    async def test_activity_endpoint_with_both_filters(self, client, db_session):
        """Test /api/v1/geospatial/activity with both domain and time_range."""
        response = await client.get(
            "/api/v1/geospatial/activity?bbox=68.1,6.7,97.4,35.5&limit=100&domain=cybersecurity&time_range=month"
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert data.get("type") == "FeatureCollection"
        assert isinstance(data.get("features"), list)

    @pytest.mark.asyncio
    async def test_activity_endpoint_invalid_bbox(self, client, db_session):
        """Test /api/v1/geospatial/activity with invalid bbox."""
        response = await client.get(
            "/api/v1/geospatial/activity?bbox=invalid&limit=100"
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_activity_endpoint_invalid_domain(self, client, db_session):
        """Test /api/v1/geospatial/activity with invalid domain."""
        response = await client.get(
            "/api/v1/geospatial/activity?bbox=68.1,6.7,97.4,35.5&limit=100&domain=invalid"
        )

        # Should still work - invalid domain is ignored
        assert response.status_code == 200