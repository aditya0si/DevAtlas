from __future__ import annotations

import logging

import redis.asyncio as aioredis
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import engine
from app.schemas.health import HealthResponse

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    db_status = "healthy"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.warning("Health check — DB unhealthy: %s", e)
        db_status = f"unhealthy: {e}"

    redis_status = "disabled"
    if settings.redis_url:
        try:
            client = aioredis.from_url(settings.redis_url, socket_connect_timeout=3)
            await client.ping()
            await client.close()
            redis_status = "healthy"
        except Exception as e:
            logger.warning("Health check — Redis unhealthy: %s", e)
            redis_status = f"unhealthy: {e}"

    return HealthResponse(
        status="healthy" if db_status == "healthy" else "degraded",
        service=settings.app_name,
        version="0.1.0",
        database=db_status,
        redis=redis_status,
    )
