from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.incremental_sync_worker import (
    run_event_sync,
    run_incremental_repo_sync,
    run_stale_user_refresh,
)


@pytest.mark.asyncio
async def test_run_incremental_repo_sync():
    with patch("app.workers.incremental_sync_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.incremental_sync_worker.GitHubAPIClient") as mock_client_class, \
         patch("app.workers.incremental_sync_worker.GitHubRepository") as mock_repo_class, \
         patch("app.workers.incremental_sync_worker.get_sync_state") as mock_get_state, \
         patch("app.workers.incremental_sync_worker.update_sync_state") as mock_update_state:

        # Mock session
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance

        # Mock Client
        client_instance = MagicMock()
        async def mock_search(*args, **kwargs):
            for i in range(5):
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
        client_instance.search_repositories.side_effect = mock_search
        client_instance.close = AsyncMock()
        mock_client_class.return_value = client_instance

        # Mock Repo
        repo_instance = MagicMock()
        repo_instance.bulk_upsert_repositories = AsyncMock()
        mock_repo_class.return_value = repo_instance

        # Mock SyncState
        sync_state = MagicMock()
        sync_state.items_processed = 0
        sync_state.last_sync_at = None
        mock_get_state.return_value = sync_state
        mock_update_state.return_value = None

        result = await run_incremental_repo_sync({"redis": None})

        assert result["status"] == "success"
        assert result["processed"] == 5
        assert repo_instance.bulk_upsert_repositories.call_count == 1
        assert sync_state.status == "completed"

@pytest.mark.asyncio
async def test_run_event_sync():
    with patch("app.workers.incremental_sync_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.incremental_sync_worker.GitHubAPIClient") as mock_client_class:

        # Mock session
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance

        # Mock query result
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = ["repo1", "repo2"]
        session_instance.execute.return_value = mock_result

        # Mock Client
        client_instance = MagicMock()
        client_instance.close = AsyncMock()
        mock_client_class.return_value = client_instance

        result = await run_event_sync({"redis": None})

        assert result["status"] == "success"
        assert result["processed"] == 2

@pytest.mark.asyncio
async def test_run_stale_user_refresh():
    with patch("app.workers.incremental_sync_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.incremental_sync_worker.LocationIntelligenceService") as mock_service_class:

        # Mock session
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance

        # Mock query result
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = ["user1", "user2", "user3"]
        session_instance.execute.return_value = mock_result

        # Mock Service
        service_instance = MagicMock()
        service_instance.enrich_repository_owner = AsyncMock()
        service_instance.close = AsyncMock()
        mock_service_class.return_value = service_instance

        result = await run_stale_user_refresh({"redis": None})

        assert result["status"] == "success"
        assert result["processed"] == 3
        assert service_instance.enrich_repository_owner.call_count == 3
