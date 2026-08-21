---
name: github-api-expert
description: "Use when working with GitHub REST API, GraphQL API, Octokit, webhooks, or GitHub Apps authentication. Invoke for rate limit handling, pagination strategies, Events API, search API, and bulk data fetching. Trigger terms: GitHub API, Octokit, GraphQL, REST API, rate limit, pagination, webhook, GitHub Apps, personal access token, Events API, Search API, repository API, user API, organization API, GitHub authentication."
license: MIT
metadata:
  author: DevAtlas
  version: "1.0.0"
  domain: api-integration
  triggers: GitHub API, Octokit, GraphQL, REST API, rate limit, pagination, webhook, GitHub Apps, personal access token, Events API, Search API, repository API, user API, organization API, GitHub authentication
  roles: specialist
  scope: implementation
  output-format: code
  related-skills:
    - github-data-pipeline
    - fastapi-expert
    - research-agent
---

# GitHub API Expert

Senior GitHub API specialist with deep expertise in REST API, GraphQL, Octokit, webhooks, and GitHub Apps for large-scale data ingestion and developer ecosystem analytics.

## When to Use This Skill

- Fetching GitHub Events API data for activity analysis
- Implementing pagination strategies for bulk data retrieval
- Handling GitHub API rate limits and authentication
- Building webhook handlers for real-time event processing
- Using GraphQL for efficient bulk data fetching
- Managing GitHub Apps vs Personal Access Tokens

## Core Competencies

### Authentication Strategies

**GitHub Apps (Recommended for Production):**
```python
import jwt
import httpx
from datetime import datetime, timedelta

class GitHubAppsAuth:
    def __init__(self, app_id: str, private_key: str):
        self.app_id = app_id
        self.private_key = private_key
        self.installation_cache = {}

    def generate_jwt(self) -> str:
        """Generate JWT for GitHub App authentication."""
        now = datetime.utcnow()
        payload = {
            'iat': now,
            'exp': now + timedelta(minutes=10),
            'iss': self.app_id
        }
        return jwt.encode(payload, self.private_key, algorithm='RS256')

    async def get_installation_token(self, installation_id: str) -> str:
        """Get installation access token."""
        if installation_id in self.installation_cache:
            token_data = self.installation_cache[installation_id]
            if datetime.utcnow() < token_data['expires_at']:
                return token_data['token']

        jwt_token = self.generate_jwt()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.github.com/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {jwt_token}",
                    "Accept": "application/vnd.github+json"
                }
            )
            data = response.json()

        self.installation_cache[installation_id] = {
            'token': data['token'],
            'expires_at': datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00'))
        }
        return data['token']
```

**Personal Access Token (Development):**
```python
# Use for development/testing only
# Production should use GitHub Apps for better rate limits (5000/hr vs 60/hr)

GITHUB_TOKEN = "ghp_..."  # Fine-grained PAT recommended
headers = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
}
```

### REST API Patterns

**Pagination with Link Headers:**
```python
import httpx

async def paginated_get(url: str, headers: dict) -> list:
    """Fetch all pages using Link header pagination."""
    results = []
    while url:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)

        if response.status_code != 200:
            break

        results.extend(response.json())

        # Parse Link header for next page
        link_header = response.headers.get('Link', '')
        url = None
        for link in link_header.split(','):
            if 'rel="next"' in link:
                url = link.split(';')[0].strip('<> ')
                break

    return results
```

**Events API (Primary Data Source for DevAtlas):**
```python
async def fetch_repo_events(
    owner: str,
    repo: str,
    headers: dict,
    max_pages: int = 10
) -> list:
    """Fetch events for a repository."""
    events = []
    page = 1

    while page <= max_pages:
        url = f"https://api.github.com/repos/{owner}/{repo}/events"
        params = {"per_page": 100, "page": page}

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)

        if response.status_code != 200:
            break

        page_events = response.json()
        if not page_events:
            break

        events.extend(page_events)
        page += 1

        # Check rate limit
        remaining = int(response.headers.get('X-RateLimit-Remaining', 0))
        if remaining < 10:
            reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
            wait_seconds = reset_time - datetime.utcnow().timestamp()
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)

    return events
```

