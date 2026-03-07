"""Receipt vision extraction service for SparkOps ingestion.

This module extracts supplier, date, and item lines from receipt images while
applying deterministic trade-vs-retail price selection rules.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - compatibility with legacy OpenAI SDK
    OpenAI = None  # type: ignore[assignment]


@dataclass(frozen=True)
class ReceiptLineItem:
    """A normalized receipt line item.

    Attributes:
        description: Human-readable line description from receipt text.
        quantity: Parsed quantity (defaults to 1 if unknown).
        unit_price: Selected lowest available price as Decimal.
    """

    description: str
    quantity: Decimal
    unit_price: Decimal


@dataclass(frozen=True)
class ReceiptExtraction:
    """Structured receipt extraction payload.

    Attributes:
        supplier: Supplier name, typically J.A. Russell or Corys.
        date: Receipt date in detected format.
        line_items: Normalized line items with trade-optimized pricing.
    """

    supplier: str
    date: str
    line_items: list[ReceiptLineItem]


class ReceiptVisionEngine:
    """Extract structured receipt data from base64 images using ``gpt-5.4``."""

    def __init__(self, api_key: str | None = None) -> None:
        """Initialize the vision engine.

        Args:
            api_key: Optional OpenAI API key override.
        """

        self.api_key = api_key or os.getenv("OPENAI_API_KEY")

    def _get_client(self) -> OpenAI:
        """Create an OpenAI client lazily.

        Returns:
            OpenAI: Configured client.

        Raises:
            RuntimeError: If API key is missing.
        """

        if OpenAI is None:
            raise RuntimeError("OpenAI SDK >= 1.0.0 is required. Install `openai` from requirements.txt.")
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is required for receipt vision extraction.")
        return OpenAI(api_key=self.api_key)

    def extract_receipt(self, image_base64: str) -> ReceiptExtraction:
        """Extract supplier, date, and line items from a receipt image.

        Args:
            image_base64: Base64-encoded image bytes (PNG/JPEG etc).

        Returns:
            ReceiptExtraction: Structured extraction with trade-safe pricing.
        """

        client = self._get_client()
        response = client.responses.create(
            model="gpt-5.4",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Extract Supplier, Date, and Line Items from this receipt. "
                                "When both Trade Price and Retail Price exist, always output "
                                "the lowest numerical value as unit_price. Return strict JSON: "
                                '{"supplier":"","date":"","line_items":[{"description":"",'
                                '"quantity":1,"trade_price":"","retail_price":"","unit_price":""}]}'
                            ),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Extract receipt details and keep numeric values parseable.",
                        },
                        {
                            "type": "input_image",
                            "image_url": f"data:image/jpeg;base64,{image_base64}",
                        },
                    ],
                },
            ],
        )

        payload = self._safe_json(response.output_text)
        supplier = str(payload.get("supplier", "")).strip()
        date = str(payload.get("date", "")).strip()

        items: list[ReceiptLineItem] = []
        for item in payload.get("line_items", []):
            if not isinstance(item, dict):
                continue
            description = str(item.get("description", "")).strip()
            if not description:
                continue

            quantity = self._to_decimal(item.get("quantity", "1"), default=Decimal("1"))
            trade_price = self._to_decimal(item.get("trade_price"), default=None)
            retail_price = self._to_decimal(item.get("retail_price"), default=None)
            explicit_price = self._to_decimal(item.get("unit_price"), default=None)

            unit_price = self._lowest_price(trade_price, retail_price, explicit_price)
            if unit_price is None:
                continue

            items.append(
                ReceiptLineItem(
                    description=description,
                    quantity=quantity,
                    unit_price=unit_price,
                )
            )

        return ReceiptExtraction(supplier=supplier, date=date, line_items=items)

    @staticmethod
    def _safe_json(text: str) -> dict[str, Any]:
        """Safely parse JSON text.

        Args:
            text: JSON candidate string.

        Returns:
            dict[str, Any]: Parsed object or empty dict.
        """

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def _to_decimal(value: Any, default: Decimal | None) -> Decimal | None:
        """Convert arbitrary value into Decimal.

        Args:
            value: Input numeric-like value.
            default: Value to return when parsing fails.

        Returns:
            Decimal | None: Parsed decimal or provided default.
        """

        if value is None:
            return default

        cleaned = str(value).strip().replace("$", "").replace(",", "")
        if not cleaned:
            return default

        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return default

    @staticmethod
    def _lowest_price(*prices: Decimal | None) -> Decimal | None:
        """Return the lowest positive price.

        Args:
            *prices: Candidate price values.

        Returns:
            Decimal | None: Lowest valid non-negative price.
        """

        valid_prices = [price for price in prices if price is not None and price >= Decimal("0")]
        if not valid_prices:
            return None
        return min(valid_prices)
