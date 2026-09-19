"""Authorization and cost-guard tests (S-01 / S-05 hardening).

Hermetic by design: no Postgres and no Redis are required.

* ``app.api.deps.require_admin_key`` / ``enforce_ai_rate_limit`` are attached as
  *route-level* dependencies, which FastAPI solves before the endpoint's own
  ``Depends(get_db)``. The test app therefore overrides ``get_db`` with a
  dependency that raises -- every 401/429/503 asserted here proves the guard
  rejected the request *before* any database work.
* Redis is replaced by an in-memory fake implementing the limiter's command
  surface.

Run: ``cd backend && .venv/Scripts/python.exe -m pytest tests/test_authz_guards.py -q``
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Callable
from unittest.mock import AsyncMock

import pytest
from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.api import activity as activity_module
from app.api import deps, india, location_intelligence, sync
from app.api.deps import enforce_ai_rate_limit, require_admin_key
from app.core.config import get_settings
from app.core.database import get_db

ADMIN_KEY = "unit-test-admin-key"
ADMIN_HEADER = deps.ADMIN_API_KEY_HEADER
FORWARDED_IP = "203.0.113.7"

API_PREFIX = "/api/v1"
SYNC_PREFIX = f"{API_PREFIX}/sync"  # mirrors app.api.routes: sync.router, prefix="/sync"

# The five LLM-backed routes the cost guard must sit in front of.
GUARDED_AI_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("POST", f"{API_PREFIX}/india/ask", {"query": "Why is Karnataka growing?"}),
    ("GET", f"{API_PREFIX}/india/ask/stream?query=hello", None),
    ("POST", f"{API_PREFIX}/india/search/semantic", {"query": "ai healthcare", "limit": 5}),
    (
        "POST",
        f"{API_PREFIX}/india/trends/explain",
        {
            "entity_type": "state",
            "entity_name": "Karnataka",
            "metric_name": "repositories",
            "current_value": 10,
            "previous_value": 5,
            "time_range": "month",
        },
    ),
    ("POST", f"{API_PREFIX}/location-intelligence/enrich/octocat", None),
]


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


class FakeRedis:
    """Minimal async Redis double for the limiter's command surface."""

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.zsets: dict[str, dict[str, float]] = {}
        self.counters: dict[str, int] = {}
        self.expirations: dict[str, int] = {}
        self.commands: list[tuple[str, str]] = []

    def _maybe_fail(self) -> None:
        if self.fail:
            raise ConnectionError("redis is down")

    async def zremrangebyscore(self, key: str, min_score: float, max_score: float) -> int:
        self._maybe_fail()
        entries = self.zsets.setdefault(key, {})
        stale = [member for member, score in entries.items() if min_score <= score <= max_score]
        for member in stale:
            del entries[member]
        self.commands.append(("zremrangebyscore", key))
        return len(stale)

    async def zcard(self, key: str) -> int:
        self._maybe_fail()
        self.commands.append(("zcard", key))
        return len(self.zsets.get(key, {}))

    async def get(self, key: str) -> Any:
        self._maybe_fail()
        self.commands.append(("get", key))
        value = self.counters.get(key)
        # ``app.core.redis.get_redis`` is configured with decode_responses=True.
        return None if value is None else str(value)

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        self._maybe_fail()
        entries = self.zsets.setdefault(key, {})
        added = sum(1 for member in mapping if member not in entries)
        entries.update(mapping)
        self.commands.append(("zadd", key))
        return added

    async def expire(self, key: str, ttl: int) -> bool:
        self._maybe_fail()
        self.expirations[key] = ttl
        self.commands.append(("expire", key))
        return True

    async def incr(self, key: str) -> int:
        self._maybe_fail()
        self.counters[key] = self.counters.get(key, 0) + 1
        self.commands.append(("incr", key))
        return self.counters[key]


class FailOnZaddRedis(FakeRedis):
    """Redis that accepts reads but rejects the write that records usage."""

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        raise ConnectionError("redis write failed")


def _redis_provider(fake: FakeRedis) -> Callable[[], Any]:
    async def _provider() -> FakeRedis:
        return fake

    return _provider


