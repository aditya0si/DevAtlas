# DevAtlas Roadmap

## Milestone 1: Foundation ✅ COMPLETE

- Backend API scaffold ✅
- Database schema and migrations ✅
- GitHub ingestion pipeline ✅
- Frontend shell with map visualization ✅

## Milestone 2: Intelligence ✅ COMPLETE

- AI repository classification ✅
- Embedding storage and search ✅
- Trend analysis endpoints ✅

## Milestone 3: Productionization ✅ COMPLETE

- Authentication and authorization ✅
- Observability and logging ✅
- CI/CD and deployment automation ✅
- Background job processing ✅
- Rate limiting (Redis-backed) ✅
- Refresh token rotation ✅
- Email verification flow ✅
- WebSocket support for real-time updates ✅
- Grafana monitoring dashboards ✅
- Production deployment configuration ✅

## Milestone 4: Scale ✅ COMPLETE

### Horizontal Scaling with Kubernetes
- [x] HPA for backend deployment (CPU/memory-based auto-scaling, 3-20 replicas)
- [x] PDB for backend (min 2 available)
- [x] HPA for worker deployment (1-5 replicas)
- [x] PDB for worker (min 1 available)
- [x] EKS cluster Terraform configuration (`deploy/kubernetes/eks/terraform/main.tf`)
- [x] Node group setup (system, backend, worker)
- [x] IRSA for AWS Load Balancer Controller, External DNS, External Secrets

### Database Read Replicas
- [x] PostgreSQL replica deployment manifest
- [x] PgBouncer connection pooler for read/write routing
- [x] Read replica service configuration
- [x] PgBouncer transaction-mode configuration (`deploy/kubernetes/pgbouncer.ini`)
- [x] Database read replica promotion runbook (`deploy/kubernetes/postgres-promotion-runbook.md`)

### Caching Layer Optimization
- [x] Redis cache service (`app/core/cache.py`)
- [x] Repository list caching (5-min TTL)
- [x] Geospatial activity caching (2-min TTL)
- [x] Events caching (5-min TTL)
- [x] Cache invalidation endpoint (`POST /api/v1/sync/cache/invalidate`)
- [x] Cache integration in geospatial, repositories, events endpoints

### CDN for Static Assets
- [x] CloudFront distribution configuration (`deploy/cdn/cloudfront-config.json`)
- [x] Vercel deployment config with edge caching (`frontend/vercel.json`)
- [x] Cache headers for immutable assets (1-year)
- [x] SPA routing support (200 for /index.html on 404/403)
- [x] CDN invalidation automation (`deploy/cdn/invalidation.md`)
- [x] GitHub Actions workflow for automatic invalidation

### API Versioning Strategy
- [x] v2 API router (`app/api/v2.py`)
- [x] Cursor-based pagination (replaces offset)
- [x] v1 deprecation middleware (Sunset: 2027-03-31)
- [x] Deprecation headers (Deprecation, Sunset, Link, X-API-Deprecated)
- [x] v2 cache keys with namespace isolation

### API Gateway
- [x] Kong Gateway configuration (`deploy/kubernetes/kong-api-gateway.md`)
- [x] Rate limiting tiers (free, pro, enterprise)
- [x] JWT authentication plugin
- [x] CORS configuration
- [x] Request/response transformation
- [x] Circuit breaker and IP restriction
- [x] WebSocket support


## Milestone 5: Developer Intelligence Platform ✅ COMPLETE

### India-Centric Features
- [x] India heatmap with domain filters (AI, Cybersecurity, Healthcare, Robotics, Web, Mobile, DevOps, Blockchain, Open Source)
- [x] Time machine timeline slider (Last Week, Month, 3 Months, 6 Months, Year)
- [x] State dashboard with detailed analytics per Indian state
- [x] Interactive analytics graphs (repos over time, language popularity, domain distribution, state comparison, growth trends)
- [x] Ecosystem scores and leaderboard (Developer Activity, Innovation, Open Source, AI, Cybersecurity, Growth)
- [x] Discovery page (trending repos, technologies, states, organizations, AI projects, domains)
- [x] Semantic search with natural language queries using embeddings
- [x] Repository cards with AI-generated summaries
- [x] India overview homepage with key metrics and AI summary
- [x] Insight panels with AI-generated cards throughout the UI

