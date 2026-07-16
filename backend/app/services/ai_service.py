from abc import ABC, abstractmethod
import json
from typing import Any
from pydantic import BaseModel, Field

from app.core.config import get_settings

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

class GeminiProvider(AIProvider):
    def __init__(self):
        try:
            from google import genai
            from google.genai import types
            self.client = genai.Client(api_key=settings.gemini_api_key)
            self.types = types
        except ImportError:
            self.client = None

    async def classify_repository(self, prompt: str) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("google-genai not installed or configured")
            
        # Using Gemini to parse structured output
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

class OpenAIProvider(AIProvider):
    def __init__(self):
        try:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(api_key=settings.openai_api_key)
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

class AIServiceFactory:
    @staticmethod
    def get_provider() -> AIProvider:
        if settings.gemini_api_key:
            return GeminiProvider()
        elif settings.openai_api_key:
            return OpenAIProvider()
        else:
            raise ValueError("No AI provider API keys configured")
