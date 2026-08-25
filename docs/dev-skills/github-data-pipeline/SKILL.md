---
name: github-data-pipeline
description: "Use when building data pipelines for GitHub API ingestion, batch processing, incremental syncing, or ETL workflows. Invoke for rate limit handling, pagination strategies, event stream processing, and loading GitHub data into PostgreSQL. Trigger terms: GitHub API, data pipeline, ETL, batch processing, incremental sync, rate limit, pagination, GitHub Events API, data ingestion, streaming, event processing, Octokit, webhook."
license: MIT
metadata:
  author: DevAtlas
  version: "1.0.0"
  domain: data-engineering
  triggers: GitHub API, data pipeline, ETL, batch processing, incremental sync, rate limit, pagination, GitHub Events API, data ingestion, streaming, event processing, Octokit, webhook
  roles: specialist
  scope: implementation
  output-format: code
  related-skills:
    - fastapi-expert
    - postgres-pro
    - github-api-expert
---

# GitHub Data Pipeline

Senior data engineer specializing in GitHub API data ingestion, ETL pipelines, and batch processing for large-scale developer ecosystem analytics.

## When to Use This Skill

- Building data pipelines to ingest GitHub Events API data
- Implementing incremental sync strategies for repository metadata
- Processing large-scale GitHub activity streams
- Loading bulk data into PostgreSQL with batch operations
- Handling GitHub API rate limits and pagination
- Scheduling and orchestrating data pipeline jobs

## Core Competencies

### GitHub API Rate Limit Management

**Rate Limit Strategy:**
```python
import httpx
from datetime import datetime, timedelta

class GitHubRateLimiter:
    def __init__(self, token: str):
        self.token = token
        self.remaining = 5000  # Authenticated: 5000/hr
        self.reset_time = datetime.utcnow() + timedelta(hours=1)
        self.client = httpx.Client(
            headers={"Authorization": f"token {token}"},
            timeout=30.0
        )

    async def request(self, method: str, url: str, **kwargs):
        """Make rate-limit-aware GitHub API request."""
        if datetime.utcnow() >= self.reset_time:
            self.remaining = 5000
            self.reset_time = datetime.utcnow() + timedelta(hours=1)

        if self.remaining <= 10:
            wait_seconds = (self.reset_time - datetime.utcnow()).total_seconds()
            await asyncio.sleep(max(wait_seconds, 0))

        response = await self.client.request(method, url, **kwargs)
        self.remaining = int(response.headers.get('X-RateLimit-Remaining', 0))
        self.reset_time = datetime.fromtimestamp(
            int(response.headers.get('X-RateLimit-Reset', 0))
        )
        return response
```

**GraphQL vs REST for Bulk Data:**
```python
# GraphQL: More efficient for bulk repository data
GRAPHQL_QUERY = """
query ($cursor: String) {
  search(query: "stars:>100", type: REPOSITORY, first: 100, after: $cursor) {
    edges {
      node {
        ... on Repository {
          id
          name
          stargazerCount
          primaryLanguage { name }
          owner { login }
          createdAt
          updatedAt
        }
      }
    }
    pageInfo { endCursor hasNextPage }
  }
}
"""

# REST: Better for event streams and webhooks
EVENTS_URL = "https://api.github.com/repos/{owner}/{repo}/events?per_page=100"
```

### Incremental Sync Patterns

