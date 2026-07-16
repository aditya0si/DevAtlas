---
name: ai-classification
description: "Use when integrating LLMs for repository classification, generating embeddings, storing vectors in pgvector, or building AI-powered categorization pipelines. Invoke for model selection, structured output parsing, embedding generation, vector search, and combining LLM outputs with PostgreSQL. Trigger terms: LLM classification, embeddings, pgvector, vector search, AI classification, repository classification, language detection, topic modeling, embedding model, vector database, approximate nearest neighbor, ANN, cosine similarity, structured output."
license: MIT
metadata:
  author: DevAtlas
  version: "1.0.0"
  domain: ai-ml
  triggers: LLM classification, embeddings, pgvector, vector search, AI classification, repository classification, language detection, topic modeling, embedding model, vector database, approximate nearest neighbor, ANN, cosine similarity, structured output
  roles: specialist
  scope: implementation
  output-format: code
  related-skills:
    - prompt-engineer
    - postgres-pro
    - fastapi-expert
---

# AI Classification

Senior ML engineer specializing in LLM-based repository classification, embedding generation, and vector search for developer ecosystem intelligence.

## When to Use This Skill

- Classifying GitHub repositories by language, domain, or technology stack
- Generating embeddings for repository metadata and descriptions
- Storing and querying vectors with pgvector
- Building AI-powered categorization pipelines
- Combining LLM structured outputs with PostgreSQL storage
- Implementing semantic search over repository data

## Core Competencies

### LLM-Based Repository Classification

**Structured Output Pattern:**
```python
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

class RepositoryClassification(BaseModel):
    primary_language: str = Field(description="Primary programming language")
    secondary_languages: list[str] = Field(description="Other languages used")
    domain: str = Field(description="Domain: web, mobile, data, devops, ai/ml, etc.")
    tech_stack: list[str] = Field(description="Key technologies and frameworks")
    maturity: str = Field(description="maturity: experimental, growing, mature, legacy")
    community_health: str = Field(description="community_health: active, moderate, low")

async def classify_repository(
    client: AsyncOpenAI,
    repo_name: str,
    description: str,
    readme: str,
    languages: dict
) -> RepositoryClassification:
    """Classify a repository using LLM with structured output."""
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": """You are an expert software engineer analyzing GitHub repositories.
                Classify repositories accurately based on their code, documentation, and metadata.
                Be precise and consistent in your classifications."""
            },
            {
                "role": "user",
                "content": f"""Classify this repository:

Name: {repo_name}
Description: {description}
Languages: {', '.join(languages.keys())}
README excerpt: {readme[:2000]}

Provide a structured classification."""
            }
        ],
        response_format=RepositoryClassification,
        temperature=0.1  # Low temperature for consistency
    )
    return response.choices[0].message.parsed
```

**Batch Classification Pipeline:**
```python
import asyncio
from typing import List, Tuple

async def batch_classify_repositories(
    client: AsyncOpenAI,
    repositories: List[Tuple[str, str, str, dict]],
    batch_size: int = 10
) -> List[RepositoryClassification]:
    """Classify multiple repositories concurrently."""
    semaphore = asyncio.Semaphore(batch_size)

    async def classify_one(repo):
        async with semaphore:
            return await classify_repository(client, *repo)

    tasks = [classify_one(repo) for repo in repositories]
    return await asyncio.gather(*tasks, return_exceptions=True)
```

### Embedding Generation

**OpenAI Embeddings:**
```python
from openai import AsyncOpenAI

class EmbeddingGenerator:
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = "text-embedding-3-small"  # 1536 dimensions, cost-effective
        self.batch_size = 100

    async def embed_repositories(self, repos: List[dict]) -> List[dict]:
        """Generate embeddings for repository descriptions."""
        texts = [
            f"{repo['name']}: {repo['description'] or ''} {repo['readme'][:500] or ''}"
            for repo in repos
        ]

        response = await self.client.embeddings.create(
            model=self.model,
            input=texts,
            dimensions=1536
        )

        # Attach embeddings to repositories
        for repo, embedding_data in zip(repos, response.data):
            repo['embedding'] = embedding_data.embedding

        return repos

    async def embed_query(self, query: str) -> List[float]:
        """Generate embedding for search query."""
        response = await self.client.embeddings.create(
            model=self.model,
            input=query,
            dimensions=1536
        )
        return response.data[0].embedding
```

