import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import engine
from app.services.location_intelligence_service import LocationIntelligenceService
from app.workers.repo_ingestion_worker import get_sync_state, update_sync_state

logger = logging.getLogger(__name__)

async def run_user_enrichment(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Enriches GitHub users with full profiles and geocodes their locations.
    """
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session_factory() as session:
        service = LocationIntelligenceService(session)
        sync_state = await get_sync_state(session, "user_enrichment")
        
        sync_state.status = "in_progress"
        sync_state.started_at = datetime.now(timezone.utc)
        await update_sync_state(session, sync_state)
        
        try:
            # We fetch up to 200 users at a time due to GitHub rate limits
            result = await service.run_batch_enrichment(limit=200)
            
            sync_state.items_processed += result.processed
            sync_state.total_processed += result.processed
            sync_state.total_errors += result.errors
            
            sync_state.status = "completed"
            sync_state.completed_at = datetime.now(timezone.utc)
            await update_sync_state(session, sync_state)
            
            return {
                "status": "success",
                "processed": result.processed,
                "enriched": result.enriched,
                "errors": result.errors,
            }
        except Exception as e:
            logger.exception("Error during user enrichment")
            sync_state.status = "failed"
            sync_state.error_message = str(e)
            sync_state.completed_at = datetime.now(timezone.utc)
            await update_sync_state(session, sync_state)
            raise
        finally:
            await service.close()
