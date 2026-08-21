from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/v1/health/health")
    assert response.status_code == 200
    assert response.json()["status"] in {"healthy", "unhealthy"}
