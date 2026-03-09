"""Kiwi slang translation service for SparkOps voice-to-cash ingestion.

This module converts informal NZ electrician language into professional invoice
line descriptions suitable for customer-facing invoicing.
"""

from __future__ import annotations

import json
import os
from typing import Any

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - compatibility with legacy OpenAI SDK
    OpenAI = None  # type: ignore[assignment]

SYSTEM_PROMPT = "You are a professional NZ Quantity Surveyor. Translate slang to professional line items."

HARD_CODED_TRANSLATIONS: dict[str, str] = {
    "installed hot water cylinder in cupboard": "Installed Horizontal Hot Water Cylinder.",
    "hot water cylinder in cupboard": "Installed Horizontal Hot Water Cylinder.",
    "ran some 2.5 twin and earth": "Installed 2.5mm TPS Cable.",
    "stuck a jbox in the roof": "Installed Junction Box in Ceiling Cavity.",
}


class KiwiTranslator:
    """Translate NZ electrician slang into professional invoice descriptions.

    The engine prioritizes deterministic hardcoded mappings for known critical
    phrases and uses ``gpt-5.4`` for nuanced extraction. A ``gpt-5-nano`` pass
    is used as a low-cost fallback when response formatting needs repair.
    """

    def __init__(self, api_key: str | None = None) -> None:
        """Initialize the translator.

        Args:
            api_key: Optional OpenAI API key. If omitted, ``OPENAI_API_KEY`` is used.
        """

        self.api_key = api_key or os.getenv("OPENAI_API_KEY")

    def _get_client(self) -> OpenAI:
        """Create an OpenAI client on demand.

        Returns:
            OpenAI: Configured OpenAI client.

        Raises:
            RuntimeError: If no API key is configured.
        """

        if OpenAI is None:
            raise RuntimeError("OpenAI SDK >= 1.0.0 is required. Install `openai` from requirements.txt.")
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is required for AI translation calls.")
        return OpenAI(api_key=self.api_key)

    def translate_notes(self, raw_notes: str) -> list[str]:
        """Translate free-form notes into normalized professional line items.

        Args:
            raw_notes: Raw transcript or typed sparky notes.

        Returns:
            list[str]: Professional invoice-ready line descriptions.
        """

        normalized = raw_notes.strip().lower()
        if not normalized:
            return []

        if normalized in HARD_CODED_TRANSLATIONS:
            return [HARD_CODED_TRANSLATIONS[normalized]]

        for slang, professional in HARD_CODED_TRANSLATIONS.items():
            if slang in normalized:
                return [professional]

        response_text = self._translate_with_reasoning_model(raw_notes)
        if not str(response_text).strip():
            return []

        parsed = self._safe_parse_line_items(response_text)
        if parsed:
            return parsed

        fallback_text = self._format_with_nano(raw_notes, response_text)
        fallback_parsed = self._safe_parse_line_items(fallback_text)
        if fallback_parsed:
            return fallback_parsed

        return [line.strip() for line in response_text.splitlines() if line.strip()]

    def _translate_with_reasoning_model(self, raw_notes: str) -> str:
        """Call ``gpt-5.4`` for contextual slang translation.

        Args:
            raw_notes: Raw user work notes.

        Returns:
            str: Model response text expected to contain JSON line items.
        """

        client = self._get_client()
        response = client.responses.create(
            model="gpt-5.4",
            input=[
                {
                    "role": "system",
                    "content": [
                        {"type": "input_text", "text": SYSTEM_PROMPT},
                        {
                            "type": "input_text",
                            "text": (
                                "Examples:\n"
                                "- Installed hot water cylinder in cupboard => Installed Horizontal Hot Water Cylinder.\n"
                                "- Sparky installed new hot water cylinder => Installed Horizontal Hot Water Cylinder.\n"
                                "- Ran some 2.5 twin and earth => Installed 2.5mm TPS Cable.\n"
                                "- Chippie and spark-chaser fitted jbox in roof => Installed Junction Box in Ceiling Cavity."
                            ),
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Translate this into professional invoice lines and return strict JSON:\n"
                                '{"line_items": ["..."]}\n\n'
                                f"Notes: {raw_notes}"
                            ),
                        }
                    ],
                },
            ],
        )
        return response.output_text

    def _format_with_nano(self, raw_notes: str, unstructured_text: str) -> str:
        """Repair output into strict JSON using ``gpt-5-nano``.

        Args:
            raw_notes: Original input notes.
            unstructured_text: First-pass reasoning output.

        Returns:
            str: JSON string in ``{"line_items": [...]}`` shape.
        """

        client = self._get_client()
        response = client.responses.create(
            model="gpt-5-nano",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Convert content to strict JSON only. No prose.",
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Return JSON exactly as {\"line_items\": [\"...\"]}.\n"
                                f"Original notes: {raw_notes}\n"
                                f"Model output: {unstructured_text}"
                            ),
                        }
                    ],
                },
            ],
        )
        return response.output_text

    @staticmethod
    def _safe_parse_line_items(text: str) -> list[str]:
        """Parse strict JSON payload if available.

        Args:
            text: Candidate JSON text.

        Returns:
            list[str]: Parsed line items, or empty list if parsing fails.
        """

        try:
            payload: dict[str, Any] = json.loads(text)
        except (TypeError, json.JSONDecodeError):
            return []

        items = payload.get("line_items")
        if not isinstance(items, list):
            return []

        return [str(item).strip() for item in items if str(item).strip()]
