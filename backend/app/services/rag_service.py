from __future__ import annotations

import hashlib
from typing import Optional
from pydantic import BaseModel
from sqlalchemy import select, literal, Float
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github import Repository
from app.services.ai_service import AIServiceFactory
from app.core.cache import get_cache_service


class GroundedCitation(BaseModel):
    repository_id: str
    full_name: str
    description: Optional[str] = None
    similarity_score: float
    language: Optional[str] = None
    stars: int = 0


class RAGContextResult(BaseModel):
    query: str
    formatted_context: str
    citations: list[GroundedCitation]


class RAGService:
    CACHE_TTL = 300

    def __init__(self, db: AsyncSession, confidence_threshold: float = 0.3):
        self.db = db
        self.confidence_threshold = confidence_threshold
        self.cache = get_cache_service()

    async def retrieve_context(self, query: str, top_k: int = 5) -> RAGContextResult:
        cache_key = self._cache_key(query, top_k)
        cached = await self.cache.get(cache_key)
        if cached:
            return RAGContextResult(**cached)

        provider = AIServiceFactory.get_provider()
        citations: list[GroundedCitation] = []
        formatted_context_parts: list[str] = []

        try:
            query_embedding = await provider.generate_embedding(query)

            sim_col = (1 - Repository.embedding.cosine_distance(query_embedding)).label("similarity")
            stmt = (
                select(Repository, sim_col)
                .where(Repository.embedding.isnot(None))
                .order_by(Repository.embedding.cosine_distance(query_embedding))
                .limit(top_k)
            )
            res = await self.db.execute(stmt)
            vector_rows = list(res.all())

            keyword_rows = await self._keyword_search(query, top_k)
            combined = self._merge_results(vector_rows, keyword_rows, top_k)
            above_threshold = [(r, s) for r, s in combined if float(s or 0) >= self.confidence_threshold]

            if above_threshold:
                for repo, score in above_threshold:
                    score_val = round(float(score or 0), 4)
                    citation = GroundedCitation(
                        repository_id=repo.id,
                        full_name=repo.full_name,
                        description=repo.description,
                        similarity_score=score_val,
                        language=repo.language,
                        stars=repo.stargazers_count,
                    )
                    citations.append(citation)

                    context_snippet = (
                        f"- Repository: {repo.full_name}\n"
                        f"  Description: {repo.description or 'N/A'}\n"
                        f"  Language: {repo.language or 'N/A'}\n"
                        f"  Stars: {repo.stargazers_count} | Domain: {(repo.classification or {}).get('domain', 'General')}\n"
                    )
                    formatted_context_parts.append(context_snippet)
            else:
                formatted_context_parts.append(
                    "- Context: India developer ecosystem telemetry across Bengaluru, Hyderabad, Mumbai, and Delhi NCR."
                )
        except Exception:
            # A failed embedding/vector statement aborts the underlying Postgres
            # transaction; roll back so subsequent statements on this session do
            # not fail with InFailedSQLTransactionError.
            await self.db.rollback()
            formatted_context_parts.append(
                "- Context: India developer ecosystem telemetry across Bengaluru, Hyderabad, Mumbai, and Delhi NCR."
            )

        formatted_context = "\n".join(formatted_context_parts) if formatted_context_parts else "No direct repository matches found."

        result = RAGContextResult(
            query=query,
            formatted_context=formatted_context,
            citations=citations,
        )

        await self.cache.set(cache_key, result.model_dump(), ttl=self.CACHE_TTL)
        return result

    @staticmethod
    def _cache_key(query: str, top_k: int) -> str:
        hash_val = hashlib.md5(query.lower().strip().encode()).hexdigest()[:12]
        return f"rag:{hash_val}:k{top_k}"

    async def _keyword_search(self, query: str, limit: int = 5) -> list[tuple[Repository, float]]:
        try:
            keyword_score = literal(0.6, type_=Float).label("score")
            stmt = (
                select(Repository, keyword_score)
                .where(Repository.description.ilike(f"%{query}%"))
                .limit(limit)
            )
            res = await self.db.execute(stmt)
            return list(res.all())
        except Exception:
            return []

    @staticmethod
    def _merge_results(
        vector_rows: list[tuple[Repository, float]],
        keyword_rows: list[tuple[Repository, float]],
        top_k: int,
    ) -> list[tuple[Repository, float]]:
        seen: set[str] = set()
        merged: list[tuple[Repository, float]] = []

        for repo, score in vector_rows:
            if repo.id not in seen:
                seen.add(repo.id)
                merged.append((repo, score))

        for repo, score in keyword_rows:
            if repo.id not in seen:
                seen.add(repo.id)
                merged.append((repo, score))

        merged.sort(key=lambda x: x[1], reverse=True)
        return merged[:top_k]
