"""Invoice pricing service with global markup support."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Protocol

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


@dataclass(frozen=True)
class JobDraftInvoiceSummary:
    """Invoice summary for JobDraft extracted line items."""

    subtotal: Decimal
    markup_amount: Decimal
    gst: Decimal
    total: Decimal
    material_cost_base: Decimal
    material_cost_with_markup: Decimal
    labor_total: Decimal


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


def _parse_decimal(raw: Any, default: Decimal = Decimal("0.00")) -> Decimal:
    """Parse unknown numeric input into Decimal with safe fallback."""

    if raw is None:
        return default
    try:
        text = str(raw).strip()
        if not text:
            return default
        normalized = text.replace("$", "").replace(",", "")
        return Decimal(normalized)
    except Exception:
        return default


def calculate_job_draft_invoice_summary(
    *,
    extracted_data: dict[str, Any],
    markup_percentage: Decimal,
    default_labor_rate: Decimal,
) -> JobDraftInvoiceSummary:
    """Calculate subtotal/markup/GST totals from extracted JobDraft line items."""

    line_items = extracted_data.get("line_items", []) if isinstance(extracted_data, dict) else []
    if not isinstance(line_items, list):
        line_items = []

    material_base = Decimal("0.00")
    labor_total = Decimal("0.00")

    for item in line_items:
        if not isinstance(item, dict):
            continue

        item_type = str(item.get("type", "LABOR")).strip().upper()
        qty = _parse_decimal(item.get("qty"), Decimal("1.00"))
        if qty <= 0:
            qty = Decimal("1.00")

        line_total = _parse_decimal(item.get("line_total"), Decimal("0.00"))
        unit_price = _parse_decimal(item.get("unit_price"), Decimal("0.00"))

        if line_total <= 0:
            if unit_price <= 0 and item_type == "LABOR":
                unit_price = default_labor_rate
            line_total = calculate_line_total(qty=qty, unit_price=unit_price)

        if item_type == "MATERIAL":
            material_base += line_total
        else:
            labor_total += line_total

    material_base = _to_money(material_base)
    labor_total = _to_money(labor_total)
    markup_amount = _to_money(material_base * markup_percentage)
    material_with_markup = _to_money(material_base + markup_amount)
    subtotal = _to_money(labor_total + material_with_markup)
    gst = _to_money(subtotal * Decimal("0.15"))
    total = _to_money(subtotal + gst)

    return JobDraftInvoiceSummary(
        subtotal=subtotal,
        markup_amount=markup_amount,
        gst=gst,
        total=total,
        material_cost_base=material_base,
        material_cost_with_markup=material_with_markup,
        labor_total=labor_total,
    )


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
