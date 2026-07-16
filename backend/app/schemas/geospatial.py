from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel  # noqa: E402  # noqa: E402  # noqa: E402


class GeoJSONPoint(BaseModel):
    type: str = "Point"
    coordinates: tuple[float, float]


class RegionStats(BaseModel):
    region_id: str
    name: str
    repository_count: int
    top_languages: list[str]
    activity_score: float
    center_latitude: float
    center_longitude: float


class DeveloperActivityResponse(BaseModel):
    latitude: float
    longitude: float
    activity_score: float
    repository_count: int
    top_languages: list[str]
    last_activity_at: Optional[datetime] = None
