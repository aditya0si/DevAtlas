from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import (  # noqa: E402  # noqa: E402  # noqa: E402  # noqa: E402
    GitHubEvent,
    Repository,
)


class GitHubRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def upsert_repository(self, repository: Repository) -> Repository:
        existing = await self.db.execute(select(Repository).where(Repository.github_id == repository.github_id))
        existing_repo = existing.scalar_one_or_none()
        if existing_repo is None:
            self.db.add(repository)
            await self.db.flush()
            await self.db.refresh(repository)
            return repository
        for field, value in repository.__dict__.items():
            if field not in {"id", "ingested_at", "events"} and not field.startswith("_"):
                setattr(existing_repo, field, value)
        await self.db.flush()
        await self.db.refresh(existing_repo)
        return existing_repo

    async def bulk_upsert_repositories(self, repositories: list[Repository]) -> None:
        if not repositories:
            return

        # Extract dictionaries from models, excluding SQLAlchemy state
        values = []
        for repo in repositories:
            repo_dict = {
                k: v for k, v in repo.__dict__.items()
                if not k.startswith('_') and k not in ('id', 'events', 'ingested_at')
            }
            # Handle uuid if set
            if hasattr(repo, 'id') and repo.id:
                repo_dict['id'] = repo.id
            values.append(repo_dict)

        stmt = insert(Repository).values(values)

        # Exclude fields we don't want to update on conflict
        update_dict = {
            c.name: c for c in stmt.excluded
            if c.name not in ('id', 'github_id', 'created_at', 'ingested_at')
        }

        # Add ON CONFLICT DO UPDATE
        stmt = stmt.on_conflict_do_update(
            index_elements=['github_id'],
            set_=update_dict
        )

        await self.db.execute(stmt)
        await self.db.flush()

    async def get_recent_repositories(self, since: datetime, limit: int = 1000) -> list[Repository]:
        result = await self.db.execute(
            select(Repository)
            .where(Repository.last_activity_at >= since)
            .order_by(Repository.last_activity_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def upsert_event(self, event: GitHubEvent) -> GitHubEvent:
        existing = await self.db.execute(select(GitHubEvent).where(GitHubEvent.github_id == event.github_id))
        existing_event = existing.scalar_one_or_none()
        if existing_event is None:
            self.db.add(event)
            await self.db.flush()
            await self.db.refresh(event)
            return event
        for field, value in event.__dict__.items():
            if field not in {"id", "ingested_at", "repository"} and not field.startswith("_"):
                setattr(existing_event, field, value)
        await self.db.flush()
        await self.db.refresh(existing_event)
        return existing_event

    async def bulk_upsert_events(self, events: list[GitHubEvent]) -> None:
        for event in events:
            await self.upsert_event(event)

    async def get_last_sync_time(self) -> datetime | None:
        result = await self.db.execute(
            select(GitHubEvent.created_at).order_by(GitHubEvent.created_at.desc()).limit(1)
        )
        row = result.scalar_one_or_none()
        return row

    async def get_repositories_for_classification(self, limit: int = 100) -> list[Repository]:
        result = await self.db.execute(
            select(Repository)
            .where(Repository.classification.is_(None))
            .order_by(Repository.last_activity_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update_classification(self, repository_id: str, classification: dict[str, Any]) -> None:
        await self.db.execute(
            update(Repository)
            .where(Repository.id == repository_id)
            .values(classification=classification, classification_updated_at=datetime.utcnow())
        )
