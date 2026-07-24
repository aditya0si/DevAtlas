from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Optional
from uuid import uuid4

import httpx
from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.cache import get_cache_service
from app.models.github import GitHubEvent, Repository, GitHubUser, SyncState

settings = get_settings()
logger = logging.getLogger(__name__)


class PushEventService:
    """Service for ingesting and enriching GitHub PushEvents."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.cache = get_cache_service()
        self.client = httpx.AsyncClient(
            headers={
                "Authorization": f"token {settings.github_token or ''}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30.0,
        )
        self.rate_limit_remaining = 5000
        self.rate_limit_reset = 0

    async def _update_rate_limit(self, response: httpx.Response) -> None:
        remaining = response.headers.get("X-RateLimit-Remaining")
        reset = response.headers.get("X-RateLimit-Reset")
        if remaining is not None:
            self.rate_limit_remaining = int(remaining)
        if reset is not None:
            self.rate_limit_reset = int(reset)

    async def _handle_rate_limit(self, response: httpx.Response) -> None:
        await self._update_rate_limit(response)
        if response.status_code in (403, 429):
            if self.rate_limit_remaining == 0:
                import time
                wait_time = max(self.rate_limit_reset - time.time(), 0) + 1
                logger.warning("Rate limit exceeded. Waiting %.1fs", wait_time)
                await asyncio.sleep(wait_time)
            else:
                retry_after = response.headers.get("Retry-After")
                if retry_after:
                    await asyncio.sleep(int(retry_after) + 1)

    async def get_active_repositories(
        self, limit: int = 100, min_push_interval_hours: int = 24
    ) -> list[Repository]:
        """Get repositories sorted by activity freshness (pushed_at) for prioritization."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        result = await self.db.execute(
            select(Repository)
            .where(Repository.pushed_at >= cutoff)
            .order_by(Repository.pushed_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_repo_events_etag(self, owner: str, repo: str) -> Optional[str]:
        """Get stored ETag for a repository's events."""
        result = await self.db.execute(
            select(SyncState).where(
                SyncState.sync_type == f"events_{owner}_{repo}"
            )
        )
        state = result.scalar_one_or_none()
        return state.last_etag if state else None

    async def save_repo_events_etag(self, owner: str, repo: str, etag: str) -> None:
        """Save ETag for a repository's events."""
        result = await self.db.execute(
            select(SyncState).where(
                SyncState.sync_type == f"events_{owner}_{repo}"
            )
        )
        state = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if state:
            state.last_etag = etag
            state.last_sync_at = now
            state.status = "completed"
            state.updated_at = now
        else:
            state = SyncState(
                sync_type=f"events_{owner}_{repo}",
                last_etag=etag,
                last_sync_at=now,
                status="completed",
                total_processed=0,
                total_skipped=0,
                total_errors=0,
            )
            self.db.add(state)
        await self.db.flush()

    async def fetch_push_events(
        self, owner: str, repo: str, max_pages: int = 3, min_quota: int = 50
    ) -> list[dict[str, Any]]:
        """Fetch PushEvents for a repository, respecting rate limits."""
        if self.rate_limit_remaining < min_quota:
            logger.warning(
                "Insufficient rate limit quota: %d remaining, need %d",
                self.rate_limit_remaining, min_quota,
            )
            return []

        all_events: list[dict[str, Any]] = []
        etag = await self.get_repo_events_etag(owner, repo)

        for page in range(1, max_pages + 1):
            url = f"https://api.github.com/repos/{owner}/{repo}/events"
            params = {"per_page": 100, "page": page}
            headers = {}
            if page == 1 and etag:
                headers["If-None-Match"] = etag

            try:
                response = await self.client.get(url, params=params, headers=headers)
            except httpx.RequestError:
                logger.warning("Network error fetching events for %s/%s", owner, repo)
                break

            await self._handle_rate_limit(response)

            if response.status_code == 304:
                logger.debug("Events unchanged for %s/%s (ETag match)", owner, repo)
                break

            if response.status_code != 200:
                logger.warning(
                    "GitHub API returned %d for %s/%s events",
                    response.status_code, owner, repo,
                )
                break

            page_events = response.json()
            if not page_events:
                break

            # Store ETag from first page
            if page == 1:
                new_etag = response.headers.get("ETag")
                if new_etag:
                    await self.save_repo_events_etag(owner, repo, new_etag)

            # Only keep PushEvents
            push_events = [e for e in page_events if e.get("type") == "PushEvent"]
            all_events.extend(push_events)

            await asyncio.sleep(0.1)

        return all_events

    async def store_push_events(
        self, events_data: list[dict[str, Any]], repository_id: str
    ) -> int:
        """Bulk upsert PushEvents into the database."""
        if not events_data:
            return 0

        stored = 0
        for event_data in events_data:
            github_id = str(event_data.get("id", ""))
            if not github_id:
                continue

            existing = await self.db.execute(
                select(GitHubEvent).where(GitHubEvent.github_id == github_id)
            )
            if existing.scalar_one_or_none() is not None:
                continue

            actor = event_data.get("actor", {})
            actor_id = actor.get("id")
            actor_login = actor.get("login")

            # Upsert GitHubUser with numeric ID if not exists
            if actor_id and actor_login:
                await self._ensure_github_user(actor_id, actor_login)

            event = GitHubEvent(
                github_id=github_id,
                event_type=event_data.get("type", "PushEvent"),
                actor_id=actor_id,
                actor_login=actor_login,
                repo_id=event_data.get("repo", {}).get("id"),
                repo_name=event_data.get("repo", {}).get("name"),
                payload=event_data.get("payload"),
                public=event_data.get("public", True),
                created_at=(
                    datetime.fromisoformat(event_data["created_at"].replace("Z", "+00:00"))
                    if event_data.get("created_at") else None
                ),
                repository_id=repository_id,
                enrichment_status="pending",
            )
            self.db.add(event)
            stored += 1

        await self.db.flush()
        return stored

    async def _ensure_github_user(self, github_user_id: int, login: str) -> None:
        """Ensure a GitHubUser record exists, creating with numeric ID if needed."""
        result = await self.db.execute(
            select(GitHubUser).where(GitHubUser.login == login)
        )
        user = result.scalar_one_or_none()
        if user is None:
            user = GitHubUser(
                login=login,
                github_user_id=github_user_id,
                enrichment_status="pending",
            )
            self.db.add(user)
        elif user.github_user_id is None:
            user.github_user_id = github_user_id
        await self.db.flush()

    async def enrich_event(
        self, event: GitHubEvent
    ) -> GitHubEvent:
        """Enrich a single PushEvent with resolved metadata."""
        if event.enrichment_status == "enriched":
            return event

        # Resolve repository domain
        if event.repository_id and event.repository:
            classification = event.repository.classification or {}
            event.domain = classification.get("domain")
            event.language = event.repository.language

        # Resolve actor location (from GitHubUser, not duplicated into event)
        if event.actor_login:
            result = await self.db.execute(
                select(GitHubUser).where(GitHubUser.login == event.actor_login)
            )
            actor = result.scalar_one_or_none()
            if actor:
                event.state = actor.state
                event.city = actor.city
                # If actor is not yet enriched, mark event as pending
                if actor.enrichment_status != "enriched":
                    event.enrichment_status = "pending_enrichment"
                else:
                    event.enrichment_status = "enriched"
                    event.enriched_at = datetime.now(timezone.utc)
            else:
                event.enrichment_status = "pending_enrichment"

        if event.enrichment_status == "pending":
            # Resolve what we can from repo
            if event.domain or event.language or event.state:
                event.enrichment_status = "partially_enriched"

        await self.db.flush()
        return event

    async def enrich_pending_events(self, limit: int = 500) -> int:
        """Enrich events marked as pending or pending_enrichment."""
        result = await self.db.execute(
            select(GitHubEvent)
            .where(GitHubEvent.enrichment_status.in_(["pending", "pending_enrichment"]))
            .limit(limit)
        )
        events = result.scalars().all()

        enriched = 0
        for event in events:
            await self.enrich_event(event)
            enriched += 1

        await self.db.flush()
        return enriched

    async def count_pending_enrichments(self) -> dict[str, int]:
        """Count events by enrichment status."""
        result = await self.db.execute(
            select(
                GitHubEvent.enrichment_status,
                func.count(GitHubEvent.id),
            ).group_by(GitHubEvent.enrichment_status)
        )
        counts = {row[0] or "unknown": row[1] for row in result.all()}
        return counts

    async def get_push_event_stats(
        self, start_date: datetime, end_date: datetime
    ) -> dict[str, Any]:
        """Get PushEvent statistics for a time window."""
        result = await self.db.execute(
            select(
                func.count(GitHubEvent.id),
                func.count(func.distinct(GitHubEvent.actor_login)),
                func.count(func.distinct(GitHubEvent.repo_id)),
            ).where(
                GitHubEvent.event_type == "PushEvent",
                GitHubEvent.created_at >= start_date,
                GitHubEvent.created_at < end_date,
            )
        )
        row = result.one()
        return {
            "total_push_events": row[0] or 0,
            "unique_developers": row[1] or 0,
            "unique_repositories": row[2] or 0,
        }

    async def close(self) -> None:
        await self.client.aclose()
