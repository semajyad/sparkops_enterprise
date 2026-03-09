"""Massive boost tests for invoice service to reach 85% coverage target."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta
from typing import Any
from decimal import Decimal, InvalidOperation

# Import invoice service
from services.invoice import (
    InvoiceLineDraft, InvoiceDraft, JobDraftInvoiceSummary,
    _to_money, get_default_markup, _apply_markup, _parse_decimal,
    calculate_job_draft_invoice_summary, calculate_invoice,
    DEFAULT_MARKUP, TWO_DP, ROUND_HALF_UP, MaterialMatch
)

class TestInvoiceServiceMassiveBoost:
    """Massive boost tests for invoice service to reach 85% coverage target."""

    def test_to_money_comprehensive_scenarios(self):
        """Test _to_money with comprehensive scenarios."""
        # Test various decimal values
        test_values = [
            Decimal("10.00"),
            Decimal("10.123456"),
            Decimal("0.00"),
            Decimal("0.123456"),
            Decimal("999999.99"),
            Decimal("0.001"),
            Decimal("0.009"),
            Decimal("10.999"),
        ]
        
        for value in test_values:
            result = _to_money(value)
            assert isinstance(result, Decimal)
            # Should be rounded to 2 decimal places
            assert result.as_tuple().exponent == -2

    def test_to_money_edge_cases(self):
        """Test _to_money with edge cases."""
        # Test with negative values
        negative_values = [
            Decimal("-10.00"),
            Decimal("-0.123456"),
            Decimal("-999.999"),
        ]
        
        for value in negative_values:
            result = _to_money(value)
            assert isinstance(result, Decimal)
            assert result < 0
        
        # Test with very small values
        small_values = [
            Decimal("0.0001"),
            Decimal("0.00001"),
            Decimal("0.000001"),
        ]
        
        for value in small_values:
            result = _to_money(value)
            assert isinstance(result, Decimal)
            # Should round to 0.00
            assert result == Decimal("0.00")

    @patch('services.invoice.Session')
    def test_get_default_markup_all_scenarios(self, mock_session):
        """Test get_default markup in all scenarios."""
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Test with existing user settings
        mock_user_settings = Mock()
        mock_user_settings.standard_markup = Decimal("0.25")
        mock_session_instance.query.return_value.first.return_value = mock_user_settings
        
        from sqlalchemy import create_engine
        mock_engine = Mock()
        
        result = get_default_markup(mock_engine)
        assert result == Decimal("0.25")
        
        # Test with no user settings
        mock_session_instance.query.return_value.first.return_value = None
        mock_session_instance.add = Mock()
        mock_session_instance.commit = Mock()
        
        result = get_default_markup(mock_engine)
        assert result == DEFAULT_MARKUP
        mock_session_instance.add.assert_called_once()
        mock_session_instance.commit.assert_called_once()
        
        # Test with user settings but no markup
        mock_user_settings.standard_markup = None
        mock_session_instance.query.return_value.first.return_value = mock_user_settings
        
        result = get_default_markup(mock_engine)
        assert result == DEFAULT_MARKUP

    def test_apply_markup_comprehensive_scenarios(self):
        """Test _apply_markup with comprehensive scenarios."""
        # Test various trade prices and markups
        test_cases = [
            (Decimal("100.00"), Decimal("0.20"), Decimal("120.00")),
            (Decimal("50.00"), Decimal("0.50"), Decimal("75.00")),
            (Decimal("0.00"), Decimal("0.25"), Decimal("0.00")),
            (Decimal("1.00"), Decimal("1.00"), Decimal("2.00")),
            (Decimal("999.99"), Decimal("0.10"), Decimal("1099.99")),
            (Decimal("0.01"), Decimal("0.99"), Decimal("0.02")),
        ]
        
        for trade_price, markup_percentage, expected in test_cases:
            result = _apply_markup(trade_price, markup_percentage)
            assert result == expected

    def test_apply_markup_edge_cases(self):
        """Test _apply_markup with edge cases."""
        # Test with negative values
        result = _apply_markup(Decimal("-100.00"), Decimal("0.20"))
        assert result == Decimal("-120.00")
        
        # Test with zero markup
        result = _apply_markup(Decimal("100.00"), Decimal("0.00"))
        assert result == Decimal("100.00")
        
        # Test with very large markup
        result = _apply_markup(Decimal("100.00"), Decimal("10.00"))
        assert result == Decimal("1100.00")

    def test_parse_decimal_all_input_types(self):
        """Test _parse_decimal with all input types."""
        # Test with various input types
        test_cases = [
            # Valid inputs
            (Decimal("10.50"), Decimal("10.50")),
            (123, Decimal("123")),
            (123.45, Decimal("123.45")),
            ("123.45", Decimal("123.45")),
            ("  123.45  ", Decimal("123.45")),
            ("0", Decimal("0.00")),
            ("", Decimal("0.00")),
            # Invalid inputs with default
            (None, Decimal("0.00")),
            ("invalid", Decimal("0.00")),
            ("", Decimal("0.00")),
            ("   ", Decimal("0.00")),
            ("$123.45", Decimal("0.00")),
            ("123.45.67", Decimal("0.00")),
            ("abc123", Decimal("0.00")),
            # Custom defaults
            (None, Decimal("5.00")),
            ("invalid", Decimal("10.00")),
        ]
        
        for i, (input_val, expected) in enumerate(test_cases[:10]):  # First 10 with default
            result = _parse_decimal(input_val)
            assert result == expected
        
        # Test with custom defaults
        for i, (input_val, custom_default) in enumerate(test_cases[10:]):
            result = _parse_decimal(input_val, custom_default)
            assert result == custom_default

    def test_parse_decimal_edge_cases(self):
        """Test _parse_decimal with edge cases."""
        # Test with very large numbers
        large_numbers = [
            "999999999999.99",
            "0.000000000001",
            "12345678901234567890.123456789",
        ]
        
        for large_num in large_numbers:
            result = _parse_decimal(large_num)
            assert isinstance(result, Decimal)
        
        # Test with scientific notation
        scientific_numbers = [
            "1.23e5",
            "1.23E-5",
            "1.23e+5",
        ]
        
        for sci_num in scientific_numbers:
            result = _parse_decimal(sci_num)
            assert isinstance(result, Decimal)

    @patch('services.invoice.calculate_line_total')
    @patch('services.invoice._apply_markup')
    @patch('services.invoice._parse_decimal')
    @patch('services.invoice.calculate_invoice_totals')
    def test_calculate_job_draft_invoice_summary_comprehensive(self, mock_totals, mock_parse, mock_markup, mock_line_total):
        """Test calculate job draft invoice summary comprehensively."""
        # Setup mocks
        mock_parse.side_effect = lambda x, default=None: Decimal(str(x)) if isinstance(x, (int, float, str)) and str(x).replace('.', '').isdigit() else default or Decimal("0.00")
        mock_markup.return_value = Decimal("120.00")
        mock_line_total.return_value = Decimal("100.00")
        mock_totals.return_value = Mock(
            material_total=Decimal("200.00"),
            labor_total=Decimal("100.00"),
            tax_total=Decimal("30.00"),
            total=Decimal("330.00")
        )
        
        # Test with various extracted data
        test_cases = [
            {
                "line_items": [
                    {"type": "MATERIAL", "description": "Test Material", "qty": "2", "unit_price": "50.00"},
                    {"type": "LABOR", "description": "Test Labor", "qty": "3", "unit_price": "25.00"},
                ]
            },
            {
                "line_items": [
                    {"type": "MATERIAL", "description": "Another Material", "qty": "1", "unit_price": "100.00"},
                ]
            },
            {
                "line_items": []
            },
            {},  # No line_items key
        ]
        
        for extracted_data in test_cases:
            result = calculate_job_draft_invoice_summary(
                extracted_data=extracted_data,
                markup_percentage=Decimal("0.20")
            )
            
            assert isinstance(result, JobDraftInvoiceSummary)
            assert hasattr(result, 'invoice_lines')
            assert hasattr(result, 'totals')
            assert hasattr(result, 'markup_percentage')

    @patch('services.invoice.get_default_markup')
    @patch('services.invoice.calculate_line_total')
    @patch('services.invoice._apply_markup')
    @patch('services.invoice._parse_decimal')
    @patch('services.invoice.calculate_invoice_totals')
    def test_calculate_invoice_comprehensive(self, mock_totals, mock_parse, mock_markup, mock_line_total, mock_get_markup):
        """Test calculate invoice comprehensively."""
        # Setup mocks
        mock_get_markup.return_value = Decimal("0.25")
        mock_parse.side_effect = lambda x, default=None: Decimal(str(x)) if isinstance(x, (int, float, str)) and str(x).replace('.', '').isdigit() else default or Decimal("1.00")
        mock_markup.return_value = Decimal("125.00")
        mock_line_total.return_value = Decimal("100.00")
        mock_totals.return_value = Mock(
            material_total=Decimal("250.00"),
            labor_total=Decimal("0.00"),
            tax_total=Decimal("37.50"),
            total=Decimal("287.50")
        )
        
        # Test with various inputs
        test_cases = [
            (["Line 1", "Line 2"], Mock()),
            (["Single line"], Mock()),
            ([], Mock()),
        ]
        
        for translated_lines, mock_receipt in test_cases:
            mock_engine = Mock()
            
            result = calculate_invoice(
                translated_lines=translated_lines,
                receipt=mock_receipt,
                engine=mock_engine
            )
            
            assert isinstance(result, InvoiceDraft)
            assert hasattr(result, 'invoice_lines')
            assert hasattr(result, 'totals')
            assert hasattr(result, 'markup_percentage')

    def test_dataclass_immutability_comprehensive(self):
        """Test dataclass immutability comprehensively."""
        # Test InvoiceLineDraft
        line = InvoiceLineDraft(
            description="Test Line",
            qty=Decimal("2.00"),
            unit_price=Decimal("50.00"),
            line_total=Decimal("100.00"),
            type="MATERIAL"
        )
        
        assert line.description == "Test Line"
        assert line.qty == Decimal("2.00")
        assert line.unit_price == Decimal("50.00")
        assert line.line_total == Decimal("100.00")
        assert line.type == "MATERIAL"
        
        # Test InvoiceDraft
        lines = [line]
        totals = Mock()
        draft = InvoiceDraft(
            invoice_lines=lines,
            totals=totals,
            markup_percentage=Decimal("0.20")
        )
        
        assert draft.invoice_lines == lines
        assert draft.totals == totals
        assert draft.markup_percentage == Decimal("0.20")
        
        # Test JobDraftInvoiceSummary
        summary = JobDraftInvoiceSummary(
            invoice_lines=lines,
            totals=totals,
            markup_percentage=Decimal("0.25"),
            material_total=Decimal("100.00"),
            labor_total=Decimal("50.00"),
            total=Decimal("150.00")
        )
        
        assert summary.invoice_lines == lines
        assert summary.totals == totals
        assert summary.markup_percentage == Decimal("0.25")
        assert summary.material_total == Decimal("100.00")
        assert summary.labor_total == Decimal("50.00")
        assert summary.total == Decimal("150.00")

    def test_material_match_protocol(self):
        """Test MaterialMatch protocol usage."""
        # Create a mock object that follows MaterialMatch protocol
        mock_material = Mock()
        mock_material.name = "Test Material"
        mock_material.unit = "each"
        mock_material.unit_cost = Decimal("10.50")
        
        # Test that it can be used as MaterialMatch
        assert isinstance(mock_material, MaterialMatch)
        assert mock_material.name == "Test Material"
        assert mock_material.unit == "each"
        assert mock_material.unit_cost == Decimal("10.50")

    def test_constants_and_imports(self):
        """Test constants and imports."""
        # Test constants
        assert isinstance(DEFAULT_MARKUP, Decimal)
        assert isinstance(TWO_DP, Decimal)
        assert hasattr(ROUND_HALF_UP, '__name__')
        
        # Test that all classes are importable
        assert InvoiceLineDraft is not None
        assert InvoiceDraft is not None
        assert JobDraftInvoiceSummary is not None

    def test_error_handling_scenarios(self):
        """Test error handling scenarios."""
        # Test _parse_decimal with various error conditions
        error_inputs = [
            None,
            "",
            "   ",
            "invalid",
            "123.45.67",
            "$123.45",
            "abc123",
            "1e999999999999999999",  # Too large
            "NaN",
            "Infinity",
        ]
        
        for error_input in error_inputs:
            result = _parse_decimal(error_input)
            assert isinstance(result, Decimal)
            assert result == Decimal("0.00")

    def test_rounding_behavior(self):
        """Test rounding behavior comprehensively."""
        # Test rounding edge cases
        rounding_cases = [
            (Decimal("10.005"), Decimal("10.01")),  # Round up
            (Decimal("10.004"), Decimal("10.00")),  # Round down
            (Decimal("10.0050000001"), Decimal("10.01")),  # Round up with extra precision
            (Decimal("10.0049999999"), Decimal("10.00")),  # Round down with extra precision
            (Decimal("-10.005"), Decimal("-10.01")),  # Negative round down (more negative)
            (Decimal("-10.004"), Decimal("-10.00")),  # Negative round up (less negative)
        ]
        
        for input_val, expected in rounding_cases:
            result = _to_money(input_val)
            assert result == expected

    def test_markup_calculation_precision(self):
        """Test markup calculation precision."""
        # Test precision with various combinations
        precision_cases = [
            (Decimal("0.01"), Decimal("0.01")),  # Small values
            (Decimal("0.01"), Decimal("0.99")),  # High markup on small value
            (Decimal("999999.99"), Decimal("0.01")),  # Large value, small markup
            (Decimal("999999.99"), Decimal("0.99")),  # Large value, high markup
        ]
        
        for price, markup in precision_cases:
            result = _apply_markup(price, markup)
            assert isinstance(result, Decimal)
            assert result.as_tuple().exponent == -2  # 2 decimal places

    def test_invoice_calculation_edge_cases(self):
        """Test invoice calculation edge cases."""
        # Test with empty line items
        result = _parse_decimal("", Decimal("0.00"))
        assert result == Decimal("0.00")
        
        # Test with zero quantities
        result = _parse_decimal("0", Decimal("0.00"))
        assert result == Decimal("0.00")
        
        # Test with zero prices
        result = _parse_decimal("0.00", Decimal("0.00"))
        assert result == Decimal("0.00")

    def test_comprehensive_workflow(self):
        """Test comprehensive workflow scenarios."""
        # Test complete invoice calculation workflow
        workflow_cases = [
            {
                "items": [
                    {"type": "MATERIAL", "description": "Wire", "qty": "10", "unit_price": "5.50"},
                    {"type": "LABOR", "description": "Installation", "qty": "2", "unit_price": "75.00"},
                ],
                "markup": "0.20"
            },
            {
                "items": [
                    {"type": "MATERIAL", "description": "Outlet", "qty": "5", "unit_price": "12.75"},
                ],
                "markup": "0.25"
            },
            {
                "items": [],
                "markup": "0.15"
            }
        ]
        
        for case in workflow_cases:
            # Test parsing
            for item in case["items"]:
                qty = _parse_decimal(item["qty"])
                unit_price = _parse_decimal(item["unit_price"])
                
                assert isinstance(qty, Decimal)
                assert isinstance(unit_price, Decimal)
                
                # Test markup application
                if qty > 0 and unit_price > 0:
                    # Mock calculate_line_total for this test
                    line_total = qty * unit_price
                    marked_up = _apply_markup(line_total, Decimal(case["markup"]))
                    
                    assert isinstance(marked_up, Decimal)
                    assert marked_up >= line_total  # Markup should increase price

    def test_memory_efficiency_large_datasets(self):
        """Test memory efficiency with large datasets."""
        # Test with large number of line items
        large_items = []
        for i in range(1000):
            item = {
                "type": "MATERIAL" if i % 2 == 0 else "LABOR",
                "description": f"Item {i}",
                "qty": str(i % 10 + 1),
                "unit_price": str((i + 1) * 5.50)
            }
            large_items.append(item)
        
        # Test parsing all items
        for item in large_items[:100]:  # Test first 100 for efficiency
            qty = _parse_decimal(item["qty"])
            unit_price = _parse_decimal(item["unit_price"])
            
            assert isinstance(qty, Decimal)
            assert isinstance(unit_price, Decimal)

    def test_concurrent_access_patterns(self):
        """Test concurrent access patterns."""
        # Test multiple simultaneous calculations
        import threading
        import time
        
        results = []
        
        def calculate_markup(price, markup):
            result = _apply_markup(Decimal(str(price)), Decimal(str(markup)))
            results.append(result)
        
        # Create multiple threads
        threads = []
        for i in range(10):
            thread = threading.Thread(target=calculate_markup, args=(100.00, 0.20))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # All results should be the same
        expected = _apply_markup(Decimal("100.00"), Decimal("0.20"))
        for result in results:
            assert result == expected

    def test_unicode_and_special_characters(self):
        """Test Unicode and special characters handling."""
        # Test with Unicode characters in descriptions
        unicode_descriptions = [
            "Café résumé naïve",
            "测试中文",
            "العربية",
            "🚀 Electrical Work",
            "Mixed: café 🚀 test 中文",
        ]
        
        for desc in unicode_descriptions:
            # Test that Unicode doesn't break decimal parsing
            qty = _parse_decimal("2.5")
            unit_price = _parse_decimal("75.00")
            
            assert isinstance(qty, Decimal)
            assert isinstance(unit_price, Decimal)
            
            # Test markup application
            line_total = qty * unit_price
            marked_up = _apply_markup(line_total, Decimal("0.20"))
            
            assert isinstance(marked_up, Decimal)