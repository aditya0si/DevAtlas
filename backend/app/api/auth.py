from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.repositories.email_verification_repository import EmailVerificationRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import Token, UserCreate, UserResponse, VerificationResponse
from app.services.email_service import get_email_service

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")
settings = get_settings()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserResponse:
    repository = UserRepository(db)
    existing = await repository.get_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=payload.email, hashed_password=hash_password(payload.password), full_name=payload.full_name)
    created = await repository.create(user)

    # Create verification token and send email
    verification_repo = EmailVerificationRepository(db)
    token = await verification_repo.create_token(user_id=created.id, email=created.email)
    await db.commit()

    # Send verification email (non-blocking, failures don't break registration)
    try:
        email_service = get_email_service()
        await email_service.send_verification_email(created.email, token.token)
    except Exception:
        pass  # Don't fail registration if email fails

    return UserResponse.model_validate(created)


@router.post("/token", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
) -> Token:
    repository = UserRepository(db)
    user = await repository.get_by_email(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Create tokens with new family
    access_token = create_access_token(
        subject=user.id, expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    refresh_token, token_hash, family_id = create_refresh_token(subject=user.id)

    # Store refresh token
    token_repo = RefreshTokenRepository(db)
    await token_repo.create(
        token_hash=token_hash,
        user_id=user.id,
        family_id=family_id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.refresh_token_expire_minutes),
    )
    await db.commit()

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_token: str,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """
    Refresh access token using a refresh token.
    Implements rotation: issues new access + refresh token, revokes old refresh token.
    Detects reuse and revokes entire token family if detected.
    """
    # Decode and validate the refresh token
    token_data = decode_refresh_token(refresh_token)
    if token_data is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Hash to look up in database
    import hashlib
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

    token_repo = RefreshTokenRepository(db)
    stored_token = await token_repo.get_valid_token(token_hash)

    if stored_token is None:
        # Token reuse detected - potential theft
        if token_data.family:
            await token_repo.revoke_family(token_data.family)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token reuse detected")

    # Get user
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(token_data.sub)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Create new token pair first so the rotated token can point at its
    # replacement. ``replaced_by`` is a UUID column, so it must receive the new
    # token's id rather than a literal such as "rotated".
    access_token = create_access_token(
        subject=user.id, expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    new_refresh_token, new_hash, _ = create_refresh_token(subject=user.id, family_id=token_data.family)

    new_token = await token_repo.create(
        token_hash=new_hash,
        user_id=user.id,
        family_id=token_data.family,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.refresh_token_expire_minutes),
    )

    # Rotate: revoke the old token and link it to the replacement
    await token_repo.revoke_token(stored_token.id)
    await token_repo.mark_replaced(stored_token.id, new_token.id)

    await db.commit()

    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/verify-email", response_model=VerificationResponse)
async def verify_email(
    db: AsyncSession = Depends(get_db),
    token: str = Query(..., description="Verification token"),
) -> VerificationResponse:
    """
    Verify email address using the token sent to the user's email.
    """
    verification_repo = EmailVerificationRepository(db)
    verification_token = await verification_repo.get_by_token(token)

    if verification_token is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")

    if verification_token.is_expired:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token has expired")

    # Get user and mark email as verified
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(verification_token.user_id)

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")

    # Update user and mark token as used
    user.email_verified = True
    await verification_repo.mark_used(verification_token.id)
    await db.commit()

    return VerificationResponse(success=True, message="Email verified successfully")


@router.post("/resend-verification", response_model=VerificationResponse)
async def resend_verification(
    email: str,
    db: AsyncSession = Depends(get_db),
) -> VerificationResponse:
    """
    Resend verification email for unverified accounts.
    Rate limited to prevent abuse.
    """
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(email)

    if user is None:
        # Don't reveal whether email exists
        return VerificationResponse(success=True, message="If the email exists, a verification link has been sent")

    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")

    # Invalidate existing tokens and create new one
    verification_repo = EmailVerificationRepository(db)
    await verification_repo.invalidate_user_tokens(user.id)
    token = await verification_repo.create_token(user_id=user.id, email=user.email)
    await db.commit()

    # Send verification email
    try:
        email_service = get_email_service()
        await email_service.send_verification_email(user.email, token.token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email",
        )

    return VerificationResponse(success=True, message="Verification email sent")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    """Get current authenticated user."""
    return UserResponse.model_validate(current_user)
