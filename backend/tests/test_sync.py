from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.requests import Request
from starlette.responses import Response

from app.middleware.rate_limit import RateLimitMiddleware


class TestRateLimitMiddleware:
    """Tests for Redis-backed rate limiting middleware."""

    @pytest.mark.asyncio
    async def test_rate_limit_allows_request_under_limit(self):
        """Test that requests under the limit are allowed."""
        app = MagicMock()
        middleware = RateLimitMiddleware(app, requests=10, window=60)

        # Mock Redis pipeline
        mock_redis = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.execute = AsyncMock(return_value=[None, 5, None, None, None])  # 5 requests in window
        mock_pipeline.zremrangebyscore = MagicMock()
        mock_pipeline.zcard = MagicMock()
        mock_pipeline.zadd = MagicMock()
        mock_pipeline.expire = MagicMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        with patch("app.middleware.rate_limit.get_redis", return_value=mock_redis):
            mock_request = MagicMock(spec=Request)
            mock_request.client = MagicMock(host="127.0.0.1")
            mock_request.app = app

            async def call_next(request):
                return Response(content="OK", status_code=200)

            response = await middleware.dispatch(mock_request, call_next)
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_rate_limit_blocks_request_over_limit(self):
        """Test that requests over the limit are blocked."""
        app = MagicMock()
        middleware = RateLimitMiddleware(app, requests=10, window=60)

        # Mock Redis pipeline - already at limit
        mock_redis = AsyncMock()
        mock_pipeline = AsyncMock()
        mock_pipeline.execute = AsyncMock(return_value=[None, 10, None, None, None])  # 10 requests = at limit
        mock_pipeline.zremrangebyscore = MagicMock()
        mock_pipeline.zcard = MagicMock()
        mock_pipeline.zadd = MagicMock()
        mock_pipeline.expire = MagicMock()
        mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
        mock_pipeline.__aexit__ = AsyncMock(return_value=None)
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)

        with patch("app.middleware.rate_limit.get_redis", return_value=mock_redis):
            mock_request = MagicMock(spec=Request)
            mock_request.client = MagicMock(host="127.0.0.1")
            mock_request.app = app

            async def call_next(request):
                return Response(content="OK", status_code=200)

            with pytest.raises(Exception) as exc_info:
                await middleware.dispatch(mock_request, call_next)

            assert exc_info.value.status_code == 429


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

            response = await client.post("/api/v1/sync/sync/full")

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

            response = await client.post("/api/v1/sync/sync/incremental")

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

            response = await client.get("/api/v1/sync/sync/status/non-existent-id")

            assert response.status_code == 404
