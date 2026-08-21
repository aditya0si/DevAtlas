import logging
from arq.cron import cron
from arq.connections import RedisSettings
from app.core.config import get_settings

from app.workers.repo_ingestion_worker import run_repo_ingestion
from app.workers.user_enrichment_worker import run_user_enrichment
from app.workers.incremental_sync_worker import run_incremental_repo_sync
from app.workers.ai_classification_worker import run_classification_worker
from app.workers.analytics_worker import run_analytics_worker
from app.workers.push_event_ingestion_worker import run_push_event_ingestion
from app.workers.event_enrichment_worker import run_event_enrichment
from app.workers.activity_score_worker import run_activity_score
from app.workers.ecosystem_score_worker import run_ecosystem_score
from app.workers.aggregation_worker import run_aggregation

logger = logging.getLogger(__name__)
settings = get_settings()

class WorkerSettings:
    functions = [
        run_repo_ingestion,
        run_user_enrichment,
        run_incremental_repo_sync,
        run_classification_worker,
        run_analytics_worker,
        run_push_event_ingestion,
        run_event_enrichment,
        run_activity_score,
        run_ecosystem_score,
        run_aggregation,
    ]
    
    redis_settings = RedisSettings.from_dsn(settings.redis_url) if settings.redis_url else RedisSettings()
    
    cron_jobs = [
        # Existing workers
        cron(run_repo_ingestion, hour=0, minute=0),
        cron(run_incremental_repo_sync, minute={0, 15, 30, 45}),
        cron(run_user_enrichment, minute=10),
        cron(run_classification_worker, minute=20),
        cron(run_analytics_worker, hour=1, minute=0),
        
        # Push Event Ingestion - every 2 hours at :30
        cron(run_push_event_ingestion, minute=30, hour={0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22}),
        
        # Event Enrichment - every hour at :45 (after user enrichment)
        cron(run_event_enrichment, minute=45),
        
        # Aggregation - every hour at :55
        cron(run_aggregation, minute=55),
        
        # Activity Score - daily at 2 AM (after analytics)
        cron(run_activity_score, hour=2, minute=0),
        
        # Ecosystem Score - daily at 3 AM (after activity score)
        cron(run_ecosystem_score, hour=3, minute=0),
    ]

    on_startup = None
    on_shutdown = None
