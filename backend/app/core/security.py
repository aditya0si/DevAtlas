from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import get_settings  # noqa: E402  # noqa: E402  # noqa: E402

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[datetime] = None
    type: Optional[str] = None
    family: Optional[str] = None


class RefreshTokenData(BaseModel):
    sub: str
    exp: datetime
    family: str
    token_id: str


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, family_id: Optional[str] = None) -> tuple[str, str, str]:
    """
    Create a new refresh token with rotation support.
    Returns: (token_string, token_hash, family_id)
    """
    if family_id is None:
        family_id = secrets.token_urlsafe(32)
    
    token_id = secrets.token_urlsafe(32)
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.refresh_token_expire_minutes)
    payload = {
        "sub": subject,
        "exp": expire,
        "type": "refresh",
        "family": family_id,
        "jti": token_id,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash, family_id


def decode_refresh_token(token: str) -> Optional[RefreshTokenData]:
    """Decode and validate a refresh token, returning its payload data."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "refresh":
            return None
        return RefreshTokenData(
            sub=payload.get("sub"),
            exp=datetime.fromtimestamp(payload.get("exp"), tz=timezone.utc),
            family=payload.get("family"),
            token_id=payload.get("jti"),
        )
    except JWTError:
        return None


def decode_access_token(token: str) -> Optional[TokenPayload]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return TokenPayload(**payload)
    except JWTError:
        return None
