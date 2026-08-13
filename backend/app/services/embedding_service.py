from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx

from app.core.config import get_settings
from app.repositories.github_repository import GitHubRepository
from app.services.ai_service import AIServiceFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()


class EmbeddingService:
    """Generate repository/query embeddings.

    Embeddings are generated through the AI provider fallback chain
    (``AIServiceFactory``/``FallbackChainProvider``), so the service stays
    functional in no-key environments: without an ``OPENAI_API_KEY`` it falls
    back to the deterministic local provider instead of raising at client
    construction time.
    """

    def __init__(self, db: "AsyncSession") -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        self.provider = AIServiceFactory.get_provider()
        self.http_client = httpx.AsyncClient(timeout=30.0)

    async def embed_repositories(self, limit: int = 100, batch_size: int = 100) -> None:
        repositories = await self.repository.get_repositories_for_classification(limit=limit)
        for i in range(0, len(repositories), batch_size):
            batch = repositories[i : i + batch_size]
            for repo in batch:
                text = self._build_embedding_text(repo)
                embedding = await self.generate_embedding(text)
                await self.repository.update_classification(
                    repo.id,
                    {
                        **(repo.classification or {}),
                        "embedding": embedding,
                    },
                )

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate an embedding through the AI provider fallback chain.

        Delegates to ``AIServiceFactory`` so OpenAI -> Gemini -> Ollama ->
        deterministic local fallback semantics are shared with the rest of the
        codebase (see ``app.services.ai_service.FallbackChainProvider``).
        """
        return await self.provider.generate_embedding(text)

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
