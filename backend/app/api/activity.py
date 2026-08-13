"""DevAtlas Activity Intelligence API.

Serves precomputed developer activity, ecosystem scores, heatmap data,
domain statistics, growth metrics, and administrative triggers.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from arq import ArqRedis
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.cache import get_cache_service
from app.core.config import get_settings
from app.models.github import (
    GitHubEvent, GitHubUser, Repository, ActivityScore, EcosystemScore,
    DailyAggregation, HourlyAggregation,
)
from app.schemas.geospatial import GeoJSONFeature, GeoJSONFeatureCollection

router = APIRouter()
settings = get_settings()


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class ActivityScoreResponse(BaseModel):
    entity_type: str
    entity_key: str
    entity_name: Optional[str]
    activity_score: float
    push_activity: float
    developer_presence: float
    repository_diversity: float
    period_start: Optional[str]
    period_end: Optional[str]


class EcosystemScoreResponse(BaseModel):
    entity_type: str
    entity_key: str
    entity_name: Optional[str]
    ecosystem_score: float
    developer_activity_score: float
    developer_count: float
    technology_diversity: float
    domain_diversity: float
    growth_rate: float
    rank: int
    period_start: Optional[str]
    period_end: Optional[str]


class DomainStatsResponse(BaseModel):
    domain: str
    push_events: int
    unique_developers: int
    unique_repositories: int


class GrowthMetricsResponse(BaseModel):
    daily_activity: list[dict[str, str | int | float]]
    weekly_growth_percent: float
    monthly_growth_percent: float
    year_over_year_growth_percent: float


class CoverageStatsResponse(BaseModel):
    users_total: int
    users_enriched: int
    users_with_location: int
    events_total: int
    events_enriched: int
    repos_total: int
    repos_with_events: int
    avg_geocoding_confidence: float
    cache_hit_ratio: Optional[float] = None


async def get_arq_redis() -> ArqRedis:
    return ArqRedis.from_url(settings.redis_url or "redis://localhost:6379/0")


# ─────────────────────────────────────────────────────────────
# Activity Heatmap (Multi-Layer)
# ─────────────────────────────────────────────────────────────

ACTIVITY_LAYERS = [
    "developer_presence",
    "development_activity",
    "ai", "cybersecurity", "healthcare", "robotics",
    "cloud", "devops", "web", "mobile", "fintech", "developer_tools",
]

LAYER_COLORS = {
    "developer_presence": "#3B82F6",
    "development_activity": "#8B5CF6",
    "ai": "#10B981",
    "cybersecurity": "#EF4444",
    "healthcare": "#F59E0B",
    "robotics": "#6366F1",
    "cloud": "#06B6D4",
    "devops": "#F97316",
    "web": "#EC4899",
    "mobile": "#14B8A6",
    "fintech": "#84CC16",
    "developer_tools": "#A855F7",
}

TIME_WINDOWS = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "12m": timedelta(days=365),
}


@router.get("/heatmap", response_model=GeoJSONFeatureCollection)
async def get_activity_heatmap(
    db: AsyncSession = Depends(get_db),
    bbox: str = Query(default="-180,-90,180,90", description="Bounding box: minLon,minLat,maxLon,maxLat"),
    layer: str = Query(
        default="development_activity",
        description="Map layer: developer_presence, development_activity, or domain name",
        pattern="^(developer_presence|development_activity|ai|cybersecurity|healthcare|robotics|cloud|devops|web|mobile|fintech|developer_tools)$",
    ),
    time_range: str = Query(default="30d", description="Time window: 24h, 7d, 30d, 12m"),
    limit: int = Query(default=2000, le=10000),
) -> GeoJSONFeatureCollection:
    """Activity heatmap endpoint supporting multiple GIS layers.

    Layers:
    - developer_presence: Unique developers by location (blue)
    - development_activity: PushEvent intensity by location (purple, default)
    - Domain overlays: ai, cybersecurity, healthcare, robotics, cloud, devops, web, mobile, fintech, developer_tools
    """
    cache = get_cache_service()
    cache_key = f"activity_heatmap:{layer}:{time_range}:{bbox}:{limit}"
    cached = await cache.get(cache_key)
    if cached is not None:
        return GeoJSONFeatureCollection(**cached)

    try:
        min_lon, min_lat, max_lon, max_lat = [float(p) for p in bbox.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid bbox format")

    window = TIME_WINDOWS.get(time_range, TIME_WINDOWS["30d"])
    start_date = datetime.now(timezone.utc) - window

    features = await _build_heatmap_features(
        db, layer, start_date, min_lon, min_lat, max_lon, max_lat, limit
    )

    response = GeoJSONFeatureCollection(type="FeatureCollection", features=features)
    await cache.set(cache_key, response.model_dump(mode="json"), ttl=120)
    return response


async def _build_heatmap_features(
    db: AsyncSession, layer: str, start_date: datetime,
    min_lon: float, min_lat: float, max_lon: float, max_lat: float,
    limit: int,
) -> list[GeoJSONFeature]:
    """Build GeoJSON features for a heatmap layer."""

    if layer == "developer_presence":
        return await _developer_presence_layer(db, start_date, min_lon, min_lat, max_lon, max_lat, limit)

    if layer in LAYER_COLORS and layer not in ["developer_presence", "development_activity"]:
        return await _domain_layer(db, layer, start_date, min_lon, min_lat, max_lon, max_lat, limit)

    # Default: development_activity layer
    return await _development_activity_layer(db, start_date, min_lon, min_lat, max_lon, max_lat, limit)


async def _developer_presence_layer(
    db, start_date, min_lon, min_lat, max_lon, max_lat, limit
) -> list[GeoJSONFeature]:
    """Developer presence: count unique developers per location cluster."""
    query = text("""
        SELECT
            gu.latitude,
            gu.longitude,
            gu.city,
            gu.state,
            COUNT(DISTINCT ge.actor_login) AS developer_count
        FROM github_events ge
        JOIN github_users gu ON ge.actor_login = gu.login
        WHERE ge.event_type = 'PushEvent'
          AND ge.created_at >= :start_date
          AND gu.latitude IS NOT NULL
          AND gu.longitude IS NOT NULL
          AND gu.latitude BETWEEN :min_lat AND :max_lat
          AND gu.longitude BETWEEN :min_lon AND :max_lon
        GROUP BY gu.latitude, gu.longitude, gu.city, gu.state
        ORDER BY developer_count DESC
        LIMIT :limit
    """)
    result = await db.execute(query, {
        "start_date": start_date, "limit": limit,
        "min_lon": min_lon, "min_lat": min_lat,
        "max_lon": max_lon, "max_lat": max_lat,
    })
    rows = result.fetchall()
    color = LAYER_COLORS["developer_presence"]
    return [
        GeoJSONFeature(
            type="Feature",
            geometry={"type": "Point", "coordinates": [row[1], row[0]]},
            properties={
                "developer_count": row[4],
                "city": row[2],
                "state": row[3],
                "layer": "developer_presence",
                "color": color,
            },
        )
        for row in rows if row[1] is not None and row[0] is not None
    ]


async def _development_activity_layer(
    db, start_date, min_lon, min_lat, max_lon, max_lat, limit
) -> list[GeoJSONFeature]:
    """Development activity: PushEvent intensity per location cluster."""
    query = text("""
        SELECT
            gu.latitude,
            gu.longitude,
            gu.city,
            gu.state,
            COUNT(ge.id) AS push_count,
            COUNT(DISTINCT ge.actor_login) AS developer_count,
            COUNT(DISTINCT ge.repo_id) AS repo_count
        FROM github_events ge
        JOIN github_users gu ON ge.actor_login = gu.login
        WHERE ge.event_type = 'PushEvent'
          AND ge.created_at >= :start_date
          AND gu.latitude IS NOT NULL
          AND gu.longitude IS NOT NULL
          AND gu.latitude BETWEEN :min_lat AND :max_lat
          AND gu.longitude BETWEEN :min_lon AND :max_lon
        GROUP BY gu.latitude, gu.longitude, gu.city, gu.state
        ORDER BY push_count DESC
        LIMIT :limit
    """)
    result = await db.execute(query, {
        "start_date": start_date, "limit": limit,
        "min_lon": min_lon, "min_lat": min_lat,
        "max_lon": max_lon, "max_lat": max_lat,
    })
    rows = result.fetchall()
    color = LAYER_COLORS["development_activity"]
    return [
        GeoJSONFeature(
            type="Feature",
            geometry={"type": "Point", "coordinates": [row[1], row[0]]},
            properties={
                "push_events": row[4],
                "developer_count": row[5],
                "repo_count": row[6],
                "city": row[2],
                "state": row[3],
                "layer": "development_activity",
                "color": color,
            },
        )
        for row in rows if row[1] is not None and row[0] is not None
    ]


async def _domain_layer(
    db, domain: str, start_date, min_lon, min_lat, max_lon, max_lat, limit
) -> list[GeoJSONFeature]:
    """Domain overlay: PushEvent intensity filtered by domain."""
    query = text("""
        SELECT
            gu.latitude,
            gu.longitude,
            gu.city,
            gu.state,
            COUNT(ge.id) AS push_count,
            COUNT(DISTINCT ge.actor_login) AS developer_count
        FROM github_events ge
        JOIN github_users gu ON ge.actor_login = gu.login
        WHERE ge.event_type = 'PushEvent'
          AND ge.created_at >= :start_date
          AND ge.domain ILIKE :domain_pattern
          AND gu.latitude IS NOT NULL
          AND gu.longitude IS NOT NULL
          AND gu.latitude BETWEEN :min_lat AND :max_lat
          AND gu.longitude BETWEEN :min_lon AND :max_lon
        GROUP BY gu.latitude, gu.longitude, gu.city, gu.state
        ORDER BY push_count DESC
        LIMIT :limit
    """)
    result = await db.execute(query, {
        "start_date": start_date, "domain_pattern": f"%{domain}%", "limit": limit,
        "min_lon": min_lon, "min_lat": min_lat,
        "max_lon": max_lon, "max_lat": max_lat,
    })
    rows = result.fetchall()
    color = LAYER_COLORS.get(domain, "#6B7280")
    return [
        GeoJSONFeature(
            type="Feature",
            geometry={"type": "Point", "coordinates": [row[1], row[0]]},
            properties={
                "push_events": row[4],
                "developer_count": row[5],
                "city": row[2],
                "state": row[3],
                "domain": domain,
                "layer": domain,
                "color": color,
            },
        )
        for row in rows if row[1] is not None and row[0] is not None
    ]


# ─────────────────────────────────────────────────────────────
# Activity Scores & Rankings
# ─────────────────────────────────────────────────────────────

@router.get("/scores/states", response_model=list[ActivityScoreResponse])
async def get_state_activity_scores(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100),
    period: str = Query(default="30d"),
) -> list[ActivityScoreResponse]:
    """Get state rankings by Developer Activity Score."""
    end = datetime.now(timezone.utc)
    window = TIME_WINDOWS.get(period, TIME_WINDOWS["30d"])
    start = end - window

    result = await db.execute(
        select(ActivityScore)
        .where(
            ActivityScore.entity_type == "state",
            ActivityScore.period_start >= start,
            ActivityScore.period_end <= end,
        )
        .order_by(ActivityScore.activity_score.desc())
        .limit(limit)
    )
    return [
        ActivityScoreResponse(
            entity_type=s.entity_type,
            entity_key=s.entity_key,
            entity_name=s.entity_name,
            activity_score=s.activity_score,
            push_activity=s.push_activity,
            developer_presence=s.developer_presence,
            repository_diversity=s.repository_diversity,
            period_start=s.period_start.isoformat() if s.period_start else None,
            period_end=s.period_end.isoformat() if s.period_end else None,
        )
        for s in result.scalars().all()
    ]


@router.get("/scores/cities", response_model=list[ActivityScoreResponse])
async def get_city_activity_scores(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100),
    period: str = Query(default="30d"),
) -> list[ActivityScoreResponse]:
    """Get city rankings by Developer Activity Score."""
    end = datetime.now(timezone.utc)
    window = TIME_WINDOWS.get(period, TIME_WINDOWS["30d"])
    start = end - window

    result = await db.execute(
        select(ActivityScore)
        .where(
            ActivityScore.entity_type == "city",
            ActivityScore.period_start >= start,
            ActivityScore.period_end <= end,
        )
        .order_by(ActivityScore.activity_score.desc())
        .limit(limit)
    )
    return [
        ActivityScoreResponse(
            entity_type=s.entity_type,
            entity_key=s.entity_key,
            entity_name=s.entity_name,
            activity_score=s.activity_score,
            push_activity=s.push_activity,
            developer_presence=s.developer_presence,
            repository_diversity=s.repository_diversity,
            period_start=s.period_start.isoformat() if s.period_start else None,
            period_end=s.period_end.isoformat() if s.period_end else None,
        )
        for s in result.scalars().all()
    ]


# ─────────────────────────────────────────────────────────────
# Ecosystem Scores & Rankings
# ─────────────────────────────────────────────────────────────

@router.get("/ecosystem/scores", response_model=list[EcosystemScoreResponse])
async def get_ecosystem_scores(
    db: AsyncSession = Depends(get_db),
    entity_type: str = Query(default="state", description="state or city"),
    limit: int = Query(default=20, le=100),
    period: str = Query(default="30d"),
) -> list[EcosystemScoreResponse]:
    """Get ecosystem health scores and rankings."""
    end = datetime.now(timezone.utc)
    window = TIME_WINDOWS.get(period, TIME_WINDOWS["30d"])
    start = end - window

    result = await db.execute(
        select(EcosystemScore)
        .where(
            EcosystemScore.entity_type == entity_type,
            EcosystemScore.period_start >= start,
            EcosystemScore.period_end <= end,
        )
        .order_by(EcosystemScore.rank.asc())
        .limit(limit)
    )
    return [
        EcosystemScoreResponse(
            entity_type=s.entity_type,
            entity_key=s.entity_key,
            entity_name=s.entity_name,
            ecosystem_score=s.ecosystem_score,
            developer_activity_score=s.developer_activity_score,
            developer_count=s.developer_count,
            technology_diversity=s.technology_diversity,
            domain_diversity=s.domain_diversity,
            growth_rate=s.growth_rate,
            rank=s.rank,
            period_start=s.period_start.isoformat() if s.period_start else None,
            period_end=s.period_end.isoformat() if s.period_end else None,
        )
        for s in result.scalars().all()
    ]


# ─────────────────────────────────────────────────────────────
# Domain Statistics
# ─────────────────────────────────────────────────────────────

@router.get("/domains/stats", response_model=list[DomainStatsResponse])
async def get_domain_statistics(
    db: AsyncSession = Depends(get_db),
    period: str = Query(default="30d"),
    limit: int = Query(default=20, le=100),
) -> list[DomainStatsResponse]:
    """Get PushEvent statistics by domain.

    Uses the enriched ``GitHubEvent.domain`` when available, falling back to the
    repository's ``classification->>'domain'`` so domain stats remain populated
    even when event enrichment has not run yet.
    """
    end = datetime.now(timezone.utc)
    window = TIME_WINDOWS.get(period, TIME_WINDOWS["30d"])
    start = end - window

    domain_expr = func.coalesce(
        func.nullif(GitHubEvent.domain, ""),
        Repository.classification.op("->>")("domain"),
    )
    result = await db.execute(
        select(
            domain_expr.label("domain"),
            func.count(GitHubEvent.id).label("push_count"),
            func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
            func.count(func.distinct(GitHubEvent.repo_id)).label("repo_count"),
        )
        .outerjoin(Repository, GitHubEvent.repository_id == Repository.id)
        .where(
            GitHubEvent.event_type == "PushEvent",
            GitHubEvent.created_at >= start,
            domain_expr.isnot(None),
            domain_expr != "",
        )
        .group_by(domain_expr)
        .order_by(func.count(GitHubEvent.id).desc())
        .limit(limit)
    )
    return [
        DomainStatsResponse(
            domain=row[0] or "unknown",
            push_events=row[1],
            unique_developers=row[2],
            unique_repositories=row[3],
        )
        for row in result.all()
    ]


@router.get("/languages/stats", response_model=list[dict])
async def get_language_statistics(
    db: AsyncSession = Depends(get_db),
    period: str = Query(default="30d"),
    limit: int = Query(default=20, le=100),
) -> list[dict]:
    """Get PushEvent statistics by programming language."""
    end = datetime.now(timezone.utc)
    window = TIME_WINDOWS.get(period, TIME_WINDOWS["30d"])
    start = end - window

    result = await db.execute(
        select(
            GitHubEvent.language,
            func.count(GitHubEvent.id).label("push_count"),
            func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
        )
        .where(
            GitHubEvent.event_type == "PushEvent",
            GitHubEvent.created_at >= start,
            GitHubEvent.language.isnot(None),
            GitHubEvent.language != "",
        )
        .group_by(GitHubEvent.language)
        .order_by(func.count(GitHubEvent.id).desc())
        .limit(limit)
    )
    return [
        {"language": row[0] or "unknown", "push_events": row[1], "unique_developers": row[2]}
        for row in result.all()
    ]


# ─────────────────────────────────────────────────────────────
# Daily Activity (Time Series)
# ─────────────────────────────────────────────────────────────

@router.get("/daily", response_model=list[dict])
async def get_daily_activity(
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, le=365),
) -> list[dict]:
    """Get daily PushEvent counts for the last N days."""
    start = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(GitHubEvent.created_at).label("day"),
            func.count(GitHubEvent.id).label("push_count"),
            func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
            func.count(func.distinct(GitHubEvent.repo_id)).label("repo_count"),
        )
        .where(
            GitHubEvent.event_type == "PushEvent",
            GitHubEvent.created_at >= start,
        )
        .group_by(func.date(GitHubEvent.created_at))
        .order_by(func.date(GitHubEvent.created_at))
    )
    return [
        {
            "date": str(row[0]),
            "push_events": row[1],
            "unique_developers": row[2],
            "unique_repositories": row[3],
        }
        for row in result.all()
    ]


@router.get("/monthly", response_model=list[dict])
async def get_monthly_activity(
    db: AsyncSession = Depends(get_db),
    months: int = Query(default=12, le=24),
) -> list[dict]:
    """Get monthly PushEvent counts for the last N months."""
    start = datetime.now(timezone.utc) - timedelta(days=months * 30)

    result = await db.execute(
        select(
            func.date_trunc("month", GitHubEvent.created_at).label("month"),
            func.count(GitHubEvent.id).label("push_count"),
            func.count(func.distinct(GitHubEvent.actor_login)).label("dev_count"),
            func.count(func.distinct(GitHubEvent.repo_id)).label("repo_count"),
        )
        .where(
            GitHubEvent.event_type == "PushEvent",
            GitHubEvent.created_at >= start,
        )
        .group_by(func.date_trunc("month", GitHubEvent.created_at))
        .order_by(func.date_trunc("month", GitHubEvent.created_at))
    )
    return [
        {
            "month": row[0].strftime("%Y-%m") if row[0] else None,
            "push_events": row[1],
            "unique_developers": row[2],
            "unique_repositories": row[3],
        }
        for row in result.all()
    ]


# ─────────────────────────────────────────────────────────────
# Growth Metrics
# ─────────────────────────────────────────────────────────────

@router.get("/growth", response_model=GrowthMetricsResponse)
async def get_growth_metrics(
    db: AsyncSession = Depends(get_db),
) -> GrowthMetricsResponse:
    """Get growth metrics: weekly, monthly, year-over-year."""
    now = datetime.now(timezone.utc)

    # Daily activity for the last 30 days
    daily_data = await get_daily_activity(db, days=30)

    # Current week vs previous week
    this_week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)

    this_week = await _count_events(db, this_week_start, now)
    prev_week = await _count_events(db, prev_week_start, this_week_start)
    weekly_growth = _pct_change(this_week, prev_week)

    # Current month vs previous month
    this_month_start = now - timedelta(days=30)
    prev_month_start = now - timedelta(days=60)

    this_month = await _count_events(db, this_month_start, now)
    prev_month = await _count_events(db, prev_month_start, this_month_start)
    monthly_growth = _pct_change(this_month, prev_month)

    # Year over year
    this_year_start = now - timedelta(days=365)
    prev_year_start = now - timedelta(days=730)

    this_year = await _count_events(db, this_year_start, now)
    prev_year = await _count_events(db, prev_year_start, this_year_start)
    yoy_growth = _pct_change(this_year, prev_year)

    return GrowthMetricsResponse(
        daily_activity=daily_data,
        weekly_growth_percent=round(weekly_growth, 2),
        monthly_growth_percent=round(monthly_growth, 2),
        year_over_year_growth_percent=round(yoy_growth, 2),
    )


async def _count_events(db: AsyncSession, start: datetime, end: datetime) -> int:
    result = await db.execute(
        select(func.count(GitHubEvent.id)).where(
            GitHubEvent.event_type == "PushEvent",
            GitHubEvent.created_at >= start,
            GitHubEvent.created_at < end,
        )
    )
    return result.scalar() or 0


def _pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0
    return ((current - previous) / previous) * 100


# ─────────────────────────────────────────────────────────────
# Coverage Statistics
# ─────────────────────────────────────────────────────────────

@router.get("/coverage", response_model=CoverageStatsResponse)
async def get_coverage_statistics(
    db: AsyncSession = Depends(get_db),
) -> CoverageStatsResponse:
    """Get data quality coverage statistics."""
    users_total = (await db.execute(select(func.count(GitHubUser.login)))).scalar() or 0
    users_enriched = (await db.execute(
        select(func.count(GitHubUser.login)).where(GitHubUser.enrichment_status == "enriched")
    )).scalar() or 0
    users_with_location = (await db.execute(
        select(func.count(GitHubUser.login)).where(GitHubUser.latitude.isnot(None))
    )).scalar() or 0

    events_total = (await db.execute(
        select(func.count(GitHubEvent.id)).where(GitHubEvent.event_type == "PushEvent")
    )).scalar() or 0
    events_enriched = (await db.execute(
        select(func.count(GitHubEvent.id)).where(
            GitHubEvent.event_type == "PushEvent",
            GitHubEvent.enrichment_status == "enriched",
        )
    )).scalar() or 0

    repos_total = (await db.execute(select(func.count(Repository.id)))).scalar() or 0
    repos_with_events = (await db.execute(
        select(func.count(func.distinct(GitHubEvent.repository_id))).where(
            GitHubEvent.event_type == "PushEvent",
        )
    )).scalar() or 0

    avg_confidence = (await db.execute(
        select(func.avg(GitHubUser.confidence_score)).where(GitHubUser.confidence_score.isnot(None))
    )).scalar()
    avg_confidence = round(float(avg_confidence), 2) if avg_confidence else 0.0

    return CoverageStatsResponse(
        users_total=users_total,
        users_enriched=users_enriched,
        users_with_location=users_with_location,
        events_total=events_total,
        events_enriched=events_enriched,
        repos_total=repos_total,
        repos_with_events=repos_with_events,
        avg_geocoding_confidence=avg_confidence,
    )


# ─────────────────────────────────────────────────────────────
# Administrative Endpoints
# ─────────────────────────────────────────────────────────────

@router.post("/admin/trigger/push-event-ingestion")
async def trigger_push_event_ingestion() -> dict[str, str]:
    """Manually trigger PushEvent ingestion."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_push_event_ingestion")
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")
    return {"message": "Push event ingestion enqueued", "job_id": str(job.job_id)}


