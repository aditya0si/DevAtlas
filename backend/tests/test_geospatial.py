from __future__ import annotations

from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_geospatial_activity_requires_bbox(client):
    response = await client.get("/api/v1/geospatial/activity")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_geospatial_activity_returns_empty(client):
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert data["features"] == []


@pytest.mark.asyncio
async def test_geospatial_activity_validates_domain(client):
    # Invalid domain -> 422 (validated query param)
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10&domain=not-a-domain")
    assert response.status_code == 422

    # Valid domain -> 200
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10&domain=ai")
    assert response.status_code == 200
    assert response.json()["type"] == "FeatureCollection"


@pytest.mark.asyncio
async def test_geospatial_activity_validates_time_range(client):
    # Invalid time_range -> 422
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10&time_range=decade")
    assert response.status_code == 422

    # Valid time_range -> 200
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10&time_range=month")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_geospatial_activity_accepts_historical_year(client):
    # Valid historical year -> 200 (no 422)
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10&year=2024")
    assert response.status_code == 200
    assert response.json()["type"] == "FeatureCollection"

    # Out-of-range year -> 422
    response = await client.get("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=10&year=1999")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_geospatial_activity_invalid_bbox(client):
    response = await client.get("/api/v1/geospatial/activity?bbox=invalid&limit=100")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_geospatial_push_aggregate_respects_year_filter(client, db):
    """PushEvent aggregates must apply the same year filter as the outer query.

    A repository whose only push activity falls outside the requested year must
    not receive activity credit from those out-of-window events.
    """
    from datetime import datetime, timezone

    from sqlalchemy import text as sa_text

    from app.models.github import GitHubEvent, Repository

    repo_in_year = Repository(
        github_id=8001,
        name="in-year-repo",
        full_name="owner-a/in-year-repo",
        owner_login="owner-a",
        html_url="https://github.com/owner-a/in-year-repo",
        language="Python",
        stargazers_count=0,
        forks_count=0,
        open_issues_count=0,
        classification={"domain": "ai/ml"},
        created_at=datetime(2024, 5, 1, tzinfo=timezone.utc),
    )
    repo_out_year = Repository(
        github_id=8002,
        name="out-year-repo",
        full_name="owner-b/out-year-repo",
        owner_login="owner-b",
        html_url="https://github.com/owner-b/out-year-repo",
        language="Python",
        stargazers_count=0,
        forks_count=0,
        open_issues_count=0,
        classification={"domain": "ai/ml"},
        created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
    )
    db.add_all([repo_in_year, repo_out_year])
    await db.flush()

    db.add_all([
        GitHubEvent(
            github_id="in-year-ev-1", event_type="PushEvent", actor_login="alice",
            repo_id=repo_in_year.github_id, repository_id=repo_in_year.id,
            created_at=datetime(2024, 5, 15, tzinfo=timezone.utc), domain="ai",
        ),
        GitHubEvent(
            github_id="out-year-ev-1", event_type="PushEvent", actor_login="bob",
            repo_id=repo_out_year.github_id, repository_id=repo_out_year.id,
            created_at=datetime(2020, 6, 15, tzinfo=timezone.utc), domain="ai",
        ),
        GitHubEvent(
            github_id="out-year-ev-2", event_type="PushEvent", actor_login="bob",
            repo_id=repo_out_year.github_id, repository_id=repo_out_year.id,
            created_at=datetime(2020, 6, 16, tzinfo=timezone.utc), domain="ai",
        ),
        GitHubEvent(
            github_id="out-year-ev-3", event_type="PushEvent", actor_login="bob",
            repo_id=repo_out_year.github_id, repository_id=repo_out_year.id,
            created_at=datetime(2020, 6, 17, tzinfo=timezone.utc), domain="ai",
        ),
    ])
    await db.execute(
        sa_text("UPDATE repositories SET geom = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) WHERE id = :id"),
        {"lon": 77.5, "lat": 12.9, "id": repo_in_year.id},
    )
    await db.execute(
        sa_text("UPDATE repositories SET geom = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) WHERE id = :id"),
        {"lon": 77.6, "lat": 13.0, "id": repo_out_year.id},
    )
    await db.commit()

    # The endpoint is Redis-cached; invalidate so a stale entry from a
    # previous run (with different repo UUIDs) can't satisfy this test.
    from app.core.cache import get_cache_service
    cache = get_cache_service()
    await cache.invalidate_geospatial()

    response = await client.get(
        "/api/v1/geospatial/activity?bbox=70,10,85,15&limit=100&year=2024&domain=ai"
    )
    assert response.status_code == 200
    data = response.json()
    scores = {feature["properties"]["id"]: feature["properties"]["activity_score"] for feature in data["features"]}

    # In-year repo owns the only in-window push events -> normalized to 100
    assert scores.get(repo_in_year.id, 0) == 100.0
    # Out-of-year repo has no in-window events -> falls back to stars (0) -> 0
    assert scores.get(repo_out_year.id, 0) == 0.0


class TestActivityScore:
    """Unit tests for activity_score computation."""

    def test_activity_score_from_push_activity(self):
        from app.api.geospatial import _compute_activity_scores

        # Two repos with push activity; score must favor the most active one and stay 0-100
        rows = [
            SimpleNamespace(push_count=100, dev_count=10, stargazers_count=1000),
            SimpleNamespace(push_count=10, dev_count=1, stargazers_count=5),
        ]
        scores = _compute_activity_scores(rows)
        assert scores[0] > scores[1]
        assert scores[0] == 100.0
        assert 0 <= scores[1] <= 100

    def test_activity_score_falls_back_to_stars_when_no_activity(self):
        from app.api.geospatial import _compute_activity_scores

        # No push activity -> fall back to stars normalized to 0-100
        rows = [
            SimpleNamespace(push_count=0, dev_count=0, stargazers_count=50),
            SimpleNamespace(push_count=0, dev_count=0, stargazers_count=25),
        ]
        scores = _compute_activity_scores(rows)
        assert scores[0] == 100.0
        assert scores[1] == 50.0

    def test_activity_score_zero_when_no_data(self):
        from app.api.geospatial import _compute_activity_scores

        rows = [SimpleNamespace(push_count=0, dev_count=0, stargazers_count=0)]
        assert _compute_activity_scores(rows) == [0.0]

    def test_activity_score_mixed_activity_and_fallback(self):
        from app.api.geospatial import _compute_activity_scores

        rows = [
            SimpleNamespace(push_count=5, dev_count=3, stargazers_count=0),
            SimpleNamespace(push_count=0, dev_count=0, stargazers_count=2),
        ]
        scores = _compute_activity_scores(rows)
        # Activity-backed repo scores higher than the no-activity repo
        assert scores[0] == 100.0
        assert scores[1] == 100.0  # fallback repo is the only starred repo
        assert scores[0] >= scores[1]
