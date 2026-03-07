"""Local invoice math utilities using Decimal for bank-grade precision."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

TWO_DP = Decimal("0.01")
NZ_GST_RATE = Decimal("0.15")


@dataclass(frozen=True)
class InvoiceMathLine:
    """Minimal shape needed for deterministic invoice calculations."""

    qty: Decimal
    unit_price: Decimal


@dataclass(frozen=True)
class InvoiceTotals:
    """Computed invoice totals."""

    subtotal: Decimal
    gst: Decimal
    total: Decimal


def _to_money(value: Decimal) -> Decimal:
    """Round to NZ currency precision (2dp)."""

    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


def calculate_line_total(qty: Decimal, unit_price: Decimal) -> Decimal:
    """Line total = qty * unit_price, rounded to 2dp."""

    return _to_money(qty * unit_price)


def calculate_subtotal(lines: Iterable[InvoiceMathLine]) -> Decimal:
    """Subtotal = sum of all line totals."""

    subtotal = sum(calculate_line_total(line.qty, line.unit_price) for line in lines)
    return _to_money(subtotal)


def calculate_gst(subtotal: Decimal) -> Decimal:
    """GST = subtotal * 15% for NZ."""

    return _to_money(subtotal * NZ_GST_RATE)


def validate_totals(subtotal: Decimal, gst: Decimal, total: Decimal, tolerance: Decimal = TWO_DP) -> None:
    """Assert total arithmetic integrity within tolerance."""

    difference = abs((total - gst) - subtotal)
    assert difference <= tolerance, (
        f"Invoice total validation failed: |(total - gst) - subtotal|={difference} exceeds {tolerance}"
    )


def calculate_invoice_totals(lines: Iterable[InvoiceMathLine]) -> InvoiceTotals:
    """Compute subtotal, GST, and total with local Decimal arithmetic only."""

    subtotal = calculate_subtotal(lines)
    gst = calculate_gst(subtotal)
    total = _to_money(subtotal + gst)
    validate_totals(subtotal=subtotal, gst=gst, total=total)
    return InvoiceTotals(subtotal=subtotal, gst=gst, total=total)
