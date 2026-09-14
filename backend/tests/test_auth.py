from __future__ import annotations

import pytest

# bcrypt only consumes the first 72 bytes of a password. The API must reject
# anything longer at the schema boundary (register) or in the verify path
# (login) instead of letting bcrypt raise an unhandled 500.
OVERLONG_PASSWORD = "a" * 73


@pytest.mark.asyncio
async def test_register_user(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "securepass123", "full_name": "New User"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"


@pytest.mark.asyncio
async def test_register_rejects_overlong_password(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "too-long@example.com", "password": OVERLONG_PASSWORD, "full_name": "Too Long"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login(client, test_user):
    response = await client.post(
        "/api/v1/auth/token",
        data={"username": test_user.email, "password": "testpass123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_rejects_overlong_password(client, test_user):
    response = await client.post(
        "/api/v1/auth/token",
        data={"username": test_user.email, "password": OVERLONG_PASSWORD},
    )
    assert response.status_code == 401
