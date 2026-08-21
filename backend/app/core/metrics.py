from __future__ import annotations

import time
from typing import Callable

from fastapi import Request, Response
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Match

# Metrics definitions
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

ACTIVE_REQUESTS = Gauge(
    "http_requests_active",
    "Number of active HTTP requests",
)

# Database metrics
DB_QUERY_COUNT = Counter(
    "db_queries_total",
    "Total database queries",
    ["operation"],
)

DB_QUERY_LATENCY = Histogram(
    "db_query_duration_seconds",
    "Database query latency",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

# GitHub API metrics
GITHUB_API_COUNT = Counter(
    "github_api_requests_total",
    "Total GitHub API requests",
    ["endpoint", "status_code"],
)

GITHUB_API_LATENCY = Histogram(
    "github_api_duration_seconds",
    "GitHub API request latency",
    ["endpoint"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Redis metrics
REDIS_OPERATIONS = Counter(
    "redis_operations_total",
    "Total Redis operations",
    ["operation"],
)

# AI provider metrics
AI_REQUESTS = Counter(
    "ai_requests_total",
    "Total AI provider requests",
    ["provider", "operation", "model"],
)

AI_TOKENS = Counter(
    "ai_tokens_total",
    "Total AI tokens used",
    ["provider", "operation", "model"],
)

AI_COST = Counter(
    "ai_cost_cents_total",
    "Total estimated AI cost in cents",
    ["provider", "operation", "model"],
)

AI_LATENCY = Histogram(
    "ai_request_duration_seconds",
    "AI request latency",
    ["provider", "operation"],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0],
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect Prometheus metrics."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics endpoint itself
        if request.url.path == "/metrics":
            return await call_next(request)
        
        endpoint = request.url.path
        for r in request.app.routes:
            match_result, match_scope = r.matches(request.scope)
            if match_result == Match.FULL:
                endpoint = getattr(r, "path", endpoint)
                break
        method = request.method
        
        ACTIVE_REQUESTS.inc()
        start_time = time.time()
        
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            ACTIVE_REQUESTS.dec()
            duration = time.time() - start_time
            
            REQUEST_COUNT.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code,
            ).inc()
            
            REQUEST_LATENCY.labels(
                method=method,
                endpoint=endpoint,
            ).observe(duration)
        
        return response


async def metrics_endpoint(request: Request) -> Response:
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
