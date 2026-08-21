from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.api.routes import api_router
from app.api.websocket_endpoints import router as websocket_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.logging import StructuredLoggingMiddleware, setup_logging
from app.core.metrics import MetricsMiddleware, metrics_endpoint
from app.core.redis import close_redis
from app.middleware.deprecation import DeprecationMiddleware
from app.middleware.rate_limit import RateLimitMiddleware

settings = get_settings()
logger = logging.getLogger(__name__)

setup_logging(level="DEBUG" if settings.environment == "development" else "INFO")


async def validate_database() -> str:
    """Check database connectivity. Returns status string."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return "healthy"
    except Exception as e:
        logger.critical("Database connection failed: %s", e)
        return f"unhealthy: {e}"


async def validate_redis() -> str:
    """Check Redis connectivity. Returns status string."""
    if not settings.redis_url:
        return "disabled"
    try:
        client = aioredis.from_url(settings.redis_url, socket_connect_timeout=3)
        await client.ping()
        await client.close()
        return "healthy"
    except Exception as e:
        logger.warning("Redis connection failed (rate limiting will degrade): %s", e)
        return f"unhealthy: {e}"


def validate_required_env() -> list[str]:
    """Check required environment variables. Returns list of missing vars."""
    missing = []
    if not settings.github_token:
        missing.append("GITHUB_TOKEN")
    if not settings.jwt_secret_key or settings.jwt_secret_key == "change-me":
        missing.append("JWT_SECRET_KEY")
    if settings.environment == "production":
        if not (settings.openai_api_key or settings.gemini_api_key or settings.groq_api_key):
            missing.append("OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY")
    return missing


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting DevAtlas API — environment=%s", settings.environment)

    # Startup validation
    db_status = await validate_database()
    redis_status = await validate_redis()
    missing_vars = validate_required_env()

    startup_ok = True
    if "unhealthy" in db_status:
        logger.critical("DATABASE UNHEALTHY: %s", db_status)
        startup_ok = False
    if "unhealthy" in redis_status:
        logger.warning("Redis check: %s", redis_status)
    if missing_vars:
        logger.warning("Missing required env vars: %s", ", ".join(missing_vars))

    if not startup_ok:
        logger.critical("Startup validation failed. API may not function correctly.")

    yield

    # Shutdown
    logger.info("Shutting down DevAtlas API")
    await close_redis()


app = FastAPI(title=settings.app_name, lifespan=lifespan, version="0.1.0")

# Add middlewares
app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(MetricsMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    requests=settings.rate_limit_requests,
    window=settings.rate_limit_window_seconds,
)
app.add_middleware(DeprecationMiddleware)

# Include API routes
app.include_router(api_router, prefix=settings.api_prefix)
app.include_router(websocket_router)

# Add metrics endpoint
app.add_route("/metrics", metrics_endpoint)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "running"}
