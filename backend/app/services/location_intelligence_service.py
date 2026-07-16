from __future__ import annotations

import asyncio
import re
import urllib.parse
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_service
from app.core.config import get_settings
from app.models.github import GitHubUser
from app.repositories.location_repository import LocationRepository
from app.services.github_api_client import GitHubAPIClient

settings = get_settings()

@dataclass
class NormalizedLocation:
    raw: str
    normalized: Optional[str]
    confidence_hint: int

@dataclass
class GeocodedLocation:
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    timezone: Optional[str]
    confidence_score: int


class LocationNormalizer:
    """Normalizes raw location strings using dictionary rules."""

    ALIAS_MAP = {
        "bangalore": "Bengaluru",
        "bengaluru": "Bengaluru",
        "bombay": "Mumbai",
        "mumbai": "Mumbai",
        "pune mh": "Pune, Maharashtra",
        "pune": "Pune",
        "delhi ncr": "New Delhi",
        "delhi": "New Delhi",
        "new delhi": "New Delhi",
        "gurugram": "Gurugram",
        "gurgaon": "Gurugram",
        "hyderabad": "Hyderabad",
        "chennai": "Chennai",
        "madras": "Chennai",
        "kolkata": "Kolkata",
        "calcutta": "Kolkata",
        "ahmedabad": "Ahmedabad",
        "india": "India",
    }

    @classmethod
    def normalize(cls, raw_location: Optional[str]) -> NormalizedLocation:
        if not raw_location:
            return NormalizedLocation(raw="", normalized=None, confidence_hint=0)

        # Basic cleaning
        cleaned = raw_location.lower().strip()
        
        # Remove emojis (basic ascii/alphanumeric keeping)
        cleaned = re.sub(r'[^\w\s,.-]', '', cleaned)
        cleaned = cleaned.strip()

        if not cleaned:
            return NormalizedLocation(raw=raw_location, normalized=None, confidence_hint=0)

        # Remove "india" or ", india" to help alias matching
        base_city = re.sub(r',?\s*india$', '', cleaned).strip()

        # Check aliases
        normalized = cls.ALIAS_MAP.get(base_city)
        if normalized:
            return NormalizedLocation(raw=raw_location, normalized=normalized, confidence_hint=99 if "," in normalized or normalized != "India" else 65)

        # Fallback to Title Case
        normalized = " ".join(word.capitalize() for word in base_city.split())
        return NormalizedLocation(raw=raw_location, normalized=normalized, confidence_hint=50)


class ConfidenceEngine:
    """Calculates confidence scores for geocoded locations."""

    @classmethod
    def calculate(cls, geocoded: dict[str, Any]) -> int:
        if not geocoded:
            return 0
            
        address = geocoded.get("address", {})
        
        # Exact city match
        if "city" in address or "town" in address or "village" in address:
            return 99
            
        # Exact state match
        if "state" in address:
            return 90
            
        # Country only
        if "country" in address:
            return 65
            
        return 20


class GeocodingService:
    """Geocodes normalized locations via Nominatim."""

    def __init__(self, location_repo: LocationRepository):
        self.repo = location_repo
        self.cache = get_cache_service()
        self.rate_limit_lock = asyncio.Lock()
        self.client = httpx.AsyncClient(
            headers={"User-Agent": getattr(settings, "geocoding_user_agent", "DevAtlas/1.0 contact@devatlas.dev")},
            timeout=10.0,
        )

    async def geocode(self, normalized_loc: str) -> GeocodedLocation:
        # 1. Check Redis Cache
        redis_cache = await self.cache.get_geocode(normalized_loc)
        if redis_cache:
            return GeocodedLocation(**redis_cache)

        # 2. Check DB Cache
        db_cache = await self.repo.get_location_cache(normalized_loc)
        if db_cache:
            data = {
                "latitude": db_cache.latitude,
                "longitude": db_cache.longitude,
                "city": db_cache.city,
                "state": db_cache.state,
                "country": db_cache.country,
                "timezone": db_cache.timezone,
                "confidence_score": db_cache.confidence_score,
            }
            await self.cache.set_geocode(normalized_loc, data)
            return GeocodedLocation(**data)

        # 3. Call Nominatim
        async with self.rate_limit_lock:
            url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(normalized_loc)}&format=json&addressdetails=1&limit=1"
            try:
                response = await self.client.get(url)
                await asyncio.sleep(getattr(settings, "geocode_rate_limit_seconds", 1.1))  # Respect usage policy
                
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        first_match = data[0]
                        address = first_match.get("address", {})
                        
                        confidence = ConfidenceEngine.calculate(first_match)
                        
                        result = GeocodedLocation(
                            latitude=float(first_match["lat"]),
                            longitude=float(first_match["lon"]),
                            city=address.get("city") or address.get("town") or address.get("village"),
                            state=address.get("state"),
                            country=address.get("country"),
                            timezone=None,  # Nominatim doesn't provide timezone directly
                            confidence_score=confidence,
                        )
                    else:
                        # Unresolvable location
                        result = GeocodedLocation(
                            latitude=None, longitude=None, city=None, state=None, 
                            country=None, timezone=None, confidence_score=0
                        )
                else:
                    result = GeocodedLocation(
                        latitude=None, longitude=None, city=None, state=None, 
                        country=None, timezone=None, confidence_score=0
                    )
            except Exception:
                result = GeocodedLocation(
                    latitude=None, longitude=None, city=None, state=None, 
                    country=None, timezone=None, confidence_score=0
                )

        # Cache in DB and Redis
        result_dict = {
            "latitude": result.latitude,
            "longitude": result.longitude,
            "city": result.city,
            "state": result.state,
            "country": result.country,
            "timezone": result.timezone,
            "confidence_score": result.confidence_score,
        }
        await self.repo.set_location_cache(normalized_loc, result_dict)
        await self.cache.set_geocode(normalized_loc, result_dict)

        return result

    async def close(self):
        await self.client.aclose()


