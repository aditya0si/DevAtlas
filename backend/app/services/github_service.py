from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.github import GitHubEvent, Repository
from app.repositories.github_repository import (
    GitHubRepository,  # noqa: E402  # noqa: E402  # noqa: E402  # noqa: E402
)
from app.core.cache import get_cache_service
from app.utils.rate_limiter import GitHubRateLimiter  # noqa: E402

settings = get_settings()


class GitHubService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        self.rate_limiter = GitHubRateLimiter(token=settings.github_token or "")
        self.cache = get_cache_service()
        self.client = httpx.AsyncClient(
            headers={
                "Authorization": f"token {settings.github_token or ''}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30.0,
        )

    async def sync_repositories_since(self, since: datetime | None = None) -> None:
        since = since or await self.repository.get_last_sync_time() or (datetime.now(timezone.utc) - timedelta(days=30))
        url = "https://api.github.com/repositories"
        params = {"since": int(since.timestamp()), "per_page": 100}
        while url:
            response = await self.rate_limiter.request("GET", url, params=params)
            if response.status_code != 200:
                break
            repositories = response.json()
            if not repositories:
                break
            entities: list[Repository] = []
            for item in repositories:
                entities.append(
                    Repository(
                        github_id=item["id"],
                        name=item["name"],
                        full_name=item["full_name"],
                        owner_login=item["owner"]["login"],
                        description=item.get("description"),
                        html_url=item["html_url"],
                        private=item.get("private", False),
                        visibility=item.get("visibility", "public"),
                        language=item.get("language"),
                        stargazers_count=item.get("stargazers_count", 0),
                        forks_count=item.get("forks_count", 0),
                        open_issues_count=item.get("open_issues_count", 0),
                        topics=item.get("topics", []),
                        default_branch=item.get("default_branch"),
                        created_at=self._parse_iso(item.get("created_at")),
                        updated_at=self._parse_iso(item.get("updated_at")),
                        pushed_at=self._parse_iso(item.get("pushed_at")),
                        last_activity_at=self._parse_iso(item.get("updated_at")),
                    )
                )
            await self.repository.bulk_upsert_repositories(entities)
            url = response.links.get("next", {}).get("url")
            params = None
            await asyncio.sleep(1)

    async def sync_repo_events(self, owner: str, repo: str, max_pages: int = 10) -> None:
        events: list[GitHubEvent] = []
        page = 1
        while page <= max_pages:
            url = f"https://api.github.com/repos/{owner}/{repo}/events"
            params = {"per_page": 100, "page": page}
            response = await self.rate_limiter.request("GET", url, params=params)
            if response.status_code != 200:
                break
            page_events = response.json()
            if not page_events:
                break
            for event in page_events:
                events.append(
                    GitHubEvent(
                        github_id=event["id"],
                        event_type=event["type"],
                        actor_id=event.get("actor", {}).get("id"),
                        actor_login=event.get("actor", {}).get("login"),
                        repo_id=event.get("repo", {}).get("id"),
                        repo_name=event.get("repo", {}).get("name"),
                        payload=event.get("payload"),
                        public=event.get("public", True),
                        created_at=self._parse_iso(event.get("created_at")),
                    )
                )
            page += 1
            remaining = int(response.headers.get("X-RateLimit-Remaining", 0))
            if remaining < 10:
                reset_time = int(response.headers.get("X-RateLimit-Reset", 0))
                wait_seconds = max(reset_time - datetime.now(timezone.utc).timestamp(), 0)
                await asyncio.sleep(wait_seconds)
        if events:
            await self.repository.bulk_upsert_events(events)

    async def fetch_and_store_readme(self, owner: str, repo: str, default_branch: str | None) -> str | None:
        """Fetch README content and store it in repository classification."""
        branch = default_branch or "main"
        url = f"https://api.github.com/repos/{owner}/{repo}/readme"
        
        try:
            response = await self.rate_limiter.request("GET", url)
            if response.status_code == 200:
                readme_content = response.text
                # Update repository with README content
                await self.repository.update_classification(
                    f"{owner}/{repo}",
                    {"readme_content": readme_content[:5000]},  # Store first 5000 chars
                )
                return readme_content
        except Exception:
            pass
        
        return None

    async def fetch_github_user(self, login: str) -> dict[str, Any] | None:
        """Fetch a GitHub user profile, utilizing Redis cache and ETags."""
        cached = await self.cache.get_github_user(login)
        if cached and "etag" not in cached:
            return cached

        headers = {}
        if cached and "etag" in cached:
            headers["If-None-Match"] = cached["etag"]

        url = f"https://api.github.com/users/{login}"
        try:
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 304 and cached:
                return cached
                
            if response.status_code == 200:
                data = response.json()
                result = {
                    "login": data.get("login"),
                    "raw_location": data.get("location"),
                    "company": data.get("company"),
                    "type": data.get("type", "User"),
                    "created_at": self._parse_iso(data.get("created_at")),
                    "public_repos": data.get("public_repos", 0),
                    "bio": data.get("bio"),
                }
                etag = response.headers.get("ETag")
                if etag:
                    result["etag"] = etag
                    
                await self.cache.set_github_user(login, result)
                return result
        except Exception as e:
            print(f"Error fetching github user {login}: {e}")
            
        return cached if cached else None

    async def close(self) -> None:
        await self.client.aclose()

    @staticmethod
    def _parse_iso(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
