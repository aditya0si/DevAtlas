from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_cache_service
from app.core.config import get_settings
from pydantic import BaseModel, Field

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: dict

class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]

settings = get_settings()

router = APIRouter()


@router.get("/activity", response_model=GeoJSONFeatureCollection)
async def get_developer_activity(
    db: AsyncSession = Depends(get_db),
    bbox: str = Query(..., description="Bounding box: minLon,minLat,maxLon,maxLat"),
    limit: int = Query(default=1000, le=5000),
    domain: Optional[str] = Query(default=None, description="Filter by domain: ai, cybersecurity, healthcare, robotics, web, mobile, devops, blockchain, opensource"),
    time_range: Optional[str] = Query(default=None, description="Time range: week, month, quarter, year"),
) -> GeoJSONFeatureCollection:
    cache = get_cache_service()

    # Try cache first (include domain and time_range in cache key)
    cache_key_suffix = f"{domain or 'all'}_{time_range or 'all'}_geojson"
    cached = await cache.get_geospatial_activity(f"{bbox}_{cache_key_suffix}", limit)
    if cached is not None:
        return GeoJSONFeatureCollection(**cached)

    try:
        min_lon, min_lat, max_lon, max_lat = [float(part) for part in bbox.split(",")]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid bbox format") from exc

    # Minimum confidence to include in geospatial queries
    min_confidence = getattr(settings, "location_min_confidence", 40)

    query = text(f"""
        SELECT
            r.id,
            r.name,
            r.language,
            r.classification,
            r.stargazers_count,
            ROUND(ST_Y(COALESCE(gu.geom, r.geom))::numeric, 4) AS latitude,
            ROUND(ST_X(COALESCE(gu.geom, r.geom))::numeric, 4) AS longitude
        FROM repositories r
        LEFT JOIN github_users gu ON r.github_user_login = gu.login
        WHERE (gu.confidence_score >= :min_confidence OR gu.confidence_score IS NULL)
          AND COALESCE(gu.geom, r.geom) && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
          AND (:domain IS NULL OR CAST(classification->>'domain' AS text) ILIKE :domain)
          AND (:time_interval IS NULL OR created_at >= NOW() - CAST(:time_interval AS INTERVAL))
        ORDER BY r.stargazers_count DESC
        LIMIT :limit
    """)

    # Domain pattern matching
    domain_pattern = None
    if domain:
        domain_mapping = {
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
        domain_pattern = domain_mapping.get(domain)

    # Time interval pattern matching
    time_interval = None
    if time_range:
        time_mapping = {
            "week": "7 days",
            "month": "30 days",
            "quarter": "90 days",
            "year": "365 days",
        }
        time_interval = time_mapping.get(time_range)

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
        },
    )
    rows = result.fetchall()
    
    features = []
    for row in rows:
        features.append(GeoJSONFeature(
            type="Feature",
            geometry={"type": "Point", "coordinates": [row.longitude, row.latitude]},
            properties={
                "id": row.id,
                "name": row.name,
                "language": row.language,
                "activity_score": float(row.stargazers_count),
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
