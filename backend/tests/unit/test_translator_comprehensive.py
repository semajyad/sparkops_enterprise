"""Deterministic tests for translator service behavior and branches."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from services.translator import HARD_CODED_TRANSLATIONS, KiwiTranslator


def test_translate_notes_returns_empty_for_blank_inputs() -> None:
    translator = KiwiTranslator(api_key="test-key")
    assert translator.translate_notes("") == []
    assert translator.translate_notes("   \n\t ") == []


def test_translate_notes_uses_exact_hardcoded_mapping() -> None:
    translator = KiwiTranslator(api_key=None)
    assert translator.translate_notes("hot water cylinder in cupboard") == [
        "Installed Horizontal Hot Water Cylinder."
    ]


def test_translate_notes_uses_embedded_hardcoded_mapping() -> None:
    translator = KiwiTranslator(api_key=None)
    assert translator.translate_notes("today we stuck a jbox in the roof") == [
        "Installed Junction Box in Ceiling Cavity."
    ]


def test_translate_notes_returns_parsed_json_from_reasoning_model() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch.object(
        translator,
        "_translate_with_reasoning_model",
        return_value='{"line_items": ["Installed New Lighting."]}',
    ):
        assert translator.translate_notes("custom work") == ["Installed New Lighting."]


def test_translate_notes_uses_nano_fallback_when_reasoning_is_not_json() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch.object(translator, "_translate_with_reasoning_model", return_value="not-json"):
        with patch.object(
            translator,
            "_format_with_nano",
            return_value='{"line_items": ["Formatted line"]}',
        ) as mock_nano:
            assert translator.translate_notes("custom work") == ["Formatted line"]
            mock_nano.assert_called_once_with("custom work", "not-json")


def test_translate_notes_falls_back_to_split_lines_when_json_parsing_fails() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch.object(
        translator,
        "_translate_with_reasoning_model",
        return_value="Line 1\n\nLine 2",
    ):
        with patch.object(translator, "_format_with_nano", return_value="still-not-json"):
            assert translator.translate_notes("custom work") == ["Line 1", "Line 2"]


def test_get_client_raises_when_api_key_missing() -> None:
    translator = KiwiTranslator(api_key=None)
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
        translator._get_client()


def test_translate_with_reasoning_model_calls_responses_api() -> None:
    translator = KiwiTranslator(api_key="test-key")
    mock_client = Mock()
    mock_client.responses.create.return_value.output_text = "ok"

    with patch.object(translator, "_get_client", return_value=mock_client):
        assert translator._translate_with_reasoning_model("raw notes") == "ok"
        mock_client.responses.create.assert_called_once()


def test_format_with_nano_calls_responses_api() -> None:
    translator = KiwiTranslator(api_key="test-key")
    mock_client = Mock()
    mock_client.responses.create.return_value.output_text = "formatted"

    with patch.object(translator, "_get_client", return_value=mock_client):
        assert translator._format_with_nano("raw", "unstructured") == "formatted"
        mock_client.responses.create.assert_called_once()


def test_safe_parse_line_items_handles_invalid_and_non_string_payloads() -> None:
    assert KiwiTranslator._safe_parse_line_items("invalid json") == []
    assert KiwiTranslator._safe_parse_line_items(None) == []
    assert KiwiTranslator._safe_parse_line_items('{"line_items": "not-list"}') == []


def test_safe_parse_line_items_filters_blank_items() -> None:
    parsed = KiwiTranslator._safe_parse_line_items('{"line_items": ["a", "", "  ", "b"]}')
    assert parsed == ["a", "b"]


def test_hardcoded_translations_are_all_accessible() -> None:
    translator = KiwiTranslator(api_key=None)
    for phrase, expected in HARD_CODED_TRANSLATIONS.items():
        assert translator.translate_notes(phrase) == [expected]