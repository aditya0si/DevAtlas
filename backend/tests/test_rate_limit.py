"""HTTP-level acceptance tests for ``RateLimitMiddleware`` (campaign subtask S-02).

The middleware used to raise ``HTTPException`` from ``dispatch``, which never
reaches FastAPI's exception handlers: requests past the limit were answered with
``500``. These tests drive the real app through httpx's ASGITransport with a tiny
env-configured limit and prove:

* an over-limit request is throttled with a real ``429`` (not ``500``), a
  ``Retry-After`` header and a JSON ``detail`` body,
* exactly ``RATE_LIMIT_REQUESTS`` requests succeed before the first ``429``,
* a Redis client that raises on connect does not fail open: the in-process
  fallback still throttles, logs a WARNING and counts the degradation,
* ``X-Forwarded-For`` selects the bucket, so two clients behind one proxy keep
  independent budgets, and an unparsable value falls back to the socket peer.

Neither Redis nor Postgres is required: ``app.middleware.rate_limit.get_redis``
is patched with fakeredis (or with a broken stand-in), and ASGITransport does
not run the app lifespan, so the startup database checks never execute.

Run: ``cd backend && .venv/Scripts/python.exe -m pytest tests/test_rate_limit.py -q``
"""

from __future__ import annotations

import importlib
import logging
import os
from unittest.mock import MagicMock, patch

import fakeredis.aioredis
from httpx import ASGITransport, AsyncClient
from prometheus_client import REGISTRY

RATE_LIMIT_REQUESTS = 3
RATE_LIMIT_WINDOW_SECONDS = 60

# Must be set before app.main is imported: main.py passes settings.rate_limit_*
# to add_middleware(RateLimitMiddleware, requests=..., window=...). get_redis is
# patched below, so REDIS_URL only has to be a truthy URL (it also selects the
# Redis path in the middleware instead of the in-process fallback).
_ENV_OVERRIDES = {
    "RATE_LIMIT_REQUESTS": str(RATE_LIMIT_REQUESTS),
    "RATE_LIMIT_WINDOW_SECONDS": str(RATE_LIMIT_WINDOW_SECONDS),
    "REDIS_URL": "redis://localhost:6379/0",
}
_PREVIOUS_ENV = {name: os.environ.get(name) for name in _ENV_OVERRIDES}
os.environ.update(_ENV_OVERRIDES)

from app.core.config import get_settings  # noqa: E402
from app.middleware.rate_limit import RateLimitMiddleware  # noqa: E402


def _configured_limit(application) -> int:
    """The ``requests`` value main.py handed to the installed middleware."""
    for middleware in application.user_middleware:
        if middleware.cls is RateLimitMiddleware:
            return int(middleware.kwargs["requests"])
    raise AssertionError("RateLimitMiddleware is not installed on the app")


def _build_app():
    """The app from app.main, carrying the tiny env-configured limit.

    tests/conftest.py imports app.main during collection, before this module gets
    a chance to set the environment, so the app may already exist with the
    default (60) limit. Re-execute app.main - with the settings cache cleared -
    so the limit genuinely comes from the environment either way.

    Returns ``(application, rebuilt)``.
    """
    import app.main as main_module

    if _configured_limit(main_module.app) == RATE_LIMIT_REQUESTS:
        return main_module.app, False

    original_app = main_module.app
    get_settings.cache_clear()
    rebuilt_app = importlib.reload(main_module).app
    assert _configured_limit(rebuilt_app) == RATE_LIMIT_REQUESTS, (
        f"expected app.main to pick up RATE_LIMIT_REQUESTS={RATE_LIMIT_REQUESTS} from the environment, "
        f"got {_configured_limit(rebuilt_app)}"
    )
    # The reload re-executed app.main to read the tiny limit from the
    # environment; put the original instance back so every other test module
    # (and the ``client`` fixture in tests/conftest.py, which bound it at import
    # time) keeps the default production wiring.
    main_module.app = original_app
    return rebuilt_app, True


app, APP_REBUILT_FROM_ENV = _build_app()