### Backend Services
- [x] Insight service (`app/services/insight_service.py`) for AI-powered insight generation
- [x] India API router (`app/api/india.py`) with all endpoints
- [x] India schemas (`app/schemas/india.py`) for request/response validation
- [x] Domain filtering in geospatial endpoints
- [x] Time range filtering for historical data

### Frontend Components
- [x] `IndiaOverview.tsx` - Homepage with AI summary and key metrics
- [x] `DeveloperMap.tsx` - Enhanced heatmap with domain and time filters
- [x] `StateDashboard.tsx` - Detailed state analytics dashboard
- [x] `AnalyticsGraphs.tsx` - Interactive animated graphs
- [x] `EcosystemScores.tsx` - Leaderboard with score breakdown
- [x] `Discovery.tsx` - Trending and discovery content
- [x] `SemanticSearch.tsx` - Natural language repository search
- [x] `InsightPanel.tsx` - AI-generated insight cards

### API Endpoints
- `GET /api/v1/india/stats` - Ecosystem statistics
- `GET /api/v1/india/insights` - AI-generated insights
- `GET /api/v1/india/insights/summary` - AI summary generation
- `GET /api/v1/india/overview` - India homepage data
- `GET /api/v1/india/states/{state}` - State dashboard
- `GET /api/v1/india/analytics/graphs` - Analytics graph data
- `GET /api/v1/india/scores` - Ecosystem scores
- `GET /api/v1/india/discovery` - Discovery content
- `POST /api/v1/india/search/semantic` - Semantic search
- `GET /api/v1/india/repositories/{id}/card` - Repository card
- `GET /api/v1/geospatial/activity?domain=ai` - Filtered heatmap data
- `GET /api/v1/geospatial/activity?time_range=month` - Time-filtered data

### Tests
- [x] `test_india.py` - India API endpoint tests
- [x] Schema validation tests
- [x] Geospatial filter tests

## Milestone 6: Intelligence & Comparative Analytics ✅ COMPLETE

### Trend Explanation Engine
- [x] `trend_explanation_service.py` - AI-powered trend explanation service
- [x] `TrendExplanation` model with summary, key drivers, unusual observations, confidence score
- [x] `ComparisonSummary` model for state comparisons
- [x] `ComparisonInsight` model for specific comparison insights
- [x] `StateComparisonData` model for comprehensive comparison data
- [x] Support for national, state, city, technology, organization, repository entity types
- [x] AI-generated explanations with fallback to structured explanations

### Explain This Graph
- [x] ✨ Explain button added to AnalyticsGraphs component
- [x] Modal overlay with AI analysis panel
- [x] Displays summary, key drivers, unusual observations, notable changes
- [x] Confidence score visualization
- [x] Smooth animations and professional styling

### Compare States Dashboard
- [x] `CompareStates.tsx` - Dedicated comparison frontend component
- [x] State selector dropdowns with swap functionality
- [x] Side-by-side comparison with bar charts
- [x] Radar chart visualization for multi-metric comparison
- [x] Tabbed interface (overview, domains, languages, orgs)
- [x] AI-generated comparison summary card
- [x] Expandable comparison insights
- [x] Recommendations section

### AI Comparison Summary
- [x] Automatic generation after state comparison
- [x] Highlights strengths and weaknesses
- [x] Identifies opportunities and recommendations
- [x] Data-driven, avoids hallucination
- [x] Confidence scoring

### Comparison Insights
- [x] Automatic generation of specific insights
- [x] Insight types: growth, dominance, emerging, closing_gap
- [x] Metric-by-metric comparison
- [x] Winner determination with confidence levels
- [x] Expandable detail cards

### API Endpoints
- `POST /api/v1/india/trends/explain` - Generate trend explanation
- `GET /api/v1/india/compare` - Compare two states comprehensively
- `GET /api/v1/india/compare/insights` - Get comparison insights

### Architecture
- [x] Reusable comparison abstractions supporting Country, State, City, Organization, University, Developer
- [x] Extends existing InsightService patterns
- [x] Consistent schema-first design with Pydantic V2
- [x] Async LLM integration with fallback handling

### Tests
- [x] `test_trend_explanation.py` - Trend explanation service tests
- [x] Schema validation tests for new models
- [x] API endpoint tests for compare and explain endpoints
- [x] Frontend component logic tests

## Milestone 7: Cinematic Experience Overhaul ✅ COMPLETE

