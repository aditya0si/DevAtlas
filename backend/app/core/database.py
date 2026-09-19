from __future__ import annotations

import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine_kwargs = {
    # echo=True logs every statement AND its bound parameters. That is useful in development, but it
    # also writes credential material (bcrypt hashes from `users`, token hashes from
    # `refresh_tokens`) to stdout, so it is opt-out-able: set DB_ECHO=false to keep development
    # logging quiet. Production (environment != development) never echoes.
    "echo": (settings.environment == "development")
    and os.getenv("DB_ECHO", "true").strip().lower() not in {"0", "false", "no", "off"},
    "pool_pre_ping": True,
}
if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update({"pool_size": 5, "max_overflow": 10})

engine = create_async_engine(
    settings.database_url,
    **engine_kwargs,
)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
