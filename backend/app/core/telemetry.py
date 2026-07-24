from __future__ import annotations

try:
    from prometheus_client import Counter, Histogram

    AI_TOKEN_USAGE_COUNTER = Counter(
        "devatlas_ai_token_usage_total",
        "Total AI tokens consumed",
        ["provider", "model", "token_type"],  # token_type: prompt, completion
    )

    AI_ESTIMATED_COST_COUNTER = Counter(
        "devatlas_ai_estimated_cost_usd_total",
        "Total estimated AI API spend in USD",
        ["provider", "model"],
    )

    AI_REQUEST_LATENCY_HISTOGRAM = Histogram(
        "devatlas_ai_request_latency_seconds",
        "AI response generation latency in seconds",
        ["provider", "model"],
    )
except ImportError:
    AI_TOKEN_USAGE_COUNTER = None
    AI_ESTIMATED_COST_COUNTER = None
    AI_REQUEST_LATENCY_HISTOGRAM = None


class AITelemetry:
    @staticmethod
    def record_usage(provider: str, model: str, prompt_tokens: int, completion_tokens: int, duration_seconds: float):
        if AI_TOKEN_USAGE_COUNTER:
            AI_TOKEN_USAGE_COUNTER.labels(provider=provider, model=model, token_type="prompt").inc(prompt_tokens)
            AI_TOKEN_USAGE_COUNTER.labels(provider=provider, model=model, token_type="completion").inc(completion_tokens)

            # Estimate cost based on gpt-4o standard pricing ($2.50 / 1M prompt, $10.00 / 1M completion)
            est_cost = (prompt_tokens * 2.50 / 1_000_000) + (completion_tokens * 10.00 / 1_000_000)
            AI_ESTIMATED_COST_COUNTER.labels(provider=provider, model=model).inc(est_cost)

        if AI_REQUEST_LATENCY_HISTOGRAM:
            AI_REQUEST_LATENCY_HISTOGRAM.labels(provider=provider, model=model).observe(duration_seconds)
