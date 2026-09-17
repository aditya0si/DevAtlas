"""Startup validation tests (S-03): fail fast on unsafe production config.

These tests run WITHOUT Postgres: the enforced production checks are evaluated
before any database/Redis probe, and the permissive paths stub those probes.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app import main as main_module
from app.core.config import Settings

# 44 bytes — accepted in production (>= MIN_JWT_SECRET_BYTES).
VALID_SECRET = "unit-test-secret-that-is-long-enough-0123456789"


def _stub_probes(monkeypatch) -> None:
    """Keep lifespan tests hermetic: DB/Redis probing is not under test here."""
    monkeypatch.setattr(main_module, "validate_database", AsyncMock(return_value="healthy"))
    monkeypatch.setattr(main_module, "validate_redis", AsyncMock(return_value="disabled"))


class TestValidateRequiredEnv:
    """validate_required_env() keeps reporting missing vars (warning path)."""

    def test_reports_jwt_secret_and_github_token_when_unset(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "development")
        monkeypatch.setattr(main_module.settings, "github_token", None)
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "")

        missing = main_module.validate_required_env()

        assert "JWT_SECRET_KEY" in missing
        assert "GITHUB_TOKEN" in missing

    def test_reports_development_default_secret(self, monkeypatch):
        """The documented dev default 'change-me' is still reported as missing."""
        monkeypatch.setattr(main_module.settings, "environment", "development")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "change-me")

        assert "JWT_SECRET_KEY" in main_module.validate_required_env()

    def test_reports_nothing_when_configured(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "development")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", VALID_SECRET)

        assert main_module.validate_required_env() == []


class TestProductionSecurityGate:
    """validate_production_security() returns the fatal production problems."""

    def test_empty_in_development(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "development")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "change-me")
        monkeypatch.setattr(main_module.settings, "github_token", None)

        assert main_module.validate_production_security() == []

    def test_flags_default_secret(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "change-me")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        problems = main_module.validate_production_security()

        assert len(problems) == 1
        assert "JWT_SECRET_KEY" in problems[0]
        assert "change-me" in problems[0]

    def test_flags_empty_secret(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        problems = main_module.validate_production_security()

        assert any("JWT_SECRET_KEY" in p for p in problems)

    def test_flags_short_secret(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "too-short-secret")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        problems = main_module.validate_production_security()

        assert len(problems) == 1
        assert "JWT_SECRET_KEY" in problems[0]
        assert "32 bytes" in problems[0]

    def test_flags_missing_github_token(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", VALID_SECRET)
        monkeypatch.setattr(main_module.settings, "github_token", None)

        problems = main_module.validate_production_security()

        assert len(problems) == 1
        assert "GITHUB_TOKEN" in problems[0]

    def test_accepts_valid_production_config(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", VALID_SECRET)
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        assert main_module.validate_production_security() == []


class TestLifespanFailFast:
    """The lifespan refuses to start production with unsafe settings."""

    @pytest.mark.asyncio
    async def test_raises_with_default_secret(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "change-me")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
            async with main_module.lifespan(main_module.app):
                pass  # pragma: no cover - startup must not complete

    @pytest.mark.asyncio
    async def test_raises_with_empty_secret(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
            async with main_module.lifespan(main_module.app):
                pass  # pragma: no cover

    @pytest.mark.asyncio
    async def test_raises_with_short_secret(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "short")
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")

        with pytest.raises(RuntimeError, match="32 bytes"):
            async with main_module.lifespan(main_module.app):
                pass  # pragma: no cover

    @pytest.mark.asyncio
    async def test_raises_without_github_token(self, monkeypatch):
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", VALID_SECRET)
        monkeypatch.setattr(main_module.settings, "github_token", None)

        with pytest.raises(RuntimeError, match="GITHUB_TOKEN"):
            async with main_module.lifespan(main_module.app):
                pass  # pragma: no cover

    @pytest.mark.asyncio
    async def test_development_stays_permissive(self, monkeypatch):
        """The documented dev defaults must not block local startup."""
        monkeypatch.setattr(main_module.settings, "environment", "development")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", "change-me")
        monkeypatch.setattr(main_module.settings, "github_token", None)
        _stub_probes(monkeypatch)

        started = False
        async with main_module.lifespan(main_module.app):
            started = True

        assert started

    @pytest.mark.asyncio
    async def test_production_without_ai_keys_still_starts(self, monkeypatch):
        """Missing AI keys are warnings (validate_required_env), not fatal."""
        monkeypatch.setattr(main_module.settings, "environment", "production")
        monkeypatch.setattr(main_module.settings, "jwt_secret_key", VALID_SECRET)
        monkeypatch.setattr(main_module.settings, "github_token", "ghp_test")
        monkeypatch.setattr(main_module.settings, "openai_api_key", None)
        monkeypatch.setattr(main_module.settings, "gemini_api_key", None)
        monkeypatch.setattr(main_module.settings, "groq_api_key", None)
        _stub_probes(monkeypatch)

        started = False
        async with main_module.lifespan(main_module.app):
            started = True

        assert started


class TestAdminAndBudgetSettings:
    """Frozen interface for A1: admin key + LLM rate/daily budgets."""

    def test_defaults(self, monkeypatch):
        for var in ("ADMIN_API_KEY", "AI_RATE_LIMIT_REQUESTS", "AI_DAILY_REQUESTS"):
            monkeypatch.delenv(var, raising=False)

        settings = Settings()

        assert settings.admin_api_key is None
        assert settings.ai_rate_limit_requests == 10
        assert settings.ai_daily_requests == 300

    def test_sourced_from_env(self, monkeypatch):
        monkeypatch.setenv("ADMIN_API_KEY", "admin-test-key")
        monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "7")
        monkeypatch.setenv("AI_DAILY_REQUESTS", "42")

        settings = Settings()

        assert settings.admin_api_key == "admin-test-key"
        assert settings.ai_rate_limit_requests == 7
        assert settings.ai_daily_requests == 42

    def test_jwt_secret_default_remains_documented_dev_value(self, monkeypatch):
        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

        assert Settings().jwt_secret_key == "change-me"
