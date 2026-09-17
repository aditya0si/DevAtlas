from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.middleware.rate_limit import RateLimitMiddleware

# The /sync/* routes are operational and now require the shared admin key.
# Tests configure it for the process and send it on every request; the guard
# behaviour itself (503 without a configured key, 401 with a wrong key) is
# covered in tests/test_authz_guards.py and by the tests at the end of this file.
TEST_ADMIN_KEY = "test-admin-key"
ADMIN_HEADERS = {"X-Admin-Key": TEST_ADMIN_KEY}


@pytest.fixture(autouse=True)
def _admin_api_key(monkeypatch) -> None:
    """Configure the admin key the sync routes require (unset -> 503)."""
    monkeypatch.setattr(get_settings(), "admin_api_key", TEST_ADMIN_KEY)


class _FakeLimiterRedis:
    """Redis double for the limiter's sliding-window pipeline."""

    def __init__(self, *, count: int, oldest: float | None = None) -> None:
        self.count = count
        self.oldest = oldest

    def pipeline(self, transaction: bool = True) -> "_FakeLimiterPipeline":
        return _FakeLimiterPipeline(self.count)

    async def zrange(self, key: str, start: int, end: int, withscores: bool = False):
        return [("member", self.oldest)] if self.oldest is not None else []


class _FakeLimiterPipeline:
    """Pipeline double: ``zremrangebyscore -> zadd -> zcard -> expire``."""

    def __init__(self, count: int) -> None:
        self.count = count

    def zremrangebyscore(self, *args, **kwargs) -> "_FakeLimiterPipeline":
        return self

    def zadd(self, *args, **kwargs) -> "_FakeLimiterPipeline":
        return self

    def zcard(self, *args, **kwargs) -> "_FakeLimiterPipeline":
        return self

    def expire(self, *args, **kwargs) -> "_FakeLimiterPipeline":
        return self

    async def execute(self) -> list:
        # The request counts itself, so zcard is the Nth request in the window.
        return [None, None, self.count, None]

    async def __aenter__(self) -> "_FakeLimiterPipeline":
        return self

    async def __aexit__(self, *exc_info) -> bool:
        return False


def _build_limiter_app(requests: int, window: int) -> FastAPI:
    """A real ASGI app with the limiter installed exactly as production wires it."""
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, requests=requests, window=window)

    @app.get("/probe")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    return app


async def _probe(app: FastAPI):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/probe")


class TestRateLimitMiddleware:
    """Tests for the Redis-backed rate limiting middleware.

    Over-limit requests are answered with a real ``429`` JSON response: raising
    ``HTTPException`` inside ``BaseHTTPMiddleware.dispatch`` bypasses FastAPI's
    exception handlers and reaches the client as a ``500``. A Redis outage
    degrades to a bounded in-process window instead of failing open.
    """

    @pytest.mark.asyncio
    async def test_rate_limit_allows_request_under_limit(self, monkeypatch):
        """A request under the window limit reaches the application."""
        monkeypatch.setattr(get_settings(), "redis_url", "redis://limiter-test")
        app = _build_limiter_app(requests=10, window=60)

        with patch("app.middleware.rate_limit.get_redis", return_value=_FakeLimiterRedis(count=5)):
            response = await _probe(app)

        assert response.status_code == 200
        assert response.json() == {"ok": True}

    @pytest.mark.asyncio
    async def test_rate_limit_blocks_request_over_limit(self, monkeypatch):
        """Over the limit -> 429 with Retry-After (not a 500)."""
        monkeypatch.setattr(get_settings(), "redis_url", "redis://limiter-test")
        app = _build_limiter_app(requests=10, window=60)

        with patch(
            "app.middleware.rate_limit.get_redis",
            return_value=_FakeLimiterRedis(count=11, oldest=time.time() - 30),
        ):
            response = await _probe(app)

        assert response.status_code == 429
        assert response.json()["detail"] == "Too many requests. Limit: 10 per 60 seconds"
        assert int(response.headers["Retry-After"]) >= 1

    @pytest.mark.asyncio
    async def test_rate_limit_enforces_limit_in_process_when_redis_is_down(self, monkeypatch):
        """Redis down -> the worker still enforces its own copy of the limit."""
        monkeypatch.setattr(get_settings(), "redis_url", "redis://limiter-test")
        app = _build_limiter_app(requests=1, window=60)

        async def _unavailable():
            raise ConnectionError("redis down")

        with patch("app.middleware.rate_limit.get_redis", _unavailable):
            first = await _probe(app)
            second = await _probe(app)

        assert first.status_code == 200
        assert second.status_code == 429


