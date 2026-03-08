"""Unit tests for Kiwi slang translator mappings."""

from __future__ import annotations

from services.translator import KiwiTranslator


def test_translator_maps_hot_water_cylinder_phrase_exactly() -> None:
    """Map canonical hot water cylinder phrase to professional invoice description."""

    translator = KiwiTranslator(api_key=None)
    translated = translator.translate_notes("Hot water cylinder in cupboard")
    assert translated == ["Installed Horizontal Hot Water Cylinder."]


def test_translator_maps_embedded_known_slang_without_api_call() -> None:
    """Map known slang even when embedded in a longer sentence."""

    translator = KiwiTranslator(api_key=None)
    translated = translator.translate_notes("Today we stuck a jbox in the roof and wrapped up")
    assert translated == ["Installed Junction Box in Ceiling Cavity."]
