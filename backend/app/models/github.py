from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Date, Float, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID, FLOAT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base  # noqa: E402  # noqa: E402  # noqa: E402


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    github_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    owner_login: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    github_user_login: Mapped[Optional[str]] = mapped_column(
        String(255), 
        ForeignKey("github_users.login", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    html_url: Mapped[str] = mapped_column(String(255), nullable=False)
    private: Mapped[bool] = mapped_column(default=False, nullable=False)
    visibility: Mapped[str] = mapped_column(String(50), default="public", nullable=False)
    language: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    languages: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    stargazers_count: Mapped[int] = mapped_column(default=0, nullable=False)
    forks_count: Mapped[int] = mapped_column(default=0, nullable=False)
    open_issues_count: Mapped[int] = mapped_column(default=0, nullable=False)
    topics: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True)
    default_branch: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    license: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    has_wiki: Mapped[Optional[bool]] = mapped_column(Boolean, default=True, nullable=True)
    archived: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    subscribers_count: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    has_pages: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    homepage: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pushed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    classification: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(JSONB, nullable=True)
    geom: Mapped[Optional[Geometry]] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    classification_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list["GitHubEvent"]] = relationship(
        "GitHubEvent",
        back_populates="repository",
        viewonly=True,
        cascade="all, delete-orphan",
    )
    owner: Mapped[Optional["GitHubUser"]] = relationship(
        "GitHubUser",
        back_populates="repositories",
        lazy="selectin",
    )


class GitHubEvent(Base):
    __tablename__ = "github_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    github_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_login: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    repo_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    repo_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    public: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    repository_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    repository: Mapped[Repository | None] = relationship(
        "Repository",
        back_populates="events",
        lazy="selectin",
    )


Index("ix_repositories_owner_language", Repository.owner_login, Repository.language)
Index("ix_events_repo_created", GitHubEvent.repo_id, GitHubEvent.created_at)
Index("ix_repositories_classification_updated_at", Repository.classification_updated_at)
Index("ix_repositories_stargazers_count", Repository.stargazers_count)
Index("ix_repositories_classification_gin", Repository.classification, postgresql_using="gin")
Index("ix_repositories_geom", Repository.geom, postgresql_using="gist")


class GitHubUser(Base):
    __tablename__ = "github_users"

    login: Mapped[str] = mapped_column(String(255), primary_key=True)
    raw_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="User")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    public_repos: Mapped[int] = mapped_column(Integer, default=0)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    followers: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    following: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    organizations: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    html_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    twitter_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hireable: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    enrichment_status: Mapped[Optional[str]] = mapped_column(String(20), default="pending", nullable=True, index=True)
    enrichment_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    enriched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Location Intelligence
    normalized_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(FLOAT, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(FLOAT, nullable=True)
    confidence_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0 to 100
    location_source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_verified: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    geom: Mapped[Optional[Geometry]] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    
    repositories: Mapped[list["Repository"]] = relationship(
        "Repository",
        back_populates="owner",
        viewonly=True,
    )


class LocationCache(Base):
    __tablename__ = "location_cache"

    normalized_location: Mapped[str] = mapped_column(String(255), primary_key=True)
    latitude: Mapped[Optional[float]] = mapped_column(FLOAT, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(FLOAT, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    confidence_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cached_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

Index("ix_github_users_country", GitHubUser.country)

class SyncState(Base):
    __tablename__ = "sync_state"
    
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    sync_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    last_github_id: Mapped[int] = mapped_column(Integer, default=0)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_etag: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_processed: Mapped[int] = mapped_column(Integer, default=0)
    total_skipped: Mapped[int] = mapped_column(Integer, default=0)
    total_errors: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="idle")
    state_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"
    
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    snapshot_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    snapshot_type: Mapped[str] = mapped_column(String(50), nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        UniqueConstraint("snapshot_date", "snapshot_type", name="uq_snapshot_date_type"),
        Index("ix_analytics_snapshots_date_type", "snapshot_date", "snapshot_type"),
    )

class WorkerRun(Base):
    __tablename__ = "worker_runs"
    
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    worker_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    items_processed: Mapped[int] = mapped_column(Integer, default=0)
    items_failed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(FLOAT, nullable=True)
    metrics: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

Index("ix_worker_runs_name_status", WorkerRun.worker_name, WorkerRun.status)

