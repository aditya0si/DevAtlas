"""Tests for Groq support in the AI provider layer.

Covers settings/provider selection (Groq first when configured, backward
compatibility for OpenAI/Gemini, no-key fallback), Groq structured
classification and streaming via the OpenAI SDK against Groq's
OpenAI-compatible base URL, and the embedding abstraction (Groq raises so the
fallback chain skips it).
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_service import (
    AIServiceFactory,
    FallbackChainProvider,
    GeminiProvider,
    GroqProvider,
    MockAIProvider,
    OpenAIProvider,
)


class TestSettings:
    def test_groq_settings_defaults(self):
        """GROQ_API_KEY defaults to None and GROQ_MODEL to a current model."""
        from app.core.config import get_settings

        settings = get_settings()
        assert settings.groq_api_key is None
        assert settings.groq_model == "llama-3.3-70b-versatile"

    def test_groq_settings_from_env(self, monkeypatch):
        """GROQ_API_KEY/GROQ_MODEL are sourced from environment variables."""
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test_env_key")
        monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")

        from app.core.config import Settings

        settings = Settings()
        assert settings.groq_api_key == "gsk_test_env_key"
        assert settings.groq_model == "llama-3.3-70b-versatile"


class TestProviderSelection:
    def test_groq_first_when_configured(self, monkeypatch):
        """Groq is first in the chain when GROQ_API_KEY is set."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")
        monkeypatch.setattr(ai_service.settings, "openai_api_key", "sk-test")
        monkeypatch.setattr(ai_service.settings, "gemini_api_key", "gem-test")

        chain = FallbackChainProvider()
        assert isinstance(chain.providers[0], GroqProvider)
        assert isinstance(chain.providers[1], OpenAIProvider)
        assert isinstance(chain.providers[2], GeminiProvider)

    def test_openai_gemini_preserved_without_groq(self, monkeypatch):
        """Backward compatibility: OpenAI/Gemini still used when Groq absent."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", None)
        monkeypatch.setattr(ai_service.settings, "openai_api_key", "sk-test")
        monkeypatch.setattr(ai_service.settings, "gemini_api_key", "gem-test")

        chain = FallbackChainProvider()
        assert isinstance(chain.providers[0], OpenAIProvider)
        assert isinstance(chain.providers[1], GeminiProvider)
        assert not any(isinstance(p, GroqProvider) for p in chain.providers)

    def test_no_keys_lands_on_mock(self, monkeypatch):
        """Without any AI key the chain falls back to MockAI."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", None)
        monkeypatch.setattr(ai_service.settings, "openai_api_key", None)
        monkeypatch.setattr(ai_service.settings, "gemini_api_key", None)
        monkeypatch.setattr(
            ai_service.OllamaProvider,
            "_check_available",
            AsyncMock(return_value=False),
        )

        chain = FallbackChainProvider()
        assert isinstance(chain.providers[-1], MockAIProvider)
        assert not any(
            isinstance(p, (GroqProvider, OpenAIProvider, GeminiProvider))
            for p in chain.providers
        )

    def test_factory_returns_fallback_chain(self):
        """AIServiceFactory still returns the fallback chain provider."""
        provider = AIServiceFactory.get_provider()
        assert isinstance(provider, FallbackChainProvider)


