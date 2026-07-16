from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import GitHubEvent, Repository
from app.repositories.github_repository import GitHubRepository


@pytest.mark.asyncio
async def test_upsert_repository_new(db: AsyncSession):
    """Test inserting a new repository."""
    repo = GitHubRepository(db)
    repository = Repository(
        github_id=999,
        name="test-repo",
        full_name="owner/test-repo",
        owner_login="owner",
        html_url="https://github.com/owner/test-repo",
        language="Python",
        stargazers_count=100,
        forks_count=10,
        open_issues_count=5,
        topics=["python", "testing"],
        default_branch="main",
    )
    
    result = await repo.upsert_repository(repository)
    
    assert result.github_id == 999
    assert result.name == "test-repo"
    assert result.stargazers_count == 100


@pytest.mark.asyncio
async def test_upsert_repository_existing(db: AsyncSession, sample_repository: Repository):
    """Test updating an existing repository."""
    repo = GitHubRepository(db)
    
    # Update the repository
    sample_repository.stargazers_count = 200
    result = await repo.upsert_repository(sample_repository)
    
    assert result.stargazers_count == 200


@pytest.mark.asyncio
async def test_get_recent_repositories(db: AsyncSession, sample_repository: Repository):
    """Test fetching recent repositories."""
    repo = GitHubRepository(db)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    
    results = await repo.get_recent_repositories(since=since, limit=10)
    
    assert len(results) >= 1
    assert results[0].name == sample_repository.name


@pytest.mark.asyncio
async def test_upsert_event_new(db: AsyncSession, sample_repository: Repository):
    """Test inserting a new event."""
    repo = GitHubRepository(db)
    event = GitHubEvent(
        github_id="evt-new-123",
        event_type="PushEvent",
        actor_login="owner",
        repo_id=sample_repository.github_id,
        repo_name=sample_repository.name,
        payload={"commits": [{"sha": "abc123"}]},
    )
    
    result = await repo.upsert_event(event)
    
    assert result.github_id == "evt-new-123"
    assert result.event_type == "PushEvent"


@pytest.mark.asyncio
async def test_get_repositories_for_classification(db: AsyncSession, sample_repository: Repository):
    """Test fetching repositories needing classification."""
    repo = GitHubRepository(db)
    
    # Repository with no classification
    results = await repo.get_repositories_for_classification(limit=10)
    
    assert len(results) >= 1


@pytest.mark.asyncio
async def test_update_classification(db: AsyncSession, sample_repository: Repository):
    """Test updating repository classification."""
    repo = GitHubRepository(db)
    
    classification = {
        "category": "machine-learning",
        "confidence": 0.95,
        "embedding": [0.1, 0.2, 0.3],
    }
    
    await repo.update_classification(sample_repository.id, classification)
    
    # Refresh and verify
    await db.refresh(sample_repository)
    assert sample_repository.classification["category"] == "machine-learning"


@pytest.fixture
def sample_repository(db: AsyncSession) -> Repository:
    """Create a sample repository for testing."""
    repository = Repository(
        github_id=888,
        name="sample-repo",
        full_name="owner/sample-repo",
        owner_login="owner",
        html_url="https://github.com/owner/sample-repo",
        language="Python",
        stargazers_count=50,
        forks_count=5,
        open_issues_count=2,
        topics=["python"],
        default_branch="main",
    )
    db.add(repository)
    return repository