**Cursor-based Sync:**
```python
import asyncpg
from datetime import datetime

class GitHubSyncPipeline:
    def __init__(self, db_pool: asyncpg.Pool, rate_limiter: GitHubRateLimiter):
        self.db = db_pool
        self.rate_limiter = rate_limiter

    async def sync_repositories(self, since: datetime = None):
        """Incremental sync of repositories updated since last run."""
        last_sync = since or await self.get_last_sync_time()

        async with self.db.acquire() as conn:
            # Find repositories updated since last sync
            repos = await conn.fetch("""
                SELECT id, name, owner, last_activity_at
                FROM repositories
                WHERE last_activity_at > $1
                ORDER BY last_activity_at DESC
                LIMIT 1000
            """, last_sync)

            for repo in repos:
                await self.sync_repo_events(repo['id'], repo['owner'], repo['name'])

        await self.update_sync_time(datetime.utcnow())

    async def sync_repo_events(self, repo_id: str, owner: str, name: str):
        """Sync events for a single repository."""
        url = f"https://api.github.com/repos/{owner}/{name}/events?per_page=100"

        while url:
            response = await self.rate_limiter.request("GET", url)
            events = response.json()

            if not events:
                break

            await self.bulk_insert_events(repo_id, events)

            # Handle pagination
            if 'next' in response.links:
                url = response.links['next']['url']
            else:
                url = None
```

**Timestamp-based Sync:**
```python
async def sync_since_timestamp(self, since: datetime):
    """Sync all repositories active since a timestamp."""
    async with self.rate_limiter.client.get(
        "https://api.github.com/repositories",
        params={"since": since.timestamp(), "per_page": 100}
    ) as response:
        while response.status_code == 200:
            repos = response.json()
            if not repos:
                break

            await self.bulk_upsert_repositories(repos)

            if 'next' in response.links:
                await asyncio.sleep(1)  # Respect rate limits
                response = await self.rate_limiter.request(
                    "GET",
                    response.links['next']['url']
                )
            else:
                break
```

### Batch Loading into PostgreSQL

**Bulk Insert Pattern:**
```python
import asyncpg
from typing import List, Dict

async def bulk_insert_events(conn: asyncpg.Connection, events: List[Dict]):
    """Efficiently bulk insert GitHub events."""
    if not events:
        return

    # Prepare batch data
    rows = []
    for event in events:
        rows.append((
            event['id'],
            event['type'],
            event['actor']['id'],
            event['repo']['id'],
            event['created_at'],
            json.dumps(event)  # Store full event payload
        ))

    # Use COPY for maximum throughput
    await conn.copy_records_to_table(
        'github_events',
        records=rows,
        columns=['id', 'event_type', 'actor_id', 'repo_id', 'created_at', 'payload']
    )

async def bulk_upsert_repositories(conn: asyncpg.Connection, repos: List[Dict]):
    """Upsert repositories with conflict handling."""
    await conn.executemany("""
        INSERT INTO repositories (id, name, owner, stars, language, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET stars = EXCLUDED.stars,
            language = EXCLUDED.language,
            updated_at = EXCLUDED.updated_at
    """, [
        (
            repo['id'],
            repo['name'],
            repo['owner']['login'],
            repo['stargazer_count'],
            repo.get('language'),
            datetime.utcnow()
        )
        for repo in repos
    ])
```

**Connection Pool Configuration:**
```python
# FastAPI lifespan setup
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create connection pool for bulk operations
    pool = await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=10,
        max_size=50,
        command_timeout=60
    )
    app.state.db_pool = pool
    yield
    await pool.close()
```

### Event Stream Processing

**Real-time Event Processing:**
```python
import asyncio
from collections import defaultdict

class EventStreamProcessor:
    def __init__(self, db_pool: asyncpg.Pool):
        self.db = db_pool
        self.buffer = defaultdict(list)
        self.buffer_size = 1000
        self.flush_interval = 60  # seconds

    async def process_event(self, event: Dict):
        """Process a single GitHub event."""
        event_type = event['type']
        repo_id = event['repo']['id']

        # Buffer events by repository
        self.buffer[repo_id].append(event)

        # Flush when buffer is full
        if sum(len(v) for v in self.buffer.values()) >= self.buffer_size:
            await self.flush_buffer()

    async def flush_buffer(self):
        """Flush buffered events to database."""
        async with self.db.acquire() as conn:
            async with conn.transaction():
                for repo_id, events in self.buffer.items():
                    await bulk_insert_events(conn, events)
        self.buffer.clear()

    async def start_periodic_flush(self):
        """Periodically flush buffer."""
        while True:
            await asyncio.sleep(self.flush_interval)
            if self.buffer:
                await self.flush_buffer()
```