# Leave the process as this module found it: the env overrides were only needed
# to build this module's app, and get_settings() must keep returning the default
# settings for every other test in the session.
for _name, _previous in _PREVIOUS_ENV.items():
    if _previous is None:
        os.environ.pop(_name, None)
    else:
        os.environ[_name] = _previous


class UnreachableRedis:
    """Stand-in for a redis client whose server cannot be reached."""

    async def ping(self) -> None:
        raise ConnectionError("redis: connection refused")

    def pipeline(self, transaction: bool = True):  # noqa: ARG002 - mirrors redis.asyncio
        raise ConnectionError("redis: connection refused")


def _connect_to(client_object):
    """Patch the middleware's ``get_redis`` with an async callable returning ``client_object``."""

    async def _get_redis():
        return client_object

    return patch("app.middleware.rate_limit.get_redis", _get_redis)


def _http_client() -> AsyncClient:
    # raise_app_exceptions=False: if the middleware ever regresses to raising,
    # the assertion below fails on the resulting 500 instead of the exception
    # escaping through the client.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    return AsyncClient(transport=transport, base_url="http://testserver")


async def _send(client: AsyncClient, forwarded_for: str | None = None):
    headers = {"X-Forwarded-For": forwarded_for} if forwarded_for is not None else {}
    return await client.get("/", headers=headers)


async def _hammer_until_first_429(client: AsyncClient, forwarded_for: str | None = None):
    """Send requests until one is throttled; return ``(successes, throttled_response)``."""
    successes = 0
    for _ in range(RATE_LIMIT_REQUESTS + 5):
        response = await _send(client, forwarded_for)
        if response.status_code == 200:
            successes += 1
            continue
        return successes, response
    raise AssertionError("the limiter never throttled a request")


async def test_over_limit_request_is_throttled_with_429():
    """Redis path: exact limit, then a real 429 + Retry-After + JSON detail."""
    fake = fakeredis.aioredis.FakeRedis()
    with _connect_to(fake):
        async with _http_client() as client:
            successes, throttled = await _hammer_until_first_429(client, "203.0.113.10")

    print(
        f"[S-02] limit={RATE_LIMIT_REQUESTS} app_rebuilt_from_env={APP_REBUILT_FROM_ENV} "
        f"successes_before_first_429={successes} status={throttled.status_code} "
        f"retry_after={throttled.headers.get('retry-after')} body={throttled.text}"
    )

    assert successes == RATE_LIMIT_REQUESTS, "exactly <limit> requests must succeed"
    assert throttled.status_code == 429, (
        f"expected 429, got {throttled.status_code} "
        "(a 500 means the HTTPException escaped FastAPI's exception handlers)"
    )
    retry_after = throttled.headers.get("retry-after")
    assert retry_after is not None and retry_after.isdigit(), f"Retry-After header missing/invalid: {retry_after!r}"
    assert 1 <= int(retry_after) <= RATE_LIMIT_WINDOW_SECONDS
    assert "detail" in throttled.json()
    assert await fake.keys("rate_limit:*"), "the Redis backend was not exercised"


async def test_throttled_request_is_counted_once_in_prometheus():
    """The 429 lands in http_requests_total exactly once (no double counting)."""
    fake = fakeredis.aioredis.FakeRedis()
    labels = {"method": "GET", "endpoint": "/", "status_code": "429"}
    with _connect_to(fake):
        async with _http_client() as client:
            await _hammer_until_first_429(client, "203.0.113.11")
            before = REGISTRY.get_sample_value("http_requests_total", labels) or 0.0
            extra = await _send(client, "203.0.113.11")
            after = REGISTRY.get_sample_value("http_requests_total", labels) or 0.0

    assert extra.status_code == 429
    assert after - before == 1.0, f"expected one 429 to be counted once, delta was {after - before}"


