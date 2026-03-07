"""Unit tests for Kiwi slang translator mappings."""

from __future__ import annotations

from services.translator import KiwiTranslator


def test_translator_maps_hori_phrase_exactly() -> None:
    """Map canonical Hori phrase to professional invoice description."""

    translator = KiwiTranslator(api_key=None)
    translated = translator.translate_notes("Hori in the cupboard")
    assert translated == ["Installed Horizontal Hot Water Cylinder."]


def test_translator_maps_embedded_known_slang_without_api_call() -> None:
    """Map known slang even when embedded in a longer sentence."""

    translator = KiwiTranslator(api_key=None)
    translated = translator.translate_notes("Today we stuck a jbox in the roof and wrapped up")
    assert translated == ["Installed Junction Box in Ceiling Cavity."]
