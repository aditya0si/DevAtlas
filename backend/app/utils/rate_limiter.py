from __future__ import annotations

import asyncio
from datetime import datetime

import httpx


class GitHubRateLimiter:
    def __init__(self, token: str) -> None:
        self.token = token
        self.remaining = 5000
        self.reset_time = datetime.utcnow()
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"token {token}"},
            timeout=30.0,
        )

    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        if datetime.utcnow() >= self.reset_time:
            self.remaining = 5000
            self.reset_time = datetime.utcnow()
        if self.remaining <= 10:
            wait_seconds = max((self.reset_time - datetime.utcnow()).total_seconds(), 0)
            await asyncio.sleep(wait_seconds)
        response = await self.client.request(method, url, **kwargs)
        self.remaining = int(response.headers.get("X-RateLimit-Remaining", 0))
        self.reset_time = datetime.fromtimestamp(int(response.headers.get("X-RateLimit-Reset", 0)))
        return response
