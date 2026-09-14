from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.user_enrichment_worker import run_user_enrichment


@pytest.mark.asyncio
async def test_run_user_enrichment():
    with patch("app.workers.user_enrichment_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.user_enrichment_worker.LocationIntelligenceService") as mock_service_class, \
         patch("app.workers.user_enrichment_worker.get_sync_state") as mock_get_state, \
         patch("app.workers.user_enrichment_worker.update_sync_state") as mock_update_state:

        # Mock session
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance

        # Mock LocationIntelligenceService
        service_instance = MagicMock()
        mock_batch_result = MagicMock()
        mock_batch_result.processed = 5
        mock_batch_result.enriched = 3
        mock_batch_result.errors = 0
        service_instance.run_batch_enrichment = AsyncMock(return_value=mock_batch_result)
        service_instance.close = AsyncMock()
        mock_service_class.return_value = service_instance

        # Mock SyncState
        sync_state = MagicMock()
        sync_state.items_processed = 0
        sync_state.total_processed = 0
        sync_state.total_errors = 0
        mock_get_state.return_value = sync_state
        mock_update_state.return_value = None

        result = await run_user_enrichment({"redis": None})

        assert result["status"] == "success"
        assert result["processed"] == 5
        assert result["enriched"] == 3

        service_instance.run_batch_enrichment.assert_called_once_with(limit=200)
        assert sync_state.status == "completed"
        assert sync_state.total_processed == 5

        service_instance.close.assert_called_once()