### Storytelling & Interaction
- [x] **Cinematic Intro**: Sequential initial loading screen transitioning into a smooth MapLibre fly-in from space to the "Mission Control" isometric perspective.
- [x] **Story Mode**: Guided autonomous tour highlighting top tech hubs (Mumbai -> Bengaluru -> Hyderabad) with custom camera sweeps and narrative overlays.
- [x] **Ask DevAtlas (AI Copilot)**: Semantic search bar that automatically triggers camera movements to relevant locations and displays contextual AI insights.

### Living UI & Data Visualization
- [x] **Time Machine Slider**: Interactive bottom dock slider allowing users to scrub historical geographical data layers (2022-2026).
- [x] **Living Statistics**: Auto-ticking data components to create a sense of real-time polling.
- [x] **Developer Pulse Ticker**: Bottom marquee scrolling live ecosystem events.
- [x] **Progressive Information Layers**: Zoom-based mapping where the view gracefully transitions from abstract heatmaps to clustered nodes, avoiding visual clutter.

### Playwright E2E Validation
- [x] Configured headless Chromium and WebKit matrices.
- [x] End-to-end tests validating the initial cinematic sequence, timeline interactions, story mode, and semantic search integration.
- [x] Generated comprehensive QA validation report evaluating visual fidelity, accessibility, animations, and cross-browser responsiveness.

## Milestone 8: Location Intelligence & Geocoding Pipeline ✅ COMPLETE

### Database & Ingestion
- [x] Designed `github_users` table to track owners (users and organizations) and store normalized locations.
- [x] Implemented `location_cache` table to permanently cache Nominatim responses and prevent rate limit exhaustion.
- [x] Integrated PostGIS spatial coordinates (`Geometry`) for normalized user location points.

### Geocoding & Enrichment Engine
- [x] Built geocoding service integrating with OpenStreetMap's **Nominatim API**.
- [x] Implemented two-tier caching: Local fast Redis + permanent PostgreSQL database caching.
- [x] Developed a confidence scoring algorithm (0-100) based on location matching granularity.
- [x] Implemented a background worker synchronization job (ARQ-backed) to periodically enrich users in batches.

### API Endpoints
- [x] `POST /api/v1/location-intelligence/enrich/{login}` - Trigger manual enrichment for a user.
- [x] Updated `/api/v1/geospatial/activity` to perform spatial joins with `github_users` locations.

## Milestone 9: Stability & E2E Validation ✅ COMPLETE

### Bug Fixing & Middleware Stability
- [x] Resolved client-side Maplibre GL initialization crash by deferring instantiation to mounting lifecycle.
- [x] Fixed Starlette metrics middleware `UnboundLocalError` to ensure handler exceptions bubble up cleanly.
- [x] Resolved backend SQL query errors by binding the missing `min_confidence` parameter and adjusting the GROUP BY clause to match SELECT expressions.
- [x] Corrected Next.js ref-forwarding limits inside dynamic imports using an `onReady` actions callback.

### Styling & Layout
- [x] Corrected Tailwind CSS directory scan paths in `tailwind.config.ts` to look inside `./src/app` and `./src/components`, restoring the full UI layout and styles.
- [x] Verified all 5 E2E Playwright validation tests pass successfully.

## Milestone 10: Real-Time GitHub Intelligence Engine ✅ COMPLETE

### Architecture Overview
Transforms the pipeline from simple sync-based to fully **event-driven ingestion pipeline** with decoupled stages. Each worker stage has one responsibility, can be monitored independently, retried on failure, and scaled horizontally.

### Session 1: Schema Evolution & Sync State Infrastructure
- [x] `SyncState` model for tracking sync cursors and resumable progress
- [x] `AnalyticsSnapshot` model for daily/hourly aggregated metrics
- [x] `WorkerRun` model for monitoring worker execution
- [x] Enriched `GitHubUser` with followers, following, organizations, enrichment_status
- [x] Enriched `Repository` with license, archived, size, subscribers_count, has_wiki, has_pages, homepage
- [x] Alembic migration `b8b9bd0d046a_sprint10_schema_evolution`
- [x] GIN index on `Repository.classification` JSONB
- [x] GiST spatial index on `Repository.geom`

### Session 2: Production GitHub API Client
- [x] `GitHubAPIClient` class with ETag support and conditional requests
- [x] Automatic pagination with Link header parsing
- [x] Rate limit tracking and automatic backoff
- [x] Retry with exponential backoff via tenacity
- [x] Request statistics tracking (requests_made, cache_hits, errors)