@router.post("/admin/trigger/event-enrichment")
async def trigger_event_enrichment() -> dict[str, str]:
    """Manually trigger event enrichment."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_event_enrichment")
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")
    return {"message": "Event enrichment enqueued", "job_id": str(job.job_id)}


@router.post("/admin/trigger/activity-score")
async def trigger_activity_score() -> dict[str, str]:
    """Manually trigger activity score computation."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_activity_score")
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")
    return {"message": "Activity score computation enqueued", "job_id": str(job.job_id)}


@router.post("/admin/trigger/ecosystem-score")
async def trigger_ecosystem_score() -> dict[str, str]:
    """Manually trigger ecosystem score computation."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_ecosystem_score")
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")
    return {"message": "Ecosystem score computation enqueued", "job_id": str(job.job_id)}


@router.post("/admin/trigger/aggregation")
async def trigger_aggregation() -> dict[str, str]:
    """Manually trigger aggregation."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_aggregation")
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")
    return {"message": "Aggregation enqueued", "job_id": str(job.job_id)}


@router.post("/admin/trigger/retry-enrichment")
async def trigger_retry_enrichment() -> dict[str, str]:
    """Retry failed event enrichments."""
    redis = await get_arq_redis()
    job = await redis.enqueue_job("run_event_enrichment")
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to enqueue job")
    return {"message": "Retry enrichment enqueued", "job_id": str(job.job_id)}


