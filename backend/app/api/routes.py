from __future__ import annotations

from fastapi import APIRouter

from app.api import (  # noqa: E402  # noqa: E402  # noqa: E402
    auth,
    events,
    geospatial,
    health,
    india,
    location_intelligence,
    repositories,
    sync,
    v2,
    websocket_endpoints,
    analytics,
    observability,
    activity,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(repositories.router, prefix="/repositories", tags=["repositories"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(geospatial.router, prefix="/geospatial", tags=["geospatial"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(india.router, prefix="/india", tags=["india"])
api_router.include_router(location_intelligence.router, prefix="/location-intelligence", tags=["location-intelligence"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(observability.router, prefix="/observability", tags=["observability"])
api_router.include_router(activity.router, tags=["activity"])
api_router.include_router(v2.router)  # /v2 prefix is in v2.py
