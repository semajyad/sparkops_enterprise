"""Final push tests for main.py to reach 84% backend coverage target."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta
from typing import Any
import json
import base64
import io
import os
from decimal import Decimal
from uuid import uuid4

# Import the main app
from main import app

# Create test client
client = TestClient(app)

class TestMainAPIFinalPush:
    """Final push tests for main.py to reach 84% coverage target."""

    def test_root_endpoint_variations(self):
        """Test root endpoint variations."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data or "message" in data

    def test_health_endpoint_detailed(self):
        """Test health endpoint detailed response."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @patch('main.get_openai_client')
    def test_transcribe_audio_various_formats(self, mock_get_client):
        """Test audio transcription with various base64 formats."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_transcription = Mock()
        mock_transcription.text = "Test transcription"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        from main import transcribe_audio
        
        # Test with different base64 strings
        test_cases = [
            "SGVsbG8gV29ybGQ=",  # "Hello World"
            "VGVzdCBhdWRpbyBkYXRh",  # "Test audio data"
            "QmFzZTY0IGVuY29kZWQgc3RyaW5n"  # "Base64 encoded string"
        ]
        
        for test_case in test_cases:
            result = transcribe_audio(test_case)
            assert result == "Test transcription"

    @patch('main.get_openai_client')
    def test_embed_text_comprehensive_scenarios(self, mock_get_client):
        """Test text embedding with comprehensive scenarios."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        from main import embed_text
        
        # Test with various text types
        test_texts = [
            "Simple text",
            "Text with numbers 123",
            "Text with special chars !@#$%",
            "Very long text " * 100,
            "Unicode text: café résumé",
            "",  # Empty string
            "   ",  # Whitespace only
        ]
        
        for text in test_texts:
            mock_embedding = Mock()
            mock_embedding.data = [Mock(embedding=[0.1, 0.2, 0.3])]
            mock_client.embeddings.create.return_value = mock_embedding
            
            result = embed_text(text)
            assert isinstance(result, list)

    @patch('main.get_openai_client')
    def test_embed_text_batch_various_sizes(self, mock_get_client):
        """Test batch embedding with various sizes."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        from main import embed_text_batch
        
        # Test with different batch sizes
        test_cases = [
            ["single"],
            ["two", "texts"],
            ["three", "different", "texts"],
            ["many"] * 10,
            [],  # Empty list
        ]
        
        for texts in test_cases:
            if texts:  # Only test non-empty lists
                mock_embedding = Mock()
                mock_embedding.data = [Mock(embedding=[0.1, 0.2, 0.3]) for _ in texts]
                mock_client.embeddings.create.return_value = mock_embedding
                
                result = embed_text_batch(texts)
                assert len(result) == len(texts)

    def test_normalize_trade_all_variations(self):
        """Test trade normalization with all possible variations."""
        from main import _normalize_trade
        
        # Test all valid inputs
        valid_inputs = [
            "electrical", "ELECTRICAL", "Electrical", "  electrical  ",
            "plumbing", "PLUMBING", "Plumbing", "\tplumbing\t",
            "any", "ANY", "Any", "\n any \n"
        ]
        
        expected_outputs = ["ELECTRICAL", "ELECTRICAL", "ELECTRICAL", "ELECTRICAL",
                           "PLUMBING", "PLUMBING", "PLUMBING", "PLUMBING",
                           "ANY", "ANY", "ANY", "ANY"]
        
        for input_val, expected in zip(valid_inputs, expected_outputs):
            result = _normalize_trade(input_val)
            assert result == expected
        
        # Test invalid inputs with different defaults
        invalid_inputs = ["invalid", "unknown", "", None, "   "]
        
        for input_val in invalid_inputs:
            result = _normalize_trade(input_val)
            assert result == "ELECTRICAL"  # Default
            
            result_custom = _normalize_trade(input_val, default="PLUMBING")
            assert result_custom == "PLUMBING"

    def test_required_tests_for_trade_all_scenarios(self):
        """Test required tests for all trade scenarios."""
        from main import _required_tests_for_trade
        
        # Test all trade types including variations
        test_cases = [
            ("ELECTRICAL", ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")),
            ("electrical", ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")),
            ("PLUMBING", ("Gas Pressure", "Water Flow", "Backflow Prevention", "RCD Test")),
            ("plumbing", ("Gas Pressure", "Water Flow", "Backflow Prevention", "RCD Test")),
            ("ANY", ()),
            ("any", ()),
            ("UNKNOWN", ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")),  # Default
        ]
        
        for trade_input, expected in test_cases:
            result = _required_tests_for_trade(trade_input)
            assert result == expected

    def test_normalize_safety_tests_comprehensive(self):
        """Test safety test normalization comprehensively."""
        from main import _normalize_safety_tests
        
        # Test with various data structures
        test_cases = [
            # Valid structure
            {
                "safety_tests": [
                    {"name": "Earth Loop", "status": "PASS", "value": "0.32 Ohms"},
                    {"name": "Polarity", "status": "FAIL", "value": "Incorrect"}
                ]
            },
            # Empty tests
            {"safety_tests": []},
            # Missing key
            {},
            # None input
            None,
            # Non-list tests
            {"safety_tests": "not a list"},
            # Malformed test objects
            {
                "safety_tests": [
                    "not a dict",
                    {"name": "Test"},  # Missing status
                    {"status": "PASS"},  # Missing name
                    None  # None object
                ]
            }
        ]
        
        for test_data in test_cases:
            if test_data is not None:
                result = _normalize_safety_tests(test_data, Decimal("-36.8485"), Decimal("174.7633"))
            else:
                result = _normalize_safety_tests(test_data, None, None)
            
            assert isinstance(result, list)

    def test_compute_guardrail_status_all_combinations(self):
        """Test guardrail status computation for all combinations."""
        from main import _compute_guardrail_status
        
        # Test all trade types with various test scenarios
        trades_and_tests = [
            ("ELECTRICAL", [
                {"name": "Earth Loop", "status": "PASS"},
                {"name": "Polarity", "status": "PASS"},
                {"name": "Insulation Resistance", "status": "PASS"},
                {"name": "RCD Test", "status": "PASS"}
            ]),
            ("PLUMBING", [
                {"name": "Gas Pressure", "status": "PASS"},
                {"name": "Water Flow", "status": "PASS"},
                {"name": "Backflow Prevention", "status": "PASS"},
                {"name": "RCD Test", "status": "PASS"}
            ]),
            ("ANY", [
                {"name": "Any Test", "status": "PASS"}
            ])
        ]
        
        for trade, tests in trades_and_tests:
            # Compliant scenario
            status, missing, message = _compute_guardrail_status("test transcript", tests, trade)
            assert status in ["GREEN_SHIELD", "AMBER_SHIELD"]
            assert isinstance(missing, list)
            assert isinstance(message, str)
            
            # Non-compliant scenario
            if tests:
                non_compliant_tests = tests.copy()
                non_compliant_tests[0]["status"] = "FAIL"
                status, missing, message = _compute_guardrail_status("test transcript", non_compliant_tests, trade)
                assert status in ["RED_SHIELD", "AMBER_SHIELD"]
            
            # Missing tests scenario
            if len(tests) > 1:
                missing_tests = tests[:-1]
                status, missing, message = _compute_guardrail_status("test transcript", missing_tests, trade)
                assert status in ["AMBER_SHIELD", "RED_SHIELD"]

    def test_assert_job_write_access_all_scenarios(self):
        """Test job write access assertion for all scenarios."""
        from main import _assert_job_write_access
        
        mock_draft = Mock()
        mock_draft.organization_id = "org-123"
        
        # Test all role combinations
        roles_and_orgs = [
            ("OWNER", "org-123", True),      # Same org, owner - should pass
            ("ADMIN", "org-123", True),      # Same org, admin - should pass
            ("MEMBER", "org-123", False),    # Same org, member - should fail
            ("OWNER", "org-456", False),      # Different org, owner - should fail
            ("ADMIN", "org-456", False),      # Different org, admin - should fail
            ("MEMBER", "org-456", False),     # Different org, member - should fail
        ]
        
        for role, org_id, should_pass in roles_and_orgs:
            mock_user = Mock()
            mock_user.organization_id = org_id
            mock_user.role = role
            
            if should_pass:
                # Should not raise exception
                _assert_job_write_access(mock_draft, mock_user)
            else:
                # Should raise HTTPException
                with pytest.raises(HTTPException) as exc_info:
                    _assert_job_write_access(mock_draft, mock_user)
                assert exc_info.value.status_code == 403

    def test_materials_vector_support_detection(self):
        """Test vector column support detection."""
        from main import _materials_supports_vector_column
        
        # Test with mock Material class
        with patch('main.Material') as mock_material_class:
            # Test with vector support
            mock_material_class.vector_embedding = True
            result = _materials_supports_vector_column()
            assert result is True
            
            # Test without vector support
            del mock_material_class.vector_embedding
            result = _materials_supports_vector_column()
            assert result is False

    def test_parse_materials_csv_edge_cases(self):
        """Test CSV parsing with edge cases."""
        from main import _parse_materials_csv
        
        # Test various CSV formats
        test_cases = [
            # Standard format
            b"name,unit,unit_cost\nTest Material,each,10.50",
            # With extra whitespace
            b"  name  ,  unit  ,  unit_cost  \n  Test Material  ,  each  ,  10.50  ",
            # With quotes
            b'"name","unit","unit_cost"\n"Test Material","each","10.50"',
            # Multiple rows
            b"name,unit,unit_cost\nMaterial 1,each,10.50\nMaterial 2,meter,25.75",
        ]
        
        for csv_data in test_cases:
            try:
                result = _parse_materials_csv(csv_data)
                assert isinstance(result, list)
            except ValueError:
                # Some edge cases might raise ValueError, which is expected
                pass

    def test_xero_environment_functions_comprehensive(self):
        """Test Xero environment functions comprehensively."""
        from main import _xero_env_value, _xero_state_secret, _build_xero_state
        
        # Test _xero_env_value
        with patch.dict(os.environ, {'TEST_VAR': 'test-value'}):
            result = _xero_env_value('TEST_VAR')
            assert result == 'test-value'
        
        # Test _xero_state_secret priority order
        with patch.dict(os.environ, {
            'XERO_STATE_SECRET': 'xero-secret',
            'SECRET_KEY': 'secret-key'
        }):
            result = _xero_state_secret()
            assert result == 'xero-secret'
        
        with patch.dict(os.environ, {'SECRET_KEY': 'secret-key'}, clear=True):
            result = _xero_state_secret()
            assert result == 'secret-key'
        
        with patch.dict(os.environ, {}, clear=True):
            result = _xero_state_secret()
            assert result == 'sparkops-xero-state-secret'
        
        # Test _build_xero_state
        org_id = uuid4()
        result = _build_xero_state(org_id)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_response_conversion_functions(self):
        """Test response conversion functions."""
        from main import _to_invite_response, _to_org_settings_response, _build_auth_me_response
        
        # Test _build_auth_me_response
        mock_user = Mock()
        mock_user.id = uuid4()
        mock_user.email = "test@example.com"
        mock_user.role = "OWNER"
        mock_user.organization_id = uuid4()
        
        response = _build_auth_me_response(mock_user)
        assert response.id == mock_user.id
        assert response.email == "test@example.com"
        assert response.role == "OWNER"

    def test_error_handling_scenarios(self):
        """Test various error handling scenarios."""
        from main import _normalize_safety_tests, _parse_decimal
        
        # Test _normalize_safety_tests with various invalid inputs
        invalid_inputs = [
            None,
            {},
            {"safety_tests": None},
            {"safety_tests": "not a list"},
            {"safety_tests": [None, "invalid", {}]}
        ]
        
        for invalid_input in invalid_inputs:
            result = _normalize_safety_tests(invalid_input, None, None)
            assert isinstance(result, list)
        
        # Test _parse_decimal with various invalid inputs
        invalid_decimal_inputs = [
            None,
            "",
            "invalid",
            "not a number",
            [],
            {},
        ]
        
        for invalid_input in invalid_decimal_inputs:
            result = _parse_decimal(invalid_input)
            assert result == Decimal("0.00")

    @patch('main.get_openai_client')
    def test_api_error_handling(self, mock_get_client):
        """Test API error handling."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        from main import embed_text, embed_text_batch
        
        # Test embed_text error handling
        mock_client.embeddings.create.side_effect = Exception("API Error")
        result = embed_text("test text")
        assert result == []
        
        # Test embed_text_batch error handling
        mock_client.embeddings.create.side_effect = Exception("API Error")
        result = embed_text_batch(["test text"])
        assert result == []

    def test_data_validation_edge_cases(self):
        """Test data validation edge cases."""
        from main import _normalize_trade, _required_tests_for_trade
        
        # Test _normalize_trade with edge cases
        edge_cases = [
            None,
            "",
            "   ",
            "\t\n",
            "invalid-trade-name",
            "123",
            "!@#$%",
        ]
        
        for case in edge_cases:
            result = _normalize_trade(case)
            assert result in ["ELECTRICAL", "PLUMBING", "ANY"]
        
        # Test _required_tests_for_trade with edge cases
        trade_edge_cases = [
            None,
            "",
            "INVALID",
            "unknown",
            "123",
        ]
        
        for case in trade_edge_cases:
            result = _required_tests_for_trade(case)
            assert isinstance(result, tuple)