import json
import logging
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator

from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

class RepositoryClassification(BaseModel):
    domain: str = Field(description="Broad domain, e.g., Web, Mobile, Data, AI/ML, DevOps")
    industry: str = Field(description="Target industry, e.g., Finance, Healthcare, DevTools, General")
    primary_technology: str = Field(description="Main programming language or technology")
    framework: str = Field(description="Primary framework used, e.g., React, Django, FastAPI, None")
    difficulty: str = Field(description="Beginner, Intermediate, Advanced")
    health: str = Field(description="Active, Unmaintained, Archived")

class AIProvider(ABC):
    @abstractmethod
    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        pass

    @abstractmethod
    async def generate_embedding(self, text: str) -> list[float]:
        pass

    @abstractmethod
    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        pass

class GeminiProvider(AIProvider):
    def __init__(self):
        try:
            from google import genai
            from google.genai import types
            self.client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None
            self.types = types
        except ImportError:
            self.client = None

    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("google-genai not installed or configured")
            
        response = self.client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt],
            config=self.types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RepositoryClassification,
                temperature=0.1,
            ),
        )
        return json.loads(response.text)

    async def generate_embedding(self, text: str) -> list[float]:
        if not self.client:
            raise RuntimeError("google-genai not installed or configured")
            
        result = self.client.models.embed_content(
            model='text-embedding-004',
            contents=text,
        )
        return result.embeddings[0].values

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        if not self.client:
            yield "Gemini API key is not configured. Returning analysis baseline.\n"
            yield f"Query: {user_prompt}\n"
            yield "India developer ecosystem shows high growth in AI, Cloud, and Web3 repositories across Karnataka and Telangana."
            return

        combined_prompt = f"{system_prompt}\n\nUser Query: {user_prompt}"
        response = self.client.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=[combined_prompt],
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text


class OllamaProvider(AIProvider):
    def __init__(self):
        try:
            import httpx
            self.client = httpx.AsyncClient(timeout=60.0)
            self.base_url = settings.ollama_base_url
            self.model = settings.ollama_model
            self.embedding_model = settings.ollama_embedding_model
            self.embedding_dims = settings.ollama_embedding_dimensions
            self._available = False
        except ImportError:
            self.client = None
            self._available = False

    async def _check_available(self) -> bool:
        if self._available:
            return True
        if not self.client:
            return False
        try:
            resp = await self.client.get(f"{self.base_url}/api/tags", timeout=5.0)
            if resp.status_code == 200:
                self._available = True
                return True
        except Exception:
            pass
        return False

    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        if not await self._check_available():
            raise RuntimeError("Ollama not available")
        response = await self.client.post(
            f"{self.base_url}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1},
                "format": "json",
            },
        )
        result = response.json()
        import json as _json
        return _json.loads(result.get("response", "{}"))

    async def generate_embedding(self, text: str) -> list[float]:
        if not await self._check_available():
            raise RuntimeError("Ollama not available")
        response = await self.client.post(
            f"{self.base_url}/api/embeddings",
            json={"model": self.embedding_model, "prompt": text},
        )
        result = response.json()
        raw = result.get("embedding", [])
        if not raw:
            raise RuntimeError(f"Ollama returned an empty embedding for model {self.embedding_model}")
        if len(raw) != self.embedding_dims and len(raw) > 0:
            if len(raw) < self.embedding_dims:
                raw = raw + [0.0] * (self.embedding_dims - len(raw))
            else:
                raw = raw[:self.embedding_dims]
        return raw

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        if not await self._check_available():
            base = "Ollama is not available. Returning analysis baseline.\n"
            yield f"{base}Query: {user_prompt}\nIndia developer ecosystem shows high growth across states."
            return

        combined = f"{system_prompt}\n\nUser Query: {user_prompt}"
        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/generate",
            json={"model": self.model, "prompt": combined, "stream": True, "options": {"temperature": 0.3}},
        ) as resp:
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    if "response" in data:
                        yield data["response"]
                except json.JSONDecodeError:
                    continue


class OpenAIProvider(AIProvider):
    def __init__(self):
        try:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
        except ImportError:
            self.client = None

    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("openai not installed or configured")
            
        response = await self.client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert software engineer analyzing GitHub repositories."},
                {"role": "user", "content": prompt},
            ],
            response_format=RepositoryClassification,
            temperature=0.1,
        )
        return response.choices[0].message.parsed.model_dump()

    async def generate_embedding(self, text: str) -> list[float]:
        if not self.client:
            raise RuntimeError("openai not installed or configured")
            
        response = await self.client.embeddings.create(
            input=text,
            model=settings.embedding_model,
            dimensions=settings.embedding_dimensions,
        )
        return response.data[0].embedding

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        if not self.client:
            yield "OpenAI API key is not configured. Returning analysis baseline.\n"
            yield f"Query: {user_prompt}\n"
            yield "India developer ecosystem shows high growth in AI, Cloud, and Web3 repositories across Karnataka and Telangana."
            return

        response = await self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
            temperature=0.3,
        )
        async for chunk in response:
            content = chunk.choices[0].delta.content or ""
            if content:
                yield content

