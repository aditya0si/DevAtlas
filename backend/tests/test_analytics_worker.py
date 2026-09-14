from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.analytics_worker import run_analytics_worker


@pytest.mark.asyncio
async def test_run_analytics_worker():
    with patch("app.workers.analytics_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.analytics_worker.get_sync_state") as mock_get_state, \
         patch("app.workers.analytics_worker.update_sync_state") as mock_update_state:

        # Mock session
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance

        # Mock queries
        async def mock_execute(query):
            mock_result = MagicMock()
            query_str = str(query)

            if "count" in query_str and "repositories.id" in query_str:
                mock_result.scalar_one_or_none.return_value = 100
            elif "language" in query_str:
                mock_result.all.return_value = [("Python", 50), ("JavaScript", 30)]
            elif "city" in query_str:
                mock_result.all.return_value = [("Bengaluru", 40), ("Pune", 20)]
            else:
                # AnalyticsSnapshot existing query
                mock_result.scalar_one_or_none.return_value = None

            return mock_result

        session_instance.execute = AsyncMock(side_effect=mock_execute)

        # Mock state
        sync_state = MagicMock()
        mock_get_state.return_value = sync_state
        mock_update_state.return_value = None

        result = await run_analytics_worker({"redis": None})

        assert result["status"] == "success"
        metrics = result["metrics"]
        assert metrics["total_repositories"] == 100
        assert metrics["top_languages"] == {"Python": 50, "JavaScript": 30}
        assert metrics["top_cities"] == {"Bengaluru": 40, "Pune": 20}

        session_instance.add.assert_called_once()
        session_instance.commit.assert_called_once()
