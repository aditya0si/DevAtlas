from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.repositories.github_repository import GitHubRepository

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()


class EmbeddingService:
    def __init__(self, db: "AsyncSession") -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.embedding_model
        self.dimensions = settings.embedding_dimensions
        self.http_client = httpx.AsyncClient(timeout=30.0)

    async def embed_repositories(self, limit: int = 100, batch_size: int = 100) -> None:
        repositories = await self.repository.get_repositories_for_classification(limit=limit)
        for i in range(0, len(repositories), batch_size):
            batch = repositories[i : i + batch_size]
            texts = [
                self._build_embedding_text(repo)
                for repo in batch
            ]
            response = await self.client.embeddings.create(model=self.model, input=texts, dimensions=self.dimensions)
            for repo, embedding_data in zip(batch, response.data):
                await self.repository.update_classification(
                    repo.id,
                    {
                        **(repo.classification or {}),
                        "embedding": embedding_data.embedding,
                    },
                )

    def _build_embedding_text(self, repo: Any) -> str:
        """Build text for embedding from repository data."""
        parts = [repo.name or "", repo.description or ""]
        
        # Add README if available
        readme_text = self._extract_readme_text(repo)
        if readme_text:
            parts.append(readme_text[:2000])  # Limit README to 2000 chars
        
        # Add topics
        if repo.topics:
            parts.extend(repo.topics[:10])  # Limit to 10 topics
        
        return " | ".join(filter(None, parts))

    async def _fetch_readme(self, owner: str, repo: str, default_branch: str | None) -> str | None:
        """Fetch README content from GitHub API."""
        branch = default_branch or "main"
        url = f"https://api.github.com/repos/{owner}/{repo}/readme"
        
        try:
            response = await self.http_client.get(
                url,
                headers={
                    "Accept": "application/vnd.github.raw+json",
                    "Authorization": f"token {settings.github_token}",
                },
            )
            if response.status_code == 200:
                return response.text
        except Exception:
            pass
        
        return None

    def _extract_readme_text(self, repo: Any) -> str | None:
        """Extract README text from repository classification data."""
        # README content should have been fetched during sync and stored
        classification = repo.classification or {}
        return classification.get("readme_content")
