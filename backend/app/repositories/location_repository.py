from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import GitHubUser, LocationCache, Repository

class LocationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_github_user(self, login: str) -> Optional[GitHubUser]:
        result = await self.db.execute(select(GitHubUser).where(GitHubUser.login == login))
        return result.scalar_one_or_none()

    async def upsert_github_user(self, user_data: dict[str, Any]) -> GitHubUser:
        login = user_data["login"]
        existing = await self.get_github_user(login)
        
        if existing is None:
            user = GitHubUser(**user_data)
            self.db.add(user)
            await self.db.flush()
            await self.db.refresh(user)
            return user
            
        for field, value in user_data.items():
            if field != "login" and not field.startswith("_") and field in existing.__table__.columns.keys():
                setattr(existing, field, value)
                
        await self.db.flush()
        await self.db.refresh(existing)
        return existing

    async def get_location_cache(self, normalized_location: str) -> Optional[LocationCache]:
        result = await self.db.execute(
            select(LocationCache).where(LocationCache.normalized_location == normalized_location)
        )
        return result.scalar_one_or_none()

    async def set_location_cache(self, normalized_location: str, geodata: dict[str, Any]) -> LocationCache:
        existing = await self.get_location_cache(normalized_location)
        
        if existing is None:
            cache_entry = LocationCache(
                normalized_location=normalized_location,
                latitude=geodata.get("latitude"),
                longitude=geodata.get("longitude"),
                city=geodata.get("city"),
                state=geodata.get("state"),
                country=geodata.get("country"),
                timezone=geodata.get("timezone"),
                confidence_score=geodata.get("confidence_score", 0),
            )
            self.db.add(cache_entry)
            await self.db.flush()
            return cache_entry
            
        for field, value in geodata.items():
            if hasattr(existing, field):
                setattr(existing, field, value)
        existing.cached_at = datetime.now(timezone.utc)
        
        await self.db.flush()
        return existing

    async def get_users_needing_enrichment(self, limit: int = 200) -> list[str]:
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        result = await self.db.execute(
            select(GitHubUser.login)
            .where(
                (GitHubUser.last_verified.is_(None)) | 
                (GitHubUser.last_verified < thirty_days_ago)
            )
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update_repository_geom_for_user(self, login: str) -> None:
        user = await self.get_github_user(login)
        if not user or user.longitude is None or user.latitude is None:
            return
            
        # Update user geom
        geom_val = f"ST_SetSRID(ST_MakePoint({user.longitude}, {user.latitude}), 4326)"
        await self.db.execute(
            text(f"""
                UPDATE github_users 
                SET geom = {geom_val}
                WHERE login = :login
            """),
            {"login": login}
        )
        
        # Link repositories to user if not already linked
        await self.db.execute(
            update(Repository)
            .where(Repository.owner_login == login)
            .values(github_user_login=login)
        )