**Local Embedding Models (Ollama):**
```python
import httpx

class OllamaEmbeddingGenerator:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.model = "nomic-embed-text"  # 768 dimensions

    async def embed(self, text: str) -> List[float]:
        """Generate embedding using local Ollama model."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": text}
            )
            return response.json()['embedding']
```

### pgvector Integration

**Schema Setup:**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Repository embeddings table
CREATE TABLE repository_embeddings (
    repo_id UUID PRIMARY KEY REFERENCES repositories(id),
    embedding vector(1536),  -- Match embedding model dimensions
    model_name TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast similarity search
CREATE INDEX ON repository_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- For higher accuracy (slower inserts, faster queries)
-- CREATE INDEX ON repository_embeddings
-- USING hnsw (embedding vector_cosine_ops);
```

**Vector Search Queries:**
```python
import asyncpg
import numpy as np

async def similarity_search(
    conn: asyncpg.Connection,
    query_embedding: List[float],
    limit: int = 10,
    similarity_threshold: float = 0.7
) -> List[dict]:
    """Find repositories similar to query embedding."""
    rows = await conn.fetch("""
        SELECT
            r.id,
            r.name,
            r.description,
            r.language,
            r.stars,
            1 - (re.embedding <=> $1::vector) as similarity
        FROM repository_embeddings re
        JOIN repositories r ON r.id = re.repo_id
        WHERE 1 - (re.embedding <=> $1::vector) > $2
        ORDER BY re.embedding <=> $1::vector
        LIMIT $3
    """, str(query_embedding), similarity_threshold, limit)

    return [dict(row) for row in rows]

async def hybrid_search(
    conn: asyncpg.Connection,
    query: str,
    query_embedding: List[float],
    limit: int = 10
) -> List[dict]:
    """Hybrid search: combine full-text and vector search."""
    rows = await conn.fetch("""
        WITH semantic_results AS (
            SELECT
                r.id,
                r.name,
                r.description,
                r.language,
                r.stars,
                1 - (re.embedding <=> $1::vector) as semantic_score
            FROM repository_embeddings re
            JOIN repositories r ON r.id = re.repo_id
            ORDER BY re.embedding <=> $1::vector
            LIMIT 100
        ),
        fulltext_results AS (
            SELECT
                r.id,
                ts_rank(to_tsvector('english', r.description || ' ' || r.readme),
                        websearch_to_tsquery('english', $2)) as text_score
            FROM repositories r
            WHERE to_tsvector('english', r.description || ' ' || r.readme)
                  @@ websearch_to_tsquery('english', $2)
        )
        SELECT
            sr.id,
            sr.name,
            sr.description,
            sr.language,
            sr.stars,
            (sr.semantic_score * 0.7 + COALESCE(ft.text_score, 0) * 0.3) as hybrid_score
        FROM semantic_results sr
        LEFT JOIN fulltext_results ft ON sr.id = ft.id
        ORDER BY hybrid_score DESC
        LIMIT $3
    """, str(query_embedding), query, limit)

    return [dict(row) for row in rows]
```

**Batch Embedding Storage:**
```python
async def store_embeddings_batch(
    conn: asyncpg.Connection,
    embeddings: List[dict]
):
    """Store multiple embeddings efficiently."""
    await conn.copy_records_to_table(
        'repository_embeddings',
        records=[
            (e['repo_id'], str(e['embedding']), e['model_name'])
            for e in embeddings
        ],
        columns=['repo_id', 'embedding', 'model_name']
    )
```

### Classification Pipeline Integration

**End-to-End Pipeline:**
```python
class ClassificationPipeline:
    def __init__(
        self,
        db_pool: asyncpg.Pool,
        llm_client: AsyncOpenAI,
        embedding_gen: EmbeddingGenerator
    ):
        self.db = db_pool
        self.llm = llm_client
        self.embeddings = embedding_gen

    async def process_repositories(self, repo_ids: List[str]):
        """Process repositories: classify + embed + store."""
        # Fetch repositories
        async with self.db.acquire() as conn:
            repos = await conn.fetch("""
                SELECT id, name, description, readme, languages
                FROM repositories
                WHERE id = ANY($1)
                  AND classification_status != 'completed'
            """, repo_ids)

        # Classify with LLM
        classifications = await batch_classify_repositories(
            self.llm,
            [(r['name'], r['description'], r['readme'], r['languages']) for r in repos]
        )

        # Generate embeddings
        repos_with_embeddings = await self.embeddings.embed_repositories(
            [dict(r) for r in repos]
        )

        # Store results
        async with self.db.acquire() as conn:
            async with conn.transaction():
                for repo, classification, embedding_data in zip(
                    repos, classifications, repos_with_embeddings
                ):
                    if isinstance(classification, Exception):
                        continue

                    # Store classification
                    await conn.execute("""
                        INSERT INTO repository_classifications
                            (repo_id, primary_language, domain, tech_stack, maturity)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (repo_id) DO UPDATE
                        SET primary_language = EXCLUDED.primary_language,
                            domain = EXCLUDED.domain
                    """,
                        repo['id'],
                        classification.primary_language,
                        classification.domain,
                        classification.tech_stack,
                        classification.maturity
                    )

                    # Store embedding
                    await conn.execute("""
                        INSERT INTO repository_embeddings (repo_id, embedding)
                        VALUES ($1, $2::vector)
                        ON CONFLICT (repo_id) DO UPDATE
                        SET embedding = EXCLUDED.embedding
                    """,
                        repo['id'],
                        str(embedding_data['embedding'])
                    )
```

## Integration with DevAtlas Stack

- **prompt-engineer**: Design classification prompts and structured output schemas
- **postgres-pro**: Optimize pgvector indexes and query performance
- **fastapi-expert**: Build async classification endpoints
- **github-data-pipeline**: Trigger classification after data ingestion

## Best Practices

1. **Use low temperature (0.1-0.2) for classification** — ensures consistency across runs
2. **Cache embeddings** — don't regenerate for unchanged repositories
3. **Use HNSW for high accuracy** — better recall than IVFFlat, slower inserts
4. **Use IVFFlat for large datasets** — faster inserts, good enough recall with enough lists
5. **Batch API calls** — OpenAI supports up to 2048 inputs per request
6. **Implement retry logic** — LLM APIs have rate limits and occasional failures
7. **Monitor classification drift** — track when classifications change over time
8. **Use structured outputs** — Pydantic models ensure consistent JSON responses

## Common Patterns

**Semantic Search API:**
```python
from fastapi import FastAPI, Query

@app.get("/api/search/semantic")
async def semantic_search(q: str = Query(...), limit: int = 10):
    """Semantic search over repositories."""
    query_embedding = await embedding_gen.embed_query(q)

    async with db_pool.acquire() as conn:
        results = await hybrid_search(conn, q, query_embedding, limit)

    return {"results": results, "query": q}
```

**Technology Trend Detection:**
```python
async def detect_emerging_technologies(
    conn: asyncpg.Connection,
    min_repos: int = 10,
    growth_threshold: float = 2.0
) -> List[dict]:
    """Detect technologies with rapid growth."""
    rows = await conn.fetch("""
        WITH monthly_counts AS (
            SELECT
                unnest(tech_stack) as technology,
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as repo_count
            FROM repository_classifications
            WHERE created_at > NOW() - INTERVAL '6 months'
            GROUP BY technology, month
        ),
        growth_rates AS (
            SELECT
                technology,
                REGR_SLOPE(repo_count, EXTRACT(EPOCH FROM month)) as growth_slope
            FROM monthly_counts
            GROUP BY technology
            HAVING COUNT(*) >= 2
        )
        SELECT technology, growth_slope
        FROM growth_rates
        WHERE growth_slope > $1
          AND technology IN (
              SELECT technology FROM monthly_counts
              WHERE month > NOW() - INTERVAL '1 month'
              GROUP BY technology
              HAVING SUM(repo_count) >= $2
          )
        ORDER BY growth_slope DESC
    """, growth_threshold, min_repos)

    return [dict(row) for row in rows]
```
