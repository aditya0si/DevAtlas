import logging
from arq.cron import cron
from arq.connections import RedisSettings
from app.core.config import get_settings

from app.workers.repo_ingestion_worker import run_repo_ingestion
from app.workers.user_enrichment_worker import run_user_enrichment
from app.workers.incremental_sync_worker import run_incremental_sync
from app.workers.ai_classification_worker import run_ai_classification
from app.workers.analytics_worker import run_analytics_worker

logger = logging.getLogger(__name__)
settings = get_settings()

class WorkerSettings:
    functions = [
        run_repo_ingestion,
        run_user_enrichment,
        run_incremental_sync,
        run_ai_classification,
        run_analytics_worker,
    ]
    
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL) if settings.REDIS_URL else RedisSettings()
    
    cron_jobs = [
        # Full syncs less frequently
        cron(run_repo_ingestion, hour=0, minute=0),
        
        # Incremental sync more frequently
        cron(run_incremental_sync, minute={0, 15, 30, 45}),
        
        # User enrichment every hour
        cron(run_user_enrichment, minute=10),
        
        # AI classification runs after enrichment
        cron(run_ai_classification, minute=20),
        
        # Analytics daily at 1 AM
        cron(run_analytics_worker, hour=1, minute=0),
    ]

    on_startup = None
    on_shutdown = None
