"""Bootstrap a fresh database for DevAtlas.

Why this exists
---------------
The alembic chain under ``alembic/versions/`` is **incremental only**: migration ``0001`` runs
``ALTER TABLE repositories ADD COLUMN geom …`` and no migration anywhere creates ``repositories``,
``github_users``, ``github_events`` or ``users``. On an empty database ``alembic upgrade head``
therefore fails immediately with::

    asyncpg.exceptions.UndefinedTableError: relation "repositories" does not exist
    [SQL: ALTER TABLE repositories ADD COLUMN geom geometry(POINT,4326)]

The base schema has always come from the SQLAlchemy models (the test suite calls
``Base.metadata.create_all`` directly, which is why CI never noticed). This script makes that
bootstrap explicit and repeatable:

1. ensure the ``postgis`` and ``vector`` extensions exist,
2. create every table/column defined by the models,
3. ``alembic stamp head`` so the migration chain is recorded as applied (existing databases that
   already ran the chain are untouched — ``create_all`` skips objects that exist and ``stamp`` only
   rewrites the version row).

Existing databases do NOT need this: keep using ``alembic upgrade head`` there.

Usage:
    DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db python -m scripts.init_db
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.models import *  # noqa: F401,F403,E402  (register every model on Base.metadata)


async def create_extensions(url: str) -> list[str]:
    """CREATE EXTENSION IF NOT EXISTS for the extensions the models depend on."""
    created: list[str] = []
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            for ext in ("postgis", "vector"):
                try:
                    await conn.execute(text(f"CREATE EXTENSION IF NOT EXISTS {ext}"))
                    created.append(ext)
                except Exception as exc:  # noqa: BLE001
                    print(f"  ! could not create extension {ext}: {exc}")
    finally:
        await engine.dispose()
    return created


async def create_schema(url: str) -> list[str]:
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with engine.connect() as conn:
            rows = await conn.execute(text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"
            ))
            return [r[0] for r in rows]
    finally:
        await engine.dispose()


def stamp_head() -> str:
    from alembic import command
    from alembic.config import Config

    backend = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    command.stamp(cfg, "head")
    return "head"


def main() -> int:
    settings = get_settings()
    url = settings.database_url
    safe = url.split("@")[-1] if "@" in url else url
    print(f"bootstrapping database: …@{safe}")

    exts = asyncio.run(create_extensions(url))
    print(f"  extensions ensured: {', '.join(exts) or 'none'}")

    tables = asyncio.run(create_schema(url))
    print(f"  tables present after create_all: {len(tables)}")
    print("   ", ", ".join(tables))

    if not tables:
        print("  ! no tables were created — check DATABASE_URL and the model imports")
        return 1

    rev = stamp_head()
    print(f"  alembic stamped: {rev}")
    print("done — a fresh database now matches the models and records the migration head.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
