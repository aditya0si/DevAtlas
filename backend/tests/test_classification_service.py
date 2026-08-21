from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.classification_service import ClassificationService, RepositoryClassification


class TestRepositoryClassification:
    """Tests for RepositoryClassification schema."""

    def test_valid_classification(self):
        """Test creating a valid classification."""
        classification = RepositoryClassification(
            primary_language="Python",
            secondary_languages=["JavaScript", "TypeScript"],
            domain="web",
            tech_stack=["FastAPI", "React", "PostgreSQL"],
            maturity="growing",
            community_health="active",
        )
        
        assert classification.primary_language == "Python"
        assert classification.domain == "web"
        assert classification.maturity == "growing"

    def test_classification_defaults(self):
        """Test classification with minimal data."""
        classification = RepositoryClassification(
            primary_language="Go",
            secondary_languages=[],
            domain="devops",
            tech_stack=["Docker", "Kubernetes"],
            maturity="mature",
            community_health="moderate",
        )
        
        assert classification.primary_language == "Go"
        assert len(classification.secondary_languages) == 0


class TestClassificationService:
    """Tests for ClassificationService."""

    @pytest.mark.asyncio
    async def test_build_prompt(self):
        """Test prompt building for classification."""
        prompt = ClassificationService._build_prompt(
            name="my-repo",
            description="A web framework",
            readme="This is a README",
            languages={"Python": 1000, "JavaScript": 200},
        )
        
        assert "my-repo" in prompt
        assert "web framework" in prompt
        assert "Python" in prompt
        assert "JavaScript" in prompt

    @pytest.mark.asyncio
    async def test_build_prompt_no_readme(self):
        """Test prompt building without README."""
        prompt = ClassificationService._build_prompt(
            name="minimal-repo",
            description=None,
            readme=None,
            languages=None,
        )
        
        assert "minimal-repo" in prompt
        assert "N/A" in prompt
        assert "unknown" in prompt

    @pytest.mark.asyncio
    @patch("app.services.classification_service.AIServiceFactory")
    async def test_classify_repository_mock(self, mock_factory):
        """Test repository classification routed through the provider chain."""
        # Setup mock provider
        mock_provider = MagicMock()
        mock_provider.classify_repository = AsyncMock(return_value={
            "domain": "Data",
            "industry": "General",
            "primary_technology": "Python",
            "framework": "pandas",
            "difficulty": "Intermediate",
            "health": "Active",
        })
        mock_factory.get_provider.return_value = mock_provider

        # Create service with mocked db
        mock_db = AsyncMock()
        service = ClassificationService.__new__(ClassificationService)
        service.db = mock_db
        service.repository = MagicMock()
        service.provider = mock_provider

        # Call classify
        result = await service.classify_repository(
            repository_id="test-id",
            repo_name="test-repo",
            description="A data processing library",
            readme="README content",
            languages={"Python": 5000},
        )

        assert result.primary_language == "Python"
        assert result.domain == "data"
        assert result.maturity == "growing"
        assert result.community_health == "active"
        mock_provider.classify_repository.assert_awaited_once()

    def test_init_does_not_construct_raw_openai_client(self, db_session):
        """ClassificationService must not build a raw AsyncOpenAI client.

        Regression: ``AsyncOpenAI(api_key=settings.openai_api_key)`` raised at
        construction time when no key was configured. Classification now routes
        through the AIServiceFactory fallback chain instead.
        """
        service = ClassificationService(db_session)
        assert not hasattr(service, "client")
        assert service.provider is not None

    def test_from_provider_result_maps_fields(self):
        """Provider-chain dicts map onto the seed/classification schema."""
        classification = RepositoryClassification.from_provider_result({
            "domain": "AI/ML",
            "industry": "DevTools",
            "primary_technology": "Python",
            "framework": "PyTorch",
            "difficulty": "Advanced",
            "health": "Active",
        })

        assert classification.primary_language == "Python"
        assert classification.secondary_languages == []
        assert classification.domain == "ai/ml"
        assert classification.tech_stack == ["Python", "PyTorch"]
        assert classification.maturity == "mature"
        assert classification.community_health == "active"

    def test_from_provider_result_handles_missing_fields(self):
        """Missing provider fields fall back to safe defaults."""
        classification = RepositoryClassification.from_provider_result({})

        assert classification.primary_language == "Unknown"
        assert classification.domain == "general"
        assert classification.maturity == "growing"
        assert classification.community_health == "active"