def _make_request(
    headers: dict[str, str] | None = None,
    client_host: str | None = FORWARDED_IP,
) -> Request:
    raw_headers = [
        (name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in (headers or {}).items()
    ]
    scope: dict[str, Any] = {"type": "http", "method": "POST", "path": "/", "headers": raw_headers}
    scope["client"] = (client_host, 12345) if client_host else None
    return Request(scope)


async def _call(
    client: AsyncClient,
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
):
    kwargs: dict[str, Any] = {"headers": headers} if headers else {}
    if payload is not None:
        kwargs["json"] = payload
    return await client.request(method, path, **kwargs)


def _forbidden_db_dependency():
    """Any DB access during a guard test is a bug: the guard must reject first."""
    raise AssertionError("database was accessed before the guard rejected the request")


def _build_app() -> FastAPI:
    """Production routers, production prefixes, no middleware, no database."""
    application = FastAPI()
    application.include_router(sync.router, prefix=SYNC_PREFIX)
    application.include_router(activity_module.router, prefix=API_PREFIX)
    application.include_router(india.router, prefix=f"{API_PREFIX}/india")
    application.include_router(location_intelligence.router, prefix=f"{API_PREFIX}/location-intelligence")
    application.dependency_overrides[get_db] = _forbidden_db_dependency

    @application.post("/__probe__/ai-guard", dependencies=[Depends(enforce_ai_rate_limit)])
    async def _ai_guard_probe() -> dict[str, str]:
        return {"ok": "true"}

    @application.post("/__probe__/admin-guard", dependencies=[Depends(require_admin_key)])
    async def _admin_guard_probe() -> dict[str, str]:
        return {"ok": "true"}

    return application


def _arq_redis_mock() -> AsyncMock:
    redis_mock = AsyncMock()
    redis_mock.enqueue_job = AsyncMock(return_value=SimpleNamespace(job_id="job-1"))
    redis_mock.get_job_result = AsyncMock(
        return_value=SimpleNamespace(success=True, result={"ok": True}, enqueue_time_ms=1, finish_time_ms=2)
    )
    return redis_mock


def _cache_service_mock() -> AsyncMock:
    cache = AsyncMock()
    cache.invalidate_repositories = AsyncMock(return_value=1)
    cache.invalidate_geospatial = AsyncMock(return_value=2)
    cache.invalidate_events = AsyncMock(return_value=3)
    return cache


def _guard_callables(route: APIRoute) -> set[Any]:
    """Every callable reachable through a route's dependency tree."""
    found: set[Any] = set()

    def walk(dependant: Any) -> None:
        if dependant.call is not None:
            found.add(dependant.call)
        for sub in dependant.dependencies:
            walk(sub)

    walk(route.dependant)
    return found


def _routes(router: Any) -> list[APIRoute]:
    return [route for route in router.routes if isinstance(route, APIRoute)]


def _sync_route_cases() -> list[tuple[str, str]]:
    cases: list[tuple[str, str]] = []
    for route in _routes(sync.router):
        for method in sorted((route.methods or set()) - {"HEAD", "OPTIONS"}):
            cases.append((method, SYNC_PREFIX + route.path.replace("{job_id}", "job-1")))
    return cases


def _admin_trigger_routes() -> list[APIRoute]:
    return [route for route in _routes(activity_module.router) if route.path.startswith("/admin/trigger")]


SYNC_ROUTE_CASES = _sync_route_cases()
ADMIN_TRIGGER_ROUTE_CASES = [
    (method, f"{API_PREFIX}{route.path}") for route in _admin_trigger_routes() for method in ["POST"]
]


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def settings():
    return get_settings()


@pytest.fixture
def admin_key(monkeypatch) -> str:
    monkeypatch.setattr(get_settings(), "admin_api_key", ADMIN_KEY)
    return ADMIN_KEY


@pytest.fixture
def app() -> FastAPI:
    return _build_app()


@pytest.fixture
async def guard_client(app: FastAPI):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ─────────────────────────────────────────────────────────────
# S-01a: require_admin_key on every /sync/* route
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_route_returns_503_when_admin_key_not_configured(monkeypatch, guard_client):
    """Unset ADMIN_API_KEY -> 503 and the endpoint stays closed."""
    monkeypatch.setattr(get_settings(), "admin_api_key", None)

    for method, path in [("POST", f"{SYNC_PREFIX}/sync/full"), ("GET", f"{SYNC_PREFIX}/sync/status/job-1")]:
        response = await _call(guard_client, method, path, headers={ADMIN_HEADER: ADMIN_KEY})
        assert response.status_code == 503, f"{method} {path} -> {response.status_code}"
        assert "ADMIN_API_KEY" in response.json()["detail"]


@pytest.mark.asyncio
async def test_sync_route_returns_503_when_admin_key_empty(monkeypatch, guard_client):
    monkeypatch.setattr(get_settings(), "admin_api_key", "")

    response = await guard_client.post(f"{SYNC_PREFIX}/sync/full", headers={ADMIN_HEADER: ADMIN_KEY})

    assert response.status_code == 503
    assert "ADMIN_API_KEY" in response.json()["detail"]


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="missing-header"),
        pytest.param({ADMIN_HEADER: ""}, id="blank-header"),
        pytest.param({ADMIN_HEADER: "   "}, id="whitespace-header"),
        pytest.param({ADMIN_HEADER: "wrong-key"}, id="wrong-key"),
        pytest.param({ADMIN_HEADER: ADMIN_KEY + "x"}, id="wrong-key-prefix"),
    ],
)
@pytest.mark.asyncio
async def test_sync_route_returns_401_without_valid_admin_key(admin_key, guard_client, headers):
    response = await guard_client.post(f"{SYNC_PREFIX}/sync/full", headers=headers)

    assert response.status_code == 401, f"headers={headers} -> {response.status_code}"
    assert ADMIN_HEADER in response.json()["detail"]


