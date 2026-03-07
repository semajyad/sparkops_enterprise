"""PDF invoice generation for JobDraft records."""

from __future__ import annotations

import io
from decimal import Decimal
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlmodel import Session, select
from sqlalchemy.engine import Engine

from models.database import Material, UserSettings
from services.math_utils import InvoiceMathLine, calculate_invoice_totals, calculate_line_total

DEFAULT_MARKUP = Decimal("0.20")
DEFAULT_LABOR_RATE = Decimal("95.00")


def _to_decimal(value: Any, fallback: Decimal) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return fallback


def _to_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _get_markup(engine: Engine) -> Decimal:
    with Session(engine) as session:
        settings = session.get(UserSettings, 1)
        if settings is None:
            return DEFAULT_MARKUP
        return settings.default_markup if settings.default_markup >= Decimal("0") else DEFAULT_MARKUP


def _resolve_material_trade_price(engine: Engine, description: str) -> Decimal | None:
    with Session(engine) as session:
        row = session.exec(
            select(Material)
            .where(Material.name.ilike(f"%{description}%"))
            .limit(1)
        ).first()
        if row is None:
            return None
        return row.trade_price


def _extract_invoice_lines(job_data: Any, engine: Engine) -> list[dict[str, Any]]:
    extracted = job_data.extracted_data if isinstance(job_data.extracted_data, dict) else {}
    raw_lines = extracted.get("line_items", [])
    markup = _get_markup(engine)

    lines: list[dict[str, Any]] = []
    for row in raw_lines:
        if not isinstance(row, dict):
            continue
        description = str(row.get("description", "")).strip() or "Unspecified item"
        qty = _to_decimal(row.get("qty", "1"), Decimal("1"))
        line_type = str(row.get("type", "LABOR")).upper()

        explicit_unit_price = row.get("unit_price")
        if explicit_unit_price is not None:
            unit_price = _to_money(_to_decimal(explicit_unit_price, DEFAULT_LABOR_RATE))
        elif line_type == "MATERIAL":
            trade_price = _resolve_material_trade_price(engine, description)
            if trade_price is None:
                trade_price = Decimal("0.00")
            unit_price = _to_money(trade_price * (Decimal("1") + markup))
        else:
            unit_price = DEFAULT_LABOR_RATE

        line_total = calculate_line_total(qty=qty, unit_price=unit_price)
        lines.append(
            {
                "description": description,
                "qty": qty,
                "unit_price": unit_price,
                "line_total": line_total,
            }
        )

    return lines


def generate_invoice_pdf(job_data: Any, engine: Engine) -> bytes:
    """Generate a professional invoice PDF for a JobDraft-like object."""

    lines = _extract_invoice_lines(job_data, engine)
    totals = calculate_invoice_totals(
        InvoiceMathLine(qty=line["qty"], unit_price=line["unit_price"]) for line in lines
    )

    extracted = job_data.extracted_data if isinstance(job_data.extracted_data, dict) else {}
    client_name = str(extracted.get("client", "Client")).strip() or "Client"
    client_address = str(extracted.get("address", "")).strip() or "Address not provided"

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 24 * mm

    # Header
    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.rect(0, height - 34 * mm, width, 34 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(16 * mm, height - 20 * mm, "SparkOps")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(16 * mm, height - 26 * mm, "Sparky Electrical Ltd")
    pdf.drawString(16 * mm, height - 30 * mm, "sales@sparkops.nz | +64 21 000 0000")

    y -= 22 * mm

    # Client block
    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(16 * mm, y, "Bill To")
    y -= 6 * mm
    pdf.setFont("Helvetica", 11)
    pdf.drawString(16 * mm, y, client_name)
    y -= 5 * mm
    pdf.drawString(16 * mm, y, client_address)
    y -= 10 * mm

    # Table header
    pdf.setFillColor(colors.HexColor("#e2e8f0"))
    pdf.rect(14 * mm, y - 6 * mm, width - 28 * mm, 8 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(16 * mm, y - 3 * mm, "Description")
    pdf.drawRightString(140 * mm, y - 3 * mm, "Qty")
    pdf.drawRightString(170 * mm, y - 3 * mm, "Unit Price")
    pdf.drawRightString(196 * mm, y - 3 * mm, "Total")

    y -= 11 * mm
    pdf.setFont("Helvetica", 10)

    for line in lines:
        if y < 48 * mm:
            pdf.showPage()
            y = height - 24 * mm
        pdf.setFillColor(colors.black)
        pdf.drawString(16 * mm, y, line["description"][:52])
        pdf.drawRightString(140 * mm, y, f"{line['qty']}")
        pdf.drawRightString(170 * mm, y, f"${line['unit_price']}")
        pdf.drawRightString(196 * mm, y, f"${line['line_total']}")
        y -= 6 * mm

    # Totals footer
    y -= 4 * mm
    pdf.line(130 * mm, y, 196 * mm, y)
    y -= 6 * mm

    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(170 * mm, y, "Subtotal")
    pdf.drawRightString(196 * mm, y, f"${_to_money(totals.subtotal)}")
    y -= 6 * mm

    pdf.drawRightString(170 * mm, y, "GST (15%)")
    pdf.drawRightString(196 * mm, y, f"${_to_money(totals.gst)}")
    y -= 7 * mm

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(170 * mm, y, "Grand Total")
    pdf.drawRightString(196 * mm, y, f"${_to_money(totals.total)}")

    pdf.showPage()
    pdf.save()

    return buffer.getvalue()
