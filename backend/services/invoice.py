"""Invoice pricing service with global markup support."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Protocol

from sqlalchemy.engine import Engine
from sqlmodel import Session

from models.database import UserSettings
from services.math_utils import InvoiceMathLine, InvoiceTotals, calculate_invoice_totals, calculate_line_total
from services.vision import ReceiptExtraction

TWO_DP = Decimal("0.01")
DEFAULT_MARKUP = Decimal("0.20")


class MaterialMatch(Protocol):
    """Material match contract used by invoice calculation."""

    query: str
    trade_price: Decimal


@dataclass(frozen=True)
class InvoiceLineDraft:
    """Invoice line with sell pricing."""

    description: str
    qty: Decimal
    unit_price: Decimal
    line_total: Decimal
    type: str


@dataclass(frozen=True)
class InvoiceDraft:
    """Calculated invoice payload using marked-up sell prices."""

    invoice_lines: list[InvoiceLineDraft]
    totals: InvoiceTotals
    markup_percentage: Decimal


def _to_money(value: Decimal) -> Decimal:
    """Round to NZ currency precision (2dp)."""

    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


def get_default_markup(engine: Engine) -> Decimal:
    """Return persisted default markup, creating defaults when absent."""

    with Session(engine) as session:
        settings = session.get(UserSettings, 1)
        if settings is None:
            settings = UserSettings(id=1, default_markup=DEFAULT_MARKUP)
            session.add(settings)
            session.commit()
            session.refresh(settings)

        markup = settings.default_markup
        if markup < Decimal("0"):
            return DEFAULT_MARKUP
        return markup


def _apply_markup(trade_price: Decimal, markup_percentage: Decimal) -> Decimal:
    """Convert trade price to sell price using configured markup."""

    multiplier = Decimal("1") + markup_percentage
    return _to_money(trade_price * multiplier)


def calculate_invoice(
    *,
    translated_lines: list[str],
    receipt: ReceiptExtraction,
    vector_matches: list[MaterialMatch],
    default_labor_rate: Decimal,
    markup_percentage: Decimal,
) -> InvoiceDraft:
    """Calculate invoice using sell prices for materials and standard labor pricing."""

    invoice_lines: list[InvoiceLineDraft] = []
    material_price_lookup = {match.query: match.trade_price for match in vector_matches}

    for description in translated_lines:
        qty = Decimal("1.00")
        matched_trade_price = material_price_lookup.get(description)
        if matched_trade_price is not None:
            unit_price = _apply_markup(matched_trade_price, markup_percentage)
            line_type = "Material"
        else:
            unit_price = _to_money(default_labor_rate)
            line_type = "Labor"

        invoice_lines.append(
            InvoiceLineDraft(
                description=description,
                qty=qty,
                unit_price=unit_price,
                line_total=calculate_line_total(qty=qty, unit_price=unit_price),
                type=line_type,
            )
        )

    for receipt_item in receipt.line_items:
        sell_unit_price = _apply_markup(receipt_item.unit_price, markup_percentage)
        invoice_lines.append(
            InvoiceLineDraft(
                description=receipt_item.description,
                qty=receipt_item.quantity,
                unit_price=sell_unit_price,
                line_total=calculate_line_total(qty=receipt_item.quantity, unit_price=sell_unit_price),
                type="Material",
            )
        )

    totals = calculate_invoice_totals(
        InvoiceMathLine(qty=line.qty, unit_price=line.unit_price)
        for line in invoice_lines
    )
    return InvoiceDraft(invoice_lines=invoice_lines, totals=totals, markup_percentage=markup_percentage)
