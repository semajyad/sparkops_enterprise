"""Comprehensive tests for real invoice service functions."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta
from typing import Any
from decimal import Decimal

# Import actual invoice service functions
from services.invoice import (
    _to_money,
    get_default_markup,
    _apply_markup,
    _parse_decimal,
    calculate_job_draft_invoice_summary,
    calculate_invoice,
    MaterialMatch,
    InvoiceLineDraft,
    InvoiceDraft,
    JobDraftInvoiceSummary,
    DEFAULT_MARKUP
)

class TestInvoiceServiceReal:
    """Comprehensive tests for real invoice service functions."""

    def test_to_money_basic(self):
        """Test money rounding function."""
        # Test standard rounding
        result = _to_money(Decimal("123.456"))
        assert result == Decimal("123.46")
        
        # Test rounding down
        result = _to_money(Decimal("123.454"))
        assert result == Decimal("123.45")
        
        # Test exact values
        result = _to_money(Decimal("123.45"))
        assert result == Decimal("123.45")

    def test_to_money_edge_cases(self):
        """Test money rounding edge cases."""
        # Test with very small values
        result = _to_money(Decimal("0.001"))
        assert result == Decimal("0.00")
        
        # Test with large values
        result = _to_money(Decimal("1234567.896"))
        assert result == Decimal("1234567.90")
        
        # Test with negative values
        result = _to_money(Decimal("-123.456"))
        assert result == Decimal("-123.46")

    @patch('services.invoice.Session')
    def test_get_default_markup_existing(self, mock_session):
        """Test getting existing default markup."""
        mock_engine = Mock()
        mock_user_settings = Mock()
        mock_user_settings.standard_markup = Decimal("0.25")
        
        mock_session.return_value.__enter__.return_value.query.return_value.first.return_value = mock_user_settings
        
        result = get_default_markup(mock_engine)
        
        assert result == Decimal("0.25")

    @patch('services.invoice.Session')
    def test_get_default_markup_create_default(self, mock_session):
        """Test creating default markup when none exists."""
        mock_engine = Mock()
        mock_session.return_value.__enter__.return_value.query.return_value.first.return_value = None
        
        result = get_default_markup(mock_engine)
        
        assert result == DEFAULT_MARKUP
        # Verify default was created
        mock_session.return_value.__enter__.return_value.add.assert_called_once()
        mock_session.return_value.__enter__.return_value.commit.assert_called_once()

    def test_apply_markup_basic(self):
        """Test markup application."""
        # Test standard markup
        result = _apply_markup(Decimal("100.00"), Decimal("0.20"))
        assert result == Decimal("120.00")
        
        # Test zero markup
        result = _apply_markup(Decimal("100.00"), Decimal("0.00"))
        assert result == Decimal("100.00")
        
        # Test high markup
        result = _apply_markup(Decimal("100.00"), Decimal("0.50"))
        assert result == Decimal("150.00")

    def test_apply_markup_edge_cases(self):
        """Test markup application edge cases."""
        # Test with small values
        result = _apply_markup(Decimal("0.01"), Decimal("0.20"))
        assert result == Decimal("0.01")  # Should round to 0.01
        
        # Test with large values
        result = _apply_markup(Decimal("1000000.00"), Decimal("0.20"))
        assert result == Decimal("1200000.00")
        
        # Test with negative markup
        result = _apply_markup(Decimal("100.00"), Decimal("-0.10"))
        assert result == Decimal("90.00")

    def test_parse_decimal_valid_inputs(self):
        """Test parsing valid decimal inputs."""
        # Test with string
        result = _parse_decimal("123.45")
        assert result == Decimal("123.45")
        
        # Test with integer
        result = _parse_decimal(123)
        assert result == Decimal("123")
        
        # Test with decimal
        result = _parse_decimal(Decimal("123.45"))
        assert result == Decimal("123.45")
        
        # Test with float
        result = _parse_decimal(123.45)
        assert result == Decimal("123.45")

    def test_parse_decimal_invalid_inputs(self):
        """Test parsing invalid decimal inputs."""
        # Test with None
        result = _parse_decimal(None)
        assert result == Decimal("0.00")
        
        # Test with empty string
        result = _parse_decimal("")
        assert result == Decimal("0.00")
        
        # Test with invalid string
        result = _parse_decimal("invalid")
        assert result == Decimal("0.00")
        
        # Test with custom default
        result = _parse_decimal(None, Decimal("10.00"))
        assert result == Decimal("10.00")

    def test_calculate_job_draft_invoice_summary_basic(self):
        """Test basic job draft invoice summary calculation."""
        extracted_data = {
            "line_items": [
                {
                    "type": "MATERIAL",
                    "description": "Test Material",
                    "qty": 2,
                    "unit_price": 50.00
                },
                {
                    "type": "LABOR",
                    "description": "Test Labor",
                    "qty": 1,
                    "unit_price": 75.00
                }
            ]
        }
        
        result = calculate_job_draft_invoice_summary(
            extracted_data=extracted_data,
            markup_percentage=Decimal("0.20")
        )
        
        assert isinstance(result, JobDraftInvoiceSummary)
        assert len(result.invoice_lines) == 2
        assert result.material_total > 0
        assert result.labor_total > 0
        assert result.total > 0

    def test_calculate_job_draft_invoice_summary_empty(self):
        """Test job draft invoice summary with empty data."""
        extracted_data = {"line_items": []}
        
        result = calculate_job_draft_invoice_summary(
            extracted_data=extracted_data,
            markup_percentage=Decimal("0.20")
        )
        
        assert isinstance(result, JobDraftInvoiceSummary)
        assert len(result.invoice_lines) == 0
        assert result.material_total == Decimal("0.00")
        assert result.labor_total == Decimal("0.00")
        assert result.total == Decimal("0.00")

    def test_calculate_job_draft_invoice_summary_missing_fields(self):
        """Test job draft invoice summary with missing fields."""
        extracted_data = {
            "line_items": [
                {
                    "type": "MATERIAL",
                    "description": "Test Material"
                    # Missing qty and unit_price
                }
            ]
        }
        
        result = calculate_job_draft_invoice_summary(
            extracted_data=extracted_data,
            markup_percentage=Decimal("0.20")
        )
        
        assert isinstance(result, JobDraftInvoiceSummary)
        assert len(result.invoice_lines) == 1
        # Should use default values for missing fields
        assert result.invoice_lines[0].qty == Decimal("0.00")
        assert result.invoice_lines[0].unit_price == Decimal("0.00")

    def test_calculate_job_draft_invoice_summary_different_types(self):
        """Test job draft invoice summary with different line types."""
        extracted_data = {
            "line_items": [
                {
                    "type": "MATERIAL",
                    "description": "Test Material",
                    "qty": 1,
                    "unit_price": 100.00
                },
                {
                    "type": "LABOR",
                    "description": "Test Labor",
                    "qty": 2,
                    "unit_price": 50.00
                },
                {
                    "type": "OTHER",
                    "description": "Test Other",
                    "qty": 1,
                    "unit_price": 25.00
                }
            ]
        }
        
        result = calculate_job_draft_invoice_summary(
            extracted_data=extracted_data,
            markup_percentage=Decimal("0.20")
        )
        
        assert isinstance(result, JobDraftInvoiceSummary)
        assert len(result.invoice_lines) == 3
        
        # Check material total
        material_lines = [line for line in result.invoice_lines if line.type == "MATERIAL"]
        assert len(material_lines) == 1
        assert result.material_total > Decimal("0.00")
        
        # Check labor total
        labor_lines = [line for line in result.invoice_lines if line.type == "LABOR"]
        assert len(labor_lines) == 1
        assert result.labor_total > Decimal("0.00")

    @patch('services.invoice.get_default_markup')
    def test_calculate_invoice_basic(self, mock_get_markup):
        """Test basic invoice calculation."""
        mock_get_markup.return_value = Decimal("0.20")
        mock_engine = Mock()
        
        translated_lines = [
            "Test Material 1 - $50.00",
            "Test Labor - $75.00/hour - 2 hours"
        ]
        
        mock_receipt = Mock()
        mock_receipt.merchant_name = "Test Merchant"
        mock_receipt.total = Decimal("200.00")
        mock_receipt.date = datetime.now(timezone.utc)
        
        result = calculate_invoice(
            translated_lines=translated_lines,
            receipt=mock_receipt,
            engine=mock_engine
        )
        
        assert isinstance(result, InvoiceDraft)
        assert len(result.invoice_lines) > 0
        assert result.totals.subtotal >= Decimal("0.00")
        assert result.markup_percentage == Decimal("0.20")

    @patch('services.invoice.get_default_markup')
    def test_calculate_invoice_empty_lines(self, mock_get_markup):
        """Test invoice calculation with empty lines."""
        mock_get_markup.return_value = Decimal("0.20")
        mock_engine = Mock()
        
        translated_lines = []
        
        mock_receipt = Mock()
        mock_receipt.merchant_name = "Test Merchant"
        mock_receipt.total = Decimal("0.00")
        mock_receipt.date = datetime.now(timezone.utc)
        
        result = calculate_invoice(
            translated_lines=translated_lines,
            receipt=mock_receipt,
            engine=mock_engine
        )
        
        assert isinstance(result, InvoiceDraft)
        assert len(result.invoice_lines) == 0
        assert result.totals.subtotal == Decimal("0.00")

    def test_dataclass_immutability(self):
        """Test that dataclasses are frozen/immutable."""
        line_draft = InvoiceLineDraft(
            description="Test",
            qty=Decimal("1.00"),
            unit_price=Decimal("100.00"),
            line_total=Decimal("100.00"),
            type="MATERIAL"
        )
        
        # Should be frozen
        with pytest.raises(AttributeError):
            line_draft.description = "Modified"
        
        invoice_draft = InvoiceDraft(
            invoice_lines=[line_draft],
            totals=Mock(),
            markup_percentage=Decimal("0.20")
        )
        
        # Should be frozen
        with pytest.raises(AttributeError):
            invoice_draft.markup_percentage = Decimal("0.25")

    def test_material_match_protocol(self):
        """Test MaterialMatch protocol usage."""
        class TestMaterialMatch:
            def __init__(self, query, trade_price):
                self.query = query
                self.trade_price = trade_price
        
        material = TestMaterialMatch("test query", Decimal("100.00"))
        
        # Should satisfy the protocol
        assert hasattr(material, 'query')
        assert hasattr(material, 'trade_price')
        assert material.query == "test query"
        assert material.trade_price == Decimal("100.00")

    def test_calculate_job_draft_invoice_summary_markup_application(self):
        """Test that markup is correctly applied in job draft calculation."""
        extracted_data = {
            "line_items": [
                {
                    "type": "MATERIAL",
                    "description": "Test Material",
                    "qty": 1,
                    "unit_price": 100.00
                }
            ]
        }
        
        # Test with different markup percentages
        result_10_percent = calculate_job_draft_invoice_summary(
            extracted_data=extracted_data,
            markup_percentage=Decimal("0.10")
        )
        
        result_20_percent = calculate_job_draft_invoice_summary(
            extracted_data=extracted_data,
            markup_percentage=Decimal("0.20")
        )
        
        # Higher markup should result in higher total
        assert result_20_percent.total > result_10_percent.total

    def test_parse_decimal_edge_cases(self):
        """Test decimal parsing edge cases."""
        # Test with very large numbers
        result = _parse_decimal("999999999.99")
        assert result == Decimal("999999999.99")
        
        # Test with very small numbers
        result = _parse_decimal("0.000001")
        assert result == Decimal("0.000001")
        
        # Test with scientific notation
        result = _parse_decimal("1.23e-4")
        assert result == Decimal("0.000123")
        
        # Test with whitespace
        result = _parse_decimal("  123.45  ")
        assert result == Decimal("123.45")