class TestSyncAPI:
    """Tests for sync API endpoints."""

    @pytest.mark.asyncio
    async def test_enqueue_full_sync(self, client):
        """Test enqueueing a full sync job."""
        with patch("app.api.sync.get_arq_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_job = MagicMock()
            mock_job.job_id = "test-job-123"
            mock_redis.enqueue_job = AsyncMock(return_value=mock_job)
            mock_get_redis.return_value = mock_redis

            response = await client.post("/api/v1/sync/sync/full", headers=ADMIN_HEADERS)

            assert response.status_code == 200
            data = response.json()
            # The endpoint enqueues the ``run_repo_ingestion`` worker; its
            # user-facing copy describes that precisely.
            assert data["message"] == "Full repo ingestion enqueued"
            assert data["job_id"] == "test-job-123"

    @pytest.mark.asyncio
    async def test_enqueue_incremental_sync(self, client):
        """Test enqueueing an incremental sync job."""
        with patch("app.api.sync.get_arq_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_job = MagicMock()
            mock_job.job_id = "test-job-456"
            mock_redis.enqueue_job = AsyncMock(return_value=mock_job)
            mock_get_redis.return_value = mock_redis

            response = await client.post("/api/v1/sync/sync/incremental", headers=ADMIN_HEADERS)

            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Incremental sync enqueued"

    @pytest.mark.asyncio
    async def test_enqueue_incremental_sync_uses_registered_worker_name(self):
        """The incremental sync endpoint must enqueue the canonical
        ``run_incremental_repo_sync`` worker registered in app.workers.main
        (not the legacy ``run_incremental_sync`` from github_sync.py)."""
        from app.api.sync import enqueue_incremental_sync
        from app.workers.main import WorkerSettings

        registered = {func.__name__ for func in WorkerSettings.functions}

        with patch("app.api.sync.get_arq_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_job = MagicMock()
            mock_job.job_id = "test-job-inc"
            mock_redis.enqueue_job = AsyncMock(return_value=mock_job)
            mock_get_redis.return_value = mock_redis

            result = await enqueue_incremental_sync()

            assert result["message"] == "Incremental sync enqueued"
            enqueued = mock_redis.enqueue_job.await_args.args[0]
            assert enqueued == "run_incremental_repo_sync"
            assert enqueued in registered

    @pytest.mark.asyncio
    async def test_enqueue_ai_classification_uses_registered_worker_name(self):
        """The classify endpoint must enqueue the canonical
        ``run_classification_worker`` registered in app.workers.main."""
        from app.api.sync import enqueue_ai_classification
        from app.workers.main import WorkerSettings

        registered = {func.__name__ for func in WorkerSettings.functions}

        with patch("app.api.sync.get_arq_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_job = MagicMock()
            mock_job.job_id = "test-job-cls"
            mock_redis.enqueue_job = AsyncMock(return_value=mock_job)
            mock_get_redis.return_value = mock_redis

            result = await enqueue_ai_classification()

            assert result["message"] == "AI classification enqueued"
            enqueued = mock_redis.enqueue_job.await_args.args[0]
            assert enqueued == "run_classification_worker"
            assert enqueued in registered

    @pytest.mark.asyncio
    async def test_enqueue_full_pipeline_uses_registered_worker_names(self):
        """Every job enqueued by the full pipeline must be a registered worker
        (regression: it previously enqueued the non-existent
        ``run_ai_classification``)."""
        from app.api.sync import enqueue_full_pipeline
        from app.workers.main import WorkerSettings

        registered = {func.__name__ for func in WorkerSettings.functions}

        with patch("app.api.sync.get_arq_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_redis.enqueue_job = AsyncMock(return_value=MagicMock(job_id="test-job-pipe"))
            mock_get_redis.return_value = mock_redis

            result = await enqueue_full_pipeline()

            enqueued = [call.args[0] for call in mock_redis.enqueue_job.call_args_list]
            assert enqueued, "pipeline should enqueue jobs"
            assert set(enqueued) == set(result["jobs"].keys())

            missing = sorted(set(enqueued) - registered)
            assert not missing, f"pipeline enqueues unregistered workers: {missing}"
            assert "run_classification_worker" in enqueued
            assert "run_ai_classification" not in enqueued

    @pytest.mark.asyncio
    async def test_get_sync_status_not_found(self, client):
        """Test getting status of non-existent job."""
        with patch("app.api.sync.get_arq_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_redis.get_job_result = AsyncMock(return_value=None)
            mock_get_redis.return_value = mock_redis

            response = await client.get("/api/v1/sync/sync/status/non-existent-id", headers=ADMIN_HEADERS)

            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_full_sync_requires_admin_key(self, client, _admin_api_key):
        """Unauthenticated sync trigger -> 401 (no anonymous access)."""
        response = await client.post("/api/v1/sync/sync/full")

        assert response.status_code == 401
        assert "X-Admin-Key" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_sync_status_requires_admin_key(self, client, _admin_api_key):
        response = await client.get("/api/v1/sync/sync/status/some-job")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_sync_rejects_wrong_admin_key(self, client, _admin_api_key):
        response = await client.post("/api/v1/sync/sync/full", headers={"X-Admin-Key": "not-the-key"})

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_sync_returns_503_when_admin_key_not_configured(self, client, monkeypatch):
        """Unset ADMIN_API_KEY -> 503: the endpoint stays closed, not open."""
        monkeypatch.setattr(get_settings(), "admin_api_key", None)

        response = await client.post("/api/v1/sync/sync/full", headers=ADMIN_HEADERS)

        assert response.status_code == 503
        assert "ADMIN_API_KEY" in response.json()["detail"]