@pytest.mark.asyncio
async def test_sync_route_allows_request_with_valid_admin_key(admin_key, guard_client, monkeypatch):
    """Valid key -> the handler runs and enqueues the job."""
    monkeypatch.setattr(sync, "get_arq_redis", AsyncMock(return_value=_arq_redis_mock()))

    response = await guard_client.post(f"{SYNC_PREFIX}/sync/full", headers={ADMIN_HEADER: ADMIN_KEY})

    assert response.status_code == 200
    assert response.json()["job_id"] == "job-1"


@pytest.mark.parametrize("method,path", SYNC_ROUTE_CASES)
@pytest.mark.asyncio
async def test_every_sync_route_rejects_unauthenticated_requests(admin_key, guard_client, method, path):
    response = await _call(guard_client, method, path)

    assert response.status_code == 401, f"{method} {path} -> {response.status_code}"


@pytest.mark.parametrize("method,path", SYNC_ROUTE_CASES)
@pytest.mark.asyncio
async def test_every_sync_route_runs_with_valid_admin_key(admin_key, guard_client, monkeypatch, method, path):
    monkeypatch.setattr(sync, "get_arq_redis", AsyncMock(return_value=_arq_redis_mock()))
    monkeypatch.setattr(sync, "get_cache_service", lambda: _cache_service_mock())

    response = await _call(guard_client, method, path, headers={ADMIN_HEADER: ADMIN_KEY})

    assert response.status_code < 400, f"{method} {path} -> {response.status_code}"


def test_every_sync_route_declares_the_admin_guard():
    all_sync = _routes(sync.router)
    guarded = [route.path for route in all_sync if require_admin_key in _guard_callables(route)]

    assert all_sync, "expected the sync router to expose routes"
    assert sorted(guarded) == sorted(route.path for route in all_sync)


# ─────────────────────────────────────────────────────────────
# S-01a: require_admin_key on /admin/trigger/* (activity router)
# ─────────────────────────────────────────────────────────────


def test_every_admin_trigger_route_declares_the_admin_guard():
    admin_routes = _admin_trigger_routes()
    guarded = [route.path for route in admin_routes if require_admin_key in _guard_callables(route)]

    assert len(admin_routes) == 7, [route.path for route in admin_routes]
    assert sorted(guarded) == sorted(route.path for route in admin_routes)


def test_public_activity_reads_stay_open():
    """The admin guard must not leak onto the public read-only activity routes."""
    public_routes = [route for route in _routes(activity_module.router) if not route.path.startswith("/admin/")]

    assert public_routes
    assert all(require_admin_key not in _guard_callables(route) for route in public_routes)


@pytest.mark.parametrize("method,path", ADMIN_TRIGGER_ROUTE_CASES)
@pytest.mark.asyncio
async def test_admin_trigger_routes_reject_unauthenticated_requests(admin_key, guard_client, method, path):
    response = await _call(guard_client, method, path)

    assert response.status_code == 401, f"{method} {path} -> {response.status_code}"


