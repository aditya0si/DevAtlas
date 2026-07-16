from __future__ import annotations

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
