from __future__ import annotations

import logging
import sys
import time
import uuid
from contextvars import ContextVar

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Context variable for request ID
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    return request_id_ctx.get()


class RequestIDFilter(logging.Filter):
    """Add request_id to log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True


def setup_logging(level: str = "INFO") -> None:
    """Configure structured logging for the application."""
    log_format = (
        '{"time": "%(asctime)s", "level": "%(levelname)s", '
        '"logger": "%(name)s", "request_id": "%(request_id)s", '
        '"message": "%(message)s"}'
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(log_format))
    handler.addFilter(RequestIDFilter())

    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    root_logger.handlers = [handler]

    # Third party loggers - reduce noise
    for logger_name in ["uvicorn", "uvicorn.access", "httpx", "httpcore"]:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.WARNING)


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for structured request logging."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_ctx.set(request_id)

        # Add request ID to response headers
        start_time = time.time()

        response = await call_next(request)

        # Log request
        duration_ms = (time.time() - start_time) * 1000

        logger = logging.getLogger("uvicorn.access")
        logger.info(
            f'{request.method} {request.url.path} {response.status_code} {duration_ms:.2f}ms',
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client_ip": request.client.host if request.client else None,
            }
        )

        response.headers["X-Request-ID"] = request_id
        return response
