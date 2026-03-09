"""Comprehensive unit tests for translator service to achieve 85% coverage."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from services.translator import KiwiTranslator, HARD_CODED_TRANSLATIONS


def test_kiwi_translator_init_with_api_key() -> None:
    """Test KiwiTranslator initialization with provided API key."""
    translator = KiwiTranslator(api_key="test-key")
    assert translator.api_key == "test-key"


def test_kiwi_translator_init_without_api_key() -> None:
    """Test KiwiTranslator initialization without API key."""
    with patch.dict("os.environ", {"OPENAI_API_KEY": "env-key"}):
        translator = KiwiTranslator()
        assert translator.api_key == "env-key"


def test_kiwi_translator_init_missing_api_key() -> None:
    """Test KiwiTranslator initialization with missing API key."""
    with patch.dict("os.environ", {}, clear=True):
        translator = KiwiTranslator()
        assert translator.api_key is None


def test_get_client_success() -> None:
    """Test successful OpenAI client creation."""
    translator = KiwiTranslator(api_key="test-key")
    
    client = translator._get_client()
    assert client.api_key == "test-key"


def test_get_client_missing_api_key() -> None:
    """Test OpenAI client creation with missing API key."""
    translator = KiwiTranslator()
    
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required for AI translation calls"):
        translator._get_client()


def test_translate_notes_hardcoded_mapping() -> None:
    """Test translation using hardcoded mappings."""
    translator = KiwiTranslator(api_key="test-key")
    
    # Test known hardcoded translations
    raw_notes = "installed hot water cylinder in cupboard"
    result = translator.translate_notes(raw_notes)
    
    assert len(result) == 1
    assert result[0] == "Installed Horizontal Hot Water Cylinder."


def test_translate_notes_hardcoded_mapping_alternative() -> None:
    """Test translation using alternative hardcoded mapping."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "hot water cylinder in cupboard"
    result = translator.translate_notes(raw_notes)
    
    assert len(result) == 1
    assert result[0] == "Installed Horizontal Hot Water Cylinder."


def test_translate_notes_tps_cable_mapping() -> None:
    """Test TPS cable translation."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "ran some 2.5 twin and earth"
    result = translator.translate_notes(raw_notes)
    
    assert len(result) == 1
    assert result[0] == "Installed 2.5mm TPS Cable."


def test_translate_notes_jbox_mapping() -> None:
    """Test junction box translation."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "stuck a jbox in the roof"
    result = translator.translate_notes(raw_notes)
    
    assert len(result) == 1
    assert result[0] == "Installed Junction Box in Ceiling Cavity."


def test_translate_notes_with_ai_model() -> None:
    """Test translation using AI model for non-hardcoded phrases."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "fixed the dodgy switch in the hallway"
    
    with patch.object(translator, '_translate_with_reasoning_model', return_value="Repaired Hallway Switch.") as mock_translate:
        result = translator.translate_notes(raw_notes)
        
        mock_translate.assert_called_once_with(raw_notes)
        assert len(result) == 1
        assert result[0] == "Repaired Hallway Switch."


def test_translate_notes_empty_input() -> None:
    """Test translation with empty input."""
    translator = KiwiTranslator(api_key="test-key")
    
    result = translator.translate_notes("")
    assert result == []


def test_translate_notes_whitespace_only() -> None:
    """Test translation with whitespace-only input."""
    translator = KiwiTranslator(api_key="test-key")
    
    result = translator.translate_notes("   \n\t   ")
    assert result == []


def test_translate_notes_multiple_lines() -> None:
    """Test translation with multiple line items."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "installed hot water cylinder in cupboard\nran some 2.5 twin and earth"
    
    with patch.object(translator, '_translate_with_reasoning_model', return_value="Repaired Hallway Switch.\nInstalled Power Points.") as mock_translate:
        result = translator.translate_notes(raw_notes)
        
        assert len(result) == 2
        assert result[0] == "Repaired Hallway Switch."
        assert result[1] == "Installed Power Points."


def test_translate_with_reasoning_model_success() -> None:
    """Test successful translation with reasoning model."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "fixed the broken power point"
    
    with patch.object(translator, '_get_client') as mock_client:
        mock_response = Mock()
        mock_response.output_text = "Repaired Power Point."
        
        mock_client.return_value.responses.create.return_value = mock_response
        
        result = translator._translate_with_reasoning_model(raw_notes)
        
        assert result == "Repaired Power Point."
        mock_client.return_value.responses.create.assert_called_once()


def test_translate_with_reasoning_model_json_response() -> None:
    """Test translation with JSON response from reasoning model."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "installed new lighting"
    
    with patch.object(translator, '_get_client') as mock_client:
        mock_response = Mock()
        mock_response.output_text = '{"line_items": ["Installed New Lighting."]}'
        
        mock_client.return_value.responses.create.return_value = mock_response
        
        result = translator._translate_with_reasoning_model(raw_notes)
        
        # Should parse JSON and return first line item
        assert result == "Installed New Lighting."


