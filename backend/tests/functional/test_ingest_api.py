"""Functional tests for the Sprint 1 ingest endpoint."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from services.vision import ReceiptExtraction, ReceiptLineItem

pytest.importorskip("sqlmodel")
import main


def test_ingest_endpoint_returns_verified_invoice(monkeypatch) -> None:
    """Verify /api/ingest returns translated lines, totals, and matches."""

    def fake_translate(_notes: str) -> list[str]:
        return ["Installed Horizontal Hot Water Cylinder."]

    def fake_extract(_image_base64: str) -> ReceiptExtraction:
        return ReceiptExtraction(
            supplier="J.A. Russell",
            date="2026-03-07",
            line_items=[
                ReceiptLineItem(
                    description="Cable TPS 2.5mm",
                    quantity=Decimal("2"),
                    unit_price=Decimal("11.50"),
                )
            ],
        )

    def fake_vector_match(_descriptions: list[str], limit: int = 1) -> list[main.MatchedMaterialOut]:
        return [
            main.MatchedMaterialOut(
                query="Installed Horizontal Hot Water Cylinder.",
                sku="CYL-001",
                name="Horizontal Hot Water Cylinder",
                trade_price=Decimal("450.00"),
            )
        ]

    monkeypatch.setattr(main.translator_service, "translate_notes", fake_translate)
    monkeypatch.setattr(main.vision_service, "extract_receipt", fake_extract)
    monkeypatch.setattr(main, "vector_match_materials", fake_vector_match)

    client = TestClient(main.app)
    response = client.post(
        "/api/ingest",
        json={
            "voice_notes": "Hori in the cupboard",
            "receipt_image_base64": "ZmFrZS1pbWFnZQ==",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["supplier"] == "J.A. Russell"
    assert payload["invoice_lines"][0]["description"] == "Installed Horizontal Hot Water Cylinder."
    assert payload["subtotal"] == "473.00"
    assert payload["gst"] == "70.95"
    assert payload["total"] == "543.95"
