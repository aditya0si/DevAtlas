"""Tests for the Activity Intelligence API (domain stats, shared GeoJSON schema)."""

from __future__ import annotations

import pytest
from datetime import datetime, timezone

from app.models.github import GitHubEvent, Repository


@pytest.mark.asyncio
async def test_domain_stats_falls_back_to_repo_classification(client, db):
    """Domain statistics must fall back to Repository.classification when event
    enrichment (GitHubEvent.domain) is absent."""
    repo = Repository(
        github_id=9001,
        name="ml-tool",
        full_name="ml-org/ml-tool",
        owner_login="ml-org",
        html_url="https://github.com/ml-org/ml-tool",
        language="Python",
        stargazers_count=1,
        forks_count=0,
        open_issues_count=0,
        classification={"domain": "ai/ml"},
    )
    db.add(repo)
    await db.flush()

    # PushEvent with NO enriched domain (enrichment has not run)
    event = GitHubEvent(
        github_id="ev-fallback-1",
        event_type="PushEvent",
        actor_login="ml-dev",
        repo_id=repo.github_id,
        repository_id=repo.id,
        created_at=datetime.now(timezone.utc),
        domain=None,
        enrichment_status="pending",
    )
    db.add(event)
    await db.commit()

    response = await client.get("/api/v1/domains/stats")
    assert response.status_code == 200
    data = response.json()
    domains = {d["domain"]: d for d in data}
    # The event has no domain but its repo classification says "ai/ml" -> fallback applies
    assert "ai/ml" in domains
    assert domains["ai/ml"]["push_events"] >= 1
    assert domains["ai/ml"]["unique_developers"] >= 1


@pytest.mark.asyncio
async def test_domain_stats_uses_enriched_domain_when_present(client, db):
    """When GitHubEvent.domain is set it must be used over the repo fallback."""
    repo = Repository(
        github_id=9002,
        name="cyber-tool",
        full_name="cyber-org/cyber-tool",
        owner_login="cyber-org",
        html_url="https://github.com/cyber-org/cyber-tool",
        language="Python",
        stargazers_count=1,
        forks_count=0,
        open_issues_count=0,
        classification={"domain": "ai/ml"},  # different from enriched domain
    )
    db.add(repo)
    await db.flush()

    event = GitHubEvent(
        github_id="ev-enriched-1",
        event_type="PushEvent",
        actor_login="cyber-dev",
        repo_id=repo.github_id,
        repository_id=repo.id,
        created_at=datetime.now(timezone.utc),
        domain="cybersecurity",
        enrichment_status="enriched",
    )
    db.add(event)
    await db.commit()

    response = await client.get("/api/v1/domains/stats")
    assert response.status_code == 200
    data = response.json()
    domains = {d["domain"]: d for d in data}
    assert "cybersecurity" in domains
    assert "cybersecurity" not in {d["domain"] for d in data if d["domain"] != "cybersecurity"}


def test_geojson_schema_is_shared():
    """GeoJSONFeature/GeoJSONFeatureCollection must come from the shared schema
    module (no duplicated definitions in the API modules)."""
    import app.api.activity
    import app.api.geospatial
    from app.schemas.geospatial import GeoJSONFeature, GeoJSONFeatureCollection

    # API modules must reuse the shared classes, not redefine their own
    assert app.api.activity.GeoJSONFeature is GeoJSONFeature
    assert app.api.activity.GeoJSONFeatureCollection is GeoJSONFeatureCollection
    assert app.api.geospatial.GeoJSONFeature is GeoJSONFeature
    assert app.api.geospatial.GeoJSONFeatureCollection is GeoJSONFeatureCollection

    fc = GeoJSONFeatureCollection(
        type="FeatureCollection",
        features=[GeoJSONFeature(geometry={"type": "Point", "coordinates": [1.0, 2.0]}, properties={"name": "x"})],
    )
    assert fc.features[0].properties["name"] == "x"


@pytest.mark.asyncio
async def test_heatmap_layer_validation(client, db):
    """Heatmap layer must be constrained to allowed values (422 on invalid)."""
    # Default layer works
    resp = await client.get("/api/v1/heatmap")
    assert resp.status_code == 200

    # Valid base layer
    resp = await client.get("/api/v1/heatmap?layer=developer_presence")
    assert resp.status_code == 200

    # Valid domain overlay
    resp = await client.get("/api/v1/heatmap?layer=ai")
    assert resp.status_code == 200

    # Invalid layer -> explicit 422 (not silently falling back to default)
    resp = await client.get("/api/v1/heatmap?layer=not_a_real_layer")
    assert resp.status_code == 422
