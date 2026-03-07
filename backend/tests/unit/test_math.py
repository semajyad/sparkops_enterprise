"""Unit tests for Decimal-based invoice math utilities."""

from __future__ import annotations

from decimal import Decimal

import pytest

from services.math_utils import (
    InvoiceMathLine,
    calculate_gst,
    calculate_invoice_totals,
    calculate_line_total,
    validate_totals,
)


def test_calculate_line_total_uses_decimal_precision() -> None:
    """Ensure line totals are rounded using NZ 2dp currency rules."""

    result = calculate_line_total(qty=Decimal("1.333"), unit_price=Decimal("19.995"))
    assert result == Decimal("26.65")


def test_calculate_invoice_totals_applies_nz_gst() -> None:
    """Verify subtotal, GST, and total calculations for multiple lines."""

    lines = [
        InvoiceMathLine(qty=Decimal("2"), unit_price=Decimal("15.50")),
        InvoiceMathLine(qty=Decimal("1"), unit_price=Decimal("100.00")),
    ]

    totals = calculate_invoice_totals(lines)

    assert totals.subtotal == Decimal("131.00")
    assert totals.gst == calculate_gst(Decimal("131.00")) == Decimal("19.65")
    assert totals.total == Decimal("150.65")


def test_validate_totals_fails_when_outside_tolerance() -> None:
    """Raise assertion when invoice arithmetic drift exceeds $0.01."""

    with pytest.raises(AssertionError):
        validate_totals(
            subtotal=Decimal("100.00"),
            gst=Decimal("15.00"),
            total=Decimal("114.98"),
        )


def test_calculate_invoice_totals_with_zero_values() -> None:
    """Ensure all totals remain zero when every line value is zero."""

    lines = [InvoiceMathLine(qty=Decimal("0"), unit_price=Decimal("0.00"))]
    totals = calculate_invoice_totals(lines)

    assert totals.subtotal == Decimal("0.00")
    assert totals.gst == Decimal("0.00")
    assert totals.total == Decimal("0.00")


def test_calculate_invoice_totals_handles_massive_quantities() -> None:
    """Verify Decimal math remains stable for very large invoice quantities."""

    lines = [InvoiceMathLine(qty=Decimal("1000000"), unit_price=Decimal("1234.56"))]
    totals = calculate_invoice_totals(lines)

    assert totals.subtotal == Decimal("1234560000.00")
    assert totals.gst == Decimal("185184000.00")
    assert totals.total == Decimal("1419744000.00")


def test_calculate_line_total_raises_for_missing_unit_price() -> None:
    """Raise TypeError when required numeric fields are missing."""

    with pytest.raises(TypeError):
        calculate_line_total(qty=Decimal("2"), unit_price=None)  # type: ignore[arg-type]


def test_calculate_subtotal_raises_for_incomplete_line_object() -> None:
    """Raise AttributeError when line object does not include expected fields."""

    class IncompleteLine:
        qty = Decimal("1")

    with pytest.raises(AttributeError):
        calculate_invoice_totals([IncompleteLine()])  # type: ignore[list-item]
