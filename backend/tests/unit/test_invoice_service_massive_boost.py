"""Focused invoice service tests aligned to current interfaces."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from unittest.mock import Mock, patch

from services.invoice import (
    DEFAULT_MARKUP,
    InvoiceDraft,
    JobDraftInvoiceSummary,
    _apply_markup,
    _parse_decimal,
    _to_money,
    calculate_invoice,
    calculate_job_draft_invoice_summary,
    get_default_markup,
)
from services.vision import ReceiptExtraction, ReceiptLineItem


@dataclass(frozen=True)
class FakeMaterialMatch:
    query: str
    trade_price: Decimal


def test_get_default_markup_returns_existing_value() -> None:
    fake_settings = Mock(default_markup=Decimal("0.35"))
    with patch("services.invoice.Session") as mock_session:
        session = mock_session.return_value.__enter__.return_value
        session.get.return_value = fake_settings
        assert get_default_markup(Mock()) == Decimal("0.35")


def test_get_default_markup_creates_default_when_missing() -> None:
    created_settings = Mock(default_markup=DEFAULT_MARKUP)
    with patch("services.invoice.Session") as mock_session:
        session = mock_session.return_value.__enter__.return_value
        session.get.return_value = None
        session.refresh.side_effect = lambda obj: setattr(obj, "default_markup", DEFAULT_MARKUP)
        assert get_default_markup(Mock()) == DEFAULT_MARKUP
        session.add.assert_called_once()
        session.commit.assert_called_once()


def test_get_default_markup_clamps_negative_markup() -> None:
    fake_settings = Mock(default_markup=Decimal("-0.10"))
    with patch("services.invoice.Session") as mock_session:
        session = mock_session.return_value.__enter__.return_value
        session.get.return_value = fake_settings
        assert get_default_markup(Mock()) == DEFAULT_MARKUP


def test_parse_decimal_and_money_helpers() -> None:
    assert _parse_decimal("$1,234.50") == Decimal("1234.50")
    assert _parse_decimal(None, Decimal("1.00")) == Decimal("1.00")
    assert _to_money(Decimal("10.005")) == Decimal("10.01")
    assert _apply_markup(Decimal("100.00"), Decimal("0.20")) == Decimal("120.00")


def test_calculate_job_draft_invoice_summary_handles_mixed_and_invalid_lines() -> None:
    summary = calculate_job_draft_invoice_summary(
        extracted_data={
            "line_items": [
                {"type": "MATERIAL", "qty": "2", "unit_price": "10.00", "line_total": "0"},
                {"type": "LABOR", "qty": "0", "unit_price": "0", "line_total": "0"},
                "bad-row",
            ]
        },
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("95.00"),
    )
    assert isinstance(summary, JobDraftInvoiceSummary)
    assert summary.material_cost_base == Decimal("20.00")
    assert summary.markup_amount == Decimal("4.00")
    assert summary.labor_total == Decimal("95.00")
    assert summary.total == Decimal("136.85")


def test_calculate_job_draft_invoice_summary_handles_non_dict_payload() -> None:
    summary = calculate_job_draft_invoice_summary(
        extracted_data="not-a-dict",
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("95.00"),
    )
    assert summary.subtotal == Decimal("0.00")
    assert summary.total == Decimal("0.00")


def test_calculate_invoice_covers_material_and_labor_branches() -> None:
    receipt = ReceiptExtraction(
        supplier="Corys",
        date="2026-03-10",
        line_items=[ReceiptLineItem(description="Cable", quantity=Decimal("2"), unit_price=Decimal("5.00"))],
    )
    draft = calculate_invoice(
        translated_lines=["Known material", "Unknown labor line"],
        receipt=receipt,
        vector_matches=[FakeMaterialMatch(query="Known material", trade_price=Decimal("100.00"))],
        default_labor_rate=Decimal("95.00"),
        markup_percentage=Decimal("0.20"),
    )

    assert isinstance(draft, InvoiceDraft)
    assert [line.type for line in draft.invoice_lines[:2]] == ["Material", "Labor"]
    assert draft.invoice_lines[0].unit_price == Decimal("120.00")
    assert draft.invoice_lines[1].unit_price == Decimal("95.00")
    assert draft.invoice_lines[2].unit_price == Decimal("6.00")