@router.post("/admin/trigger/full-pipeline")
async def trigger_full_pipeline() -> dict[str, str]:
    """Trigger the full Activity Intelligence pipeline."""
    redis = await get_arq_redis()
    jobs = {}
    pipeline_functions = [
        "run_push_event_ingestion",
        "run_event_enrichment",
        "run_aggregation",
        "run_activity_score",
        "run_ecosystem_score",
    ]
    for func_name in pipeline_functions:
        job = await redis.enqueue_job(func_name)
        if job:
            jobs[func_name] = str(job.job_id)

    return {"message": "Full pipeline enqueued", "jobs": jobs}


# ─────────────────────────────────────────────────────────────
# Layer List (for frontend metadata)
# ─────────────────────────────────────────────────────────────

@router.get("/layers", response_model=dict)
async def get_activity_layers() -> dict:
    """Get available heatmap layers with colors."""
    return {
        "base_layers": [
            {"id": "developer_presence", "name": "Developer Presence", "color": LAYER_COLORS["developer_presence"]},
            {"id": "development_activity", "name": "Development Activity", "color": LAYER_COLORS["development_activity"]},
        ],
        "domain_overlays": [
            {"id": k, "name": k.replace("_", " ").title(), "color": v}
            for k, v in LAYER_COLORS.items()
            if k not in ["developer_presence", "development_activity"]
        ],
        "time_windows": [
            {"id": "24h", "name": "Last 24 Hours"},
            {"id": "7d", "name": "Last 7 Days"},
            {"id": "30d", "name": "Last 30 Days"},
            {"id": "12m", "name": "Last 12 Months"},
        ],
    }
