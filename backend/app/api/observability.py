"""Observability & Metrics API endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.github import GitHubUser, Repository, SyncState, WorkerRun

router = APIRouter()


@router.get("/health/deep")
async def deep_health_check(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Deep health check with DB + worker status."""
    checks = {}

    # 1. Database connectivity
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = {"status": "healthy", "latency_ms": 0}
    except Exception as e:
        checks["database"] = {"status": "unhealthy", "error": str(e)}

    # 2. Repository counts
    try:
        repo_count = await db.execute(select(func.count(Repository.id)))
        user_count = await db.execute(select(func.count(GitHubUser.login)))
        checks["data"] = {
            "repositories": repo_count.scalar_one_or_none() or 0,
            "users": user_count.scalar_one_or_none() or 0,
        }
    except Exception as e:
        checks["data"] = {"status": "error", "error": str(e)}

    # 3. Worker status
    try:
        recent_runs = await db.execute(
            select(WorkerRun)
            .order_by(WorkerRun.started_at.desc())
            .limit(10)
        )
        runs = recent_runs.scalars().all()
        checks["workers"] = [
            {
                "worker": r.worker_name,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "items_processed": r.items_processed,
                "items_failed": r.items_failed,
                "duration_seconds": r.duration_seconds,
                "error": r.error_message,
            }
            for r in runs
        ]
    except Exception as e:
        checks["workers"] = {"status": "error", "error": str(e)}

    # 4. Sync states
    try:
        sync_states = await db.execute(select(SyncState))
        states = sync_states.scalars().all()
        checks["sync_states"] = [
            {
                "sync_type": s.sync_type,
                "status": s.status,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                "metadata": s.state_metadata,
            }
            for s in states
        ]
    except Exception as e:
        checks["sync_states"] = {"status": "error", "error": str(e)}

    overall = all(
        isinstance(v, dict) and v.get("status") != "unhealthy"
        for v in checks.values()
        if isinstance(v, dict) and "status" in v
    )

    return {
        "status": "healthy" if overall else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }


@router.get("/metrics/summary")
async def get_metrics_summary(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get a summary of key platform metrics."""

    # Repository metrics
    repo_total = await db.execute(select(func.count(Repository.id)))
    repo_classified = await db.execute(
        select(func.count(Repository.id)).where(Repository.classification.isnot(None))
    )
    repo_with_embedding = await db.execute(
        select(func.count(Repository.id)).where(Repository.embedding.isnot(None))
    )

    # User metrics
    user_total = await db.execute(select(func.count(GitHubUser.login)))
    user_geocoded = await db.execute(
        select(func.count(GitHubUser.login)).where(GitHubUser.geom.isnot(None))
    )

    # Language distribution
    lang_result = await db.execute(
        select(Repository.language, func.count(Repository.id).label("count"))
        .where(Repository.language.isnot(None))
        .group_by(Repository.language)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    languages = {row.language: row.count for row in lang_result.fetchall()}

    # Domain distribution
    domain_result = await db.execute(
        select(
            Repository.classification["domain"].astext.label("domain"),
            func.count(Repository.id).label("count"),
        )
        .where(Repository.classification.isnot(None))
        .group_by(Repository.classification["domain"].astext)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    domains = {row.domain or "unknown": row.count for row in domain_result.fetchall()}

    return {
        "repositories": {
            "total": repo_total.scalar_one_or_none() or 0,
            "classified": repo_classified.scalar_one_or_none() or 0,
            "with_embedding": repo_with_embedding.scalar_one_or_none() or 0,
        },
        "users": {
            "total": user_total.scalar_one_or_none() or 0,
            "geocoded": user_geocoded.scalar_one_or_none() or 0,
        },
        "top_languages": languages,
        "top_domains": domains,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