@pytest.mark.parametrize("method,path", ADMIN_TRIGGER_ROUTE_CASES)
@pytest.mark.asyncio
async def test_admin_trigger_routes_run_with_valid_admin_key(admin_key, guard_client, monkeypatch, method, path):
    monkeypatch.setattr(activity_module, "get_arq_redis", AsyncMock(return_value=_arq_redis_mock()))

    response = await _call(guard_client, method, path, headers={ADMIN_HEADER: ADMIN_KEY})

    assert response.status_code == 200, f"{method} {path} -> {response.status_code}"


@pytest.mark.asyncio
async def test_admin_trigger_returns_503_when_admin_key_not_configured(monkeypatch, guard_client):
    monkeypatch.setattr(get_settings(), "admin_api_key", None)

    response = await guard_client.post(f"{API_PREFIX}/admin/trigger/aggregation", headers={ADMIN_HEADER: ADMIN_KEY})

    assert response.status_code == 503


# ─────────────────────────────────────────────────────────────
# S-01b: enforce_ai_rate_limit (dependency behaviour, called directly)
# ─────────────────────────────────────────────────────────────


def test_client_ip_prefers_first_forwarded_hop():
    request = _make_request({"X-Forwarded-For": "198.51.100.9, 70.41.3.18"}, client_host="10.0.0.5")

    assert deps.get_client_ip(request) == "198.51.100.9"


def test_client_ip_falls_back_to_peer_address():
    assert deps.get_client_ip(_make_request(client_host="10.0.0.5")) == "10.0.0.5"
    assert deps.get_client_ip(_make_request(client_host=None)) == "unknown"


@pytest.mark.asyncio
async def test_ai_limiter_allows_request_and_records_both_buckets(monkeypatch, settings):
    fake = FakeRedis()
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    allowed = await enforce_ai_rate_limit(_make_request())

    assert allowed is None
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert ("zadd", f"ai_rl:{FORWARDED_IP}") in fake.commands
    assert ("incr", f"ai_budget:{today}") in fake.commands
    assert fake.expirations[f"ai_budget:{today}"] == deps.AI_BUDGET_TTL_SECONDS == 48 * 60 * 60
    assert fake.expirations[f"ai_rl:{FORWARDED_IP}"] == deps.AI_RATE_LIMIT_WINDOW_SECONDS + 1
    assert fake.counters[f"ai_budget:{today}"] == 1