class TestGroqProvider:
    @pytest.mark.asyncio
    @patch("openai.AsyncOpenAI")
    async def test_classify_repository_uses_json_object_response_format(
        self, mock_openai_cls, monkeypatch
    ):
        """Groq classification uses chat.completions.create + json_object format.

        Regression: the previous implementation used the OpenAI beta parse API
        (``client.beta.chat.completions.parse`` with a Pydantic schema), which
        Groq's OpenAI-compatible endpoint does not implement. Groq only supports
        the standard ``chat.completions.create`` with
        ``response_format={"type": "json_object"}``.
        """
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")
        monkeypatch.setattr(ai_service.settings, "groq_model", "llama-3.3-70b-versatile")

        payload = {
            "domain": "Web",
            "industry": "DevTools",
            "primary_technology": "Python",
            "framework": "FastAPI",
            "difficulty": "Intermediate",
            "health": "Active",
        }
        mock_message = MagicMock()
        mock_message.content = json.dumps(payload)
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=mock_message)]
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai_cls.return_value = mock_client

        provider = GroqProvider()
        result = await provider.classify_repository("Classify this repository")

        mock_openai_cls.assert_called_once_with(
            api_key="gsk-test",
            base_url="https://api.groq.com/openai/v1",
        )
        # The standard create call is used, not the beta parse API.
        mock_client.chat.completions.create.assert_awaited_once()
        mock_client.beta.chat.completions.parse.assert_not_called()
        kwargs = mock_client.chat.completions.create.await_args.kwargs
        assert kwargs["model"] == "llama-3.3-70b-versatile"
        assert kwargs["response_format"] == {"type": "json_object"}
        assert kwargs["temperature"] == 0.1
        assert "JSON" in kwargs["messages"][0]["content"]
        # The returned JSON content is parsed and validated against the schema.
        assert result == payload
        assert result["domain"] == "Web"
        assert result["primary_technology"] == "Python"

    @pytest.mark.asyncio
    @patch("openai.AsyncOpenAI")
    async def test_classify_repository_missing_content_raises(
        self, mock_openai_cls, monkeypatch
    ):
        """Empty/missing message content raises instead of returning garbage."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")

        mock_message = MagicMock()
        mock_message.content = None
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=mock_message)]
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai_cls.return_value = mock_client

        provider = GroqProvider()
        with pytest.raises(RuntimeError, match="empty classification response"):
            await provider.classify_repository("Classify this repository")

    @pytest.mark.asyncio
    @patch("openai.AsyncOpenAI")
    async def test_classify_repository_invalid_json_raises(
        self, mock_openai_cls, monkeypatch
    ):
        """Non-JSON content raises a descriptive error."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")

        mock_message = MagicMock()
        mock_message.content = "this is not json"
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=mock_message)]
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai_cls.return_value = mock_client

        provider = GroqProvider()
        with pytest.raises(RuntimeError, match="invalid JSON"):
            await provider.classify_repository("Classify this repository")

    @pytest.mark.asyncio
    @patch("openai.AsyncOpenAI")
    async def test_classify_repository_schema_mismatch_raises(
        self, mock_openai_cls, monkeypatch
    ):
        """Valid JSON missing required schema fields raises a validation error."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")

        mock_message = MagicMock()
        mock_message.content = json.dumps({"unexpected": "field"})
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=mock_message)]
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai_cls.return_value = mock_client

        provider = GroqProvider()
        with pytest.raises(RuntimeError, match="did not match the expected schema"):
            await provider.classify_repository("Classify this repository")

    @pytest.mark.asyncio
    @patch("openai.AsyncOpenAI")
    async def test_stream_text_uses_chat_completions_stream(self, mock_openai_cls, monkeypatch):
        """Groq streaming uses the OpenAI SDK chat.completions with stream=True."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")
        monkeypatch.setattr(ai_service.settings, "groq_model", "llama-3.3-70b-versatile")

        async def _chunks():
            yield MagicMock(choices=[MagicMock(delta=MagicMock(content="Hello"))])
            yield MagicMock(choices=[MagicMock(delta=MagicMock(content=" world"))])
            yield MagicMock(choices=[MagicMock(delta=MagicMock(content=None))])

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_chunks())
        mock_openai_cls.return_value = mock_client

        provider = GroqProvider()
        collected = []
        async for chunk in provider.stream_text("system", "user query"):
            collected.append(chunk)

        assert "".join(collected) == "Hello world"
        mock_client.chat.completions.create.assert_awaited_once()
        kwargs = mock_client.chat.completions.create.await_args.kwargs
        assert kwargs["model"] == "llama-3.3-70b-versatile"
        assert kwargs["stream"] is True
        assert kwargs["messages"][0]["content"] == "system"

    @pytest.mark.asyncio
    async def test_generate_embedding_raises(self, monkeypatch):
        """Groq does not provide embeddings; the method must raise."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")

        provider = GroqProvider()
        with pytest.raises(RuntimeError, match="does not provide embeddings"):
            await provider.generate_embedding("some text")

    @pytest.mark.asyncio
    async def test_stream_text_without_key_yields_baseline(self, monkeypatch):
        """Without a Groq key, streaming yields a baseline instead of raising."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", None)

        provider = GroqProvider()
        collected = []
        async for chunk in provider.stream_text("system", "user query"):
            collected.append(chunk)

        assert "".join(collected).startswith("Groq API key is not configured")


