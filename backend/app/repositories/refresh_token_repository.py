from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken  # noqa: E402


class RefreshTokenRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        token_hash: str,
        user_id: str,
        family_id: str,
        expires_at: datetime,
    ) -> RefreshToken:
        """Create a new refresh token record."""
        token = RefreshToken(
            id=str(uuid4()),
            token_hash=token_hash,
            user_id=user_id,
            family_id=family_id,
            expires_at=expires_at,
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        """Get a refresh token by its hash."""
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def get_valid_token(self, token_hash: str) -> RefreshToken | None:
        """Get a valid (non-revoked, non-expired) refresh token."""
        result = await self.db.execute(
            select(RefreshToken).where(
                and_(
                    RefreshToken.token_hash == token_hash,
                    RefreshToken.revoked_at.is_(None),
                    RefreshToken.expires_at > datetime.now(timezone.utc),
                )
            )
        )
        return result.scalar_one_or_none()

    async def revoke_token(self, token_id: str, revoked_at: datetime | None = None) -> bool:
        """Revoke a refresh token by ID."""
        if revoked_at is None:
            revoked_at = datetime.now(timezone.utc)
        result = await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id)
            .values(revoked_at=revoked_at)
        )
        return result.rowcount > 0

    async def revoke_family(self, family_id: str) -> int:
        """Revoke all tokens in a family (token reuse detected)."""
        result = await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id)
            .values(revoked_at=datetime.now(timezone.utc))
        )
        return result.rowcount

    async def mark_replaced(self, token_id: str, replaced_by: str) -> bool:
        """Mark a token as replaced by a new one."""
        result = await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id)
            .values(replaced_by=replaced_by)
        )
        return result.rowcount > 0

    async def revoke_all_user_tokens(self, user_id: str) -> int:
        """Revoke all refresh tokens for a user (e.g., password change)."""
        result = await self.db.execute(
            update(RefreshToken)
            .where(
                and_(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked_at.is_(None),
                )
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )
        return result.rowcount
