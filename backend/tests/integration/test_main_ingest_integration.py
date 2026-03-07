"""Integration tests for Sprint 1 ingest pipeline.

These tests exercise the `/api/ingest` flow end-to-end inside FastAPI while
mocking external OpenAI-dependent calls.
"""

from __future__ import annotations

import base64
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("sqlmodel")

import main
from services.vision import ReceiptExtraction, ReceiptLineItem


def test_ingest_audio_to_invoice_with_mocked_openai_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify full ingest data flow from audio input to verified invoice output."""

    monkeypatch.setattr(main, "transcribe_audio", lambda _audio_base64: "Hori in the cupboard")
    monkeypatch.setattr(
        main.vision_service,
        "extract_receipt",
        lambda _image: ReceiptExtraction(
            supplier="Corys",
            date="2026-03-07",
            line_items=[
                ReceiptLineItem(
                    description="Cable TPS 2.5mm",
                    quantity=Decimal("2"),
                    unit_price=Decimal("12.00"),
                )
            ],
        ),
    )
    monkeypatch.setattr(
        main,
        "vector_match_materials",
        lambda _descriptions, limit=1: [
            main.MatchedMaterialOut(
                query="Installed Horizontal Hot Water Cylinder.",
                sku="CYL-001",
                name="Horizontal Hot Water Cylinder",
                trade_price=Decimal("450.00"),
            )
        ],
    )

    client = TestClient(main.app)
    audio_base64 = base64.b64encode(b"fake-wav-bytes").decode("utf-8")

    response = client.post(
        "/api/ingest",
        json={
            "audio_base64": audio_base64,
            "receipt_image_base64": "ZmFrZS1yZWNlaXB0LWJ5dGVz",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["transcript"] == "Hori in the cupboard"
    assert payload["supplier"] == "Corys"
    assert payload["receipt_date"] == "2026-03-07"
    assert len(payload["invoice_lines"]) == 2
    assert payload["invoice_lines"][0]["description"] == "Installed Horizontal Hot Water Cylinder."
    assert payload["subtotal"] == "474.00"
    assert payload["gst"] == "71.10"
    assert payload["total"] == "545.10"


def test_ingest_accepts_receipt_only_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure ingest can process receipt-only payloads without audio/text."""

    monkeypatch.setattr(
        main.vision_service,
        "extract_receipt",
        lambda _image: ReceiptExtraction(
            supplier="Corys",
            date="2026-03-07",
            line_items=[
                ReceiptLineItem(
                    description="Cable TPS 2.5mm",
                    quantity=Decimal("2"),
                    unit_price=Decimal("12.00"),
                )
            ],
        ),
    )
    monkeypatch.setattr(main, "vector_match_materials", lambda _descriptions, limit=1: [])

    client = TestClient(main.app)
    response = client.post("/api/ingest", json={"receipt_image_base64": "abc"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] == ""
    assert payload["supplier"] == "Corys"
    assert len(payload["invoice_lines"]) == 1


def test_ingest_rejects_payload_without_any_content() -> None:
    """Ensure ingest rejects fully empty payloads."""

    client = TestClient(main.app)
    response = client.post("/api/ingest", json={})

    assert response.status_code == 400
    assert "Provide voice_notes, audio_base64, or receipt_image_base64" in response.json()["error"]
