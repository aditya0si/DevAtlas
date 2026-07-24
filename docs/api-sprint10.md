# API Reference — Sprint 10

## Sync & Orchestration (`/api/v1/sync`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sync/full` | `POST` | Enqueues a full bootstrap repository ingestion job. |
| `/sync/incremental` | `POST` | Enqueues incremental sync based on ETags. |
| `/sync/enrich-users` | `POST` | Enqueues user profile and location enrichment job. |
| `/sync/classify` | `POST` | Enqueues AI repository classification and embedding generation. |
| `/sync/analytics` | `POST` | Enqueues daily `AnalyticsSnapshot` materialization. |
| `/sync/pipeline` | `POST` | Enqueues the full sequence of ingestion → enrichment → classification → analytics. |
| `/sync/status/{job_id}` | `GET` | Retrieve ARQ job status and result. |

## Observability (`/api/v1/observability`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/observability/health/deep` | `GET` | Checks DB connectivity, worker status arrays, sync states, and record counts. |
| `/observability/metrics/summary` | `GET` | Aggregated JSON of repo counts, classified repo ratios, top languages, and domains. |

## Analytics (`/api/v1/analytics`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics/snapshots` | `GET` | List all historical analytics snapshots. |
| `/analytics/snapshots/latest` | `GET` | Get the most recent daily or hourly snapshot. |

## India Ecosystem (`/api/v1/india`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/india/search/semantic` | `POST` | Uses `pgvector` to find repositories by conceptual similarity to the query. |
| `/india/stats` | `GET` | High-level live counters (Developers, Repositories). |
| `/india/discovery` | `GET` | Dynamic trending algorithm for repositories based on stars and recent updates. |

## Geospatial (`/api/v1/geospatial`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/geospatial/activity` | `GET` | Returns GeoJSON `FeatureCollection` of developers' repositories for map rendering. |
