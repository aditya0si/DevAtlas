# Architecture — Sprint 10

## Real-Time GitHub Intelligence Pipeline

DevAtlas transforms from a static mock-data visualization into a live intelligence engine using an event-driven, decoupled worker pipeline.

### High-Level Flow

```mermaid
flowchart TD
    GH["GitHub REST API"] --> RIW["Repository Ingestion Worker"]
    RIW --> RS["Repository Storage (PostgreSQL)"]
    RIW --> UEW["User Enrichment Worker"]
    UEW --> LP["Location Intelligence Pipeline"]
    LP --> DB["PostGIS Spatial Data"]
    RS --> ACW["AI Classification Worker"]
    ACW --> EGW["Embedding Generation Worker"]
    EGW --> DB
    DB --> DSG["Daily Snapshot Generator"]
    DSG --> IGW["Insight Generation Worker"]
    IGW --> DB
    DB --> CACHE["Redis Cache Layer"]
    CACHE --> API["FastAPI REST Endpoints"]
    API --> FE["Next.js + MapLibre Frontend"]

    style GH fill:#24292e,stroke:#fff,color:#fff
    style DB fill:#336791,stroke:#fff,color:#fff
    style CACHE fill:#dc382d,stroke:#fff,color:#fff
    style API fill:#009688,stroke:#fff,color:#fff
    style FE fill:#000,stroke:#fff,color:#fff
```

### Component Details

1. **Repository Ingestion**
   - Bootstraps repositories matching criteria (e.g. `location:India`).
   - Uses `github_id` for UPSERT deduplication.
   - Saves cursors in `SyncState` for resumability.

2. **User Enrichment**
   - Hydrates `GitHubUser` profiles with bio, company, followers, etc.
   - Pushes raw locations to the **Location Intelligence Pipeline** (OSM/Nominatim) for geocoding and postGIS `geom` insertion.

3. **Incremental Sync**
   - Polls high-activity repositories for changes using ETags (HTTP 304).
   - Refreshes stale user profiles automatically.

4. **AI Pipeline (Classification & Embedding)**
   - **Classifier**: GPT-4o assigns domains, maturity, and health metrics to new repositories.
   - **Embedder**: `text-embedding-3-small` generates pgvector embeddings for semantic search.
   - Both are batched and skip previously processed items unless `updated_at` > `classification_updated_at`.

5. **Analytics & Insights**
   - Materializes deep aggregations into `AnalyticsSnapshot` daily.
   - Passes snapshots to `InsightService` to generate LLM-powered macro insights.

### Worker Orchestration
Managed by `arq` running over Redis with scheduled cron definitions in `WorkerSettings`.

### Observability
- Deep health endpoint: `/api/v1/observability/health/deep`
- Metrics summary: `/api/v1/observability/metrics/summary`
