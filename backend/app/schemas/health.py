from __future__ import annotations

from pydantic import BaseModel  # noqa: E402  # noqa: E402  # noqa: E402


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str = "unknown"
    redis: str = "unknown"
