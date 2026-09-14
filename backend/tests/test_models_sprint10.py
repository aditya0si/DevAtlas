from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import AnalyticsSnapshot, GitHubUser, Repository, SyncState, WorkerRun


@pytest.mark.asyncio
async def test_sync_state_creation(db: AsyncSession):
    state = SyncState(
        sync_type="test_sync",
        last_github_id=100,
        status="running",
        state_metadata={"test": "data"}
    )
    db.add(state)
    await db.commit()
    await db.refresh(state)

    assert state.id is not None
    assert state.sync_type == "test_sync"
    assert state.last_github_id == 100
    assert state.status == "running"
    assert state.state_metadata == {"test": "data"}

@pytest.mark.asyncio
async def test_analytics_snapshot_creation(db: AsyncSession):
    snapshot = AnalyticsSnapshot(
        snapshot_date=date(2026, 7, 16),
        snapshot_type="daily",
        metrics={"total_repos": 5000}
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    assert snapshot.id is not None
    assert snapshot.snapshot_date == date(2026, 7, 16)
    assert snapshot.snapshot_type == "daily"
    assert snapshot.metrics == {"total_repos": 5000}

@pytest.mark.asyncio
async def test_worker_run_creation(db: AsyncSession):
    run = WorkerRun(
        worker_name="repo_sync",
        status="completed",
        items_processed=150,
        duration_seconds=45.5
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    assert run.id is not None
    assert run.worker_name == "repo_sync"
    assert run.status == "completed"
    assert run.items_processed == 150
    assert run.duration_seconds == 45.5

@pytest.mark.asyncio
async def test_enriched_github_user(db: AsyncSession):
    user = GitHubUser(
        login="test_user",
        followers=100,
        following=50,
        organizations=["org1", "org2"],
        enrichment_status="enriched"
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    assert user.followers == 100
    assert user.following == 50
    assert user.organizations == ["org1", "org2"]
    assert user.enrichment_status == "enriched"

@pytest.mark.asyncio
async def test_enriched_repository(db: AsyncSession):
    repo = Repository(
        github_id=999999,
        name="test_repo",
        full_name="test_user/test_repo",
        owner_login="test_user",
        html_url="https://github.com",
        license="MIT",
        archived=True,
        size=1024,
        subscribers_count=5
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    assert repo.license == "MIT"
    assert repo.archived is True
    assert repo.size == 1024
    assert repo.subscribers_count == 5
