
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.github import GitHubUserResponse
from app.services.location_intelligence_service import LocationIntelligenceService

router = APIRouter()


@router.post("/enrich/{login}", response_model=GitHubUserResponse)
async def enrich_user_location(
    login: str,
    db: AsyncSession = Depends(get_db),
) -> GitHubUserResponse:
    """
    Manually enrich a GitHub user's location data.
    Fetches the user from GitHub, normalizes the location, and geocodes it.
    """
    service = LocationIntelligenceService(db)
    try:
        user = await service.enrich_repository_owner(login)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"GitHub user {login} not found",
            )
        return GitHubUserResponse.model_validate(user)
    finally:
        await service.close()