**Search API for Developer Activity:**
```python
async def search_developers(
    query: str,
    location: str = None,
    language: str = None,
    min_followers: int = 10,
    headers: dict = None
) -> list:
    """Search GitHub users matching criteria."""
    search_query = query
    if location:
        search_query += f" location:{location}"
    if language:
        search_query += f" language:{language}"
    if min_followers:
        search_query += f" followers:>={min_followers}"

    url = "https://api.github.com/search/users"
    params = {
        "q": search_query,
        "per_page": 100,
        "sort": "followers"
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, params=params)

    if response.status_code != 200:
        return []

    data = response.json()
    return data.get('items', [])
```

### GraphQL API (Efficient Bulk Fetching)

**GraphQL for Bulk Repository Data:**
```python
import httpx

GRAPHQL_ENDPOINT = "https://api.github.com/graphql"

REPOSITORIES_QUERY = """
query ($cursor: String, $query: String!) {
  search(query: $query, type: REPOSITORY, first: 100, after: $cursor) {
    edges {
      node {
        ... on Repository {
          id
          name
          owner { login }
          description
          url
          stargazerCount
          forkCount
          primaryLanguage { name }
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges { node { name size } }
          }
          createdAt
          updatedAt
          pushedAt
          isArchived
          isDisabled
          isFork
          openIssuesCount
          closedIssuesCount
          pullRequests { totalCount }
          releases { totalCount }
        }
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
"""

async def graphql_search_repositories(
    query: str,
    headers: dict,
    max_results: int = 1000
) -> list:
    """Search repositories using GraphQL (more efficient than REST)."""
    results = []
    cursor = None

    async with httpx.AsyncClient() as client:
        while len(results) < max_results:
            variables = {
                "query": query,
                "cursor": cursor
            }

            response = await client.post(
                GRAPHQL_ENDPOINT,
                json={"query": REPOSITORIES_QUERY, "variables": variables},
                headers=headers
            )

            if response.status_code != 200:
                break

            data = response.json()
            if 'errors' in data:
                break

            search_results = data['data']['search']
            results.extend([edge['node'] for edge in search_results['edges']])

            page_info = search_results['pageInfo']
            if not page_info['hasNextPage']:
                break

            cursor = page_info['endCursor']

    return results
```

**GraphQL for Organization Analytics:**
```python
ORG_ANALYTICS_QUERY = """
query ($org: String!, $cursor: String) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor, orderBy: {field: PUSHED_AT, direction: DESC}) {
      edges {
        node {
          name
          stargazerCount
          forkCount
          primaryLanguage { name }
          createdAt
          updatedAt
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 1) {
                  edges {
                    node {
                      committedDate
                    }
                  }
                }
              }
            }
          }
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
"""
```

### Webhook Processing

**Webhook Handler (FastAPI):**
```python
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
import hashlib
import hmac

app = FastAPI()

class GitHubWebhookHandler:
    def __init__(self, secret: str, event_queue: asyncio.Queue):
        self.secret = secret
        self.event_queue = event_queue

    def verify_signature(self, signature: str, body: bytes) -> bool:
        """Verify GitHub webhook HMAC signature."""
        expected = 'sha256=' + hmac.new(
            self.secret.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(signature, expected)

    async def handle_event(self, event_type: str, payload: dict):
        """Route event to appropriate handler."""
        handlers = {
            'push': self.handle_push,
            'pull_request': self.handle_pull_request,
            'issues': self.handle_issue,
            'star': self.handle_star,
            'fork': self.handle_fork,
            'watch': self.handle_watch,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(payload)

    async def handle_push(self, payload: dict):
        """Handle push event."""
        repo = payload['repository']
        await self.event_queue.put({
            'type': 'push',
            'repo_id': repo['id'],
            'repo_name': repo['full_name'],
            'commits': len(payload['commits']),
            'timestamp': payload['head_commit']['timestamp']
        })

    async def handle_star(self, payload: dict):
        """Handle star event."""
        repo = payload['repository']
        await self.event_queue.put({
            'type': 'star',
            'repo_id': repo['id'],
            'repo_name': repo['full_name'],
            'action': payload['action'],
            'timestamp': datetime.utcnow().isoformat()
        })

@app.post("/webhooks/github")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """GitHub webhook endpoint."""
    body = await request.body()
    signature = request.headers.get('X-Hub-Signature-256')

    if not handler.verify_signature(signature, body):
        raise HTTPException(status_code=403, detail="Invalid signature")

    event_type = request.headers.get('X-GitHub-Event')
    payload = await request.json()

    # Queue for async processing
    background_tasks.add_task(handler.handle_event, event_type, payload)

    return {"status": "accepted"}
```

