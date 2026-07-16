# PLAN: Sprint 10 — Real-Time GitHub Intelligence Engine

## GOAL DEFINITION

1. **What is being built or changed?**
   A production-grade event-driven ingestion pipeline that continuously fetches real GitHub repositories and user profiles, enriches them with AI classification, embeddings, and geocoded locations, stores daily analytics snapshots, and serves everything through FastAPI endpoints — replacing ALL mock/hardcoded data in the DevAtlas frontend with live, real data.

2. **What does "done" look like?**
   - The PostgreSQL database contains ≥1,000 real GitHub repositories from Indian developers
   - Every repository owner has a full GitHub profile with geocoded location
   - AI classifications and embeddings exist for all repositories
   - Daily analytics snapshots power the Timeline, Graphs, and Developer Pulse
   - The frontend displays zero hardcoded values — every number comes from the API
   - All backend tests pass, Playwright E2E tests pass, documentation is updated

3. **What is explicitly out of scope?**
   - UI/UX redesign (frontend changes are data-wiring only)
   - Adding new frontend features or components
   - Multi-tenancy or user-facing auth changes
   - Deployment to production cloud infrastructure
   - Additional data sources (Hugging Face, Devpost, Kaggle) — these are future work

---

## TECH STACK

| Layer | Technology | Decision |
|-------|-----------|----------|
| Runtime | Python 3.11+ | Existing |
| API | FastAPI 0.111 | Existing |
| ORM | SQLAlchemy 2.0 (async) + GeoAlchemy2 | Existing |
| Database | PostgreSQL 16 + PostGIS 3.4 | Existing |
| Cache/Queue | Redis 7 + ARQ | Existing |
| HTTP Client | httpx (async) | Existing |
| AI | Pluggable AI architecture (Primary: Gemini) | Changed per user request |
| Geocoding | Nominatim (OSM) | Existing |
| Monitoring | Prometheus + Grafana | Existing |
| Testing | pytest + Playwright | Existing |
| Frontend | Next.js 14 + MapLibre GL JS | Existing — no changes to framework |
| New: Retry | tenacity ≥8.2.0 | Chosen for production-grade retry with exponential backoff |
| New: Cron | croniter ≥2.0.0 | Chosen for flexible schedule parsing |

---

## SESSION MODULARIZATION

### Session 1: Schema Evolution & Sync State Infrastructure
- **OBJECTIVE**: Extend database schema to support production-grade sync tracking, richer user profiles, and analytics snapshots
- **SCOPE**: `backend/app/models/github.py`, new Alembic migration
- **OUTPUT**: New models `SyncState`, `AnalyticsSnapshot`, `WorkerRun`; enriched `Repository` and `GitHubUser` columns; migration applied
- **CONNECTS TO**: Session 2 uses `SyncState` for cursor tracking; Session 4 uses new `GitHubUser` columns; Session 7 uses `AnalyticsSnapshot`
- **FAILURE SURFACE**: Migration conflict with existing data; PostGIS column type mismatches

### Session 2: Production GitHub API Client
- **OBJECTIVE**: Build a robust async GitHub API client with ETags, pagination, rate limiting, retries
- **SCOPE**: `backend/app/services/github_api_client.py` (new), `backend/app/utils/rate_limiter.py` (deprecate)
- **OUTPUT**: `GitHubAPIClient` class with search, paginate, ETag support, retry logic
- **CONNECTS TO**: Sessions 3, 4, 5 all use this client for GitHub API access
- **FAILURE SURFACE**: Rate limit handling edge cases; ETag storage/retrieval bugs

### Session 3: Repository Ingestion Worker
- **OBJECTIVE**: Bootstrap job to ingest real India-located GitHub repositories with deduplication and resumable progress
- **SCOPE**: `backend/app/workers/repo_ingestion_worker.py` (new), `backend/app/repositories/github_repository.py` (bulk upsert)
- **OUTPUT**: Worker that ingests ≥1,000 repos into PostgreSQL; resumable via SyncState cursor
- **CONNECTS TO**: Session 4 processes the users discovered here; Session 6 classifies these repos
- **FAILURE SURFACE**: GitHub Search API rate limits (30 req/min); query result limits (1000 per query)