@dataclass
class BatchResult:
    processed: int
    enriched: int
    errors: int


class LocationIntelligenceService:
    """Orchestrator for the Location Intelligence Pipeline."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.location_repo = LocationRepository(db)
        self.github_client = GitHubAPIClient()
        self.geocoder = GeocodingService(self.location_repo)

    async def enrich_repository_owner(self, owner_login: str) -> Optional[GitHubUser]:
        # 1. Fetch from GitHub using the new client
        user_response = await self.github_client.get_user(owner_login)
        if not user_response or user_response.get("_status") == 304:
            # If not found or not modified, we might still want to process if we have a stale record,
            # but for now we just return None to skip. Wait, 304 means not modified, so we should skip.
            return None

        # Fetch orgs
        orgs_response = []
        try:
            async for org in self.github_client.paginate(f"https://api.github.com/users/{owner_login}/orgs"):
                orgs_response.append(org.get("login"))
        except Exception:
            pass

        def parse_iso(val):
            from datetime import datetime
            return datetime.fromisoformat(val.replace("Z", "+00:00")) if val else None

        user_data = {
            "login": user_response.get("login"),
            "raw_location": user_response.get("location"),
            "company": user_response.get("company"),
            "type": user_response.get("type", "User"),
            "created_at": parse_iso(user_response.get("created_at")),
            "public_repos": user_response.get("public_repos", 0),
            "bio": user_response.get("bio"),
            "followers": user_response.get("followers", 0),
            "following": user_response.get("following", 0),
            "organizations": orgs_response,
            "avatar_url": user_response.get("avatar_url"),
            "html_url": user_response.get("html_url"),
            "twitter_username": user_response.get("twitter_username"),
            "hireable": user_response.get("hireable", False),
        }

        # 2. Upsert base user
        user = await self.location_repo.upsert_github_user(user_data)

        # 3. Normalize
        norm_result = LocationNormalizer.normalize(user.raw_location)
        user.normalized_location = norm_result.normalized

        # 4. Geocode if normalized exists
        if norm_result.normalized:
            geo_result = await self.geocoder.geocode(norm_result.normalized)
            
            user.city = geo_result.city
            user.state = geo_result.state
            user.country = geo_result.country
            user.latitude = geo_result.latitude
            user.longitude = geo_result.longitude
            user.confidence_score = geo_result.confidence_score
            user.location_source = "Nominatim"
        else:
            user.confidence_score = 0
            user.location_source = None

        user.last_verified = asyncio.get_event_loop().time() # Will be set to utcnow in repository
        
        # 5. Save enriched user
        user = await self.location_repo.upsert_github_user(user.__dict__)
        return user

    async def run_batch_enrichment(self, limit: int = 200) -> BatchResult:
        logins = await self.location_repo.get_users_needing_enrichment(limit)
        
        result = BatchResult(processed=0, enriched=0, errors=0)
        
        for login in logins:
            try:
                user = await self.enrich_repository_owner(login)
                result.processed += 1
                if user and user.confidence_score and user.confidence_score > 0:
                    result.enriched += 1
                    # Update geom on repositories
                    await self.location_repo.update_repository_geom_for_user(login)
            except Exception as e:
                # Log error but continue batch
                print(f"Error enriching {login}: {e}")
                result.errors += 1
                
        await self.db.commit()
        return result

    async def close(self):
        await self.geocoder.close()
        await self.github_client.close()
