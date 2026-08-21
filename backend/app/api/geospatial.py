from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_cache_service
from app.core.config import get_settings
from app.schemas.geospatial import GeoJSONFeature, GeoJSONFeatureCollection

settings = get_settings()

router = APIRouter()

VALID_DOMAINS = (
    "ai", "cybersecurity", "healthcare", "robotics",
    "web", "mobile", "devops", "blockchain", "opensource",
)
VALID_TIME_RANGES = ("week", "month", "quarter", "year")

DOMAIN_PATTERNS = {
    "ai": "%ai%",
    "cybersecurity": "%cybersecurity%",
    "healthcare": "%healthcare%",
    "robotics": "%robotics%",
    "web": "%web%",
    "mobile": "%mobile%",
    "devops": "%devops%",
    "blockchain": "%blockchain%",
    "opensource": "%opensource%",
}

TIME_INTERVALS = {
    "week": "7 days",
    "month": "30 days",
    "quarter": "90 days",
    "year": "365 days",
}


def _compute_activity_scores(rows) -> list[float]:
    """Compute 0-100 activity scores from real stored activity.

    Rows must expose ``push_count``, ``dev_count`` and ``stargazers_count``.
    When a row has push activity, the score is 70% push activity + 30%
    developer presence (normalized). When no activity data exists, fall back
    to stars normalized to 0-100.
    """
    max_push = max((row.push_count for row in rows), default=0)
    max_dev = max((row.dev_count for row in rows), default=0)
    max_stars = max((row.stargazers_count for row in rows), default=0)

    scores = []
    for row in rows:
        if row.push_count > 0:
            push_norm = (row.push_count / max_push * 100) if max_push > 0 else 0
            dev_norm = (row.dev_count / max_dev * 100) if max_dev > 0 else 0
            scores.append(round(push_norm * 0.7 + dev_norm * 0.3, 2))
        else:
            scores.append(round((row.stargazers_count / max_stars * 100), 2) if max_stars > 0 else 0.0)
    return scores


@router.get("/activity", response_model=GeoJSONFeatureCollection)
async def get_developer_activity(
    db: AsyncSession = Depends(get_db),
    bbox: str = Query(..., description="Bounding box: minLon,minLat,maxLon,maxLat"),
    limit: int = Query(default=1000, le=5000),
    domain: Optional[str] = Query(
        default=None,
        pattern="^(ai|cybersecurity|healthcare|robotics|web|mobile|devops|blockchain|opensource)$",
        description="Filter by domain: ai, cybersecurity, healthcare, robotics, web, mobile, devops, blockchain, opensource",
    ),
    time_range: Optional[str] = Query(
        default=None,
        pattern="^(week|month|quarter|year)$",
        description="Time range: week, month, quarter, year",
    ),
    year: Optional[int] = Query(
        default=None,
        ge=2008,
        le=2100,
        description="Historical year filter applied to repository created_at (e.g. 2024)",
    ),
) -> GeoJSONFeatureCollection:
    cache = get_cache_service()

    # Try cache first (include domain, time_range and year in cache key)
    cache_key_suffix = f"{domain or 'all'}_{time_range or 'all'}_{year or 'all'}_geojson"
    cached = await cache.get_geospatial_activity(f"{bbox}_{cache_key_suffix}", limit)
    if cached is not None:
        return GeoJSONFeatureCollection(**cached)

    try:
        min_lon, min_lat, max_lon, max_lat = [float(part) for part in bbox.split(",")]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid bbox format") from exc

    # Minimum confidence to include in geospatial queries
    min_confidence = getattr(settings, "location_min_confidence", 40)

    domain_pattern = DOMAIN_PATTERNS.get(domain) if domain else None
    time_interval = TIME_INTERVALS.get(time_range) if time_range else None

    year_start = None
    year_end = None
    if year is not None:
        year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
        year_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    query = text(f"""
        SELECT
            r.id,
            r.name,
            r.language,
            r.classification,
            r.stargazers_count,
            COALESCE(ev.push_count, 0) AS push_count,
            COALESCE(ev.dev_count, 0) AS dev_count,
            ROUND(ST_Y(COALESCE(gu.geom, r.geom))::numeric, 4) AS latitude,
            ROUND(ST_X(COALESCE(gu.geom, r.geom))::numeric, 4) AS longitude
        FROM repositories r
        LEFT JOIN github_users gu ON r.github_user_login = gu.login
        LEFT JOIN (
            SELECT repository_id, COUNT(*) AS push_count, COUNT(DISTINCT actor_login) AS dev_count
            FROM github_events
            WHERE event_type = 'PushEvent'
              AND (CAST(:year_start AS timestamptz) IS NULL OR created_at >= CAST(:year_start AS timestamptz))
              AND (CAST(:year_end AS timestamptz) IS NULL OR created_at < CAST(:year_end AS timestamptz))
              AND (CAST(:time_interval AS text) IS NULL OR created_at >= NOW() - CAST(:time_interval AS INTERVAL))
            GROUP BY repository_id
        ) ev ON ev.repository_id = r.id
        WHERE (gu.confidence_score >= :min_confidence OR gu.confidence_score IS NULL)
          AND COALESCE(gu.geom, r.geom) && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
          AND (CAST(:domain AS text) IS NULL OR CAST(classification->>'domain' AS text) ILIKE CAST(:domain AS text))
          AND (CAST(:time_interval AS text) IS NULL OR r.created_at >= NOW() - CAST(:time_interval AS INTERVAL))
          AND (CAST(:year_start AS timestamptz) IS NULL OR r.created_at >= CAST(:year_start AS timestamptz))
          AND (CAST(:year_end AS timestamptz) IS NULL OR r.created_at < CAST(:year_end AS timestamptz))
        ORDER BY r.stargazers_count DESC
        LIMIT :limit
    """)

    result = await db.execute(
        query,
        {
            "min_lon": min_lon,
            "min_lat": min_lat,
            "max_lon": max_lon,
            "max_lat": max_lat,
            "limit": limit,
            "min_confidence": min_confidence,
            "domain": domain_pattern,
            "time_interval": time_interval,
            "year_start": year_start,
            "year_end": year_end,
        },
    )
    rows = result.fetchall()

    # Normalization maxima for activity_score (real stored activity first, stars fallback)
    activity_scores = _compute_activity_scores(rows)

    features = []
    for row, activity_score in zip(rows, activity_scores):
        features.append(GeoJSONFeature(
            type="Feature",
            geometry={"type": "Point", "coordinates": [row.longitude, row.latitude]},
            properties={
                "id": row.id,
                "name": row.name,
                "language": row.language,
                "activity_score": activity_score,
                "classification": row.classification
            }
        ))

    response = GeoJSONFeatureCollection(type="FeatureCollection", features=features)

    # Cache the response
    await cache.set_geospatial_activity(
        response.model_dump(mode="json"),
        f"{bbox}_{cache_key_suffix}",
        limit,
    )

    return response
