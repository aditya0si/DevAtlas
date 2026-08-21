from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import GitHubEvent, Repository


@pytest.mark.asyncio
async def test_list_events(client, db: AsyncSession):
    repository = Repository(
        github_id=2,
        name="event-repo",
        full_name="owner/event-repo",
        owner_login="owner",
        html_url="https://github.com/owner/event-repo",
        stargazers_count=5,
        forks_count=1,
        open_issues_count=0,
    )
    db.add(repository)
    await db.commit()

    event = GitHubEvent(
        github_id="evt-1",
        event_type="PushEvent",
        actor_login="owner",
        repo_id=repository.github_id,
        repo_name=repository.name,
        payload={"commits": []},
    )
    db.add(event)
    await db.commit()

    response = await client.get("/api/v1/events/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["event_type"] == "PushEvent"
