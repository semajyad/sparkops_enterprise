"""ETA tracking routes for client-facing sparky arrival links."""

from __future__ import annotations

import os
import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from twilio.rest import Client
except ImportError:  # pragma: no cover
    Client = None  # type: ignore[assignment]

router = APIRouter(prefix="/api/eta", tags=["eta"])


@dataclass
class TrackingRecord:
    """In-memory tracking record."""

    client_phone: str
    latitude: float
    longitude: float
    eta_minutes: int
    expires_at: int


_tracking_store: dict[str, TrackingRecord] = {}


class TrackingLinkRequest(BaseModel):
    """Request body for tracking link generation."""

    client_phone: str = Field(..., min_length=8)


def _mock_gps() -> tuple[float, float]:
    return (-36.8485, 174.7633)


def _send_sms(to_number: str, body: str) -> bool:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_SMS_FROM")

    if not account_sid or not auth_token or not from_number:
        return False
    if Client is None:
        return False

    client = Client(account_sid, auth_token)
    client.messages.create(to=to_number, from_=from_number, body=body)
    return True


@router.post("/generate")
def generate_tracking_link(payload: TrackingLinkRequest) -> dict[str, Any]:
    """Generate secure expiring tracking URL and notify client by SMS."""

    token = secrets.token_urlsafe(16)
    latitude, longitude = _mock_gps()
    expires_at = int(time.time()) + 60 * 45

    _tracking_store[token] = TrackingRecord(
        client_phone=payload.client_phone,
        latitude=latitude,
        longitude=longitude,
        eta_minutes=22,
        expires_at=expires_at,
    )

    base_url = os.getenv("TRACKING_BASE_URL", "http://localhost:3000")
    tracking_url = f"{base_url.rstrip('/')}/tracking/{token}"
    sms_body = f"SparkOps update: your electrician is on the way. Track live ETA: {tracking_url}"
    sms_sent = _send_sms(payload.client_phone, sms_body)

    return {
        "id": token,
        "tracking_url": tracking_url,
        "expires_at": expires_at,
        "sms_sent": sms_sent,
    }


@router.get("/lookup/{tracking_id}")
def lookup_tracking(tracking_id: str) -> dict[str, Any]:
    """Lookup a tracking payload for public client page consumption."""

    record = _tracking_store.get(tracking_id)
    if not record:
        raise HTTPException(status_code=404, detail="Tracking link not found.")

    now = int(time.time())
    if record.expires_at < now:
        raise HTTPException(status_code=410, detail="Tracking link has expired.")

    return {
        "id": tracking_id,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "eta_minutes": record.eta_minutes,
        "status": "Your electrician is on the way.",
        "expires_at": record.expires_at,
    }
