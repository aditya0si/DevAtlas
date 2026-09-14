from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from app.repositories.github_repository import GitHubRepository
from app.services.ai_service import AIServiceFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class RepositoryClassification(BaseModel):
    primary_language: str = Field(description="Primary programming language")
    secondary_languages: list[str] = Field(description="Other languages used")
    domain: str = Field(description="Domain: web, mobile, data, devops, ai/ml, etc.")
    tech_stack: list[str] = Field(description="Key technologies and frameworks")
    maturity: str = Field(description="maturity: experimental, growing, mature, legacy")
    community_health: str = Field(description="community_health: active, moderate, low")

    @classmethod
    def from_provider_result(cls, data: dict[str, Any]) -> "RepositoryClassification":
        """Map a fallback-chain classification dict onto this schema.

        The provider chain (Groq/OpenAI/Gemini) returns the shared
        ``ai_service.RepositoryClassification`` shape (domain, industry,
        primary_technology, framework, difficulty, health); translate it into
        the seed/classification schema consumed by the India API.
        """
        primary_technology = data.get("primary_technology") or "Unknown"
        framework = data.get("framework") or "None"
        tech_stack = [t for t in [primary_technology, framework] if t and t != "None"]

        difficulty = (data.get("difficulty") or "Intermediate").lower()
        maturity = {
            "beginner": "experimental",
            "intermediate": "growing",
            "advanced": "mature",
        }.get(difficulty, "growing")

        health = (data.get("health") or "Active").lower()
        community_health = {
            "active": "active",
            "unmaintained": "low",
            "archived": "low",
        }.get(health, "moderate")

        return cls(
            primary_language=primary_technology,
            secondary_languages=[],
            domain=(data.get("domain") or "general").lower(),
            tech_stack=tech_stack,
            maturity=maturity,
            community_health=community_health,
        )


class ClassificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        # Route through the AI provider fallback chain (Groq -> OpenAI -> Gemini
        # -> Ollama -> MockAI) so no raw OpenAI client is constructed and
        # no-key environments stay functional.
        self.provider = AIServiceFactory.get_provider()

    async def classify_repository(
        self,
        repository_id: str,
        repo_name: str,
        description: str | None,
        readme: str | None,
        languages: dict[str, int] | None,
    ) -> RepositoryClassification:
        prompt = self._build_prompt(repo_name, description, readme, languages)
        result = await self.provider.classify_repository(prompt)
        return RepositoryClassification.from_provider_result(result)

    async def classify_batch(self, limit: int = 100, batch_size: int = 10) -> None:
        repositories = await self.repository.get_repositories_for_classification(limit=limit)
        semaphore = asyncio.Semaphore(batch_size)

        async def _classify(repository):
            async with semaphore:
                try:
                    classification = await self.classify_repository(
                        repository_id=repository.id,
                        repo_name=repository.name,
                        description=repository.description,
                        readme=None,
                        languages=repository.languages,
                    )
                    await self.repository.update_classification(repository.id, classification.model_dump())
                except Exception:
                    pass

        await asyncio.gather(*[_classify(repo) for repo in repositories])

    @staticmethod
    def _build_prompt(name: str, description: str | None, readme: str | None, languages: dict[str, int] | None) -> str:
        language_text = ", ".join(languages.keys()) if languages else "unknown"
        readme_excerpt = (readme or "")[:2000]
        return (
            f"Classify this repository:\n"
            f"Name: {name}\n"
            f"Description: {description or 'N/A'}\n"
            f"Languages: {language_text}\n"
            f"README excerpt: {readme_excerpt}\n"
            "Provide a structured classification."
        )
