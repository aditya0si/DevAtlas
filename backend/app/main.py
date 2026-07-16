from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.api.websocket_endpoints import router as websocket_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.logging import StructuredLoggingMiddleware, setup_logging
from app.core.metrics import MetricsMiddleware, metrics_endpoint
from app.core.redis import close_redis
from app.middleware.deprecation import DeprecationMiddleware
from app.middleware.rate_limit import (
    RateLimitMiddleware,  # noqa: E402  # noqa: E402  # noqa: E402
)
from app.models import Base

settings = get_settings()

# Setup structured logging
setup_logging(level=settings.environment == "development" and "DEBUG" or "INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await close_redis()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

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
app.add_middleware(RateLimitMiddleware, requests=settings.rate_limit_requests, window=settings.rate_limit_window_seconds)
app.add_middleware(DeprecationMiddleware)

# Include API routes
app.include_router(api_router, prefix=settings.api_prefix)
app.include_router(websocket_router)

# Add metrics endpoint
app.add_route("/metrics", metrics_endpoint)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "running"}
