"""Supplementary translator tests aligned to current responses API implementation."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from services.translator import HARD_CODED_TRANSLATIONS, KiwiTranslator, SYSTEM_PROMPT


def test_constants_have_expected_shape() -> None:
    assert isinstance(HARD_CODED_TRANSLATIONS, dict)
    assert "Quantity Surveyor" in SYSTEM_PROMPT


def test_get_client_uses_provided_api_key() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch("services.translator.OpenAI") as mock_openai:
        translator._get_client()
    mock_openai.assert_called_once_with(api_key="test-key")


def test_get_client_raises_when_sdk_unavailable() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch("services.translator.OpenAI", None):
        with pytest.raises(RuntimeError, match="OpenAI SDK >= 1.0.0"):
            translator._get_client()


def test_translate_notes_returns_first_embedded_hardcoded_match() -> None:
    translator = KiwiTranslator(api_key=None)
    result = translator.translate_notes(
        "installed hot water cylinder in cupboard and ran some 2.5 twin and earth"
    )
    assert result == ["Installed Horizontal Hot Water Cylinder."]


def test_translate_notes_returns_empty_when_reasoning_output_blank() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch.object(translator, "_translate_with_reasoning_model", return_value="  "):
        with patch.object(translator, "_format_with_nano") as mock_nano:
            assert translator.translate_notes("unknown") == []
            mock_nano.assert_not_called()


def test_translate_notes_returns_fallback_lines_after_nano_parse_miss() -> None:
    translator = KiwiTranslator(api_key="test-key")
    with patch.object(translator, "_translate_with_reasoning_model", return_value="Line A\n\nLine B"):
        with patch.object(translator, "_format_with_nano", return_value="{bad-json}"):
            assert translator.translate_notes("unknown") == ["Line A", "Line B"]


def test_translate_reasoning_payload_contains_raw_notes() -> None:
    translator = KiwiTranslator(api_key="test-key")
    mock_client = Mock()
    mock_client.responses.create.return_value.output_text = "ok"

    with patch.object(translator, "_get_client", return_value=mock_client):
        translator._translate_with_reasoning_model("job details")

    call_kwargs = mock_client.responses.create.call_args.kwargs
    assert call_kwargs["model"] == "gpt-5.4"
    assert "Notes: job details" in str(call_kwargs["input"])


def test_translate_nano_payload_contains_unstructured_text() -> None:
    translator = KiwiTranslator(api_key="test-key")
    mock_client = Mock()
    mock_client.responses.create.return_value.output_text = "ok"

    with patch.object(translator, "_get_client", return_value=mock_client):
        translator._format_with_nano("raw", "messy-output")

    call_kwargs = mock_client.responses.create.call_args.kwargs
    assert call_kwargs["model"] == "gpt-5-nano"
    assert "messy-output" in str(call_kwargs["input"])


def test_safe_parse_line_items_stringifies_non_string_entries() -> None:
    parsed = KiwiTranslator._safe_parse_line_items('{"line_items": [1, true, "ok"]}')
    assert parsed == ["1", "True", "ok"]