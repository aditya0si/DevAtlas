import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.workers.ai_classification_worker import run_classification_worker
from app.models.github import Repository

@pytest.mark.asyncio
async def test_run_classification_worker():
    with patch("app.workers.ai_classification_worker.async_sessionmaker") as mock_sessionmaker, \
         patch("app.workers.ai_classification_worker.AIServiceFactory") as mock_factory, \
         patch("app.workers.ai_classification_worker.get_sync_state") as mock_get_state, \
         patch("app.workers.ai_classification_worker.update_sync_state") as mock_update_state:
         
        # Mock session
        session_instance = AsyncMock()
        mock_sessionmaker.return_value.return_value.__aenter__.return_value = session_instance
        
        # Mock provider
        provider_instance = MagicMock()
        provider_instance.classify_repository = AsyncMock(return_value={
            "domain": "Web",
            "industry": "General",
            "primary_technology": "Python",
            "framework": "FastAPI",
            "difficulty": "Beginner",
            "health": "Active",
        })
        provider_instance.generate_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
        mock_factory.get_provider.return_value = provider_instance
        
        # Mock repo
        repo1 = Repository(
            id="uuid1",
            name="test-repo",
            description="A test repo",
            languages={"Python": 100},
            topics=["test", "api"]
        )
        
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [repo1]
        session_instance.execute.return_value = mock_result
        
        # Mock state
        sync_state = MagicMock()
        sync_state.items_processed = 0
        sync_state.total_processed = 0
        sync_state.total_errors = 0
        sync_state.total_skipped = 0
        mock_get_state.return_value = sync_state
        mock_update_state.return_value = None
        
        result = await run_classification_worker({"redis": None})
        
        assert result["status"] == "success"
        assert result["processed"] == 1
        assert repo1.classification["domain"] == "Web"
        assert repo1.embedding == [0.1, 0.2, 0.3]
        
        provider_instance.classify_repository.assert_called_once()
        provider_instance.generate_embedding.assert_called_once()
        session_instance.commit.assert_called_once()
