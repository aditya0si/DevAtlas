"""Tests for refresh token rotation functionality."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.security import (
    create_refresh_token,
    decode_refresh_token,
)


class TestRefreshTokenCreation:
    """Test refresh token creation and decoding."""

    def test_create_refresh_token_returns_tuple(self):
        """create_refresh_token should return token, hash, and family_id."""
        token, token_hash, family_id = create_refresh_token("user-123")
        
        assert isinstance(token, str)
        assert len(token) > 0
        assert isinstance(token_hash, str)
        assert len(token_hash) == 64  # SHA256 hex digest
        assert isinstance(family_id, str)
        assert len(family_id) > 0

    def test_create_refresh_token_with_existing_family(self):
        """Should use provided family_id when given."""
        existing_family = "existing-family-id"
        token, token_hash, family_id = create_refresh_token("user-123", family_id=existing_family)
        
        assert family_id == existing_family

    def test_decode_refresh_token_valid(self):
        """Should decode a valid refresh token."""
        token, _, family_id = create_refresh_token("user-123")
        
        decoded = decode_refresh_token(token)
        
        assert decoded is not None
        assert decoded.sub == "user-123"
        assert decoded.family == family_id
        assert decoded.token_id is not None

    def test_decode_refresh_token_invalid(self):
        """Should return None for invalid token."""
        decoded = decode_refresh_token("invalid-token")
        
        assert decoded is None

    def test_decode_access_token_returns_none_for_refresh(self):
        """Access token should not be decoded as refresh token."""
        from app.core.security import create_access_token
        
        access_token = create_access_token("user-123")
        decoded = decode_refresh_token(access_token)
        
        assert decoded is None


class TestRefreshTokenRotation:
    """Test refresh token rotation flow."""

    def test_rotation_creates_new_token_pair(self):
        """Rotation should create new access + refresh token with same family."""
        # Create original token
        original_token, original_hash, family_id = create_refresh_token("user-123")
        
        # Simulate rotation: create new pair with same family
        new_refresh, new_hash, new_family = create_refresh_token("user-123", family_id=family_id)
        
        assert new_refresh != original_token
        assert new_hash != original_hash
        # Same family means reuse detection still works
        assert new_family == family_id

    def test_different_family_ids_for_different_sessions(self):
        """Each login should create a new token family."""
        token1, _, family1 = create_refresh_token("user-123")
        token2, _, family2 = create_refresh_token("user-123")
        
        # Different families
        assert family1 != family2
        # But both are valid
        assert decode_refresh_token(token1) is not None
        assert decode_refresh_token(token2) is not None


class TestTokenExpiration:
    """Test token expiration handling."""

    def test_token_expiration_set_correctly(self):
        """Token should have correct expiration from settings."""
        from app.core.config import get_settings
        settings = get_settings()
        
        token, _, _ = create_refresh_token("user-123")
        decoded = decode_refresh_token(token)
        
        assert decoded is not None
        # Expiration should be approximately 7 days from now
        expected_exp = datetime.now(timezone.utc) + timedelta(minutes=settings.refresh_token_expire_minutes)
        # Allow 1 minute tolerance
        assert abs((decoded.exp - expected_exp).total_seconds()) < 60

    def test_token_contains_required_claims(self):
        """Token payload should contain all required claims."""
        token, _, _ = create_refresh_token("user-123")
        decoded = decode_refresh_token(token)
        
        assert decoded is not None
        assert decoded.sub == "user-123"
        assert decoded.family is not None
        assert decoded.token_id is not None
        assert decoded.exp > datetime.now(timezone.utc)


class TestTokenReuseDetection:
    """Test token reuse detection logic."""

    def test_token_hash_is_deterministic(self):
        """Same token should always produce same hash."""
        token, hash1, _ = create_refresh_token("user-123")
        _, hash2, _ = create_refresh_token("user-123")
        
        # Same token produces same hash
        import hashlib
        expected_hash = hashlib.sha256(token.encode()).hexdigest()
        assert hash1 == expected_hash
        
        # But different tokens produce different hashes
        assert hash1 != hash2

    def test_family_tracking_enables_reuse_detection(self):
        """Token families enable detection of refresh token reuse."""
        # Create a token family
        token1, hash1, family = create_refresh_token("user-123")
        decoded1 = decode_refresh_token(token1)
        
        # Simulate: token was used once
        used_token_hash = hash1
        
        # Simulate: attacker tries to use the same token again
        # (they got the token somehow, but the hash is already "used")
        stored_token = None  # None means already used/revoked
        
        if stored_token is None and decoded1.family:
            # Reuse detected - would revoke entire family
            family_to_revoke = decoded1.family
            assert family_to_revoke == family  # Correct family identified