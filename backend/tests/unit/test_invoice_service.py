"""Unit tests for invoice service."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import Mock, patch

import pytest

from services.invoice import (
    _to_money,
    get_default_markup,
    _apply_markup,
    _parse_decimal,
    calculate_job_draft_invoice_summary,
    calculate_invoice,
    DEFAULT_MARKUP,
)


def test_to_money() -> None:
    """Test decimal rounding to currency precision."""
    assert _to_money(Decimal("10.235")) == Decimal("10.24")
    assert _to_money(Decimal("10.234")) == Decimal("10.23")
    assert _to_money(Decimal("10.236")) == Decimal("10.24")


def test_get_default_markup() -> None:
    """Test default markup retrieval."""
    mock_engine = Mock()
    mock_session = Mock()
    mock_settings = Mock()
    mock_settings.default_markup = Decimal("0.25")
    
    mock_engine.return_value.__enter__.return_value = mock_session
    mock_session.get.return_value = mock_settings
    
    markup = get_default_markup(mock_engine)
    assert markup == Decimal("0.25")


def test_get_default_markup_creates_default() -> None:
    """Test default markup creation when none exists."""
    mock_engine = Mock()
    mock_session = Mock()
    mock_session.get.return_value = None  # No existing settings
    
    with patch("services.invoice.UserSettings") as mock_user_settings:
        mock_settings_instance = Mock()
        mock_settings_instance.default_markup = DEFAULT_MARKUP
        mock_user_settings.return_value = mock_settings_instance
        
        markup = get_default_markup(mock_engine)
        assert markup == DEFAULT_MARKUP


def test_apply_markup() -> None:
    """Test markup application."""
    base_price = Decimal("100.00")
    markup = Decimal("0.20")
    
    result = _apply_markup(base_price, markup)
    assert result == Decimal("120.00")


def test_parse_decimal_valid() -> None:
    """Test decimal parsing with valid input."""
    assert _parse_decimal("10.50") == Decimal("10.50")
    assert _parse_decimal("$15.75") == Decimal("15.75")
    assert _parse_decimal("1,234.56") == Decimal("1234.56")


def test_parse_decimal_invalid() -> None:
    """Test decimal parsing with invalid input."""
    assert _parse_decimal(None) == Decimal("0.00")
    assert _parse_decimal("") == Decimal("0.00")
    assert _parse_decimal("invalid") == Decimal("0.00")
    assert _parse_decimal("abc") == Decimal("0.00")


def test_parse_decimal_with_default() -> None:
    """Test decimal parsing with custom default."""
    default = Decimal("99.99")
    assert _parse_decimal(None, default) == default
    assert _parse_decimal("", default) == default


def test_calculate_job_draft_invoice_summary() -> None:
    """Test job draft invoice summary calculation."""
    extracted_data = {
        "line_items": [
            {"description": "TPS Cable", "qty": "10", "type": "MATERIAL", "unit_price": "15.00"},
            {"description": "Labor", "qty": "2", "type": "LABOR"},
        ]
    }
    
    summary = calculate_job_draft_invoice_summary(
        extracted_data=extracted_data,
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("95.00")
    )
    
    assert summary.materials_subtotal == Decimal("150.00")  # 10 * 15.00
    assert summary.labor_subtotal == Decimal("190.00")      # 2 * 95.00
    assert summary.subtotal == Decimal("340.00")            # 150 + 190
    assert summary.markup_amount > Decimal("0")             # Should have markup
    assert summary.gst_amount > Decimal("0")                # Should have GST
    assert summary.total > summary.subtotal                 # Total > subtotal


def test_calculate_job_draft_invoice_summary_empty() -> None:
    """Test invoice summary with empty line items."""
    summary = calculate_job_draft_invoice_summary(
        extracted_data={"line_items": []},
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("95.00")
    )
    
    assert summary.materials_subtotal == Decimal("0.00")
    assert summary.labor_subtotal == Decimal("0.00")
    assert summary.subtotal == Decimal("0.00")
    assert summary.markup_amount == Decimal("0.00")
    assert summary.gst_amount == Decimal("0.00")
    assert summary.total == Decimal("0.00")


def test_calculate_job_draft_invoice_summary_invalid_qty() -> None:
    """Test invoice summary with invalid quantities."""
    extracted_data = {
        "line_items": [
            {"description": "Invalid", "qty": "invalid", "type": "MATERIAL", "unit_price": "10.00"},
        ]
    }
    
    summary = calculate_job_draft_invoice_summary(
        extracted_data=extracted_data,
        markup_percentage=Decimal("0.20"),
        default_labor_rate=Decimal("95.00")
    )
    
    # Should handle invalid qty gracefully
    assert summary.materials_subtotal >= Decimal("0.00")


def test_calculate_invoice() -> None:
    """Test invoice calculation with material matches."""
    translated_lines = ["Installed TPS Cable"]
    
    mock_receipt = Mock()
    mock_receipt.line_items = [
        Mock(description="TPS Cable", quantity=Decimal("10"))
    ]
    
    mock_match = Mock()
    mock_match.trade_price = Decimal("15.00")
    
    invoice = calculate_invoice(
        translated_lines=translated_lines,
        receipt=mock_receipt,
        vector_matches=[mock_match],
        default_labor_rate=Decimal("95.00"),
        markup_percentage=Decimal("0.20")
    )
    
    assert len(invoice.lines) == 1
    assert invoice.lines[0].description == "TPS Cable"
    assert invoice.lines[0].quantity == Decimal("10")
    assert invoice.lines[0].unit_price > Decimal("15.00")  # Should have markup applied


def test_calculate_invoice_no_materials() -> None:
    """Test invoice calculation with no material matches."""
    translated_lines = ["General labor work"]
    
    mock_receipt = Mock()
    mock_receipt.line_items = []
    
    invoice = calculate_invoice(
        translated_lines=translated_lines,
        receipt=mock_receipt,
        vector_matches=[],
        default_labor_rate=Decimal("95.00"),
        markup_percentage=Decimal("0.20")
    )
    
    # Should create labor line from translated text
    assert len(invoice.lines) >= 1
    assert invoice.lines[0].unit_price == Decimal("95.00")  # Default labor rate


def test_default_markup_constant() -> None:
    """Test default markup constant."""
    assert DEFAULT_MARKUP == Decimal("0.20")


def test_apply_markup_zero_markup() -> None:
    """Test markup application with zero markup."""
    base_price = Decimal("100.00")
    markup = Decimal("0.00")
    
    result = _apply_markup(base_price, markup)
    assert result == Decimal("100.00")


def test_apply_markup_high_markup() -> None:
    """Test markup application with high markup."""
    base_price = Decimal("100.00")
    markup = Decimal("0.50")
    
    result = _apply_markup(base_price, markup)
    assert result == Decimal("150.00")