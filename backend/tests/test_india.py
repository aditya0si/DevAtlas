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
            total_developers=1200,
            total_stars=25000,
            total_forks=4000,
            ai_repo_percentage=20.0,
            top_language="Python",
            top_state="Bengaluru",
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
        assert stats.total_developers == 1200
        assert stats.ai_repo_percentage == 20.0
        assert stats.top_language == "Python"

    @pytest.mark.asyncio
    async def test_ecosystem_stats_applies_year_bounds_to_growth_queries(self):
        """Weekly/monthly/quarterly growth queries must respect the year filter.

        Regression test: previously the growth queries were built inside a
        ``for query in (...)`` loop that rebound a local variable, so the year
        bounds were silently discarded and the growth metrics ignored ``year``.
        """
        from unittest.mock import AsyncMock, patch

        from app.services.insight_service import InsightService

        executed: list = []

        class FakeResult:
            def scalar(self):
                return 0

            def fetchall(self):
                return []

        class RecordingDB:
            async def execute(self, stmt, *args, **kwargs):
                executed.append(stmt)
                return FakeResult()

        with patch("app.services.insight_service.InsightService._get_top_states"):
            service = InsightService(RecordingDB())
            service._get_domain_counts = AsyncMock(return_value={
                "ai_repos_count": 0, "cybersecurity_repos_count": 0,
                "healthcare_repos_count": 0, "robotics_repos_count": 0,
                "web_repos_count": 0, "mobile_repos_count": 0,
                "devops_repos_count": 0, "blockchain_repos_count": 0,
                "opensource_repos_count": 0,
            })
            service._get_top_states = AsyncMock(return_value=[])
            await service.get_ecosystem_stats(year=2024)

        # Every query touching repositories.created_at must carry BOTH year
        # bounds (>= year_start AND < year_end). Before the fix the growth
        # queries only had the ">= week_ago" bound and ignored the year filter.
        repo_created_at_sql = [str(s) for s in executed if "repositories.created_at" in str(s)]
        assert repo_created_at_sql, "expected at least one query on repositories.created_at"
        for sql in repo_created_at_sql:
            assert "repositories.created_at <" in sql, f"growth query missing year end bound: {sql}"

    def test_init_does_not_construct_ai_client(self, db_session):
        """InsightService must NOT build a raw AsyncOpenAI client.

        AI generation is routed through AIServiceFactory/FallbackChainProvider,
        so no-key environments stay functional via the deterministic fallback.
        """
        from app.services.insight_service import InsightService

        service = InsightService(db_session)
        assert not hasattr(service, "client")

    @pytest.mark.asyncio
    async def test_generate_ai_summary_routes_through_provider(self):
        """AI summaries flow through the provider chain (not a direct OpenAI call)."""
        from unittest.mock import AsyncMock, patch

        from app.services.insight_service import IndiaEcosystemStats, InsightService

        stats = IndiaEcosystemStats(
            total_repositories=0,
            total_events=0,
            active_developers=0,
            total_developers=0,
            total_stars=0,
            total_forks=0,
            ai_repo_percentage=0.0,
            top_language="",
            top_state="",
            top_states=[],
            top_languages=[],
            top_domains=[],
            growth_metrics={"weekly_growth": 0.0, "monthly_growth": 0.0},
            ai_repos_count=0,
            cybersecurity_repos_count=0,
            healthcare_repos_count=0,
            robotics_repos_count=0,
            web_repos_count=0,
            mobile_repos_count=0,
            devops_repos_count=0,
            blockchain_repos_count=0,
            opensource_repos_count=0,
        )

        class RecordingDB:
            async def execute(self, *args, **kwargs):  # pragma: no cover - should not be hit
                raise AssertionError("no DB access expected for provider-routed summary")

        service = InsightService(RecordingDB())
        service.get_ecosystem_stats = AsyncMock(return_value=stats)

        with patch(
            "app.services.ai_service.generate_text",
            new=AsyncMock(return_value="Provider-driven summary for Karnataka."),
        ) as mock_gen:
            summary = await service.generate_ai_summary(region="Karnataka")

        assert summary == "Provider-driven summary for Karnataka."
        mock_gen.assert_awaited_once()
        kwargs = mock_gen.await_args.kwargs
        assert "expert analyst" in kwargs["system_prompt"]
        assert "Karnataka" in kwargs["user_prompt"]


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
        # Frontend Time Machine contract fields
        assert "total_developers" in data
        assert "total_stars" in data
        assert "total_forks" in data
        assert "ai_repo_percentage" in data
        assert "top_language" in data
        assert "top_state" in data

    @pytest.mark.asyncio
    async def test_get_ecosystem_stats_with_year(self, client, db_session):
        """Test GET /api/v1/india/stats accepts a historical year without 422."""
        for year in (2022, 2023, 2024, 2025, 2026):
            response = await client.get(f"/api/v1/india/stats?year={year}")
            assert response.status_code == 200
            assert "total_repositories" in response.json()

        # Out-of-range year -> 422
        response = await client.get("/api/v1/india/stats?year=1800")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_india_overview_with_year(self, client, db_session):
        """Test GET /api/v1/india/overview accepts a historical year without 422."""
        response = await client.get("/api/v1/india/overview?year=2024")
        assert response.status_code == 200
        data = response.json()
        assert "top_growing_state" in data
        assert "ai_summary" in data

    @pytest.mark.asyncio
    async def test_get_state_dashboard_with_year(self, client, db_session):
        """Test GET /api/v1/india/states/{state} accepts a historical year without 422."""
        response = await client.get("/api/v1/india/states/Bengaluru?year=2024")
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "Bengaluru"
        assert "repository_count" in data

        # Out-of-range year -> 422
        response = await client.get("/api/v1/india/states/Bengaluru?year=9999")
        assert response.status_code == 422

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
        response = await client.get("/api/v1/india/insights?limit=50")
        assert response.status_code == 200

        # Test over max limit
        response = await client.get("/api/v1/india/insights?limit=100")
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
    async def test_get_analytics_graphs_accepts_year(self, client, db_session):
        """Test GET /api/v1/india/analytics/graphs accepts a historical year without 422."""
        for year in (2022, 2023, 2024, 2025, 2026):
            response = await client.get(f"/api/v1/india/analytics/graphs?year={year}")
            assert response.status_code == 200
            data = response.json()
            assert "repositories_over_time" in data
            assert "language_popularity" in data
            assert "top_domains" in data
            assert "state_comparison" in data

        # Out-of-range year -> 422
        response = await client.get("/api/v1/india/analytics/graphs?year=1800")
        assert response.status_code == 422

        # Non-integer year -> 422
        response = await client.get("/api/v1/india/analytics/graphs?year=abc")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_analytics_graphs_respect_year(self, client, db_session):
        """Analytics graphs must only count repositories created within the
        requested calendar year (regression: the graphs previously had no year
        filter at all)."""
        from app.models.github import GitHubUser, Repository

        owner = GitHubUser(login="analytics-owner", github_user_id=7201, type="User", state="Karnataka")
        repo_2024 = Repository(
            github_id=7202,
            name="app-2024",
            full_name="analytics-owner/app-2024",
            owner_login="analytics-owner",
            github_user_login="analytics-owner",
            html_url="https://github.com/analytics-owner/app-2024",
            language="Python",
            stargazers_count=1,
            forks_count=0,
            open_issues_count=0,
            classification={"domain": "ai/ml"},
            created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
        )
        repo_2025 = Repository(
            github_id=7203,
            name="app-2025",
            full_name="analytics-owner/app-2025",
            owner_login="analytics-owner",
            github_user_login="analytics-owner",
            html_url="https://github.com/analytics-owner/app-2025",
            language="Go",
            stargazers_count=1,
            forks_count=0,
            open_issues_count=0,
            classification={"domain": "devops"},
            created_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        )
        db_session.add_all([owner, repo_2024, repo_2025])
        await db_session.commit()

        # 2024 -> only the Python / ai repo counts
        resp_2024 = await client.get("/api/v1/india/analytics/graphs?year=2024&time_range=year")
        assert resp_2024.status_code == 200
        data_2024 = resp_2024.json()
        languages_2024 = {l["language"]: l["count"] for l in data_2024["language_popularity"]}
        assert languages_2024.get("Python", 0) >= 1
        assert "Go" not in languages_2024
        domains_2024 = {d["domain"]: d["count"] for d in data_2024["top_domains"]}
        assert domains_2024.get("ai/ml", 0) >= 1
        assert "devops" not in domains_2024
        states_2024 = {s["state"]: s["repositories"] for s in data_2024["state_comparison"]}
        assert states_2024.get("Karnataka", 0) >= 1

        # 2025 -> only the Go / devops repo counts
        resp_2025 = await client.get("/api/v1/india/analytics/graphs?year=2025&time_range=year")
        assert resp_2025.status_code == 200
        data_2025 = resp_2025.json()
        languages_2025 = {l["language"]: l["count"] for l in data_2025["language_popularity"]}
        assert languages_2025.get("Go", 0) >= 1
        assert "Python" not in languages_2025
        domains_2025 = {d["domain"]: d["count"] for d in data_2025["top_domains"]}
        assert domains_2025.get("devops", 0) >= 1
        assert "ai/ml" not in domains_2025
        states_2025 = {s["state"]: s["repositories"] for s in data_2025["state_comparison"]}
        assert states_2025.get("Karnataka", 0) >= 1

    @pytest.mark.asyncio
    async def test_analytics_graphs_applies_year_bounds_to_all_queries(self):
        """Every repository query in the analytics graphs must carry BOTH year
        bounds (>= year_start AND < year_end) when a year is requested.

        Regression test: the graphs previously had no year filter at all, so the
        Time Machine could not query historical years.
        """
        from app.api.india import get_analytics_graphs

        executed: list = []

        class FakeResult:
            def fetchall(self):
                return []

        class FakeDB:
            async def execute(self, stmt, *args, **kwargs):
                executed.append(stmt)
                return FakeResult()

        await get_analytics_graphs(db=FakeDB(), time_range="year", year=2024)

        repo_created_at_sql = [str(s) for s in executed if "repositories.created_at" in str(s)]
        assert repo_created_at_sql, "expected at least one query on repositories.created_at"
        for sql in repo_created_at_sql:
            assert "repositories.created_at >=" in sql, f"query missing year start bound: {sql}"
            assert "repositories.created_at <" in sql, f"query missing year end bound: {sql}"

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

        # Should return 200 even without stored embeddings (embedding generation
        # routes through the AI provider fallback chain).
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "Find AI healthcare projects"
        assert "results" in data

    @pytest.mark.asyncio
    async def test_semantic_search_does_not_500_without_openai_key(self, client, db_session, monkeypatch):
        """Semantic search must not 500 solely because OPENAI_API_KEY is absent.

        Regression test: the endpoint previously constructed a raw
        ``AsyncOpenAI(api_key=settings.openai_api_key)`` client, which raised
        ``OpenAIError`` at construction time when no key was configured, before
        any fallback logic could run. Query embeddings must be generated through
        the AI provider fallback chain so the deterministic local provider is
        used in no-key environments.
        """
        from app.services import ai_service

        # Simulate a deployment with no OpenAI (and no Gemini) key so the
        # fallback chain skips both live providers and uses the deterministic
        # local fallback instead of attempting external calls.
        monkeypatch.setattr(ai_service.settings, "openai_api_key", None)
        monkeypatch.setattr(ai_service.settings, "gemini_api_key", None)

        response = await client.post(
            "/api/v1/india/search/semantic",
            json={"query": "Find AI healthcare projects", "limit": 10},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "Find AI healthcare projects"
        assert "results" in data
        assert "total" in data

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

    @pytest.mark.asyncio
    async def test_top_states_uses_github_user_state(self, client, db_session):
        """Top states must come from real GitHubUser.state, not owner_login."""
        from app.models.github import GitHubUser, Repository

        owner = GitHubUser(login="karnataka-owner", github_user_id=7001, type="User", state="Karnataka", normalized_location="Bengaluru")
        repo = Repository(
            github_id=7002,
            name="bangalore-app",
            full_name="karnataka-owner/bangalore-app",
            owner_login="karnataka-owner",
            github_user_login="karnataka-owner",
            html_url="https://github.com/karnataka-owner/bangalore-app",
            language="Python",
            stargazers_count=10,
            forks_count=0,
            open_issues_count=0,
        )
        db_session.add_all([owner, repo])
        await db_session.commit()

        response = await client.get("/api/v1/india/stats")
        assert response.status_code == 200
        data = response.json()

        state_names = [s["state"] for s in data["top_states"]]
        assert "Karnataka" in state_names
        # Owner logins must never be presented as states
        assert "karnataka-owner" not in state_names

    @pytest.mark.asyncio
    async def test_state_dashboard_uses_real_location_and_activity_graph(self, client, db_session):
        """State dashboard must attribute repos via GitHubUser location and the
        activity graph must be aggregated from real events (not mock)."""
        from datetime import timedelta

        from app.models.github import GitHubEvent, GitHubUser, Repository

        owner = GitHubUser(login="mumbai-owner", github_user_id=7003, type="User", state="Maharashtra", city="Mumbai")
        repo = Repository(
            github_id=7004,
            name="mumbai-app",
            full_name="mumbai-owner/mumbai-app",
            owner_login="mumbai-owner",
            github_user_login="mumbai-owner",
            html_url="https://github.com/mumbai-owner/mumbai-app",
            language="Go",
            stargazers_count=5,
            forks_count=0,
            open_issues_count=0,
        )
        db_session.add_all([owner, repo])
        await db_session.flush()
        event = GitHubEvent(
            github_id="ev-mumbai-2026-1",
            event_type="PushEvent",
            actor_login="mumbai-owner",
            repo_id=repo.github_id,
            repository_id=repo.id,
            created_at=datetime.now(timezone.utc) - timedelta(days=1),
            state="Maharashtra",
            city="Mumbai",
        )
        db_session.add(event)
        await db_session.commit()

        response = await client.get("/api/v1/india/states/Mumbai")
        assert response.status_code == 200
        data = response.json()
        assert data["repository_count"] >= 1
        assert data["active_developers"] >= 1

        # Activity graph: 30-day series with real event counts (at least one day > 0)
        graph = data["activity_graph"]
        assert len(graph) == 30
        assert any(day["activity"] > 0 for day in graph)

    @pytest.mark.asyncio
    async def test_ecosystem_scores_use_real_states(self, client, db_session):
        """Ecosystem scores must be keyed by real GitHubUser.state names with
        deterministic rankings (no hash-based mock growth)."""
        from app.models.github import GitHubUser, Repository

        owner = GitHubUser(login="tamil-owner", github_user_id=7005, type="User", state="Tamil Nadu")
        repo = Repository(
            github_id=7006,
            name="chennai-app",
            full_name="tamil-owner/chennai-app",
            owner_login="tamil-owner",
            github_user_login="tamil-owner",
            html_url="https://github.com/tamil-owner/chennai-app",
            language="Python",
            stargazers_count=10,
            forks_count=0,
            open_issues_count=0,
        )
        db_session.add_all([owner, repo])
        await db_session.commit()

        response = await client.get("/api/v1/india/scores")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any(s["state"] == "Tamil Nadu" for s in data)
        # Owner logins must never appear as state names
        assert all(s["state"] != "tamil-owner" for s in data)
        ranks = [s["rank"] for s in data]
        assert ranks == sorted(ranks)

    @pytest.mark.asyncio
    async def test_ecosystem_scores_respect_year(self, client, db_session):
        """Ecosystem scores must only count repositories within the requested year."""
        from app.models.github import GitHubUser, Repository

        owner_2024 = GitHubUser(login="karnataka-2024", github_user_id=7101, type="User", state="Karnataka")
        owner_2025 = GitHubUser(login="maharashtra-2025", github_user_id=7102, type="User", state="Maharashtra")
        repo_2024 = Repository(
            github_id=7103,
            name="app-2024",
            full_name="garnataka-2024/app-2024",
            owner_login="karnataka-2024",
            github_user_login="karnataka-2024",
            html_url="https://github.com/karnataka-2024/app-2024",
            language="Python",
            stargazers_count=1,
            forks_count=0,
            open_issues_count=0,
            created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
        )
        repo_2025 = Repository(
            github_id=7104,
            name="app-2025",
            full_name="maharashtra-2025/app-2025",
            owner_login="maharashtra-2025",
            github_user_login="maharashtra-2025",
            html_url="https://github.com/maharashtra-2025/app-2025",
            language="Python",
            stargazers_count=1,
            forks_count=0,
            open_issues_count=0,
            created_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        )
        db_session.add_all([owner_2024, owner_2025, repo_2024, repo_2025])
        await db_session.commit()

        # 2024 -> only Karnataka's repo counts
        resp_2024 = await client.get("/api/v1/india/scores?year=2024")
        assert resp_2024.status_code == 200
        states_2024 = [s["state"] for s in resp_2024.json()]
        assert "Karnataka" in states_2024
        assert "Maharashtra" not in states_2024

        # 2025 -> only Maharashtra's repo counts
        resp_2025 = await client.get("/api/v1/india/scores?year=2025")
        assert resp_2025.status_code == 200
        states_2025 = [s["state"] for s in resp_2025.json()]
        assert "Maharashtra" in states_2025
        assert "Karnataka" not in states_2025

        # Out-of-range year -> 422
        resp_bad = await client.get("/api/v1/india/scores?year=1800")
        assert resp_bad.status_code == 422


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

        # Invalid domain is rejected by validated query params
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_activity_endpoint_accepts_historical_year(self, client, db_session):
        """Test /api/v1/geospatial/activity with a historical year filter."""
        response = await client.get(
            "/api/v1/geospatial/activity?bbox=68.1,6.7,97.4,35.5&limit=100&year=2024"
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("type") == "FeatureCollection"
        assert isinstance(data.get("features"), list)


class TestAskDevAtlas:
    """Tests for Ask DevAtlas Copilot endpoints."""

    @pytest.mark.asyncio
    async def test_ask_devatlas_post(self, client, db_session):
        """Test POST /api/v1/india/ask endpoint."""
        response = await client.post(
            "/api/v1/india/ask",
            json={"query": "Why is Karnataka growing?"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert data["query"] == "Why is Karnataka growing?"

    @pytest.mark.asyncio
    async def test_ask_devatlas_stream_get(self, client, db_session):
        """Test GET /api/v1/india/ask/stream endpoint."""
        response = await client.get("/api/v1/india/ask/stream?query=Why+is+Karnataka+growing%3F")
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")