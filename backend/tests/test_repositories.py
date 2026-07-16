from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import Repository


@pytest.mark.asyncio
async def test_list_repositories(client, db: AsyncSession):
    repository = Repository(
        github_id=1,
        name="repo",
        full_name="owner/repo",
        owner_login="owner",
        html_url="https://github.com/owner/repo",
        language="Python",
        stargazers_count=10,
        forks_count=2,
        open_issues_count=1,
        topics=["python"],
        default_branch="main",
    )
    db.add(repository)
    await db.commit()

    response = await client.get("/api/v1/repositories/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["full_name"] == "owner/repo"


@pytest.mark.asyncio
async def test_get_repository_not_found(client):
    response = await client.get("/api/v1/repositories/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
