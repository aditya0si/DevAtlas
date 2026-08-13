"""Tests for EmbeddingService.

Verifies the service stays functional without an OpenAI API key by routing
embedding generation through the AI provider fallback chain (OpenAI -> Gemini ->
Ollama -> deterministic local fallback).
"""

from unittest.mock import AsyncMock

import pytest


@pytest.fixture
def no_ai_keys(monkeypatch):
    """Simulate a deployment without OpenAI/Gemini/Groq keys.

    Patches the shared cached ``Settings`` instance so any provider chain built
    during the test excludes all live providers.
    """
    from app.services import ai_service

    monkeypatch.setattr(ai_service.settings, "openai_api_key", None)
    monkeypatch.setattr(ai_service.settings, "gemini_api_key", None)
    monkeypatch.setattr(ai_service.settings, "groq_api_key", None)
    # Keep the fallback deterministic regardless of whether a local Ollama is
    # actually running by disabling the availability probe.
    monkeypatch.setattr(
        ai_service.OllamaProvider,
        "_check_available",
        AsyncMock(return_value=False),
    )
    return ai_service.settings


class TestEmbeddingService:
    def test_init_does_not_construct_raw_openai_client(self, db_session):
        """EmbeddingService must not build a raw AsyncOpenAI client.

        Regression: ``AsyncOpenAI(api_key=settings.openai_api_key)`` raised
        ``OpenAIError`` at construction time when no key was configured, which
        surfaced as a 500 from the semantic search endpoint.
        """
        from app.services.embedding_service import EmbeddingService

        service = EmbeddingService(db_session)
        assert not hasattr(service, "client")
        assert service.provider is not None

    @pytest.mark.asyncio
    async def test_generate_embedding_uses_deterministic_local_fallback(
        self, db_session, no_ai_keys
    ):
        """Without any AI key the service returns a deterministic embedding.

        The fallback chain must land on the local provider (no network calls,
        no 500) and produce a fixed-length vector usable by cosine similarity.
        """
        from app.core.config import get_settings
        from app.services.embedding_service import EmbeddingService

        settings = get_settings()
        service = EmbeddingService(db_session)

        first = await service.generate_embedding("Find AI healthcare projects")
        second = await service.generate_embedding("Find AI healthcare projects")

        assert isinstance(first, list)
        assert len(first) == settings.embedding_dimensions
        # Deterministic: identical inputs produce identical vectors, so the
        # provider chain reached the local fallback (MockAI returns 0.01 each).
        assert first == second
        assert all(abs(v - 0.01) < 1e-9 for v in first)
