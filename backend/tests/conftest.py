from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import *

from sqlalchemy import NullPool, text

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://devatlas:devatlas@db:5432/test_db",
)
engine = create_async_engine(TEST_DATABASE_URL, echo=True, poolclass=NullPool)
TestingSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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
    user = User(email="test@example.com", hashed_password=hash_password("testpass123"), full_name="Test User")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
