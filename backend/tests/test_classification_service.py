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
    @patch("app.services.classification_service.AsyncOpenAI")
    async def test_classify_repository_mock(self, mock_openai):
        """Test repository classification with mocked OpenAI."""
        # Setup mock
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_parsed = RepositoryClassification(
            primary_language="Python",
            secondary_languages=["Go"],
            domain="data",
            tech_stack=["pandas", "numpy"],
            maturity="growing",
            community_health="active",
        )
        mock_response.choices = [MagicMock(message=MagicMock(parsed=mock_parsed))]
        mock_client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)
        mock_openai.return_value = mock_client
        
        # Create service with mocked db
        mock_db = AsyncMock()
        service = ClassificationService.__new__(ClassificationService)
        service.db = mock_db
        service.repository = MagicMock()
        service.client = mock_client
        
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