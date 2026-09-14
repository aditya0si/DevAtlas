"""Tests for email verification functionality."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.email_verification import EmailVerificationToken
from app.repositories.email_verification_repository import EmailVerificationRepository
from app.services.email_service import ConsoleEmailService, SMTPEmailService, get_email_service


class TestEmailVerificationToken:
    """Test EmailVerificationToken model."""

    def test_token_is_expired_when_past_expiry(self):
        """Token should be expired after expiry time."""
        # Create token with expired time
        expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        token = EmailVerificationToken(
            id="test-id",
            token="test-token",
            user_id="user-123",
            email="test@example.com",
            expires_at=expires_at,
            created_at=datetime.now(timezone.utc),
        )
        assert token.is_expired is True

    def test_token_is_not_expired_before_expiry(self):
        """Token should not be expired before expiry time."""
        token = EmailVerificationToken(
            id="test-id",
            token="test-token",
            user_id="user-123",
            email="test@example.com",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            created_at=datetime.now(timezone.utc),
        )
        assert token.is_expired is False

    def test_token_is_valid_when_not_expired_and_not_used(self):
        """Token should be valid when not expired and not used."""
        token = EmailVerificationToken(
            id="test-id",
            token="test-token",
            user_id="user-123",
            email="test@example.com",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            created_at=datetime.now(timezone.utc),
        )
        assert token.is_valid is True

    def test_token_is_invalid_when_used(self):
        """Token should be invalid when already used."""
        token = EmailVerificationToken(
            id="test-id",
            token="test-token",
            user_id="user-123",
            email="test@example.com",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            created_at=datetime.now(timezone.utc),
            used_at=datetime.now(timezone.utc),
        )
        assert token.is_valid is False


class TestEmailVerificationRepository:
    """Test EmailVerificationRepository operations."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock AsyncSession."""
        return AsyncMock()

    @pytest.mark.asyncio
    async def test_create_token(self, mock_db):
        """Should create a new verification token."""
        repo = EmailVerificationRepository(mock_db)

        token = await repo.create_token(
            user_id="user-123",
            email="test@example.com",
            expires_hours=24,
        )

        assert token.user_id == "user-123"
        assert token.email == "test@example.com"
        assert token.token is not None
        assert len(token.token) > 0
        mock_db.add.assert_called_once()
        mock_db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_token_is_unique(self, mock_db):
        """Each generated token should be unique."""
        repo = EmailVerificationRepository(mock_db)

        token1 = repo._generate_token()
        token2 = repo._generate_token()

        assert token1 != token2
        assert len(token1) > 20


class TestConsoleEmailService:
    """Test ConsoleEmailService."""

    @pytest.mark.asyncio
    async def test_send_email_returns_true(self):
        """Console email service should always succeed."""
        service = ConsoleEmailService()

        result = await service.send_email(
            to="test@example.com",
            subject="Test",
            html_body="<p>Test</p>",
            text_body="Test",
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_verification_email_returns_true(self):
        """Should send verification email successfully."""
        service = ConsoleEmailService()

        result = await service.send_verification_email(
            email="test@example.com",
            token="test-token-123",
        )

        assert result is True


class TestSMTPEmailService:
    """Test SMTPEmailService."""

    def test_initializes_with_defaults(self):
        """Should initialize with default values."""
        service = SMTPEmailService()

        assert service.host == "localhost"
        assert service.port == 587
        assert service.use_tls is True

    def test_initializes_with_custom_values(self):
        """Should initialize with custom values."""
        service = SMTPEmailService(
            host="smtp.example.com",
            port=465,
            username="user",
            password="pass",
            use_tls=False,
            from_address="custom@example.com",
        )

        assert service.host == "smtp.example.com"
        assert service.port == 465
        assert service.username == "user"
        assert service.password == "pass"
        assert service.use_tls is False
        assert service.from_address == "custom@example.com"


class TestGetEmailService:
    """Test email service factory."""

    def test_returns_console_service_by_default(self):
        """Should return ConsoleEmailService by default."""
        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.email_service = "console"
            service = get_email_service()
            assert isinstance(service, ConsoleEmailService)

    def test_returns_smtp_service_when_configured(self):
        """Should return SMTPEmailService when configured."""
        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.email_service = "smtp"
            mock_settings.smtp_host = "smtp.example.com"
            mock_settings.smtp_port = 587
            mock_settings.smtp_username = None
            mock_settings.smtp_password = None
            mock_settings.smtp_use_tls = True
            mock_settings.smtp_from_address = "test@example.com"
            service = get_email_service()
            assert isinstance(service, SMTPEmailService)


class TestEmailVerificationFlow:
    """Test email verification flow logic."""

    def test_verification_token_contains_user_id(self):
        """Token should be associated with user ID."""
        token = EmailVerificationToken(
            id="test-id",
            token="secure-token",
            user_id="user-456",
            email="user@example.com",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            created_at=datetime.now(timezone.utc),
        )
        assert token.user_id == "user-456"

    def test_multiple_tokens_can_exist_for_same_user(self):
        """Multiple verification tokens can exist for resend scenario."""
        tokens = []
        for i in range(3):
            token = EmailVerificationToken(
                id=f"token-{i}",
                token=f"token-{i}",
                user_id="user-123",
                email="test@example.com",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
                created_at=datetime.now(timezone.utc),
            )
            tokens.append(token)

        # All tokens should be valid initially
        assert all(t.is_valid for t in tokens)

        # Mark first as used
        tokens[0].used_at = datetime.now(timezone.utc)
        assert tokens[0].is_valid is False
        assert tokens[1].is_valid is True
        assert tokens[2].is_valid is True
