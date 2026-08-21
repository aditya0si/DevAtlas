from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_verification import EmailVerificationToken  # noqa: E402


class EmailVerificationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_token(self, user_id: str, email: str, expires_hours: int = 24) -> EmailVerificationToken:
        """Create a new verification token for a user."""
        token = EmailVerificationToken(
            id=str(uuid4()),
            token=self._generate_token(),
            user_id=user_id,
            email=email,
            expires_at=datetime.now(timezone.utc).replace(microsecond=0) + timedelta(hours=expires_hours),
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    def _generate_token(self) -> str:
        """Generate a secure random token."""
        import secrets
        return secrets.token_urlsafe(32)

    async def get_by_token(self, token: str) -> EmailVerificationToken | None:
        """Get a verification token by its value."""
        result = await self.db.execute(
            select(EmailVerificationToken).where(
                and_(
                    EmailVerificationToken.token == token,
                    EmailVerificationToken.used_at.is_(None),
                )
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(self, token_id: str) -> bool:
        """Mark a token as used."""
        result = await self.db.execute(
            update(EmailVerificationToken)
            .where(EmailVerificationToken.id == token_id)
            .values(used_at=datetime.now(timezone.utc))
        )
        return result.rowcount > 0

    async def invalidate_user_tokens(self, user_id: str) -> int:
        """Invalidate all pending verification tokens for a user."""
        result = await self.db.execute(
            update(EmailVerificationToken)
            .where(
                and_(
                    EmailVerificationToken.user_id == user_id,
                    EmailVerificationToken.used_at.is_(None),
                )
            )
            .values(used_at=datetime.now(timezone.utc))
        )
        return result.rowcount

    async def delete_expired_tokens(self) -> int:
        """Delete all expired tokens."""
        from sqlalchemy import delete
        result = await self.db.execute(
            delete(EmailVerificationToken).where(
                EmailVerificationToken.expires_at < datetime.now(timezone.utc)
            )
        )
        return result.rowcount


from datetime import timedelta  # noqa: E402
