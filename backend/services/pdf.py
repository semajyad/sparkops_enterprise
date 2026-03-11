"""PDF invoice generation for JobDraft records."""

from __future__ import annotations

import io
from datetime import datetime
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


def generate_certificate_pdf(job_data: Any, safety_tests: list[dict[str, Any]]) -> bytes:
    """Generate an Electrical Safety Certificate PDF for a completed compliant job."""

    extracted = job_data.extracted_data if isinstance(job_data.extracted_data, dict) else {}
    client_name = str(extracted.get("client", "Client")).strip() or "Client"
    address = str(extracted.get("address") or extracted.get("location") or "Address not provided").strip()

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 24 * mm

    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.rect(0, height - 34 * mm, width, 34 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(16 * mm, height - 20 * mm, "Electrical Safety Certificate")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(16 * mm, height - 26 * mm, "AS/NZS 3000:2018 Compliance Evidence")

    y -= 22 * mm
    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(16 * mm, y, "Client")
    y -= 6 * mm
    pdf.setFont("Helvetica", 11)
    pdf.drawString(16 * mm, y, client_name)
    y -= 5 * mm
    pdf.drawString(16 * mm, y, address)
    y -= 8 * mm
    pdf.drawString(16 * mm, y, f"Issued: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    y -= 10 * mm

    pdf.setFillColor(colors.HexColor("#e2e8f0"))
    pdf.rect(14 * mm, y - 6 * mm, width - 28 * mm, 8 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(16 * mm, y - 3 * mm, "Safety Test")
    pdf.drawString(78 * mm, y - 3 * mm, "Result")
    pdf.drawString(112 * mm, y - 3 * mm, "Value")
    pdf.drawString(148 * mm, y - 3 * mm, "Unit")
    pdf.drawString(170 * mm, y - 3 * mm, "GPS")

    y -= 11 * mm
    pdf.setFont("Helvetica", 10)

    if not safety_tests:
        pdf.drawString(16 * mm, y, "No safety tests recorded.")
        y -= 6 * mm
    else:
        for test in safety_tests:
            if y < 40 * mm:
                pdf.showPage()
                y = height - 24 * mm
            test_type = str(test.get("test_type") or test.get("type") or "-")
            result = str(test.get("result") or "-")
            value = str(test.get("value_text") or test.get("value") or "-")
            unit = str(test.get("unit") or "-")
            gps_lat = test.get("gps_lat")
            gps_lng = test.get("gps_lng")
            gps = "-"
            if gps_lat is not None and gps_lng is not None:
                gps = f"{gps_lat},{gps_lng}"

            pdf.drawString(16 * mm, y, test_type[:28])
            pdf.drawString(78 * mm, y, result[:14])
            pdf.drawString(112 * mm, y, value[:18])
            pdf.drawString(148 * mm, y, unit[:10])
            pdf.drawString(170 * mm, y, gps[:26])
            y -= 6 * mm

    y -= 8 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.setFillColor(colors.HexColor("#065f46"))
    pdf.drawString(16 * mm, y, "Compliance Status: GREEN SHIELD")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def generate_sssp_pdf(*, job_data: Any, trade: str, plan_json: dict[str, Any]) -> bytes:
    """Generate a Site Specific Safety Plan (SSSP) PDF."""

    extracted = job_data.extracted_data if isinstance(job_data.extracted_data, dict) else {}
    client_name = str(extracted.get("client", "Client")).strip() or "Client"
    address = str(extracted.get("address") or extracted.get("location") or "Address not provided").strip()
    hazards = plan_json.get("hazards", []) if isinstance(plan_json, dict) else []
    controls = plan_json.get("controls", []) if isinstance(plan_json, dict) else []
    signoff = plan_json.get("signoff_checklist", []) if isinstance(plan_json, dict) else []
    emergency_plan = str(plan_json.get("emergency_plan") or "Call 111, isolate hazard, notify supervisor.").strip()

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 24 * mm

    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.rect(0, height - 34 * mm, width, 34 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(16 * mm, height - 20 * mm, "Site Specific Safety Plan (SSSP)")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(16 * mm, height - 26 * mm, "WorkSafe NZ pre-job safety check")

    y -= 22 * mm
    pdf.setFillColor(colors.HexColor("#0f172a"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(16 * mm, y, "Job Context")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(16 * mm, y, f"Client: {client_name}")
    y -= 5 * mm
    pdf.drawString(16 * mm, y, f"Address: {address}")
    y -= 5 * mm
    pdf.drawString(16 * mm, y, f"Trade: {(trade or 'ELECTRICAL').upper()}")
    y -= 5 * mm
    pdf.drawString(16 * mm, y, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")

    y -= 10 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(16 * mm, y, "Primary Hazards")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    for hazard in hazards[:8] if isinstance(hazards, list) else []:
        if y < 35 * mm:
            pdf.showPage()
            y = height - 24 * mm
            pdf.setFont("Helvetica", 10)
        pdf.drawString(18 * mm, y, f"- {str(hazard)[:100]}")
        y -= 5 * mm

    y -= 3 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(16 * mm, y, "Controls & Mitigations")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    for control in controls[:10] if isinstance(controls, list) else []:
        if y < 35 * mm:
            pdf.showPage()
            y = height - 24 * mm
            pdf.setFont("Helvetica", 10)
        pdf.drawString(18 * mm, y, f"- {str(control)[:100]}")
        y -= 5 * mm

    y -= 3 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(16 * mm, y, "Emergency Plan")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(18 * mm, y, emergency_plan[:110])

    y -= 10 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(16 * mm, y, "Pre-Start Signoff Checklist")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    for item in signoff[:8] if isinstance(signoff, list) else []:
        if y < 25 * mm:
            pdf.showPage()
            y = height - 24 * mm
            pdf.setFont("Helvetica", 10)
        pdf.drawString(18 * mm, y, f"[ ] {str(item)[:100]}")
        y -= 5 * mm

    y -= 8 * mm
    pdf.setFillColor(colors.HexColor("#065f46"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(16 * mm, y, "Status: READY FOR PRE-START ACKNOWLEDGEMENT")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