### Session 4: User Profile Enrichment Worker
- **OBJECTIVE**: Fetch full GitHub profiles for all repo owners, resolve locations via Location Intelligence Pipeline
- **SCOPE**: `backend/app/workers/user_enrichment_worker.py` (new), `backend/app/services/location_intelligence_service.py` (extend)
- **OUTPUT**: All discovered users have full profiles; locations geocoded and stored as PostGIS points
- **CONNECTS TO**: Session 8 serves this data via geospatial endpoints; Session 7 aggregates it
- **FAILURE SURFACE**: Nominatim rate limiting; ambiguous location strings

### Session 5: Incremental Synchronization
- **OBJECTIVE**: Scheduled jobs for incremental repo/event sync — no full refreshes
- **SCOPE**: `backend/app/workers/github_sync.py` (refactor)
- **OUTPUT**: Three cron jobs (4h repo sync, 2h event sync, daily stale user refresh)
- **CONNECTS TO**: Keeps all downstream workers fed with fresh data
- **FAILURE SURFACE**: Time window gaps if worker fails; SyncState cursor corruption

### Session 6: AI Classification & Embedding Workers
- **OBJECTIVE**: Classify all repos with expanded schema; generate embeddings; change detection
- **SCOPE**: `backend/app/services/classification_service.py`, `backend/app/services/embedding_service.py`, two new workers
- **OUTPUT**: Every repo has classification JSON + embedding vector; semantic search works with real data
- **CONNECTS TO**: Session 7 aggregates classifications; Session 8 serves search results
- **FAILURE SURFACE**: OpenAI API costs; model output schema mismatches; embedding dimension mismatches

### Session 7: Analytics Snapshots & Insight Generation
- **OBJECTIVE**: Daily aggregation snapshots powering all analytics views
- **SCOPE**: `backend/app/workers/snapshot_worker.py` (new), `backend/app/workers/insight_generation_worker.py` (new)
- **OUTPUT**: Daily snapshots in `analytics_snapshots` table; fresh AI insights
- **CONNECTS TO**: Session 8 serves snapshots via API
- **FAILURE SURFACE**: Slow aggregation queries on large datasets; snapshot schema changes

### Session 8: Live API — Wire Frontend to Real Data
- **OBJECTIVE**: Replace all mock data in API responses with real database queries
- **SCOPE**: `backend/app/api/india.py`, `backend/app/api/geospatial.py`, new `snapshot_api.py`; frontend data-wiring changes
- **OUTPUT**: Every frontend component displays real data; zero hardcoded values remain
- **CONNECTS TO**: Session 11 for performance; Session 12 for Playwright validation
- **FAILURE SURFACE**: Query performance on unoptimized tables; frontend data format mismatches

### Session 9: Background Worker Orchestration
- **OBJECTIVE**: Unified ARQ scheduling with worker independence, admin API
- **SCOPE**: `backend/app/workers/github_sync.py` (consolidate), `backend/app/api/worker_api.py` (new)
- **OUTPUT**: Single WorkerSettings with all cron schedules; admin endpoints for monitoring/triggering
- **CONNECTS TO**: Session 10 metrics integrate with worker runs
- **FAILURE SURFACE**: Cron schedule overlaps; concurrent worker conflicts

### Session 10: Observability & Metrics
- **OBJECTIVE**: Prometheus counters/gauges for entire pipeline; Grafana dashboard
- **SCOPE**: `backend/app/core/metrics.py` (extend), Grafana dashboard JSON
- **OUTPUT**: Full pipeline visibility in Grafana
- **CONNECTS TO**: Session 12 documents monitoring
- **FAILURE SURFACE**: Metric cardinality explosion; dashboard configuration errors

### Session 11: Performance Optimization
- **OBJECTIVE**: Bulk operations, indexes, Redis caching strategy, connection pooling
- **SCOPE**: Repository layer, database indexes, Redis cache config
- **OUTPUT**: Sub-second API responses; efficient bulk operations
- **CONNECTS TO**: Session 8 benefits from caching; all workers benefit from bulk ops
- **FAILURE SURFACE**: Index bloat; cache invalidation timing

### Session 12: Documentation & Playwright Validation
- **OBJECTIVE**: Update all docs; final E2E validation
- **SCOPE**: `docs/`, `devAtlas_progress.md`, Playwright tests
- **OUTPUT**: Architecture diagrams, API docs, passing E2E tests, updated roadmap
- **CONNECTS TO**: Sprint completion
- **FAILURE SURFACE**: Playwright test flakiness with real data timing

---

## PROGRESS CHECKLIST

