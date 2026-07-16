from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING, Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.repositories.github_repository import GitHubRepository

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()


class RepositoryClassification(BaseModel):
    primary_language: str = Field(description="Primary programming language")
    secondary_languages: list[str] = Field(description="Other languages used")
    domain: str = Field(description="Domain: web, mobile, data, devops, ai/ml, etc.")
    tech_stack: list[str] = Field(description="Key technologies and frameworks")
    maturity: str = Field(description="maturity: experimental, growing, mature, legacy")
    community_health: str = Field(description="community_health: active, moderate, low")


class ClassificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repository = GitHubRepository(db)
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def classify_repository(self, repository_id: str, repo_name: str, description: str | None, readme: str | None, languages: dict[str, int] | None) -> RepositoryClassification:
        prompt = self._build_prompt(repo_name, description, readme, languages)
        response = await self.client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert software engineer analyzing GitHub repositories."},
                {"role": "user", "content": prompt},
            ],
            response_format=RepositoryClassification,
            temperature=0.1,
        )
        return response.choices[0].message.parsed

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
