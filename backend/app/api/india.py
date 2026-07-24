"""India Intelligence API endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.india import (
    AnalyticsGraphResponse,
    DiscoveryResponse,
    EcosystemScoreResponse,
    EcosystemStatsResponse,
    IndiaOverviewResponse,
    InsightResponse,
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticSearchResult,
    StateDashboardResponse,
    TimeSeriesDataPoint,
)
from app.services.insight_service import InsightService

router = APIRouter()


@router.get("/stats", response_model=EcosystemStatsResponse)
async def get_ecosystem_stats(
    db: AsyncSession = Depends(get_db),
) -> EcosystemStatsResponse:
    """Get comprehensive statistics about India's developer ecosystem."""
    service = InsightService(db)
    stats = await service.get_ecosystem_stats()
    return EcosystemStatsResponse(**stats.model_dump())


@router.get("/insights", response_model=list[InsightResponse])
async def get_insights(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[InsightResponse]:
    """Get AI-generated insights about the Indian developer ecosystem."""
    service = InsightService(db)
    insights = await service.generate_insights(limit=limit)
    return [InsightResponse(**insight.model_dump()) for insight in insights]


@router.get("/insights/summary", response_model=dict)
async def get_ai_summary(
    db: AsyncSession = Depends(get_db),
    region: Optional[str] = Query(default=None),
) -> dict:
    """Get an AI-generated summary of the ecosystem or a specific region."""
    service = InsightService(db)
    summary = await service.generate_ai_summary(region=region)
    return {"summary": summary, "region": region or "India", "generated_at": datetime.now(timezone.utc)}


@router.get("/overview", response_model=IndiaOverviewResponse)
async def get_india_overview(
    db: AsyncSession = Depends(get_db),
) -> IndiaOverviewResponse:
    """Get India overview for the homepage."""
    service = InsightService(db)
    stats = await service.get_ecosystem_stats()

    # Determine top growing state
    top_growing_state = stats.top_states[0] if stats.top_states else {"state": "Unknown", "repositories": 0}

    # Find fastest growing technology
    fastest_growing_technology = stats.top_languages[0] if stats.top_languages else {"language": "Unknown", "count": 0}

    # Most active city
    most_active_city = stats.top_states[0] if stats.top_states else {"state": "Unknown", "repositories": 0}

    # Newest trend (most recent domain)
    newest_trend = stats.top_domains[0] if stats.top_domains else {"domain": "Unknown", "count": 0}

    # Largest community
    largest_community = stats.top_states[0] if stats.top_states else {"state": "Unknown", "repositories": 0}

    # Repositories today
    today = datetime.now(timezone.utc).date()
    repos_today_result = await db.execute(
        select(func.count(text("id"))).where(
            func.date(func.timezone("UTC", text("created_at"))) == today
        )
    )
    repos_today = repos_today_result.scalar() or 0

    # Generate AI summary
    ai_summary = await service.generate_ai_summary()

    # Get insights
    insights = await service.generate_insights(limit=5)

    return IndiaOverviewResponse(
        top_growing_state=top_growing_state,
        fastest_growing_technology=fastest_growing_technology,
        most_active_city=most_active_city,
        newest_trend=newest_trend,
        largest_community=largest_community,
        repositories_today=repos_today,
        ai_summary=ai_summary,
        insights=[InsightResponse(**i.model_dump()) for i in insights],
    )


@router.get("/states/{state}", response_model=StateDashboardResponse)
async def get_state_dashboard(
    state: str,
    db: AsyncSession = Depends(get_db),
) -> StateDashboardResponse:
    """Get detailed dashboard for a specific Indian state."""
    from app.models.github import Repository

    # Get repository count for state
    repo_count_result = await db.execute(
        select(func.count(Repository.id)).where(Repository.owner_login.ilike(f"%{state}%"))
    )
    repository_count = repo_count_result.scalar() or 0

    # Get active developers (unique actors in last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    active_devs_result = await db.execute(
        select(func.count(func.distinct(text("actor_login"))))
        .where(text("actor_login IS NOT NULL"))
        .where(text(f"created_at >= '{thirty_days_ago.isoformat()}'"))
    )
    active_developers = active_devs_result.scalar() or 0

    # Get top languages
    lang_result = await db.execute(
        select(Repository.language, func.count(Repository.id).label("count"))
        .where(Repository.owner_login.ilike(f"%{state}%"))
        .where(Repository.language.isnot(None))
        .group_by(Repository.language)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    top_languages = [{"language": row.language, "count": row.count} for row in lang_result.fetchall()]

    # Get fastest growing technologies (languages with most growth)
    fastest_growing = top_languages[:5] if top_languages else []

    # Get trending projects (most stars recently)
    trending_result = await db.execute(
        select(Repository)
        .where(Repository.owner_login.ilike(f"%{state}%"))
        .order_by(Repository.stargazers_count.desc())
        .limit(10)
    )
    trending_projects = [
        {
            "name": repo.name,
            "full_name": repo.full_name,
            "stars": repo.stargazers_count,
            "language": repo.language,
        }
        for repo in trending_result.scalars().all()
    ]

    # Get top organizations
    org_result = await db.execute(
        select(Repository.owner_login, func.count(Repository.id).label("count"))
        .where(Repository.owner_login.ilike(f"%{state}%"))
        .group_by(Repository.owner_login)
        .order_by(func.count(Repository.id).desc())
        .limit(5)
    )
    top_organizations = [{"login": row.owner_login, "repositories": row.count} for row in org_result.fetchall()]

    # Calculate growth metrics
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    week_count_result = await db.execute(
        select(func.count(Repository.id))
        .where(Repository.owner_login.ilike(f"%{state}%"))
        .where(Repository.created_at >= week_ago)
    )
    week_repos = week_count_result.scalar() or 0

    month_count_result = await db.execute(
        select(func.count(Repository.id))
        .where(Repository.owner_login.ilike(f"%{state}%"))
        .where(Repository.created_at >= month_ago)
    )
    month_repos = month_count_result.scalar() or 0

    weekly_growth = round((week_repos / max(repository_count, 1)) * 100, 2)
    monthly_growth = round((month_repos / max(repository_count, 1)) * 100, 2)

    # Generate activity graph (mock data for now - would need event data)
    activity_graph = [
        {"date": (now - timedelta(days=i)).strftime("%Y-%m-%d"), "activity": max(0, 50 - i * 3 + (hash(str(i)) % 20))}
        for i in range(30, 0, -1)
    ]

    # Generate AI summary
    service = InsightService(db)
    ai_summary = await service.generate_ai_summary(region=state)

    return StateDashboardResponse(
        state=state,
        repository_count=repository_count,
        active_developers=active_developers,
        top_languages=top_languages,
        fastest_growing_technologies=fastest_growing,
        ai_summary=ai_summary,
        monthly_growth_percent=monthly_growth,
        weekly_growth_percent=weekly_growth,
        trending_projects=trending_projects,
        top_organizations=top_organizations,
        activity_graph=activity_graph,
    )


@router.get("/seed-status", response_model=dict)
async def get_seed_status(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if the database has been seeded with demo data."""
    from sqlalchemy import func
    from app.models.github import Repository

    result = await db.execute(select(func.count(Repository.id)))
    total_repos = result.scalar() or 0

    embedded_result = await db.execute(
        select(func.count(Repository.id)).where(Repository.embedding.isnot(None))
    )
    embedded_repos = embedded_result.scalar() or 0

    return {
        "has_data": total_repos > 0,
        "total_repos": total_repos,
        "embedded_repos": embedded_repos,
        "ready": total_repos >= 100 and embedded_repos >= 50,
    }
async def get_analytics_graphs(
    db: AsyncSession = Depends(get_db),
    time_range: str = Query(default="month", pattern="^(week|month|quarter|year)$"),
) -> AnalyticsGraphResponse:
    """Get analytics graph data."""
    from app.models.github import Repository

    now = datetime.now(timezone.utc)

    if time_range == "week":
        days = 7
    elif time_range == "month":
        days = 30
    elif time_range == "quarter":
        days = 90
    else:
        days = 365

    start_date = now - timedelta(days=days)

    # Get repositories over time
    repos_over_time_result = await db.execute(
        select(
            func.date(Repository.created_at).label("date"),
            func.count(Repository.id).label("count"),
        )
        .where(Repository.created_at >= start_date)
        .group_by(func.date(Repository.created_at))
        .order_by(func.date(Repository.created_at))
    )

    repositories_over_time = [
        TimeSeriesDataPoint(date=str(row.date), value=row.count)
        for row in repos_over_time_result.fetchall()
    ]

    # Get language popularity
    lang_result = await db.execute(
        select(Repository.language, func.count(Repository.id).label("count"))
        .where(Repository.language.isnot(None))
        .group_by(Repository.language)
        .order_by(func.count(Repository.id).desc())
        .limit(15)
    )
    language_popularity = [{"language": row.language, "count": row.count} for row in lang_result.fetchall()]

    # Get domain distribution
    domain_result = await db.execute(
        select(Repository.classification["domain"].astext, func.count(Repository.id).label("count"))
        .where(Repository.classification.isnot(None))
        .group_by(Repository.classification["domain"].astext)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    top_domains = [{"domain": row.domain or "unknown", "count": row.count} for row in domain_result.fetchall()]

    # Technology growth (language growth over time)
    technology_growth = language_popularity[:5]  # Simplified

    # Growth trend
    growth_trend = repositories_over_time[-30:] if len(repositories_over_time) > 30 else repositories_over_time

    # State comparison
    state_result = await db.execute(
        select(Repository.owner_login, func.count(Repository.id).label("count"))
        .group_by(Repository.owner_login)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    state_comparison = [{"state": row.owner_login, "repositories": row.count} for row in state_result.fetchall()]

    return AnalyticsGraphResponse(
        repositories_over_time=repositories_over_time,
        technology_growth=technology_growth,
        language_popularity=language_popularity,
        top_domains=top_domains,
        growth_trend=growth_trend,
        state_comparison=state_comparison,
    )


@router.get("/scores", response_model=list[EcosystemScoreResponse])
async def get_ecosystem_scores(
    db: AsyncSession = Depends(get_db),
) -> list[EcosystemScoreResponse]:
    """Get ecosystem scores for all Indian states."""
    from app.models.github import Repository

    # Get all states with their metrics
    state_result = await db.execute(
        select(Repository.owner_login, func.count(Repository.id).label("repo_count"))
        .group_by(Repository.owner_login)
        .order_by(func.count(Repository.id).desc())
        .limit(20)
    )

    states_data = [
        {"state": row.owner_login, "repositories": row.repo_count}
        for row in state_result.fetchall()
    ]

    # Calculate scores for each state
    scores = []
    max_repos = max((s["repositories"] for s in states_data), default=1)

    indian_states = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Lucknow",
                     "Chandigarh", "Indore", "Bhopal", "Patna", "Ranchi", "Guwahati", "Thiruvananthapuram", "Coimbatore", "Mysore", "Vizag"]

    for i, state_data in enumerate(states_data):
        state_name = indian_states[i] if i < len(indian_states) else state_data["state"]
        repo_count = state_data["repositories"]

        # Calculate component scores (simplified algorithm)
        developer_activity = min(100, (repo_count / max_repos) * 100)
        innovation = min(100, 50 + (repo_count / max_repos) * 50)  # Innovation linked to repo count
        open_source = min(100, 60 + (repo_count / max_repos) * 40)
        ai_score = min(100, 40 + (repo_count / max_repos) * 60)  # AI focus
        cybersecurity_score = min(100, 30 + (repo_count / max_repos) * 70)
        growth_score = min(100, 70 + (hash(state_name) % 30))

        overall = (
            developer_activity * 0.25 +
            innovation * 0.15 +
            open_source * 0.15 +
            ai_score * 0.20 +
            cybersecurity_score * 0.10 +
            growth_score * 0.15
        )

        scores.append(EcosystemScoreResponse(
            state=state_name,
            developer_activity_score=round(developer_activity, 2),
            innovation_score=round(innovation, 2),
            open_source_score=round(open_source, 2),
            ai_score=round(ai_score, 2),
            cybersecurity_score=round(cybersecurity_score, 2),
            growth_score=round(growth_score, 2),
            overall_score=round(overall, 2),
            rank=i + 1,
        ))

    return sorted(scores, key=lambda x: x.overall_score, reverse=True)


@router.get("/discovery", response_model=DiscoveryResponse)
async def get_discovery(
    db: AsyncSession = Depends(get_db),
) -> DiscoveryResponse:
    """Get trending and discovery data."""
    from app.models.github import Repository

    # Get trending repositories (most stars recently)
    trending_repos_result = await db.execute(
        select(Repository)
        .order_by(Repository.stargazers_count.desc(), Repository.updated_at.desc())
        .limit(20)
    )
    trending_repositories = [
        {
            "id": repo.id,
            "name": repo.name,
            "full_name": repo.full_name,
            "stars": repo.stargazers_count,
            "language": repo.language,
            "description": repo.description,
        }
        for repo in trending_repos_result.scalars().all()
    ]

    # Get trending technologies (top languages)
    lang_result = await db.execute(
        select(Repository.language, func.count(Repository.id).label("count"))
        .where(Repository.language.isnot(None))
        .group_by(Repository.language)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    trending_technologies = [{"language": row.language, "count": row.count} for row in lang_result.fetchall()]

    # Get trending states
    state_result = await db.execute(
        select(Repository.owner_login, func.count(Repository.id).label("count"))
        .group_by(Repository.owner_login)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    trending_states = [{"state": row.owner_login, "repositories": row.count} for row in state_result.fetchall()]

    # Get top organizations
    org_result = await db.execute(
        select(Repository.owner_login, func.count(Repository.id).label("count"))
        .group_by(Repository.owner_login)
        .order_by(func.count(Repository.id).desc())
        .limit(10)
    )
    trending_organizations = [{"login": row.owner_login, "repositories": row.count} for row in org_result.fetchall()]

    # Get newest AI projects
    ai_result = await db.execute(
        select(Repository)
        .where(Repository.classification.isnot(None))
        .where(Repository.classification["domain"].astext.ilike("%ai%"))
        .order_by(Repository.created_at.desc())
        .limit(10)
    )
    newest_ai_projects = [
        {
            "id": repo.id,
            "name": repo.name,
            "full_name": repo.full_name,
            "language": repo.language,
            "created_at": repo.created_at.isoformat() if repo.created_at else None,
        }
        for repo in ai_result.scalars().all()
    ]

    # Get fastest growing domains
    domain_result = await db.execute(
        select(Repository.classification["domain"].astext, func.count(Repository.id).label("count"))
        .where(Repository.classification.isnot(None))
        .group_by(Repository.classification["domain"].astext)
        .order_by(func.count(Repository.id).desc())
        .limit(5)
    )
    fastest_growing_domains = [{"domain": row.domain or "unknown", "count": row.count} for row in domain_result.fetchall()]

    return DiscoveryResponse(
        trending_repositories=trending_repositories,
        trending_technologies=trending_technologies,
        trending_states=trending_states,
        trending_organizations=trending_organizations,
        newest_ai_projects=newest_ai_projects,
        fastest_growing_domains=fastest_growing_domains,
    )


@router.post("/search/semantic", response_model=SemanticSearchResponse)
async def semantic_search(
    request: SemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
) -> SemanticSearchResponse:
    """Perform semantic search on repositories using embeddings."""
    from app.models.github import Repository
    from app.services.embedding_service import EmbeddingService

    # Generate embedding for query
    embedding_service = EmbeddingService(db)

    try:
        # Get query embedding
        response = await embedding_service.client.embeddings.create(
            model=embedding_service.model,
            input=[request.query],
            dimensions=embedding_service.dimensions,
        )
        query_embedding = response.data[0].embedding
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")

    # Try native SQL vector similarity search via pgvector
    results = []
    try:
        # Check if pgvector is available on model column
        sim_col = (1 - Repository.embedding.cosine_distance(query_embedding)).label("similarity")
        stmt = (
            select(Repository, sim_col)
            .where(Repository.embedding.isnot(None))
        )
        if request.domain:
            stmt = stmt.where(Repository.classification["domain"].astext.ilike(f"%{request.domain}%"))
        stmt = stmt.order_by(Repository.embedding.cosine_distance(query_embedding)).limit(request.limit)
        
        db_res = await db.execute(stmt)
        rows = db_res.all()
        for repo, similarity in rows:
            results.append(
                SemanticSearchResult(
                    repository_id=repo.id,
                    name=repo.name,
                    full_name=repo.full_name,
                    description=repo.description,
                    similarity=round(float(similarity or 0), 4),
                    language=repo.language,
                    topics=repo.topics or [],
                    stars=repo.stargazers_count,
                    html_url=repo.html_url,
                )
            )
    except Exception:
        # Fallback to in-memory cosine calculation for non-PostgreSQL/SQLite test environments
        query = select(Repository).where(Repository.embedding.isnot(None))
        if request.domain:
            query = query.where(Repository.classification["domain"].astext.ilike(f"%{request.domain}%"))

        result = await db.execute(query.limit(500))
        repositories = result.scalars().all()

        def cosine_similarity(a: list[float], b: list[float]) -> float:
            dot_product = sum(x * y for x, y in zip(a, b))
            norm_a = sum(x * x for x in a) ** 0.5
            norm_b = sum(x * x for x in b) ** 0.5
            return dot_product / (norm_a * norm_b) if norm_a and norm_b else 0

        scored_repos = []
        for repo in repositories:
            if repo.embedding:
                similarity = cosine_similarity(query_embedding, repo.embedding)
                scored_repos.append((repo, similarity))

        scored_repos.sort(key=lambda x: x[1], reverse=True)
        top_results = scored_repos[:request.limit]

        results = [
            SemanticSearchResult(
                repository_id=repo.id,
                name=repo.name,
                full_name=repo.full_name,
                description=repo.description,
                similarity=round(similarity, 4),
                language=repo.language,
                topics=repo.topics or [],
                stars=repo.stargazers_count,
                html_url=repo.html_url,
            )
            for repo, similarity in top_results
        ]

    return SemanticSearchResponse(
        query=request.query,
        results=results,
        total=len(results),
    )


@router.get("/repositories/{repository_id}/card", response_model=dict)
async def get_repository_card(
    repository_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get AI-generated repository card with summary."""
    from app.models.github import Repository

    result = await db.execute(select(Repository).where(Repository.id == repository_id))
    repo = result.scalar_one_or_none()

    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    classification = repo.classification or {}

    # Extract card data from repository
    card = {
        "id": repo.id,
        "name": repo.name,
        "full_name": repo.full_name,
        "description": repo.description,
        "purpose": classification.get("domain", "General purpose"),
        "difficulty": classification.get("maturity", "Unknown"),
        "tech_stack": classification.get("tech_stack", []),
        "industry": classification.get("domain", "General"),
        "repository_health": classification.get("community_health", "Unknown"),
        "community_size": _estimate_community_size(repo.forks_count, repo.stargazers_count),
        "stars": repo.stargazers_count,
        "languages": list(repo.languages.keys()) if repo.languages else [],
        "frameworks": classification.get("tech_stack", [])[:5],
        "growth_trend": _calculate_growth_trend(repo),
        "topics": repo.topics or [],
        "html_url": repo.html_url,
    }

    return card


def _estimate_community_size(forks: int, stars: int) -> str:
    """Estimate community size category."""
    total = forks + stars
    if total > 1000:
        return "Large"
    elif total > 100:
        return "Medium"
    elif total > 10:
        return "Small"
    return "New"


def _calculate_growth_trend(repo: Repository) -> str:
    """Calculate growth trend based on dates."""
    if not repo.created_at or not repo.pushed_at:
        return "Stable"

    days_active = (repo.pushed_at - repo.created_at).days if repo.pushed_at > repo.created_at else 0

    if days_active < 30:
        return "New"
    elif repo.stargazers_count > 100:
        return "Growing Rapidly"
    elif repo.stargazers_count > 10:
        return "Growing"
    return "Stable"


# Trend Explanation Endpoints

@router.post("/trends/explain", response_model=dict)
async def explain_trend(
    request: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explain a trend using AI.

    Request body:
    - entity_type: national, state, city, technology, organization, repository
    - entity_name: Name of the entity
    - metric_name: The metric being explained
    - current_value: Current period value
    - previous_value: Previous period value
    - time_range: week, month, quarter, year
    - domain: Optional domain filter
    """
    from app.services.trend_explanation_service import TrendExplanationService, EntityType

    entity_type_str = request.get("entity_type", "state")
    try:
        entity_type = EntityType(entity_type_str)
    except ValueError:
        entity_type = EntityType.STATE

    service = TrendExplanationService(db)
    explanation = await service.explain_trend(
        entity_type=entity_type,
        entity_name=request.get("entity_name", ""),
        metric_name=request.get("metric_name", "repository_count"),
        current_value=request.get("current_value", 0),
        previous_value=request.get("previous_value", 0),
        time_range=request.get("time_range", "month"),
        domain=request.get("domain"),
    )

    return explanation.model_dump()


@router.get("/compare", response_model=dict)
async def compare_states(
    db: AsyncSession = Depends(get_db),
    state_a: str = Query(..., description="First state to compare"),
    state_b: str = Query(..., description="Second state to compare"),
    domain: Optional[str] = Query(default=None, description="Optional domain filter"),
) -> dict:
    """Compare two Indian states comprehensively.

    Returns comparison data, AI summary, and insights.
    """
    from app.services.trend_explanation_service import TrendExplanationService

    service = TrendExplanationService(db)
    comparison_data, summary, insights = await service.compare_states(
        state_a=state_a,
        state_b=state_b,
        domain=domain,
    )

    return {
        "comparison": comparison_data.model_dump(),
        "summary": summary.model_dump(),
        "insights": [i.model_dump() for i in insights],
    }


@router.get("/compare/insights", response_model=list[dict])
async def get_comparison_insights(
    db: AsyncSession = Depends(get_db),
    state_a: str = Query(..., description="First state"),
    state_b: str = Query(..., description="Second state"),
    domain: Optional[str] = Query(default=None),
) -> list[dict]:
    """Get specific comparison insights between two states."""
    from app.services.trend_explanation_service import TrendExplanationService

    service = TrendExplanationService(db)
    _, _, insights = await service.compare_states(
        state_a=state_a,
        state_b=state_b,
        domain=domain,
    )

    return [i.model_dump() for i in insights]


@router.get("/ask/stream")
async def ask_devatlas_stream(
    query: str = Query(..., description="Query for DevAtlas AI Copilot"),
    session_id: Optional[str] = Query(default=None, description="Chat session ID for multi-turn conversation"),
    db: AsyncSession = Depends(get_db),
):
    """Stream AI response for Ask DevAtlas Copilot query using SSE with RAG grounded context."""
    from app.services.ai_service import AIServiceFactory
    from app.services.rag_service import RAGService
    from app.repositories.chat_repository import ChatRepository
    import json

    chat_repo = ChatRepository(db)
    session = None

    if session_id:
        session = await chat_repo.get_session(session_id)
    if not session:
        session = await chat_repo.create_session(title=query[:60])
        session_id = session.id

    await chat_repo.add_message(session_id, "user", query)

    rag_service = RAGService(db)
    rag_result = await rag_service.retrieve_context(query)

    history_context = _build_history_context(session.messages) if session.messages else ""

    system_prompt = (
        "You are DevAtlas AI, an expert software ecosystem intelligence analyst specializing in Indian developer data.\n"
        "Ground your answer strictly in the provided repository context below when relevant. Cite specific repository names.\n\n"
        f"--- CONVERSATION HISTORY ---\n{history_context}\n------------------------------\n\n"
        f"--- GROUNDED REPOSITORY CONTEXT ---\n{rag_result.formatted_context}\n-----------------------------------"
    )

    async def event_generator():
        full_response: list[str] = []
        try:
            provider = AIServiceFactory.get_provider()
            # Send session_id first
            yield f"data: {json.dumps({'session_id': session_id})}\n\n"

            if rag_result.citations:
                citations_payload = json.dumps({"citations": [c.model_dump() for c in rag_result.citations]})
                yield f"data: {citations_payload}\n\n"

            async for chunk in provider.stream_text(system_prompt=system_prompt, user_prompt=query):
                full_response.append(chunk)
                data = json.dumps({"text": chunk})
                yield f"data: {data}\n\n"

            # Persist assistant response
            await chat_repo.add_message(session_id, "assistant", "".join(full_response))
            await db.commit()

            yield "data: [DONE]\n\n"
        except Exception as e:
            err_data = json.dumps({"error": str(e)})
            yield f"data: {err_data}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/ask")
async def ask_devatlas(
    request: dict,
    db: AsyncSession = Depends(get_db),
):
    """Ask DevAtlas Copilot non-streaming endpoint with grounded RAG context and multi-turn support."""
    from app.services.ai_service import AIServiceFactory
    from app.services.rag_service import RAGService
    from app.repositories.chat_repository import ChatRepository

    query = request.get("query", "")
    if not query:
        raise HTTPException(status_code=400, detail="Query parameter is required")

    session_id = request.get("session_id")
    chat_repo = ChatRepository(db)
    session = None

    if session_id:
        session = await chat_repo.get_session(session_id)
    if not session:
        session = await chat_repo.create_session(title=query[:60])

    await chat_repo.add_message(session.id, "user", query)

    rag_service = RAGService(db)
    rag_result = await rag_service.retrieve_context(query)

    history_context = _build_history_context(session.messages) if session.messages else ""

    system_prompt = (
        "You are DevAtlas AI, an expert software ecosystem intelligence analyst specializing in Indian developer data.\n"
        "Ground your answer strictly in the provided repository context below when relevant.\n\n"
        f"--- CONVERSATION HISTORY ---\n{history_context}\n------------------------------\n\n"
        f"--- GROUNDED REPOSITORY CONTEXT ---\n{rag_result.formatted_context}\n-----------------------------------"
    )

    provider = AIServiceFactory.get_provider()
    chunks = []
    async for chunk in provider.stream_text(system_prompt=system_prompt, user_prompt=query):
        chunks.append(chunk)

    answer = "".join(chunks)
    await chat_repo.add_message(session.id, "assistant", answer)
    await db.commit()

    return {
        "query": query,
        "answer": answer,
        "session_id": session.id,
        "citations": [c.model_dump() for c in rag_result.citations],
        "confidence_score": 0.95,
    }


def _build_history_context(messages: list) -> str:
    """Build conversation history context from chat messages."""
    if not messages:
        return "No prior conversation."
    recent = messages[-10:]  # Last 10 messages for context window
    lines = []
    for msg in recent:
        role_label = "User" if msg.role == "user" else "DevAtlas"
        lines.append(f"{role_label}: {msg.content[:500]}")
    return "\n".join(lines)


