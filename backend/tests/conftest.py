from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from uuid import uuid4

# The production rate limiter counts every request from one client IP, and the whole suite shares a
# single ASGI test client — so once the limiter genuinely throttles (S-02), the suite trips its own
# 60/min budget and hundreds of unrelated tests fail with 429. Per-test key cleanup is not reliable
# enough for that. Disable the *global* limit for the test process here, BEFORE app.main is imported
# (the middleware reads settings at construction), and let tests/test_rate_limit.py keep testing the
# limiter itself — it sets its own tiny limit and rebuilds the app for that purpose.
os.environ.setdefault("RATE_LIMIT_REQUESTS", "1000000")
os.environ.setdefault("AI_DAILY_REQUESTS", "1000000")
os.environ.setdefault("AI_RATE_LIMIT_REQUESTS", "1000000")

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import NullPool  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base, get_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://devatlas:devatlas@db:5432/test_db",
)
engine = create_async_engine(TEST_DATABASE_URL, echo=True, poolclass=NullPool)
TestingSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Resolved once per session by ``_check_redis`` so per-test limiter cleanup does
# not pay a connection timeout on every test when Redis is not running.
_redis_available: bool | None = None


@pytest_asyncio.fixture(scope="session")
async def _prepare_database() -> AsyncGenerator[None, None]:
    """Only runs for integration tests that need the database."""
    async with engine.begin() as conn:
        # Drop and recreate so the schema always matches the current models
        # (create_all alone does not alter pre-existing tables).
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def db(_prepare_database) -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def db_session(db: AsyncSession) -> AsyncGenerator[AsyncSession, None]:
    """Alias of ``db`` used by older test modules."""
    yield db


@pytest_asyncio.fixture(autouse=True)
async def _reset_cache_service():
    """Reset the Redis-backed cache singleton between tests.

    pytest-asyncio runs each test on a fresh event loop; the cache service
    caches its Redis client on the first loop it touches, so it must be torn
    down between tests to avoid "Event loop is closed" errors.
    """
    yield
    from app.core.cache import close_cache_service
    await close_cache_service()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _check_redis() -> AsyncGenerator[None, None]:
    """Detect once per session whether Redis is reachable."""
    global _redis_available
    from app.core.config import get_settings

    settings = get_settings()
    if settings.redis_url:
        import redis.asyncio as aioredis

        redis_client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        try:
            await redis_client.ping()
            _redis_available = True
        except Exception:
            _redis_available = False
        finally:
            await redis_client.close()
    else:
        _redis_available = False
    yield


@pytest_asyncio.fixture(autouse=True)
async def _reset_rate_limiter() -> AsyncGenerator[None, None]:
    """Clear the Redis-backed rate limiter between tests.

    Redis is available in CI, so the production rate limiter counts every
    request issued through the shared test client. The tests are independent,
    so a suite must not inherit another test's request budget. Only the
    limiter's own keys are removed; production limits are left untouched.

    ``app.core.redis`` caches its client per event loop (see that module), so
    this also works when the previous test ran on a different loop.
    """
    if _redis_available:
        try:
            from app.core.redis import get_redis

            redis_client = await get_redis()
            keys = await redis_client.keys("rate_limit:*")
            if keys:
                await redis_client.delete(*keys)
        except Exception:
            # The middleware fails open when Redis is unreachable, so there is
            # nothing to reset.
            pass
    yield


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    # The integration schema is not rolled back between tests and users.email is
    # unique, so every test that requests this fixture gets its own account.
    user = User(
        email=f"test-{uuid4()}@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Test User",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
