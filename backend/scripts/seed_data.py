"""
Seed data script for DevAtlas.

Idempotently seeds ~1000 top Indian GitHub repositories into an empty database,
generating embeddings, AI classifications, and geocoded locations.

Usage:
    python -m scripts.seed_data              # seed everything (fetch + enrich)
    python -m scripts.seed_data --fetch-only  # just fetch repos from GitHub
    python -m scripts.seed_data --enrich-only # only run embeddings + classification + geocoding
    python -m scripts.seed_data --limit 500   # fetch only up to 500 repos
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import get_settings
from app.core.database import engine
from app.models.github import GitHubUser, Repository

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

# GitHub's Search API rejects a query with more than five AND/OR/NOT operators
# ("422 Validation Failed: More than five AND / OR / NOT operators were used"), and the
# original single query here used six `OR location:...` clauses, so seeding could never
# succeed. Search one location per query and merge the results instead.
SEARCH_QUERIES = (
    "location:India",
    "location:Bangalore",
    "location:Bengaluru",
    "location:Mumbai",
    "location:Delhi",
    "location:Pune",
    "location:Hyderabad",
    "location:Chennai",
)
MIN_STARS = 10
DEFAULT_LIMIT = 1000


async def _repo_count(db) -> int:
    result = await db.execute(select(func.count(Repository.id)))
    return result.scalar() or 0


async def _pending_embeddings_count(db) -> int:
    result = await db.execute(
        select(func.count(Repository.id)).where(Repository.embedding.is_(None))
    )
    return result.scalar() or 0


async def _pending_classification_count(db) -> int:
    result = await db.execute(
        select(func.count(Repository.id)).where(Repository.classification.is_(None))
    )
    return result.scalar() or 0


async def _pending_geocode_count(db) -> int:
    result = await db.execute(
        select(func.count(GitHubUser.login)).where(
            GitHubUser.normalized_location.is_(None),
            GitHubUser.raw_location.isnot(None),
        )
    )
    return result.scalar() or 0


async def fetch_repositories(limit: int = DEFAULT_LIMIT, min_stars: int = MIN_STARS) -> int:
    """Fetch Indian GitHub repositories via Search API and upsert into DB."""
    from app.repositories.github_repository import GitHubRepository
    from app.services.github_api_client import GitHubAPIClient

    client = GitHubAPIClient()
    total = 0

    try:
        async with async_session_factory() as db:
            existing_count = await _repo_count(db)
            if existing_count >= limit:
                logger.info(f"DB already has {existing_count} repos (>= limit {limit}), skipping fetch.")
                return 0

            repo_repo = GitHubRepository(db)
            buffer: list[Repository] = []

            async def _iter_search():
                """Yield search results across the per-location queries, de-duplicated."""
                seen: set[int] = set()
                for location_query in SEARCH_QUERIES:
                    query = f"{location_query} stars:>={min_stars}"
                    logger.info(f"Fetching repos from GitHub Search: {query}")
                    async for result in client.search_repositories(
                        query=query, sort="stars", order="desc"
                    ):
                        github_id = result.get("id")
                        if github_id in seen:
                            continue
                        seen.add(github_id)
                        yield result

            async for item in _iter_search():
                if total >= limit:
                    break

                def parse_iso(val):
                    if not val:
                        return None
                    try:
                        return datetime.fromisoformat(val.replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        return None

                repo = Repository(
                    github_id=item["id"],
                    name=item["name"],
                    full_name=item["full_name"],
                    owner_login=item["owner"]["login"],
                    description=item.get("description"),
                    html_url=item["html_url"],
                    private=item.get("private", False),
                    visibility=item.get("visibility", "public"),
                    language=item.get("language"),
                    languages=item.get("languages"),
                    stargazers_count=item.get("stargazers_count", 0),
                    forks_count=item.get("forks_count", 0),
                    open_issues_count=item.get("open_issues_count", 0),
                    topics=item.get("topics", []),
                    default_branch=item.get("default_branch"),
                    license=item.get("license", {}).get("key") if isinstance(item.get("license"), dict) else None,
                    has_wiki=item.get("has_wiki", False),
                    archived=item.get("archived", False),
                    size=item.get("size", 0),
                    subscribers_count=item.get("subscribers_count", 0),
                    has_pages=item.get("has_pages", False),
                    homepage=item.get("homepage"),
                    created_at=parse_iso(item.get("created_at")),
                    updated_at=parse_iso(item.get("updated_at")),
                    pushed_at=parse_iso(item.get("pushed_at")),
                    last_activity_at=parse_iso(item.get("pushed_at") or item.get("updated_at")),
                )
                buffer.append(repo)
                total += 1

                if len(buffer) >= 100:
                    await repo_repo.bulk_upsert_repositories(buffer)
                    logger.info(f"Upserted batch of {len(buffer)} repos (total: {total})")
                    buffer.clear()

            if buffer:
                await repo_repo.bulk_upsert_repositories(buffer)
                logger.info(f"Upserted final batch of {len(buffer)} repos (total: {total})")

            await db.commit()

    finally:
        await client.close()

    logger.info(f"Fetch complete: {total} repos ingested.")
    return total


async def enrich_embeddings(limit: int = 500) -> int:
    """Generate embeddings for repos that don't have them yet."""
    async with async_session_factory() as db:
        pending = await _pending_embeddings_count(db)
        if pending == 0:
            logger.info("All repos already have embeddings. Skipping.")
            return 0

        from app.services.embedding_service import EmbeddingService
        service = EmbeddingService(db)
        effective_limit = min(limit, pending)
        logger.info(f"Generating embeddings for up to {effective_limit} repos (of {pending} pending)...")
        await service.embed_repositories(limit=effective_limit)
        await db.commit()

    logger.info(f"Embedding enrichment complete (limit={effective_limit}).")
    return effective_limit


