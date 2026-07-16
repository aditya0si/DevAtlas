from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.api.deps import get_db
from app.models.github import AnalyticsSnapshot

router = APIRouter()

@router.get("/snapshots", response_model=list[dict[str, Any]])
async def get_analytics_snapshots(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=10, le=100),
) -> list[dict[str, Any]]:
    """Get the latest analytics snapshots."""
    query = select(AnalyticsSnapshot).order_by(AnalyticsSnapshot.snapshot_date.desc()).limit(limit)
    result = await db.execute(query)
    snapshots = result.scalars().all()
    
    return [
        {
            "id": s.id,
            "snapshot_date": s.snapshot_date.isoformat(),
            "snapshot_type": s.snapshot_type,
            "metrics": s.metrics,
            "created_at": s.created_at.isoformat()
        }
        for s in snapshots
    ]

@router.get("/snapshots/latest", response_model=dict[str, Any])
async def get_latest_snapshot(
    db: AsyncSession = Depends(get_db),
    type: str = Query(default="daily")
) -> dict[str, Any]:
    """Get the most recent analytics snapshot of a specific type."""
    query = select(AnalyticsSnapshot).where(
        AnalyticsSnapshot.snapshot_type == type
    ).order_by(AnalyticsSnapshot.snapshot_date.desc()).limit(1)
    
    result = await db.execute(query)
    snapshot = result.scalar_one_or_none()
    
    if not snapshot:
        raise HTTPException(status_code=404, detail="No snapshot found")
        
    return {
        "id": snapshot.id,
        "snapshot_date": snapshot.snapshot_date.isoformat(),
        "snapshot_type": snapshot.snapshot_type,
        "metrics": snapshot.metrics,
        "created_at": snapshot.created_at.isoformat()
    }
