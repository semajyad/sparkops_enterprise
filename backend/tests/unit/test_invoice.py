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