### Session 3: Repository Ingestion Worker
- [x] India-focused search queries (Bangalore, Mumbai, Delhi, Hyderabad, Chennai, Pune, etc.)
- [x] Bulk upsert with `INSERT ... ON CONFLICT DO UPDATE`
- [x] Resumable ingestion via SyncState cursor
- [x] Deduplication via github_id unique constraint

### Session 4: User Profile Enrichment Worker
- [x] Full profile fetching (bio, company, followers, orgs)
- [x] Location Intelligence Pipeline integration
- [x] Enrichment status tracking (pending/enriched/failed)
- [x] Batch processing with rate limit compliance

### Session 5: Incremental Synchronization
- [x] `incremental_sync_worker.py` with event sync + stale user refresh
- [x] Retry logic with exponential backoff (1min, 5min, 30min)
- [x] SyncState tracking for all sync types

### Session 6: AI Classification & Embedding Workers
- [x] `ai_service.py` with pluggable Gemini/OpenAI providers
- [x] `ai_classification_worker.py` for automatic repository classification
- [x] Change detection (only reclassify if repo changed since last classification)
- [x] Batch embedding generation with OpenAI embeddings API

### Session 7: Analytics Snapshots & Insight Generation
- [x] `analytics_worker.py` for daily/hourly aggregation
- [x] Direct aggregation queries (no mock data)
- [x] Insight generation ("Trending: Rust in AI", "Top City: Bengaluru")
- [x] Saves into `AnalyticsSnapshot` table

### Session 8: Live API — Wire Frontend to Real Data
- [x] Geospatial API returns GeoJSON FeatureCollection
- [x] `DeveloperMap.tsx` consumes GeoJSON directly
- [x] `SemanticSearch.tsx` wired to `/api/v1/india/search/semantic`
- [x] Analytics API (`/api/v1/analytics/snapshots`) created

### Session 9: Background Worker Orchestration
- [x] `app/workers/main.py` with ARQ WorkerSettings + cron scheduling
- [x] Sync API expanded with `/sync/enrich-users`, `/sync/classify`, `/sync/analytics`, `/sync/pipeline`
- [x] Docker-compose worker service updated to `arq app.workers.main.WorkerSettings`

### Session 10: Observability & Metrics
- [x] `/api/v1/observability/health/deep` — DB, data, workers, sync state checks
- [x] `/api/v1/observability/metrics/summary` — repo/user/language/domain aggregations

### Session 11: Performance Optimization
- [x] GIN index on `Repository.classification` JSONB
- [x] GiST spatial index on `Repository.geom`
- [x] Geospatial query returns individual repo features for richer map data

### New Dependencies
- `tenacity>=8.2.0` — Retry with exponential backoff
- `croniter>=2.0.0` — Cron expression parsing

### API Endpoints Added/Modified
- `POST /api/v1/sync/pipeline` — Trigger full ingestion pipeline
- `POST /api/v1/sync/enrich-users` — Trigger user enrichment
- `POST /api/v1/sync/classify` — Trigger AI classification
- `POST /api/v1/sync/analytics` — Trigger analytics snapshot
- `GET /api/v1/analytics/snapshots` — List snapshots
- `GET /api/v1/analytics/snapshots/latest` — Most recent snapshot
- `GET /api/v1/observability/health/deep` — Deep health check
- `GET /api/v1/observability/metrics/summary` — Metrics summary

### Workers Registered
| Worker | Schedule | Purpose |
|--------|----------|---------|
| `run_repo_ingestion` | Daily at midnight | Bootstrap/catch-up ingestion |
| `run_incremental_sync` | Every 15 minutes | Incremental repo sync |
| `run_user_enrichment` | Hourly at :10 | User profile enrichment |
| `run_ai_classification` | Hourly at :20 | AI classification |
| `run_analytics_worker` | Daily at 1:00 AM | Analytics snapshots |

### Tests
- [x] `test_models_sprint10.py` — SyncState, AnalyticsSnapshot, WorkerRun models
- [x] `test_github_api_client.py` — GitHubAPIClient with ETag/pagination/retry
- [x] `test_repo_ingestion_worker.py` — Repository ingestion
- [x] `test_user_enrichment_worker.py` — User enrichment
- [x] `test_incremental_sync.py` — Incremental sync
- [x] `test_ai_classification_worker.py` — AI classification
- [x] `test_analytics_worker.py` — Analytics snapshots



