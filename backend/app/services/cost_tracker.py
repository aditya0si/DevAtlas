from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from app.core.metrics import AI_REQUESTS, AI_TOKENS, AI_COST, AI_LATENCY

# Approximate cost per 1M tokens in USD cents
_MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 250, "output": 1000},
    "gpt-4o-mini": {"input": 15, "output": 60},
    "text-embedding-3-small": {"input": 2, "output": 0},
    "gemini-2.5-flash": {"input": 15, "output": 60},
    "mistral": {"input": 0, "output": 0},
    "nomic-embed-text": {"input": 0, "output": 0},
}


class AICostTracker:
    @staticmethod
    def estimate_cost(provider: str, model: str, operation: str, input_tokens: int = 0, output_tokens: int = 0) -> int:
        pricing = _MODEL_PRICING.get(model, {"input": 0, "output": 0})
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        return int(input_cost + output_cost)

    @staticmethod
    def record(provider: str, model: str, operation: str, input_tokens: int = 0, output_tokens: int = 0, duration: float = 0) -> None:
        cost_cents = AICostTracker.estimate_cost(provider, model, operation, input_tokens, output_tokens)
        AI_REQUESTS.labels(provider=provider, operation=operation, model=model).inc()
        AI_TOKENS.labels(provider=provider, operation=operation, model=model).inc(input_tokens + output_tokens)
        AI_COST.labels(provider=provider, operation=operation, model=model).inc(cost_cents)
        if duration > 0:
            AI_LATENCY.labels(provider=provider, operation=operation).observe(duration)

    @staticmethod
    @asynccontextmanager
    async def track(provider: str, model: str, operation: str) -> AsyncGenerator[None, None]:
        start = time.time()
        try:
            yield
        finally:
            duration = time.time() - start
            AI_REQUESTS.labels(provider=provider, operation=operation, model=model).inc()
            AI_LATENCY.labels(provider=provider, operation=operation).observe(duration)