class GroqProvider(AIProvider):
    """Groq provider using the OpenAI SDK against Groq's OpenAI-compatible API.

    Groq does not offer embeddings, so ``generate_embedding`` raises and the
    fallback chain skips Groq, continuing to the configured embedding providers
    (OpenAI/Gemini/Ollama) or the deterministic local fallback.
    """

    BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(self):
        try:
            from openai import AsyncOpenAI
            self.client = (
                AsyncOpenAI(api_key=settings.groq_api_key, base_url=self.BASE_URL)
                if settings.groq_api_key
                else None
            )
        except ImportError:
            self.client = None

    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("openai SDK not installed or GROQ_API_KEY not configured")

        response = await self.client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert software engineer analyzing GitHub "
                        "repositories. Respond with JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            # Groq's OpenAI-compatible API supports structured JSON output via
            # response_format (unlike the OpenAI beta parse API, which Groq
            # does not implement).
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("Groq returned an empty classification response")
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"Groq returned invalid JSON for classification: {exc}"
            ) from exc
        try:
            classification = RepositoryClassification.model_validate(data)
        except ValidationError as exc:
            raise RuntimeError(
                f"Groq classification did not match the expected schema: {exc}"
            ) from exc
        return classification.model_dump()

    async def generate_embedding(self, text: str) -> list[float]:
        raise RuntimeError(
            "Groq does not provide embeddings; use OpenAI/Gemini/Ollama embedding providers"
        )

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        if not self.client:
            yield "Groq API key is not configured. Returning analysis baseline.\n"
            yield f"Query: {user_prompt}\n"
            baseline = (
                "India developer ecosystem shows high growth in AI, Cloud, and "
                "Web3 repositories across Karnataka and Telangana."
            )
            yield baseline
            return

        response = await self.client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
            temperature=0.3,
        )
        async for chunk in response:
            content = chunk.choices[0].delta.content or ""
            if content:
                yield content


class MockAIProvider(AIProvider):
    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        return {
            "domain": "AI/ML",
            "industry": "DevTools",
            "primary_technology": "Python",
            "framework": "PyTorch",
            "difficulty": "Intermediate",
            "health": "Active",
        }

    async def generate_embedding(self, text: str) -> list[float]:
        return [0.01] * 1536

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        response = f"Analysis for '{user_prompt}': Karnataka (Bengaluru) leads in AI repository density (+32% YoY growth), followed by Telangana (Hyderabad) and Maharashtra (Pune/Mumbai). Key tech trends include PyTorch, Next.js, and Rust adoption."
        for word in response.split():
            yield word + " "

class FallbackChainProvider(AIProvider):
    """Resilient provider cascading Groq -> OpenAI -> Gemini -> Ollama -> MockAI.

    Groq is preferred when ``GROQ_API_KEY`` is configured; OpenAI and Gemini
    remain available for backward compatibility when their env vars exist.
    """

    def __init__(self):
        self.providers: list[AIProvider] = []
        if settings.groq_api_key:
            self.providers.append(GroqProvider())
        if settings.openai_api_key:
            self.providers.append(OpenAIProvider())
        if settings.gemini_api_key:
            self.providers.append(GeminiProvider())
        self.providers.append(OllamaProvider())
        self.providers.append(MockAIProvider())

    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        for provider in self.providers:
            try:
                return await provider.classify_repository(prompt)
            except Exception:
                continue
        return await MockAIProvider().classify_repository(prompt)

    async def generate_embedding(self, text: str) -> list[float]:
        for provider in self.providers:
            try:
                if isinstance(provider, MockAIProvider):
                    self._log_embedding_fallback_warning()
                return await provider.generate_embedding(text)
            except Exception:
                continue
        self._log_embedding_fallback_warning()
        return await MockAIProvider().generate_embedding(text)

    def _log_embedding_fallback_warning(self) -> None:
        """Log when embeddings fall through to the deterministic MockAI provider.

        Groq does not offer embeddings, so a Groq-only deployment silently
        degrades semantic search to deterministic vectors unless an
        embedding-capable provider (OpenAI/Gemini/Ollama) is configured. The
        warning makes that degradation visible in the logs.
        """
        if settings.groq_api_key and not (
            settings.openai_api_key or settings.gemini_api_key
        ):
            logger.warning(
                "Groq does not provide embeddings and no other embedding-capable "
                "provider (OpenAI/Gemini/Ollama) is available; falling back to "
                "deterministic MockAI embeddings. Semantic search quality will "
                "be degraded."
            )
        else:
            logger.warning(
                "All embedding providers failed; falling back to deterministic "
                "MockAI embeddings. Semantic search quality will be degraded."
            )

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        for provider in self.providers:
            try:
                item_yielded = False
                async for chunk in provider.stream_text(system_prompt, user_prompt):
                    item_yielded = True
                    yield chunk
                if item_yielded:
                    return
            except Exception:
                continue

        async for chunk in MockAIProvider().stream_text(system_prompt, user_prompt):
            yield chunk


class AIServiceFactory:
    @staticmethod
    def get_provider() -> AIProvider:
        return FallbackChainProvider()


async def generate_text(system_prompt: str, user_prompt: str) -> str:
    """Generate plain text through the fallback provider chain.

    Convenience wrapper used by services that only need the final text (e.g.
    InsightService and TrendExplanationService) so they never construct an AI
    client directly — they delegate to AIServiceFactory/FallbackChainProvider,
    which stays functional in no-key environments (MockAI fallback).
    """
    provider = AIServiceFactory.get_provider()
    chunks: list[str] = []
    async for chunk in provider.stream_text(system_prompt, user_prompt):
        chunks.append(chunk)
    return "".join(chunks)