### Rate Limit Management

**Intelligent Rate Limiting:**
```python
class RateLimitManager:
    def __init__(self):
        self.remaining = 5000
        self.reset_time = datetime.utcnow()
        self.lock = asyncio.Lock()

    async def wait_if_needed(self, cost: int = 1):
        """Wait if rate limit would be exceeded."""
        async with self.lock:
            if self.remaining < cost:
                wait_seconds = (self.reset_time - datetime.utcnow()).total_seconds()
                if wait_seconds > 0:
                    await asyncio.sleep(wait_seconds)
                self.remaining = 5000

    def update_from_headers(self, headers: dict):
        """Update rate limit state from response headers."""
        self.remaining = int(headers.get('X-RateLimit-Remaining', 0))
        self.reset_time = datetime.fromtimestamp(
            int(headers.get('X-RateLimit-Reset', 0))
        )
```

**Secondary Rate Limits (Abuse Detection):**
```python
async def request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    max_retries: int = 3,
    **kwargs
) -> httpx.Response:
    """Make request with exponential backoff for secondary rate limits."""
    for attempt in range(max_retries):
        response = await client.request(method, url, **kwargs)

        if response.status_code == 200:
            return response

        if response.status_code == 403:
            # Check for secondary rate limit
            if 'secondary rate limit' in response.text.lower():
                await asyncio.sleep(2 ** attempt * 60)  # 1min, 2min, 4min
                continue

        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', 60))
            await asyncio.sleep(retry_after)
            continue

        break

    return response
```

### Key Endpoints for DevAtlas

**Essential Endpoints:**
```python
# Repository metadata
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/languages
GET /repos/{owner}/{repo}/stargazers?per_page=100
GET /repos/{owner}/{repo}/contributors?per_page=100

# Events (primary data source)
GET /repos/{owner}/{repo}/events?per_page=100
GET /users/{username}/events/public?per_page=100
GET /orgs/{org}/events?per_page=100

# Search
GET /search/repositories?q={query}&sort=stars&per_page=100
GET /search/users?q={query}&sort=followers&per_page=100
GET /search/code?q={query}&per_page=100

# Rate limit status
GET /rate_limit
```

## Integration with DevAtlas Stack

- **github-data-pipeline**: Use for bulk data ingestion and sync strategies
- **fastapi-expert**: Build webhook endpoints and API wrappers
- **postgres-pro**: Store fetched data efficiently
- **research-agent**: Use GitHub API for repository research

## Best Practices

1. **Use GitHub Apps for production** — 5000 requests/hr vs 60/hr for PATs
2. **Prefer GraphQL for bulk reads** — fetch multiple resources in one request
3. **Use conditional requests** — `If-None-Match` with ETags to avoid re-fetching
4. **Respect secondary rate limits** — 90 requests per minute per user/repo
5. **Cache aggressively** — repository metadata changes infrequently
6. **Use webhooks for real-time updates** — avoid polling when possible
7. **Monitor rate limit headers** — `X-RateLimit-Remaining`, `X-RateLimit-Reset`
8. **Implement exponential backoff** — handle 403/429 gracefully

## Common Patterns

**Repository Metadata Sync:**
```python
async def sync_repository_metadata(
    owner: str,
    repo: str,
    headers: dict,
    db_pool: asyncpg.Pool
):
    """Sync full repository metadata."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers
        )

    if response.status_code != 200:
        return None

    repo_data = response.json()

    async with db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO repositories (
                id, name, owner, description, language, stars, forks,
                created_at, updated_at, pushed_at, is_archived, is_fork
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO UPDATE
            SET stars = EXCLUDED.stars,
                forks = EXCLUDED.forks,
                updated_at = EXCLUDED.updated_at,
                pushed_at = EXCLUDED.pushed_at
        """,
            int(repo_data['id']),
            repo_data['name'],
            repo_data['owner']['login'],
            repo_data.get('description'),
            repo_data.get('language'),
            repo_data['stargazers_count'],
            repo_data['forks_count'],
            repo_data['created_at'],
            repo_data['updated_at'],
            repo_data['pushed_at'],
            repo_data['archived'],
            repo_data['fork']
        )
```
