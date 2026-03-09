"""Unit tests for Kiwi slang translator mappings."""

from __future__ import annotations

from unittest.mock import Mock, patch
import pytest

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


def test_translator_handles_empty_input() -> None:
    """Return empty list for empty or whitespace-only input."""

    translator = KiwiTranslator(api_key=None)
    assert translator.translate_notes("") == []
    assert translator.translate_notes("   ") == []


def test_translator_handles_unknown_slang_with_api_key() -> None:
    """Fallback to AI translation for unknown slang when API key provided."""

    mock_client = Mock()
    mock_response = Mock()
    mock_response.output_text = '{"line_items": ["Custom Electrical Work"]}'
    mock_client.responses.create.return_value = mock_response

    translator = KiwiTranslator(api_key="test-key")
    
    with patch.object(translator, '_get_client', return_value=mock_client):
        result = translator.translate_notes("some unknown slang phrase")
        assert result == ["Custom Electrical Work"]


def test_translator_fallback_to_split_lines_on_json_error() -> None:
    """Split into lines when JSON parsing fails."""

    mock_client = Mock()
    mock_response = Mock()
    mock_response.output_text = "Line 1\nLine 2\nLine 3"
    mock_client.responses.create.return_value = mock_response

    translator = KiwiTranslator(api_key="test-key")
    
    with patch.object(translator, '_get_client', return_value=mock_client):
        result = translator.translate_notes("unknown phrase")
        assert result == ["Line 1", "Line 2", "Line 3"]


def test_translator_normalizes_case_for_hardcoded_mappings() -> None:
    """Match hardcoded translations regardless of case."""

    translator = KiwiTranslator(api_key=None)
    
    # Test various cases
    assert translator.translate_notes("HOT WATER CYLINDER IN CUPBOARD") == ["Installed Horizontal Hot Water Cylinder."]
    assert translator.translate_notes("Hot Water Cylinder In Cupboard") == ["Installed Horizontal Hot Water Cylinder."]
    assert translator.translate_notes("hot water cylinder in cupboard") == ["Installed Horizontal Hot Water Cylinder."]


def test_translator_raises_error_without_api_key_for_unknown() -> None:
    """Raise error when API key is None and unknown slang needs translation."""

    translator = KiwiTranslator(api_key=None)
    
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
        translator.translate_notes("completely unknown electrical slang phrase")


def test_safe_parse_line_items_handles_invalid_json() -> None:
    """Return empty list for invalid JSON."""

    assert KiwiTranslator._safe_parse_line_items("invalid json") == []
    assert KiwiTranslator._safe_parse_line_items('{"not_line_items": ["test"]}') == []
    assert KiwiTranslator._safe_parse_line_items('{"line_items": "not a list"}') == []


def test_safe_parse_line_items_handles_valid_json() -> None:
    """Parse valid JSON line items correctly."""

    json_input = '{"line_items": ["Item 1", "Item 2", "Item 3"]}'
    result = KiwiTranslator._safe_parse_line_items(json_input)
    assert result == ["Item 1", "Item 2", "Item 3"]


def test_safe_parse_line_items_filters_empty_items() -> None:
    """Filter out empty and whitespace-only items."""

    json_input = '{"line_items": ["Item 1", "", "  ", "Item 2"]}'
    result = KiwiTranslator._safe_parse_line_items(json_input)
    assert result == ["Item 1", "Item 2"]
