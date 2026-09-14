from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator  # noqa: E402  # noqa: E402  # noqa: E402


class RepositoryBase(BaseModel):
    github_id: int
    name: str
    full_name: str
    owner_login: str
    description: Optional[str] = None
    html_url: str
    private: bool = False
    visibility: str = "public"
    language: Optional[str] = None
    languages: Optional[dict[str, int]] = None
    stargazers_count: int = 0
    forks_count: int = 0
    open_issues_count: int = 0
    topics: list[str] = []
    default_branch: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    pushed_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    classification: Optional[dict[str, Any]] = None
    embedding: Optional[list[float]] = None

    @field_validator("topics", mode="before")
    @classmethod
    def _topics_not_null(cls, v: Any) -> Any:
        """Repositories may have NULL topics in the DB; expose as [] instead."""
        return v or []


class RepositoryCreate(RepositoryBase):
    pass


class RepositoryResponse(RepositoryBase):
    id: str
    ingested_at: datetime
    classification_updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RepositoryOwnerResponse(BaseModel):
    """Owner details for repository detail drill-down."""

    login: str
    avatar_url: Optional[str] = None
    location: Optional[str] = None
    state: Optional[str] = None

    model_config = {"from_attributes": True}


class RepositoryDetailResponse(RepositoryResponse):
    """Repository detail response including resolved owner info."""

    owner: Optional[RepositoryOwnerResponse] = None


class GitHubEventBase(BaseModel):
    github_id: str
    event_type: str
    actor_id: Optional[int] = None
    actor_login: Optional[str] = None
    repo_id: Optional[int] = None
    repo_name: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    public: bool = True
    created_at: Optional[datetime] = None


class GitHubEventCreate(GitHubEventBase):
    pass


class GitHubEventResponse(GitHubEventBase):
    id: str
    ingested_at: datetime

    model_config = {"from_attributes": True}


class GitHubUserResponse(BaseModel):
    login: str
    raw_location: Optional[str] = None
    company: Optional[str] = None
    type: str = "User"
    created_at: Optional[datetime] = None
    public_repos: int = 0
    bio: Optional[str] = None
    normalized_location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confidence_score: Optional[int] = None
    location_source: Optional[str] = None
    last_verified: Optional[datetime] = None

    model_config = {"from_attributes": True}
