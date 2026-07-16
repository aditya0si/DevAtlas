from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_register_user(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "securepass123", "full_name": "New User"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"


@pytest.mark.asyncio
async def test_login(client, test_user):
    response = await client.post(
        "/api/v1/auth/token",
        data={"username": test_user.email, "password": "testpass123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
