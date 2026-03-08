"""Transactional mail delivery helpers for compliance certificate sends."""

from __future__ import annotations

import base64
import os
from datetime import datetime

import httpx


class MailDeliveryError(RuntimeError):
    """Raised when certificate email delivery fails."""


def send_certificate_email(
    *,
    to_email: str,
    client_name: str,
    address: str,
    issued_at: datetime,
    pdf_bytes: bytes,
    filename: str,
) -> str:
    """Send compliance certificate email using Resend API.

    Returns provider message id on success.
    """

    api_key = os.getenv("RESEND_API_KEY", "").strip()
    from_email = os.getenv("RESEND_FROM_EMAIL", "").strip() or "compliance@sparkops.nz"
    if not api_key:
        raise MailDeliveryError("RESEND_API_KEY is missing.")

    issued_label = issued_at.strftime("%Y-%m-%d")
    subject = f"Electrical Safety Certificate for {address} - {issued_label}"
    body_html = (
        f"<p>Hi {client_name},</p>"
        "<p>Here is your safety certificate for the work completed today.</p>"
        "<p>Regards,<br/>SparkOps Compliance</p>"
    )

    attachment_content = base64.b64encode(pdf_bytes).decode("utf-8")
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": body_html,
        "attachments": [
            {
                "filename": filename,
                "content": attachment_content,
            }
        ],
    }

    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        raise MailDeliveryError(f"Certificate email send failed ({response.status_code}): {response.text}")

    data = response.json() if response.content else {}
    return str(data.get("id") or "")
