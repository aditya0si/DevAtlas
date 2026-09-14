from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, EmailStr

from app.core.security import MAX_PASSWORD_BYTES


def _validate_password_bytes(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes when UTF-8 encoded")
    return password


# Reject passwords bcrypt cannot consume at the schema boundary so clients get a
# clean 422 instead of a 500 from the hashing layer.
Password = Annotated[str, AfterValidator(_validate_password_bytes)]


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenPayload(BaseModel):
    sub: str
    exp: datetime


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    password: Password


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[Password] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: str
    email_verified: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VerificationResponse(BaseModel):
    success: bool
    message: str