def test_translate_with_reasoning_model_invalid_json() -> None:
    """Test translation with invalid JSON response."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "installed new lighting"
    
    with patch.object(translator, '_get_client') as mock_client:
        mock_response = Mock()
        mock_response.output_text = '{"invalid": json}'  # Invalid JSON
        
        mock_client.return_value.responses.create.return_value = mock_response
        
        # Should fall back to formatting with nano
        with patch.object(translator, '_format_with_nano', return_value="Installed New Lighting.") as mock_format:
            result = translator._translate_with_reasoning_model(raw_notes)
            
            mock_format.assert_called_once_with(raw_notes, '{"invalid": json}')
            assert result == "Installed New Lighting."


def test_format_with_nano_success() -> None:
    """Test successful formatting with nano model."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "installed new lighting"
    unstructured_text = "some unstructured text"
    
    with patch.object(translator, '_get_client') as mock_client:
        mock_response = Mock()
        mock_response.output_text = "Installed New Lighting."
        
        mock_client.return_value.responses.create.return_value = mock_response
        
        result = translator._format_with_nano(raw_notes, unstructured_text)
        
        assert result == "Installed New Lighting."


def test_format_with_nano_json_response() -> None:
    """Test formatting with JSON response from nano model."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "installed new lighting"
    unstructured_text = "some unstructured text"
    
    with patch.object(translator, '_get_client') as mock_client:
        mock_response = Mock()
        mock_response.output_text = '{"line_items": ["Installed New Lighting."]}'
        
        mock_client.return_value.responses.create.return_value = mock_response
        
        result = translator._format_with_nano(raw_notes, unstructured_text)
        
        assert result == "Installed New Lighting."


def test_safe_parse_line_items_valid_json() -> None:
    """Test parsing valid JSON line items."""
    json_text = '{"line_items": ["Item 1", "Item 2"]}'
    
    result = KiwiTranslator._safe_parse_line_items(json_text)
    
    assert result == ["Item 1", "Item 2"]


def test_safe_parse_line_items_invalid_json() -> None:
    """Test parsing invalid JSON line items."""
    invalid_json = '{"invalid": json}'
    
    result = KiwiTranslator._safe_parse_line_items(invalid_json)
    
    assert result == []


def test_safe_parse_line_items_non_json_text() -> None:
    """Test parsing non-JSON text."""
    plain_text = "Just some plain text"
    
    result = KiwiTranslator._safe_parse_line_items(plain_text)
    
    assert result == []


def test_safe_parse_line_items_empty_json() -> None:
    """Test parsing empty JSON array."""
    empty_json = '{"line_items": []}'
    
    result = KiwiTranslator._safe_parse_line_items(empty_json)
    
    assert result == []


def test_safe_parse_line_items_missing_line_items() -> None:
    """Test parsing JSON without line_items field."""
    json_without_items = '{"other_field": "value"}'
    
    result = KiwiTranslator._safe_parse_line_items(json_without_items)
    
    assert result == []


def test_translate_notes_with_special_characters() -> None:
    """Test translation with special characters."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "fixed the @#$% switch"
    
    with patch.object(translator, '_translate_with_reasoning_model', return_value="Repaired Switch.") as mock_translate:
        result = translator.translate_notes(raw_notes)
        
        mock_translate.assert_called_once_with(raw_notes)
        assert len(result) == 1
        assert result[0] == "Repaired Switch."


def test_translate_notes_with_numbers() -> None:
    """Test translation with numbers in notes."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "installed 3 new power points"
    
    with patch.object(translator, '_translate_with_reasoning_model', return_value="Installed 3 Power Points.") as mock_translate:
        result = translator.translate_notes(raw_notes)
        
        mock_translate.assert_called_once_with(raw_notes)
        assert len(result) == 1
        assert result[0] == "Installed 3 Power Points."


def test_translate_notes_with_newlines_in_response() -> None:
    """Test translation response with multiple lines."""
    translator = KiwiTranslator(api_key="test-key")
    
    raw_notes = "multiple jobs"
    
    with patch.object(translator, '_translate_with_reasoning_model', return_value="Item 1\nItem 2\n\nItem 3") as mock_translate:
        result = translator.translate_notes(raw_notes)
        
        assert len(result) == 3
        assert result[0] == "Item 1"
        assert result[1] == "Item 2"
        assert result[2] == "Item 3"


def test_translate_notes_case_insensitive_hardcoded() -> None:
    """Test case insensitive hardcoded translations."""
    translator = KiwiTranslator(api_key="test-key")
    
    # Test different case variations
    test_cases = [
        "INSTALLED HOT WATER CYLINDER IN CUPBOARD",
        "Installed Hot Water Cylinder In Cupboard",
        "iNsTaLlEd HoT wAtEr CyLiNdEr In CuPbOaRd"
    ]
    
    for case in test_cases:
        result = translator.translate_notes(case)
        assert len(result) == 1
        assert result[0] == "Installed Horizontal Hot Water Cylinder."


def test_hardcoded_translations_completeness() -> None:
    """Test that all hardcoded translations work."""
    translator = KiwiTranslator(api_key="test-key")
    
    for input_phrase, expected_output in HARD_CODED_TRANSLATIONS.items():
        result = translator.translate_notes(input_phrase)
        assert len(result) == 1
        assert result[0] == expected_output


def test_translate_notes_very_long_input() -> None:
    """Test translation with very long input."""
    translator = KiwiTranslator(api_key="test-key")
    
    long_notes = "fixed switch " * 100  # Very long input
    
    with patch.object(translator, '_translate_with_reasoning_model', return_value="Repaired Multiple Switches.") as mock_translate:
        result = translator.translate_notes(long_notes)
        
        mock_translate.assert_called_once_with(long_notes)
        assert len(result) == 1
        assert result[0] == "Repaired Multiple Switches."