- [/] Session 1: Schema Evolution & Sync State Infrastructure
  - [ ] SyncState, AnalyticsSnapshot, WorkerRun models created
  - [ ] GitHubUser enriched with followers, following, organizations, enrichment_status
  - [ ] Repository enriched with license, archived, size, subscribers_count
  - [ ] Alembic migration generated and applied
  - [ ] All new indexes created
  - [ ] `pytest tests/test_models_sprint10.py` passes

- [ ] Session 2: Production GitHub API Client
  - [ ] GitHubAPIClient class with ETag support
  - [ ] Automatic pagination with Link header parsing
  - [ ] Rate limit tracking and automatic backoff
  - [ ] Retry with exponential backoff via tenacity
  - [ ] Request statistics tracking
  - [ ] `pytest tests/test_github_api_client.py` passes

- [ ] Session 3: Repository Ingestion Worker
  - [ ] India-focused search queries defined
  - [ ] Bulk upsert with INSERT ... ON CONFLICT
  - [ ] Resumable ingestion via SyncState cursor
  - [ ] Deduplication via github_id unique constraint
  - [ ] ≥1,000 real repositories ingested
  - [ ] `pytest tests/test_repo_ingestion_worker.py` passes

- [ ] Session 4: User Profile Enrichment Worker
  - [ ] Full profile fetching (bio, company, followers, orgs)
  - [ ] Location Intelligence Pipeline integration
  - [ ] Enrichment status tracking (pending/enriched/failed)
  - [ ] Batch processing with rate limit compliance
  - [ ] `pytest tests/test_user_enrichment_worker.py` passes

- [ ] Session 5: Incremental Synchronization
  - [ ] 4-hour incremental repo sync job
  - [ ] 2-hour event sync with ETags
  - [ ] Daily stale user refresh
  - [ ] SyncState cursor tracking
  - [ ] Retry logic with 3 attempts + exponential backoff
  - [ ] `pytest tests/test_incremental_sync.py` passes

- [ ] Session 6: AI Classification & Embedding Workers
  - [ ] Expanded classification schema (domain, technology, framework, difficulty, industry, health)
  - [ ] Change detection: skip unchanged repos
  - [ ] Classification worker with batch processing
  - [ ] Embedding worker with batch OpenAI calls
  - [ ] Embeddings stored in dedicated column
  - [ ] `pytest tests/test_ai_classification_worker.py` passes

- [ ] Session 7: Analytics Snapshots & Insight Generation
  - [ ] Daily snapshot aggregation worker
  - [ ] Snapshot metrics: repos, devs, by_domain, by_language, by_state, growth
  - [ ] Insight generation from real snapshot data
  - [ ] `pytest tests/test_snapshot_worker.py` passes

- [ ] Session 8: Live API — Wire Frontend to Real Data
  - [ ] /india/stats returns real counts
  - [ ] /india/overview returns real metrics + AI summary
  - [ ] /india/states/{state} returns real PostGIS-joined data
  - [ ] /india/analytics/graphs returns real snapshot time series
  - [ ] /india/discovery returns real trending repos
  - [ ] /india/search/semantic returns real embedding matches
  - [ ] DeveloperPulse fetches from API
  - [ ] MiniStats fetches from API
  - [ ] `pytest tests/test_india_live.py` passes

- [ ] Session 9: Background Worker Orchestration
  - [ ] Unified WorkerSettings with all cron schedules
  - [ ] Worker independence (failures don't block pipeline)
  - [ ] WorkerRun tracking for every execution
  - [ ] Admin API for trigger/status/history
  - [ ] `pytest tests/test_worker_api.py` passes

- [ ] Session 10: Observability & Metrics
  - [ ] Prometheus counters for GitHub API, workers, pipeline
  - [ ] Grafana dashboard created
  - [ ] Metrics endpoint verified

- [ ] Session 11: Performance Optimization
  - [ ] Bulk INSERT ... ON CONFLICT replaces row-by-row loops
  - [ ] Partial indexes for unclassified repos
  - [ ] Redis caching strategy with defined TTLs
  - [ ] Connection pool tuned (pool_size=20)

- [ ] Session 12: Documentation & Playwright Validation
  - [ ] Architecture diagram in docs/
  - [ ] API documentation for new endpoints
  - [ ] Roadmap updated with Milestone 10
  - [ ] devAtlas_progress.md updated
  - [ ] Playwright E2E tests all pass
  - [ ] No mock data remains in any frontend component