class TestEmbeddingAbstraction:
    @pytest.mark.asyncio
    async def test_embedding_chain_skips_groq(self, monkeypatch):
        """With only Groq configured, embeddings fall through to MockAI."""
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")
        monkeypatch.setattr(ai_service.settings, "openai_api_key", None)
        monkeypatch.setattr(ai_service.settings, "gemini_api_key", None)
        monkeypatch.setattr(
            ai_service.OllamaProvider,
            "_check_available",
            AsyncMock(return_value=False),
        )

        chain = FallbackChainProvider()
        embedding = await chain.generate_embedding("Find AI projects")

        assert isinstance(embedding, list)
        assert all(abs(v - 0.01) < 1e-9 for v in embedding)

    @pytest.mark.asyncio
    async def test_groq_only_embedding_fallback_logs_warning(
        self, monkeypatch, caplog
    ):
        """Groq-only deployments log a warning when embeddings hit MockAI.

        Groq does not provide embeddings, so a Groq-only deployment silently
        degrades semantic search to deterministic vectors. The warning makes
        that degradation visible in the logs.
        """
        from app.services import ai_service

        monkeypatch.setattr(ai_service.settings, "groq_api_key", "gsk-test")
        monkeypatch.setattr(ai_service.settings, "openai_api_key", None)
        monkeypatch.setattr(ai_service.settings, "gemini_api_key", None)
        monkeypatch.setattr(
            ai_service.OllamaProvider,
            "_check_available",
            AsyncMock(return_value=False),
        )

        with caplog.at_level("WARNING", logger="app.services.ai_service"):
            chain = FallbackChainProvider()
            embedding = await chain.generate_embedding("Find AI projects")

        assert isinstance(embedding, list)
        assert all(abs(v - 0.01) < 1e-9 for v in embedding)
        assert any(
            "Groq does not provide embeddings" in record.message
            and "Semantic search quality" in record.message
            for record in caplog.records
        )


class TestStartupValidation:
    def test_production_accepts_groq_key(self, monkeypatch):
        """GROQ_API_KEY alone satisfies production AI provider validation."""
        from app import main

        monkeypatch.setattr(main.settings, "environment", "production")
        monkeypatch.setattr(main.settings, "github_token", "ghp-test")
        monkeypatch.setattr(main.settings, "jwt_secret_key", "not-change-me")
        monkeypatch.setattr(main.settings, "openai_api_key", None)
        monkeypatch.setattr(main.settings, "gemini_api_key", None)
        monkeypatch.setattr(main.settings, "groq_api_key", "gsk-test")

        missing = main.validate_required_env()
        assert "OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY" not in missing

    def test_production_without_any_ai_key_is_missing(self, monkeypatch):
        """Production without OpenAI/Gemini/Groq reports a missing AI provider."""
        from app import main

        monkeypatch.setattr(main.settings, "environment", "production")
        monkeypatch.setattr(main.settings, "github_token", "ghp-test")
        monkeypatch.setattr(main.settings, "jwt_secret_key", "not-change-me")
        monkeypatch.setattr(main.settings, "openai_api_key", None)
        monkeypatch.setattr(main.settings, "gemini_api_key", None)
        monkeypatch.setattr(main.settings, "groq_api_key", None)

        missing = main.validate_required_env()
        assert "OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY" in missing
