"""Stripe billing helpers for base subscription + per-seat licensing."""

from __future__ import annotations

import hmac
import json
import os
from hashlib import sha256
from typing import Any

import httpx


class BillingError(RuntimeError):
    """Raised for Stripe billing integration failures."""


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise BillingError(f"{name} is not configured.")
    return value


def _stripe_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_required_env('STRIPE_SECRET_KEY')}",
        "Content-Type": "application/x-www-form-urlencoded",
    }


def create_checkout_session(*, customer_id: str | None, success_url: str, cancel_url: str, price_id: str, quantity: int = 1, metadata: dict[str, str] | None = None) -> dict[str, Any]:
    payload: dict[str, str] = {
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": str(max(1, quantity)),
        "allow_promotion_codes": "true",
    }

    if customer_id:
        payload["customer"] = customer_id
    if metadata:
        for key, value in metadata.items():
            payload[f"metadata[{key}]"] = value

    with httpx.Client(timeout=20.0) as client:
        response = client.post("https://api.stripe.com/v1/checkout/sessions", data=payload, headers=_stripe_headers())

    if response.status_code >= 400:
        raise BillingError(f"Stripe checkout session failed ({response.status_code}): {response.text}")

    return response.json()


def create_customer_portal_session(*, customer_id: str, return_url: str) -> dict[str, Any]:
    payload = {"customer": customer_id, "return_url": return_url}
    with httpx.Client(timeout=20.0) as client:
        response = client.post("https://api.stripe.com/v1/billing_portal/sessions", data=payload, headers=_stripe_headers())

    if response.status_code >= 400:
        raise BillingError(f"Stripe customer portal failed ({response.status_code}): {response.text}")

    return response.json()


def retrieve_subscription(subscription_id: str) -> dict[str, Any]:
    with httpx.Client(timeout=20.0) as client:
        response = client.get(f"https://api.stripe.com/v1/subscriptions/{subscription_id}", headers={"Authorization": f"Bearer {_required_env('STRIPE_SECRET_KEY')}"})

    if response.status_code >= 400:
        raise BillingError(f"Stripe subscription retrieval failed ({response.status_code}): {response.text}")

    return response.json()


def verify_webhook_signature(*, payload: bytes, signature_header: str | None) -> dict[str, Any]:
    webhook_secret = _required_env("STRIPE_WEBHOOK_SECRET")
    if not signature_header:
        raise BillingError("Missing Stripe signature header.")

    fields = {}
    for part in signature_header.split(","):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        fields[key.strip()] = value.strip()

    timestamp = fields.get("t")
    signature = fields.get("v1")
    if not timestamp or not signature:
        raise BillingError("Invalid Stripe signature header format.")

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(webhook_secret.encode("utf-8"), signed_payload, sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise BillingError("Stripe webhook signature verification failed.")

    try:
        return json.loads(payload.decode("utf-8"))
    except Exception as exc:
        raise BillingError("Invalid Stripe webhook payload.") from exc
