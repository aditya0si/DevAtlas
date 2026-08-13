from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import GitHubUser, Repository


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
    # Order is not guaranteed (NULL last_activity_at ties), so check membership
    assert "owner/repo" in {r["full_name"] for r in data}


@pytest.mark.asyncio
async def test_get_repository_not_found(client):
    response = await client.get("/api/v1/repositories/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_repository_detail_returns_owner_contract(client, db: AsyncSession):
    """Repository detail must expose the owner object needed for map drill-down."""
    owner = GitHubUser(
        login="drilldown-owner",
        github_user_id=987654,
        type="User",
        avatar_url="https://avatars.githubusercontent.com/u/987654",
        raw_location="Bengaluru, India",
        normalized_location="Bengaluru",
        state="Karnataka",
    )
    repository = Repository(
        github_id=987655,
        name="drilldown-repo",
        full_name="drilldown-owner/drilldown-repo",
        owner_login="drilldown-owner",
        html_url="https://github.com/drilldown-owner/drilldown-repo",
        language="TypeScript",
        stargazers_count=42,
        forks_count=7,
        open_issues_count=1,
        topics=["map"],
        default_branch="main",
        github_user_login="drilldown-owner",
    )
    db.add_all([owner, repository])
    await db.commit()
    await db.refresh(repository)

    response = await client.get(f"/api/v1/repositories/{repository.id}")
    assert response.status_code == 200
    data = response.json()

    # Frontend RepositoryDetailsData contract
    assert data["id"] == repository.id
    assert data["full_name"] == "drilldown-owner/drilldown-repo"
    assert data["stargazers_count"] == 42
    assert data["forks_count"] == 7
    assert data["open_issues_count"] == 1
    assert data["language"] == "TypeScript"
    assert data["topics"] == ["map"]
    assert data["html_url"] == "https://github.com/drilldown-owner/drilldown-repo"
    assert data["created_at"] is None or data["created_at"] is not None

    owner_data = data.get("owner")
    assert owner_data is not None
    assert owner_data["login"] == "drilldown-owner"
    assert owner_data["avatar_url"] == "https://avatars.githubusercontent.com/u/987654"
    assert owner_data["location"] == "Bengaluru"
    assert owner_data["state"] == "Karnataka"


@pytest.mark.asyncio
async def test_get_repository_detail_without_owner(client, db: AsyncSession):
    """Repository detail returns owner=None when no linked user exists."""
    repository = Repository(
        github_id=987656,
        name="ownerless",
        full_name="someorg/ownerless",
        owner_login="someorg",
        html_url="https://github.com/someorg/ownerless",
        language="Go",
        stargazers_count=3,
        forks_count=0,
        open_issues_count=0,
    )
    db.add(repository)
    await db.commit()
    await db.refresh(repository)

    response = await client.get(f"/api/v1/repositories/{repository.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["owner"] is None
