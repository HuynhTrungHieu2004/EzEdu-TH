"""Minimal SMTP delivery for account-security messages."""

import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import settings


def is_email_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)


async def send_account_email(*, recipient: str, subject: str, body: str) -> None:
    if not is_email_configured():
        raise RuntimeError("SMTP is not configured")

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    def send() -> None:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)

    await asyncio.to_thread(send)
