import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.models.github import Repository
from app.services.ai_service import AIServiceFactory
from app.workers.repo_ingestion_worker import get_sync_state, update_sync_state

logger = logging.getLogger(__name__)

def build_classification_prompt(repo: Repository) -> str:
    language_text = ", ".join(repo.languages.keys()) if repo.languages else "unknown"
    return (
        f"Classify this repository:\n"
        f"Name: {repo.name}\n"
        f"Description: {repo.description or 'N/A'}\n"
        f"Languages: {language_text}\n"
        f"Topics: {', '.join(repo.topics) if repo.topics else 'N/A'}\n"
        "Provide a structured classification."
    )

def build_embedding_text(repo: Repository, classification: dict[str, Any]) -> str:
    parts = [
        f"Repository: {repo.name}",
        f"Description: {repo.description or ''}",
        f"Topics: {', '.join(repo.topics) if repo.topics else ''}",
        f"Domain: {classification.get('domain', '')}",
        f"Industry: {classification.get('industry', '')}",
        f"Technologies: {classification.get('primary_technology', '')} {classification.get('framework', '')}",
    ]
    return "\n".join([p for p in parts if p])

async def run_classification_worker(ctx: dict[str, Any]) -> dict[str, Any]:
    """AI Classification and Embedding Worker"""
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    ai_provider = AIServiceFactory.get_provider()
    
    async with async_session_factory() as session:
        sync_state = await get_sync_state(session, "ai_classification")
        sync_state.status = "in_progress"
        sync_state.started_at = datetime.now(timezone.utc)
        await update_sync_state(session, sync_state)
        
        # We process 100 repositories that either:
        # 1. Have no classification (never classified)
        # 2. Have been updated since the last classification (change detection)
        result = await session.execute(
            select(Repository).where(
                or_(
                    Repository.classification.is_(None),
                    and_(
                        Repository.classification_updated_at.is_not(None),
                        Repository.updated_at > Repository.classification_updated_at
                    )
                )
            ).limit(100)
        )
        repos = result.scalars().all()
        
        processed = 0
        errors = 0
        skipped = 0
        
        for repo in repos:
            try:
                # Classify
                prompt = build_classification_prompt(repo)
                classification = await ai_provider.classify_repository(prompt)
                
                # Embed
                text_to_embed = build_embedding_text(repo, classification)
                embedding = await ai_provider.generate_embedding(text_to_embed)
                
                # Update Repository
                repo.classification = classification
                repo.embedding = embedding
                repo.classification_updated_at = datetime.now(timezone.utc)
                
                processed += 1
            except Exception as e:
                logger.error(f"Error classifying repo {repo.id}: {e}")
                errors += 1
                
        if processed > 0:
            await session.commit()
            
        sync_state.items_processed += processed
        sync_state.total_processed += processed
        sync_state.total_errors += errors
        sync_state.total_skipped += skipped
        sync_state.status = "completed"
        sync_state.completed_at = datetime.now(timezone.utc)
        await update_sync_state(session, sync_state)
        
        return {
            "status": "success",
            "processed": processed,
            "errors": errors,
            "skipped": skipped
        }
