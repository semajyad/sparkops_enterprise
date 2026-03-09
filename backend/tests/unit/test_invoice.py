"""Unit tests for invoice pricing and markup behavior."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlmodel import create_engine

from models.database import UserSettings, create_db_and_tables
from services.invoice import calculate_invoice, get_default_markup
from services.vision import ReceiptExtraction, ReceiptLineItem


@dataclass(frozen=True)
class FakeMaterialMatch:
    query: str
    trade_price: Decimal


def test_calculate_invoice_applies_markup_to_material_sell_prices() -> None:
    receipt = ReceiptExtraction(
        supplier="Corys",
        date="2026-03-07",
        line_items=[
            ReceiptLineItem(
                description="TPS 2.5mm cable",
                quantity=Decimal("2"),
                unit_price=Decimal("10.00"),
            )
        ],
    )

    invoice = calculate_invoice(
        translated_lines=["Installed Horizontal Hot Water Cylinder."],
        receipt=receipt,
        vector_matches=[FakeMaterialMatch(query="Installed Horizontal Hot Water Cylinder.", trade_price=Decimal("100.00"))],
        default_labor_rate=Decimal("95.00"),
        markup_percentage=Decimal("0.20"),
    )

    first_line = invoice.invoice_lines[0]
    second_line = invoice.invoice_lines[1]

    assert first_line.type == "Material"
    assert first_line.unit_price == Decimal("120.00")
    assert second_line.unit_price == Decimal("12.00")
    assert invoice.totals.subtotal == Decimal("144.00")


def test_get_default_markup_creates_default_user_settings_row() -> None:
    engine = create_engine("sqlite://", echo=False)
    create_db_and_tables(engine)

    markup = get_default_markup(engine)

    assert markup == Decimal("0.20")



def test_get_default_markup_reads_persisted_setting() -> None:
    engine = create_engine("sqlite://", echo=False)
    create_db_and_tables(engine)

    from sqlmodel import Session

    with Session(engine) as session:
        session.add(UserSettings(id=1, default_markup=Decimal("0.35")))
        session.commit()

    markup = get_default_markup(engine)
    assert markup == Decimal("0.35")


def test_get_default_markup_negative_returns_default() -> None:
    """Test that negative markup returns DEFAULT_MARKUP."""
    engine = create_engine("sqlite://", echo=False)
    create_db_and_tables(engine)

    from sqlmodel import Session

    with Session(engine) as session:
        session.add(UserSettings(id=1, default_markup=Decimal("-0.10")))
        session.commit()

    markup = get_default_markup(engine)
    assert markup == Decimal("0.20")  # DEFAULT_MARKUP


def test_parse_decimal_various_inputs() -> None:
    """Test _parse_decimal with various input types and edge cases."""
    from services.invoice import _parse_decimal
    
    # Test None input
    result = _parse_decimal(None)
    assert result == Decimal("0.00")
    
    # Test custom default
    result = _parse_decimal(None, Decimal("5.00"))
    assert result == Decimal("5.00")
    
    # Test empty string
    result = _parse_decimal("")
    assert result == Decimal("0.00")
    
    # Test whitespace only
    result = _parse_decimal("   ")
    assert result == Decimal("0.00")
    
    # Test valid decimal strings
    result = _parse_decimal("123.45")
    assert result == Decimal("123.45")
    
    # Test with dollar sign and commas
    result = _parse_decimal("$1,234.56")
    assert result == Decimal("1234.56")
    
    # Test invalid input (exception case)
    result = _parse_decimal(object())
    assert result == Decimal("0.00")


def test_calculate_job_draft_totals_comprehensive() -> None:
    """Test calculate_job_draft_invoice_summary with various edge cases."""
    from services.invoice import calculate_job_draft_invoice_summary
    
    # Test with non-dict extracted_data
    result = calculate_job_draft_invoice_summary(
        extracted_data="invalid",
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    assert result.subtotal == Decimal("0.00")
    assert result.markup_amount == Decimal("0.00")
    assert result.gst == Decimal("0.00")
    
    # Test with missing line_items
    result = calculate_job_draft_invoice_summary(
        extracted_data={},
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    assert result.subtotal == Decimal("0.00")
    
    # Test with invalid line_items type
    result = calculate_job_draft_invoice_summary(
        extracted_data={"line_items": "invalid"},
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    assert result.subtotal == Decimal("0.00")
    
    # Test with non-dict line items
    result = calculate_job_draft_invoice_summary(
        extracted_data={"line_items": ["invalid"]},
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    assert result.subtotal == Decimal("0.00")
    
    # Test with zero/negative quantity
    result = calculate_job_draft_invoice_summary(
        extracted_data={
            "line_items": [{
                "type": "LABOR",
                "qty": "0",  # Should become 1.00
                "line_total": "100.00"
            }]
        },
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    assert result.subtotal == Decimal("100.00")


def test_apply_markup_function() -> None:
    """Test _apply_markup function with various inputs."""
    from services.invoice import _apply_markup
    
    # Test basic markup calculation
    result = _apply_markup(Decimal("100.00"), Decimal("0.20"))
    assert result == Decimal("120.00")
    
    # Test zero markup
    result = _apply_markup(Decimal("100.00"), Decimal("0.00"))
    assert result == Decimal("100.00")
    
    # Test with different precision
    result = _apply_markup(Decimal("99.99"), Decimal("0.15"))
    assert result == Decimal("114.99")


def test_calculate_job_draft_edge_cases() -> None:
    """Test remaining edge cases in calculate_job_draft_invoice_summary."""
    from services.invoice import calculate_job_draft_invoice_summary
    
    # Test line_total <= 0 with unit_price <= 0 and LABOR type
    result = calculate_job_draft_invoice_summary(
        extracted_data={
            "line_items": [{
                "type": "LABOR",
                "qty": "2",
                "unit_price": "0",  # Should use default_labor_rate
                "line_total": "0"   # Should trigger calculation
            }]
        },
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    # Should use default labor rate for unit_price
    assert result.subtotal == Decimal("170.00")  # 2 * 85.00
    
    # Test MATERIAL vs Labor type handling
    result = calculate_job_draft_invoice_summary(
        extracted_data={
            "line_items": [{
                "type": "MATERIAL",
                "qty": "1",
                "unit_price": "50.00",
                "line_total": "50.00"
            }]
        },
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("85.00")
    )
    assert result.subtotal == Decimal("60.00")  # 50.00 + 20% markup = 60.00
