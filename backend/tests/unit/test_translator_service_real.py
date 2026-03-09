"""Comprehensive tests for real translator service functions."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta
from typing import Any
import json
import os

# Import actual translator service
from services.translator import KiwiTranslator, HARD_CODED_TRANSLATIONS, SYSTEM_PROMPT

class TestTranslatorServiceReal:
    """Comprehensive tests for real translator service functions."""

    def test_kiwi_translator_initialization_with_api_key(self):
        """Test KiwiTranslator initialization with API key."""
        api_key = "test-api-key"
        translator = KiwiTranslator(api_key=api_key)
        
        assert translator.api_key == api_key

    def test_kiwi_translator_initialization_without_api_key(self):
        """Test KiwiTranslator initialization without API key."""
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'env-api-key'}):
            translator = KiwiTranslator()
            assert translator.api_key == 'env-api-key'

    def test_kiwi_translator_initialization_missing_api_key(self):
        """Test KiwiTranslator initialization with missing API key."""
        with patch.dict(os.environ, {}, clear=True):
            translator = KiwiTranslator()
            assert translator.api_key is None

    @patch('services.translator.OpenAI')
    def test_get_client_success(self, mock_openai):
        """Test successful OpenAI client creation."""
        translator = KiwiTranslator(api_key="test-key")
        
        client = translator._get_client()
        
        assert client is not None
        mock_openai.assert_called_once_with(api_key="test-key")

    @patch('services.translator.OpenAI')
    def test_get_client_missing_api_key(self, mock_openai):
        """Test OpenAI client creation with missing API key."""
        translator = KiwiTranslator(api_key=None)
        
        with pytest.raises(RuntimeError) as exc_info:
            translator._get_client()
        
        assert "OPENAI_API_KEY is required" in str(exc_info.value)

    def test_hard_coded_translations_content(self):
        """Test that hardcoded translations contain expected content."""
        assert isinstance(HARD_CODED_TRANSLATIONS, dict)
        assert len(HARD_CODED_TRANSLATIONS) > 0
        
        # Test some known translations
        assert "installed hot water cylinder in cupboard" in HARD_CODED_TRANSLATIONS
        assert "ran some 2.5 twin and earth" in HARD_CODED_TRANSLATIONS
        assert "stuck a jbox in the roof" in HARD_CODED_TRANSLATIONS

    def test_system_prompt_content(self):
        """Test that system prompt contains expected content."""
        assert isinstance(SYSTEM_PROMPT, str)
        assert len(SYSTEM_PROMPT) > 0
        assert "Quantity Surveyor" in SYSTEM_PROMPT

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_hardcoded_mapping(self, mock_get_client):
        """Test translate_notes with hardcoded mapping."""
        translator = KiwiTranslator(api_key="test-key")
        
        # Test with hardcoded translation
        raw_notes = "installed hot water cylinder in cupboard"
        result = translator.translate_notes(raw_notes)
        
        expected = HARD_CODED_TRANSLATIONS[raw_notes]
        assert result == [expected]
        mock_get_client.assert_not_called()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_ai_translation(self, mock_get_client):
        """Test translate_notes with AI translation."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Translated line 1\nTranslated line 2\nTranslated line 3"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        raw_notes = "custom translation needed"
        result = translator.translate_notes(raw_notes)
        
        assert result == ["Translated line 1", "Translated line 2", "Translated line 3"]
        mock_get_client.assert_called_once()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_empty_input(self, mock_get_client):
        """Test translate_notes with empty input."""
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator.translate_notes("")
        
        assert result == []
        mock_get_client.assert_not_called()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_whitespace_only(self, mock_get_client):
        """Test translate_notes with whitespace only."""
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator.translate_notes("   \t\n   ")
        
        assert result == []
        mock_get_client.assert_not_called()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_multiple_hardcoded_matches(self, mock_get_client):
        """Test translate_notes with multiple hardcoded matches."""
        translator = KiwiTranslator(api_key="test-key")
        
        raw_notes = "installed hot water cylinder in cupboard\nran some 2.5 twin and earth"
        result = translator.translate_notes(raw_notes)
        
        expected = [
            HARD_CODED_TRANSLATIONS["installed hot water cylinder in cupboard"],
            HARD_CODED_TRANSLATIONS["ran some 2.5 twin and earth"]
        ]
        assert result == expected
        mock_get_client.assert_not_called()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_mixed_hardcoded_and_ai(self, mock_get_client):
        """Test translate_notes with mixed hardcoded and AI translation."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "AI translated line"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        raw_notes = "installed hot water cylinder in cupboard\ncustom translation needed"
        result = translator.translate_notes(raw_notes)
        
        assert len(result) == 2
        assert result[0] == HARD_CODED_TRANSLATIONS["installed hot water cylinder in cupboard"]
        assert result[1] == "AI translated line"
        assert mock_get_client.call_count == 1

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_with_reasoning_model_success(self, mock_get_client):
        """Test _translate_with_reasoning_model success."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Reasoned translation"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator._translate_with_reasoning_model("Test input")
        
        assert result == "Reasoned translation"
        mock_client.chat.completions.create.assert_called_once()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_with_reasoning_model_error(self, mock_get_client):
        """Test _translate_with_reasoning_model error handling."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator._translate_with_reasoning_model("Test input")
        
        assert result == ""

    @patch('services.translator.KiwiTranslator._get_client')
    def test_format_with_nano_success(self, mock_get_client):
        """Test _format_with_nano success."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Formatted output"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator._format_with_nano("raw", "unstructured")
        
        assert result == "Formatted output"
        mock_client.chat.completions.create.assert_called_once()

    @patch('services.translator.KiwiTranslator._get_client')
    def test_format_with_nano_error(self, mock_get_client):
        """Test _format_with_nano error handling."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator._format_with_nano("raw", "unstructured")
        
        assert result == ""

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_ai_error_fallback(self, mock_get_client):
        """Test translate_notes AI error with nano fallback."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # First call (reasoning model) fails
        mock_client.chat.completions.create.side_effect = [
            Exception("Reasoning model failed"),
            Mock(output_text="Nano formatted output")  # Nano model succeeds
        ]
        
        translator = KiwiTranslator(api_key="test-key")
        
        raw_notes = "custom translation needed"
        result = translator.translate_notes(raw_notes)
        
        assert result == ["Nano formatted output"]
        assert mock_get_client.call_count == 2

    def test_safe_parse_line_items_valid_json(self):
        """Test _safe_parse_line_items with valid JSON."""
        json_text = '{"line_items": [{"description": "Test item"}]}'
        
        result = KiwiTranslator._safe_parse_line_items(json_text)
        
        assert isinstance(result, list)

    def test_safe_parse_line_items_invalid_json(self):
        """Test _safe_parse_line_items with invalid JSON."""
        invalid_json = '{"line_items": [{"description": "Test item"'  # Missing closing brace
        
        result = KiwiTranslator._safe_parse_line_items(invalid_json)
        
        assert result == []

    def test_safe_parse_line_items_empty_string(self):
        """Test _safe_parse_line_items with empty string."""
        result = KiwiTranslator._safe_parse_line_items("")
        
        assert result == []

    def test_safe_parse_line_items_non_json_text(self):
        """Test _safe_parse_line_items with non-JSON text."""
        plain_text = "Just plain text"
        
        result = KiwiTranslator._safe_parse_line_items(plain_text)
        
        assert result == []

    def test_safe_parse_line_items_none_input(self):
        """Test _safe_parse_line_items with None input."""
        result = KiwiTranslator._safe_parse_line_items(None)
        
        assert result == []

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_line_filtering(self, mock_get_client):
        """Test translate_notes filters empty lines."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Line 1\n\nLine 3\n   \nLine 5"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator.translate_notes("test")
        
        assert result == ["Line 1", "Line 3", "Line 5"]
        assert len(result) == 3  # Empty lines filtered out

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_with_special_characters(self, mock_get_client):
        """Test translate_notes with special characters."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Line with émojis 🚀 and spéciål chåracters"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator.translate_notes("test with special chars")
        
        assert result == ["Line with émojis 🚀 and spéciål chåracters"]

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_very_long_input(self, mock_get_client):
        """Test translate_notes with very long input."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Long translation result"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        long_input = "A" * 10000  # Very long string
        result = translator.translate_notes(long_input)
        
        assert result == ["Long translation result"]

    def test_hardcoded_translations_comprehensive(self):
        """Test all hardcoded translations work correctly."""
        translator = KiwiTranslator(api_key="test-key")
        
        for input_text, expected_output in HARD_CODED_TRANSLATIONS.items():
            result = translator.translate_notes(input_text)
            assert result == [expected_output]

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_multiple_lines_input(self, mock_get_client):
        """Test translate_notes with multiple lines input."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "Translated line 1\nTranslated line 2"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        multi_line_input = "Line 1\nLine 2\nLine 3"
        result = translator.translate_notes(multi_line_input)
        
        assert len(result) == 2
        assert "Translated line 1" in result
        assert "Translated line 2" in result

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_with_newlines_in_response(self, mock_get_client):
        """Test translate_notes handles newlines in AI response."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "First line\n\nSecond line\nThird line"
        mock_client.chat.completions.create.return_value = mock_response
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator.translate_notes("test input")
        
        assert result == ["First line", "Second line", "Third line"]
        assert len(result) == 3  # Empty line filtered

    def test_constants_are_accessible(self):
        """Test that constants are accessible and have correct types."""
        assert isinstance(HARD_CODED_TRANSLATIONS, dict)
        assert isinstance(SYSTEM_PROMPT, str)
        assert len(HARD_CODED_TRANSLATIONS) > 0
        assert len(SYSTEM_PROMPT) > 0

    @patch('services.translator.KiwiTranslator._get_client')
    def test_translate_notes_error_recovery(self, mock_get_client):
        """Test translate_notes error recovery mechanisms."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Both reasoning and nano models fail
        mock_client.chat.completions.create.side_effect = Exception("All models failed")
        
        translator = KiwiTranslator(api_key="test-key")
        
        result = translator.translate_notes("test input")
        
        assert result == []

    def test_class_method_accessibility(self):
        """Test that class methods are accessible."""
        translator = KiwiTranslator(api_key="test-key")
        
        # Test that methods exist and are callable
        assert hasattr(translator, 'translate_notes')
        assert hasattr(translator, '_translate_with_reasoning_model')
        assert hasattr(translator, '_format_with_nano')
        assert hasattr(translator, '_safe_parse_line_items')
        assert callable(getattr(translator, 'translate_notes'))
        assert callable(getattr(translator, '_translate_with_reasoning_model'))
        assert callable(getattr(translator, '_format_with_nano'))
        assert callable(getattr(translator, '_safe_parse_line_items'))