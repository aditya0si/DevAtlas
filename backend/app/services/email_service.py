from __future__ import annotations

import secrets
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import get_settings

settings = get_settings()


class EmailService(ABC):
    """Abstract email service."""

    @abstractmethod
    async def send_email(
        self,
        to: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
    ) -> bool:
        """Send an email. Returns True if successful."""
        ...

    @abstractmethod
    async def send_verification_email(self, email: str, token: str) -> bool:
        """Send email verification email."""
        ...


class ConsoleEmailService(EmailService):
    """Email service that prints to console (for development)."""

    async def send_email(
        self,
        to: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
    ) -> bool:
        print(f"\n{'='*60}")
        print(f"EMAIL TO: {to}")
        print(f"SUBJECT: {subject}")
        print(f"{'='*60}")
        print(f"TEXT:\n{text_body or 'N/A'}")
        print(f"{'='*60}")
        print(f"HTML:\n{html_body[:500]}..." if len(html_body) > 500 else f"HTML:\n{html_body}")
        print(f"{'='*60}\n")
        return True

    async def send_verification_email(self, email: str, token: str) -> bool:
        verify_url = f"{settings.cors_origins.split(',')[0]}/auth/verify-email?token={token}"
        subject = "Verify your DevAtlas account"
        text_body = f"""
Welcome to DevAtlas!

Please verify your email address by clicking the link below:
{verify_url}

This link expires in 24 hours.

If you didn't create an account, please ignore this email.
"""
        html_body = f"""
<!DOCTYPE html>
<html>
<head><title>{subject}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #333;">Welcome to DevAtlas!</h1>
    <p>Please verify your email address by clicking the button below:</p>
    <p style="margin: 30px 0;">
        <a href="{verify_url}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email Address
        </a>
    </p>
    <p>Or copy this link into your browser:</p>
    <p style="word-break: break-all; color: #666;">{verify_url}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #999; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, please ignore this email.</p>
</body>
</html>
"""
        return await self.send_email(email, subject, html_body, text_body)


class SMTPEmailService(EmailService):
    """SMTP-based email service."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 587,
        username: str | None = None,
        password: str | None = None,
        use_tls: bool = True,
        from_address: str = "noreply@devatlas.local",
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_tls = use_tls
        self.from_address = from_address

    async def send_email(
        self,
        to: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
    ) -> bool:
        import aiosmtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self.from_address
        msg["To"] = to

        part1 = MIMEText(text_body or "", "plain")
        part2 = MIMEText(html_body, "html")
        msg.attach(part1)
        msg.attach(part2)

        try:
            await aiosmtplib.send(
                msg,
                hostname=self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                start_tls=self.use_tls,
            )
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False

    async def send_verification_email(self, email: str, token: str) -> bool:
        verify_url = f"{settings.cors_origins.split(',')[0]}/auth/verify-email?token={token}"
        subject = "Verify your DevAtlas account"
        text_body = f"""
Welcome to DevAtlas!

Please verify your email address by clicking the link below:
{verify_url}

This link expires in 24 hours.

If you didn't create an account, please ignore this email.
"""
        html_body = f"""
<!DOCTYPE html>
<html>
<head><title>{subject}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #333;">Welcome to DevAtlas!</h1>
    <p>Please verify your email address by clicking the button below:</p>
    <p style="margin: 30px 0;">
        <a href="{verify_url}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email Address
        </a>
    </p>
    <p>Or copy this link into your browser:</p>
    <p style="word-break: break-all; color: #666;">{verify_url}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #999; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, please ignore this email.</p>
</body>
</html>
"""
        return await self.send_email(email, subject, html_body, text_body)


def get_email_service() -> EmailService:
    """Get configured email service based on settings."""
    if settings.email_service == "smtp":
        return SMTPEmailService(
            host=settings.smtp_host or "localhost",
            port=settings.smtp_port or 587,
            username=settings.smtp_username,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
            from_address=settings.smtp_from_address or "noreply@devatlas.local",
        )
    return ConsoleEmailService()