async def enrich_classifications(limit: int = 500) -> int:
    """Run AI classification on repos that don't have it yet."""
    async with async_session_factory() as db:
        pending = await _pending_classification_count(db)
        if pending == 0:
            logger.info("All repos already classified. Skipping.")
            return 0

        from app.services.classification_service import ClassificationService
        service = ClassificationService(db)
        effective_limit = min(limit, pending)
        logger.info(f"Classifying up to {effective_limit} repos (of {pending} pending)...")
        await service.classify_batch(limit=effective_limit, batch_size=10)
        await db.commit()

    logger.info(f"Classification enrichment complete (limit={effective_limit}).")
    return effective_limit


async def enrich_geocoding(limit: int = 200) -> int:
    """Geocode user locations and update repo geom."""
    async with async_session_factory() as db:
        from app.services.location_intelligence_service import LocationIntelligenceService
        service = LocationIntelligenceService(db)
        logger.info(f"Running location enrichment for up to {limit} users...")
        result = await service.run_batch_enrichment(limit=limit)
        await db.close()
        logger.info(
            f"Geocoding complete: {result.processed} processed, {result.enriched} enriched, "
            f"{result.errors} errors."
        )
        return result.enriched


async def run_full_seed(fetch_limit: int = DEFAULT_LIMIT, enrich_limit: int = 500) -> None:
    """Run the complete seed pipeline: fetch -> embed -> classify -> geocode."""
    start = datetime.now(timezone.utc)

    # Step 1: Fetch repositories
    fetched = await fetch_repositories(limit=fetch_limit)

    # Step 2: Enrich embeddings
    embedding_count = await enrich_embeddings(limit=enrich_limit)

    # Step 3: Enrich classifications
    classified_count = await enrich_classifications(limit=enrich_limit)

    # Step 4: Geocode user locations
    geocoded = await enrich_geocoding(limit=200)

    duration = (datetime.now(timezone.utc) - start).total_seconds()
    logger.info(
        f"Seed pipeline complete in {duration:.1f}s. "
        f"Fetched: {fetched}, Embeddings: {embedding_count}, "
        f"Classified: {classified_count}, Geocoded: {geocoded}"
    )


async def main():
    parser = argparse.ArgumentParser(description="DevAtlas Seed Data Script")
    parser.add_argument("--fetch-only", action="store_true", help="Only fetch repos from GitHub")
    parser.add_argument("--enrich-only", action="store_true", help="Only run embeddings + classification + geocoding")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max repos to fetch")
    parser.add_argument("--enrich-limit", type=int, default=500, help="Max repos per enrichment step")

    args = parser.parse_args()

    if args.fetch_only:
        await fetch_repositories(limit=args.limit)
    elif args.enrich_only:
        await enrich_embeddings(limit=args.enrich_limit)
        await enrich_classifications(limit=args.enrich_limit)
        await enrich_geocoding(limit=200)
    else:
        await run_full_seed(fetch_limit=args.limit, enrich_limit=args.enrich_limit)


if __name__ == "__main__":
    asyncio.run(main())
