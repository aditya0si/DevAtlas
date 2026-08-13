from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Production (Railway/Vercel): env vars injected by platform, no .env file.
        # Development: place .env in backend/ directory.
        env_file=".env" if os.path.isfile(os.path.join(os.path.dirname(__file__), "..", "..", ".env")) else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "DevAtlas API"
    api_prefix: str = "/api/v1"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://devatlas:devatlas@localhost:5432/devatlas"
    redis_url: Optional[str] = "redis://localhost:6379/0"

    github_token: Optional[str] = None
    github_app_id: Optional[str] = None
    github_app_private_key_path: Optional[str] = None
    github_app_installation_id: Optional[str] = None

    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    groq_model: str = "llama-3.3-70b-versatile"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_embedding_dimensions: int = 768
    
    # Location Intelligence
    location_min_confidence: int = 40
    geocode_rate_limit_seconds: float = 1.1
    geocoding_user_agent: str = "DevAtlas/1.0 contact@devatlas.dev"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"

    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 60 * 24 * 7

    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60

    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    frontend_url: Optional[str] = None

    # Email settings
    email_service: str = "console"  # "console" or "smtp"
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True
    smtp_from_address: str = "noreply@devatlas.local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