### Scheduling & Orchestration

**APScheduler Integration:**
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

# Daily sync of active repositories
scheduler.add_job(
    sync_active_repositories,
    CronTrigger(hour=2, minute=0),  # 2 AM daily
    args=[db_pool, rate_limiter]
)

# Hourly sync of trending repositories
scheduler.add_job(
    sync_trending_repositories,
    CronTrigger(minute=0),  # Every hour
    args=[db_pool, rate_limiter]
)

scheduler.start()
```

**Celery for Distributed Processing:**
```python
# tasks.py
from celery import Celery
from celery.schedules import crontab

app = Celery('devatlas', broker='redis://localhost:6379/0')

app.conf.beat_schedule = {
    'sync-repositories-every-hour': {
        'task': 'tasks.sync_repositories',
        'schedule': crontab(minute=0),
    },
    'process-events-every-5min': {
        'task': 'tasks.process_event_queue',
        'schedule': crontab(minute='*/5'),
    },
}

@app.task
def sync_repositories():
    """Sync repository metadata from GitHub API."""
    pass

@app.task
def process_event_queue():
    """Process queued GitHub events."""
    pass
```

### Webhook Processing

**GitHub Webhook Handler:**
```python
from fastapi import FastAPI, Request, HTTPException
import hashlib
import hmac

app = FastAPI()

@app.post("/webhooks/github")
async def github_webhook(request: Request):
    """Handle GitHub webhook events."""
    # Verify signature
    signature = request.headers.get('X-Hub-Signature-256')
    if not verify_signature(signature, await request.body()):
        raise HTTPException(status_code=403, detail="Invalid signature")

    event_type = request.headers.get('X-GitHub-Event')
    payload = await request.json()

    # Queue event for processing
    await event_queue.put({
        'type': event_type,
        'payload': payload,
        'received_at': datetime.utcnow()
    })

    return {"status": "queued"}

def verify_signature(signature: str, body: bytes) -> bool:
    """Verify GitHub webhook signature."""
    expected = 'sha256=' + hmac.new(
        WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Integration with DevAtlas Stack

- **fastapi-expert**: Build async ingestion endpoints and webhook handlers
- **postgres-pro**: Optimize bulk insert performance and connection pooling
- **github-api-expert**: Deep knowledge of GitHub API endpoints and pagination
- **ai-classification**: Trigger classification jobs after data ingestion

## Best Practices

1. **Always use async I/O** — GitHub API is I/O-bound, async provides 10-100x throughput
2. **Batch operations aggressively** — Use `COPY` for bulk inserts, not individual INSERTs
3. **Implement exponential backoff** — Handle 403/429 responses gracefully
4. **Cache rate limit state** — Share across workers to avoid thundering herd
5. **Use GraphQL for bulk reads** — Fetch multiple resources in one request
6. **Use REST for event streams** — Events API is paginated and real-time
7. **Monitor pipeline lag** — Track time between event creation and database insertion
8. **Implement dead-letter queues** — Handle failed events without blocking pipeline

## Common Patterns

**Full Refresh Pipeline:**
```python
async def full_refresh(pool: asyncpg.Pool, rate_limiter: GitHubRateLimiter):
    """Full refresh of all active repositories."""
    async with pool.acquire() as conn:
        # Truncate staging table
        await conn.execute("TRUNCATE staging_repositories")

        # Fetch and load in batches
        cursor = None
        while True:
            repos = await fetch_repositories(rate_limiter, cursor)
            if not repos:
                break
            await bulk_insert_staging(conn, repos)
            cursor = repos[-1]['cursor']

        # Swap tables atomically
        await conn.execute("""
            BEGIN;
            TRUNCATE repositories;
            INSERT INTO repositories SELECT * FROM staging_repositories;
            COMMIT;
        """)
```