@pytest.mark.asyncio
async def test_ai_limiter_uses_forwarded_ip_for_the_bucket(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    await enforce_ai_rate_limit(_make_request({"X-Forwarded-For": "198.51.100.9, 70.41.3.18"}))

    assert ("zadd", "ai_rl:198.51.100.9") in fake.commands


@pytest.mark.asyncio
async def test_ai_limiter_returns_429_over_per_ip_window(monkeypatch, settings):
    monkeypatch.setattr(settings, "ai_rate_limit_requests", 2)
    fake = FakeRedis()
    now = time.time()
    fake.zsets[f"ai_rl:{FORWARDED_IP}"] = {f"entry-{i}": now - i for i in range(2)}
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    with pytest.raises(Exception) as exc_info:
        await enforce_ai_rate_limit(_make_request())

    assert exc_info.value.status_code == 429
    assert "Limit: 2 per 60 seconds" in exc_info.value.detail
    # A rejected request must not consume budget.
    assert not any(command in {"zadd", "incr"} for command, _ in fake.commands)


@pytest.mark.asyncio
async def test_ai_limiter_prunes_expired_window_entries(monkeypatch, settings):
    monkeypatch.setattr(settings, "ai_rate_limit_requests", 2)
    fake = FakeRedis()
    now = time.time()
    # One entry inside the window, one older than 60 s -> only the fresh one counts.
    fake.zsets[f"ai_rl:{FORWARDED_IP}"] = {"stale": now - 120, "fresh": now - 1}
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    assert await enforce_ai_rate_limit(_make_request()) is None


@pytest.mark.asyncio
async def test_ai_limiter_returns_429_over_global_daily_budget(monkeypatch, settings):
    monkeypatch.setattr(settings, "ai_daily_requests", 3)
    fake = FakeRedis()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fake.counters[f"ai_budget:{today}"] = 3
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    with pytest.raises(Exception) as exc_info:
        await enforce_ai_rate_limit(_make_request(client_host="198.51.100.77"))

    assert exc_info.value.status_code == 429
    assert "budget" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_ai_limiter_fails_closed_when_redis_unavailable(monkeypatch):
    async def _unavailable():
        raise ConnectionError("redis down")

    monkeypatch.setattr(deps, "get_redis", _unavailable)

    with pytest.raises(Exception) as exc_info:
        await enforce_ai_rate_limit(_make_request())

    assert exc_info.value.status_code == 503
    assert "unavailable" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_ai_limiter_fails_closed_when_redis_commands_fail(monkeypatch):
    monkeypatch.setattr(deps, "get_redis", _redis_provider(FakeRedis(fail=True)))

    with pytest.raises(Exception) as exc_info:
        await enforce_ai_rate_limit(_make_request())

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_ai_limiter_fails_closed_when_recording_usage_fails(monkeypatch):
    monkeypatch.setattr(deps, "get_redis", _redis_provider(FailOnZaddRedis()))

    with pytest.raises(Exception) as exc_info:
        await enforce_ai_rate_limit(_make_request())

    assert exc_info.value.status_code == 503


# ─────────────────────────────────────────────────────────────
# S-01b: the cost guard is applied to the LLM routes
# ─────────────────────────────────────────────────────────────


def test_every_llm_route_declares_the_cost_guard():
    guarded: set[str] = set()
    for router in (india.router, location_intelligence.router):
        for route in _routes(router):
            if enforce_ai_rate_limit in _guard_callables(route):
                guarded.add(route.path)

    assert guarded == {"/ask", "/ask/stream", "/search/semantic", "/trends/explain", "/enrich/{login}"}


@pytest.mark.parametrize("method,path,payload", GUARDED_AI_ROUTES)
@pytest.mark.asyncio
async def test_ai_routes_fail_closed_when_redis_is_down(guard_client, monkeypatch, method, path, payload):
    async def _unavailable():
        raise ConnectionError("redis down")

    monkeypatch.setattr(deps, "get_redis", _unavailable)

    response = await _call(guard_client, method, path, payload=payload)

    assert response.status_code == 503, f"{method} {path} -> {response.status_code}"


@pytest.mark.parametrize("method,path,payload", GUARDED_AI_ROUTES)
@pytest.mark.asyncio
async def test_ai_routes_return_429_when_bucket_exhausted(
    guard_client, monkeypatch, settings, method, path, payload
):
    monkeypatch.setattr(settings, "ai_rate_limit_requests", 1)
    fake = FakeRedis()
    now = time.time()
    fake.zsets[f"ai_rl:{FORWARDED_IP}"] = {"entry": now}
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    response = await _call(guard_client, method, path, payload=payload, headers={"X-Forwarded-For": FORWARDED_IP})

    assert response.status_code == 429, f"{method} {path} -> {response.status_code}"


@pytest.mark.asyncio
async def test_ai_guard_probe_allows_request_when_buckets_have_room(guard_client, monkeypatch, settings):
    fake = FakeRedis()
    monkeypatch.setattr(deps, "get_redis", _redis_provider(fake))

    response = await guard_client.post("/__probe__/ai-guard")

    assert response.status_code == 200
    assert response.json() == {"ok": "true"}
    assert any(command == "incr" for command, _ in fake.commands)


@pytest.mark.asyncio
async def test_ai_guard_rejects_before_the_database_dependency_is_solved(guard_client, monkeypatch, settings):
    """A rejected request never reaches ``get_db`` (which raises in this app)."""
    monkeypatch.setattr(settings, "ai_daily_requests", 0)

    response = await guard_client.post("/__probe__/ai-guard")

    assert response.status_code == 429


@pytest.mark.asyncio
async def test_admin_guard_probe_allows_request_with_valid_key(guard_client, admin_key):
    response = await guard_client.post("/__probe__/admin-guard", headers={ADMIN_HEADER: ADMIN_KEY})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_guard_probe_rejects_request_without_key(guard_client, admin_key):
    response = await guard_client.post("/__probe__/admin-guard")

    assert response.status_code == 401
