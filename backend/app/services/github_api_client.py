import asyncio
import logging
from typing import Any, AsyncGenerator, Dict, Optional

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

class RateLimitExceeded(Exception):
    pass

class GitHubAPIClient:
    """
    Production-grade GitHub API client with automatic retries, exponential backoff,
    pagination via Link headers, and ETags.
    """

    def __init__(self, token: Optional[str] = None):
        self.token = token or settings.github_token
        self.client = httpx.AsyncClient(
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30.0,
        )
        if self.token:
            self.client.headers["Authorization"] = f"token {self.token}"
        
        self.rate_limit_remaining = 5000
        self.rate_limit_reset = 0

    async def _handle_rate_limit(self, response: httpx.Response) -> None:
        remaining = response.headers.get("X-RateLimit-Remaining")
        reset = response.headers.get("X-RateLimit-Reset")
        
        if remaining is not None:
            self.rate_limit_remaining = int(remaining)
        if reset is not None:
            self.rate_limit_reset = int(reset)
            
        if response.status_code in (403, 429) and self.rate_limit_remaining == 0:
            import time
            now = time.time()
            wait_time = max(self.rate_limit_reset - now, 0)
            logger.warning(f"Rate limit exceeded. Waiting {wait_time:.2f} seconds.")
            await asyncio.sleep(wait_time + 1)
            raise RateLimitExceeded("Rate limit exceeded, retrying after backoff.")
            
        if response.status_code in (403, 429):
            # Secondary rate limit (abuse detection)
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                wait_time = int(retry_after)
                logger.warning(f"Secondary rate limit hit. Waiting {wait_time} seconds.")
                await asyncio.sleep(wait_time + 1)
                raise RateLimitExceeded("Secondary rate limit exceeded.")
                
        if response.status_code != 304:
            response.raise_for_status()

    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Make a request with tenacity retry logic for transient errors and rate limits."""
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(5),
            wait=wait_exponential(multiplier=1, min=2, max=60),
            retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError, RateLimitExceeded)),
        ):
            with attempt:
                response = await self.client.request(method, url, **kwargs)
                
                # Check for rate limits and raise RateLimitExceeded if necessary,
                # which triggers a retry in the AsyncRetrying block.
                await self._handle_rate_limit(response)
                
                return response
        
        # This should never be reached due to AsyncRetrying raising the last exception
        raise RuntimeError("Request failed after all retries.")

    async def paginate(self, url: str, params: Optional[Dict[str, Any]] = None) -> AsyncGenerator[Dict[str, Any], None]:
        """Automatically yield items from a paginated API endpoint."""
        next_url = url
        while next_url:
            response = await self.request("GET", next_url, params=params)
            params = None  # only include params on the first request
            data = response.json()
            
            # If the endpoint returns a dict containing 'items' (like the Search API)
            if isinstance(data, dict) and "items" in data:
                items = data["items"]
            elif isinstance(data, list):
                items = data
            else:
                items = [data]
                
            for item in items:
                yield item
                
            next_url = response.links.get("next", {}).get("url")

    async def search_repositories(self, query: str, sort: str = "stars", order: str = "desc") -> AsyncGenerator[Dict[str, Any], None]:
        """Search for repositories matching the query."""
        url = "https://api.github.com/search/repositories"
        params = {"q": query, "sort": sort, "order": order, "per_page": 100}
        async for item in self.paginate(url, params=params):
            yield item

    async def get_user(self, username: str, etag: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch a specific user profile, utilizing ETags if provided."""
        headers = {}
        if etag:
            headers["If-None-Match"] = etag
            
        try:
            # We bypass `self.request` for the 304 Not Modified case because it would raise an HTTPStatusError
            response = await self.client.get(f"https://api.github.com/users/{username}", headers=headers)
            await self._handle_rate_limit(response)
            
            if response.status_code == 304:
                return {"_status": 304}
                
            data = response.json()
            data["_etag"] = response.headers.get("ETag")
            data["_status"] = 200
            return data
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_repository(self, owner: str, repo: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific repository."""
        try:
            response = await self.request("GET", f"https://api.github.com/repos/{owner}/{repo}")
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def close(self) -> None:
        await self.client.aclose()
