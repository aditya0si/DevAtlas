"""
Deprecation middleware for v1 API.

Adds Deprecation and Sunset headers to v1 responses.
Documents migration path to v2.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Sunset date for v1 API
V1_SUNSET_DATE = "Sat, 31 Mar 2027 00:00:00 GMT"
V1_DEPRECATED_SINCE = "Sat, 01 Jan 2026 00:00:00 GMT"


class DeprecationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add deprecation headers to v1 API responses.

    Headers added:
    - Deprecation: true
    - Sunset: <sunset_date>
    - Link: <v2_endpoint>; rel="successor-version"
    - X-API-Deprecated: 1
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Only apply to /api/v1/* routes (not /api/v2/*)
        if request.url.path.startswith("/api/v1") and not request.url.path.startswith("/api/v2"):
            response.headers["Deprecation"] = "true"
            response.headers["Sunset"] = V1_SUNSET_DATE
            response.headers["Link"] = '</api/v2>; rel="successor-version"'
            response.headers["X-API-Deprecated"] = "1"
            response.headers["X-API-Deprecated-Since"] = V1_DEPRECATED_SINCE

        return response
