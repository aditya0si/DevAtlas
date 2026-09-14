from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.repo_ingestion_worker import run_repo_ingestion


@pytest.fixture
def mock_github_api_client():
    with patch("app.workers.repo_ingestion_worker.GitHubAPIClient") as mock:
        client_instance = mock.return_value

        async def mock_search_repositories(*args, **kwargs):
            # Yield 150 items to test the buffer logic (100 + 50)
            for i in range(150):
                yield {
                    "id": i,
                    "name": f"repo_{i}",
                    "full_name": f"user/repo_{i}",
                    "owner": {"login": "user"},
                    "description": "test",
                    "html_url": f"https://github.com/user/repo_{i}",
                    "created_at": "2023-01-01T00:00:00Z",
                    "updated_at": "2023-01-02T00:00:00Z",
                    "pushed_at": "2023-01-03T00:00:00Z",
                }

        client_instance.search_repositories.side_effect = mock_search_repositories
        client_instance.close = AsyncMock()
        yield client_instance

@pytest.mark.asyncio
async def test_run_repo_ingestion(mock_github_api_client):
    # We patch async_sessionmaker and GitHubRepository to avoid actual DB calls for this unit test
    with patch("app.workers.repo_ingestion_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.repo_ingestion_worker.GitHubRepository") as mock_repo_class, \
         patch("app.workers.repo_ingestion_worker.get_sync_state") as mock_get_state, \
         patch("app.workers.repo_ingestion_worker.update_sync_state") as mock_update_state:

        # Mock session context manager
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance

        # Mock GitHubRepository
        repo_instance = MagicMock()
        repo_instance.bulk_upsert_repositories = AsyncMock()
        mock_repo_class.return_value = repo_instance

        # Mock SyncState
        sync_state = MagicMock()
        sync_state.items_processed = 0
        mock_get_state.return_value = sync_state
        mock_update_state.return_value = None

        result = await run_repo_ingestion({"redis": None})

        assert result["status"] == "success"
        assert result["processed"] == 150

        # Should be called twice: once for the first 100, once for the remaining 50
        assert repo_instance.bulk_upsert_repositories.call_count == 2

        # Sync state should be updated to completed
        assert sync_state.status == "completed"
        assert mock_update_state.called