async def test_redis_outage_does_not_fail_open(caplog):
    """Redis raising on connect must degrade to in-process throttling, not allow-all."""
    fallbacks_before = REGISTRY.get_sample_value("rate_limit_fallback_total", {"reason": "error"}) or 0.0
    with _connect_to(UnreachableRedis()):
        with caplog.at_level(logging.WARNING, logger="app.middleware.rate_limit"):
            async with _http_client() as client:
                successes, throttled = await _hammer_until_first_429(client, "203.0.113.20")

    print(
        f"[S-02] redis=unreachable successes_before_first_429={successes} status={throttled.status_code} "
        f"retry_after={throttled.headers.get('retry-after')} body={throttled.text}"
    )

    assert successes == RATE_LIMIT_REQUESTS, "the fallback must still allow exactly <limit> requests"
    assert throttled.status_code == 429, (
        f"expected the in-process fallback to throttle with 429, got {throttled.status_code}"
    )
    assert throttled.headers.get("retry-after") is not None

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING and "unavailable" in r.getMessage()]
    captured = [(r.levelname, r.getMessage()) for r in caplog.records]
    assert warnings, f"the fallback must log at WARNING, captured: {captured}"

    fallbacks_after = REGISTRY.get_sample_value("rate_limit_fallback_total", {"reason": "error"}) or 0.0
    assert fallbacks_after > fallbacks_before, "the fallback must be counted in rate_limit_fallback_total"


async def test_in_memory_fallback_is_bounded(monkeypatch):
    """The fallback keeps memory bounded: bucket size, key cap and pruning."""
    monkeypatch.setattr("app.middleware.rate_limit.MAX_IN_MEMORY_CLIENTS", 5)
    middleware = RateLimitMiddleware(MagicMock(), requests=2, window=60)

    # A hammering client must not grow its own bucket past the limit.
    for _ in range(25):
        await middleware._check_rate_limit_memory("rate_limit:198.51.100.1")
    assert len(middleware._in_memory_buckets["rate_limit:198.51.100.1"]) <= 2

    # The number of tracked keys stays capped even when every client is new.
    for octet in range(50):
        await middleware._check_rate_limit_memory(f"rate_limit:198.51.100.{octet + 2}")
    assert len(middleware._in_memory_buckets) <= 5

    # A fully-expired key is dropped on the next insert, not just evicted at random.
    middleware._in_memory_buckets["rate_limit:stale"] = [0.0]
    await middleware._check_rate_limit_memory("rate_limit:203.0.113.99")
    assert "rate_limit:stale" not in middleware._in_memory_buckets
    assert len(middleware._in_memory_buckets) <= 5


async def test_forwarded_for_gives_each_client_its_own_bucket():
    """1.2.3.4 being throttled must not throttle 5.6.7.8 (or vice versa)."""
    fake = fakeredis.aioredis.FakeRedis()
    with _connect_to(fake):
        async with _http_client() as client:
            successes, throttled = await _hammer_until_first_429(client, "1.2.3.4")
            other_client = await _send(client, "5.6.7.8")
            same_client_again = await _send(client, "1.2.3.4")

    print(
        f"[S-02] xff=1.2.3.4 successes_before_first_429={successes} status={throttled.status_code} | "
        f"xff=5.6.7.8 status={other_client.status_code} | xff=1.2.3.4 again status={same_client_again.status_code}"
    )

    assert successes == RATE_LIMIT_REQUESTS
    assert throttled.status_code == 429
    assert other_client.status_code == 200, "a different X-Forwarded-For must keep its own budget"
    assert same_client_again.status_code == 429, "1.2.3.4 must stay throttled"
    assert await fake.keys("rate_limit:1.2.3.4")
    assert await fake.keys("rate_limit:5.6.7.8")


async def test_unparsable_forwarded_for_falls_back_to_socket_peer():
    """A header value that is not an IP must not create a bucket of its own."""
    fake = fakeredis.aioredis.FakeRedis()
    with _connect_to(fake):
        async with _http_client() as client:
            successes, throttled = await _hammer_until_first_429(client, "definitely-not-an-ip")
            bare = await _send(client)

    assert successes == RATE_LIMIT_REQUESTS
    assert throttled.status_code == 429
    assert bare.status_code == 429, "the invalid header must fall back to request.client.host"
    assert len(await fake.keys("rate_limit:*")) == 1, "invalid X-Forwarded-For must not open a second bucket"
