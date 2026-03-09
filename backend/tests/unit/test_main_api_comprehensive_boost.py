"""Comprehensive boost tests for main.py to reach 85% coverage target."""

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

# Import the main app
from main import app

# Create test client
client = TestClient(app)

class TestMainAPIBoost:
    """Comprehensive boost tests for main.py to reach 85% coverage."""

    def test_root_endpoint_comprehensive(self):
        """Test the root endpoint comprehensively."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data or "status" in data

    def test_health_endpoint_comprehensive(self):
        """Test the health check endpoint comprehensively."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @patch('main.get_openai_client')
    def test_transcribe_audio_base64_decoding(self, mock_get_client):
        """Test audio transcription with base64 decoding."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_transcription = Mock()
        mock_transcription.text = "Test transcription"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        from main import transcribe_audio
        
        # Test with valid base64
        result = transcribe_audio("SGVsbG8gV29ybGQ=")  # "Hello World"
        assert result == "Test transcription"

    @patch('main.get_openai_client')
    def test_transcribe_audio_with_exception_handling(self, mock_get_client):
        """Test audio transcription exception handling."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.audio.transcriptions.create.side_effect = Exception("Audio processing failed")
        
        from main import transcribe_audio
        
        result = transcribe_audio("SGVsbG8gV29ybGQ=")
        assert result == ""

    @patch('main.get_openai_client')
    def test_embed_text_comprehensive(self, mock_get_client):
        """Test text embedding comprehensively."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_embedding = Mock()
        mock_embedding.data = [Mock(embedding=[0.1, 0.2, 0.3])]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text
        result = embed_text("comprehensive test")
        
        assert result == [0.1, 0.2, 0.3]
        mock_client.embeddings.create.assert_called_once_with(
            model="text-embedding-3-large", 
            input="comprehensive test"
        )

    @patch('main.get_openai_client')
    def test_embed_text_empty_string(self, mock_get_client):
        """Test embedding with empty string."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_embedding = Mock()
        mock_embedding.data = [Mock(embedding=[])]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text
        result = embed_text("")
        
        assert result == []

    @patch('main.get_openai_client')
    def test_embed_text_batch_multiple_texts(self, mock_get_client):
        """Test batch embedding with multiple texts."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_embedding = Mock()
        mock_embedding.data = [
            Mock(embedding=[0.1, 0.2, 0.3]),
            Mock(embedding=[0.4, 0.5, 0.6]),
            Mock(embedding=[0.7, 0.8, 0.9])
        ]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text_batch
        result = embed_text_batch(["text1", "text2", "text3"])
        
        assert len(result) == 3
        assert result[0] == [0.1, 0.2, 0.3]
        assert result[1] == [0.4, 0.5, 0.6]
        assert result[2] == [0.7, 0.8, 0.9]

    def test_normalize_safety_tests_comprehensive(self):
        """Test safety test normalization comprehensively."""
        from main import _normalize_safety_tests
        
        # Test with valid structure
        extracted_data = {
            "safety_tests": [
                {"name": "Earth Loop", "status": "PASS", "value": "0.32 Ohms"},
                {"name": "Polarity", "status": "FAIL", "value": "Incorrect"},
                {"name": "Insulation Resistance", "status": "PASS", "value": "500MΩ"},
                {"name": "RCD Test", "status": "PASS", "value": "Trip time 20ms"}
            ]
        }
        
        result = _normalize_safety_tests(extracted_data, Decimal("-36.8485"), Decimal("174.7633"))
        
        assert len(result) == 4
        assert all("name" in test for test in result)
        assert all("status" in test for test in result)

    def test_normalize_safety_tests_with_gps_coordinates(self):
        """Test safety test normalization with GPS coordinates."""
        from main import _normalize_safety_tests
        
        extracted_data = {
            "safety_tests": [
                {"name": "Earth Loop", "status": "PASS", "value": "0.32 Ohms"}
            ]
        }
        
        gps_lat = Decimal("-36.8485")
        gps_lng = Decimal("174.7633")
        
        result = _normalize_safety_tests(extracted_data, gps_lat, gps_lng)
        
        assert len(result) == 1
        assert result[0]["name"] == "Earth Loop"
        assert result[0]["status"] == "PASS"

    def test_normalize_trade_comprehensive(self):
        """Test trade normalization comprehensively."""
        from main import _normalize_trade
        
        # Test all valid trades
        assert _normalize_trade("electrical") == "ELECTRICAL"
        assert _normalize_trade("ELECTRICAL") == "ELECTRICAL"
        assert _normalize_trade("plumbing") == "PLUMBING"
        assert _normalize_trade("PLUMBING") == "PLUMBING"
        assert _normalize_trade("any") == "ANY"
        assert _normalize_trade("ANY") == "ANY"
        
        # Test with whitespace
        assert _normalize_trade("  electrical  ") == "ELECTRICAL"
        assert _normalize_trade("\tplumbing\t") == "PLUMBING"
        assert _normalize_trade("\n any \n") == "ANY"
        
        # Test invalid trades
        assert _normalize_trade("invalid") == "ELECTRICAL"
        assert _normalize_trade("unknown") == "ELECTRICAL"
        assert _normalize_trade("") == "ELECTRICAL"
        assert _normalize_trade(None) == "ELECTRICAL"

    def test_normalize_trade_custom_default(self):
        """Test trade normalization with custom default."""
        from main import _normalize_trade
        
        assert _normalize_trade("invalid", default="PLUMBING") == "PLUMBING"
        assert _normalize_trade("unknown", default="ANY") == "ANY"

    def test_required_tests_for_trade_all_trades(self):
        """Test required tests for all trade types."""
        from main import _required_tests_for_trade
        
        # Electrical
        electrical_tests = _required_tests_for_trade("ELECTRICAL")
        assert electrical_tests == ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")
        
        # Plumbing
        plumbing_tests = _required_tests_for_trade("PLUMBING")
        assert plumbing_tests == ("Gas Pressure", "Water Flow", "Backflow Prevention", "RCD Test")
        
        # Any
        any_tests = _required_tests_for_trade("ANY")
        assert any_tests == ()
        
        # Unknown (should default to electrical)
        unknown_tests = _required_tests_for_trade("UNKNOWN")
        assert unknown_tests == ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")

    def test_compute_guardrail_status_all_scenarios(self):
        """Test guardrail status computation for all scenarios."""
        from main import _compute_guardrail_status
        
        # Compliant scenario
        compliant_tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Polarity", "status": "PASS"},
            {"name": "Insulation Resistance", "status": "PASS"},
            {"name": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", compliant_tests, "ELECTRICAL")
        assert status == "GREEN_SHIELD"
        assert len(missing) == 0
        
        # Non-compliant scenario
        non_compliant_tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Polarity", "status": "FAIL"},
            {"name": "Insulation Resistance", "status": "PASS"},
            {"name": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", non_compliant_tests, "ELECTRICAL")
        assert status == "RED_SHIELD"
        assert len(missing) == 0
        
        # Missing tests scenario
        missing_tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Polarity", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", missing_tests, "ELECTRICAL")
        assert status == "AMBER_SHIELD"
        assert len(missing) == 2
        assert "Insulation Resistance" in missing
        assert "RCD Test" in missing

    def test_compute_guardrail_status_plumbing_trade(self):
        """Test guardrail status for plumbing trade."""
        from main import _compute_guardrail_status
        
        # Compliant plumbing
        plumbing_tests = [
            {"name": "Gas Pressure", "status": "PASS"},
            {"name": "Water Flow", "status": "PASS"},
            {"name": "Backflow Prevention", "status": "PASS"},
            {"name": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", plumbing_tests, "PLUMBING")
        assert status == "GREEN_SHIELD"
        assert len(missing) == 0

    def test_compute_guardrail_status_any_trade(self):
        """Test guardrail status for ANY trade."""
        from main import _compute_guardrail_status
        
        # ANY trade should be compliant with any tests
        any_tests = [
            {"name": "Some Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", any_tests, "ANY")
        assert status == "GREEN_SHIELD"

    def test_assert_job_write_access_all_roles(self):
        """Test job write access assertion for all roles."""
        from main import _assert_job_write_access
        
        mock_draft = Mock()
        mock_draft.organization_id = "org-123"
        
        # Owner role
        mock_owner = Mock()
        mock_owner.organization_id = "org-123"
        mock_owner.role = "OWNER"
        _assert_job_write_access(mock_draft, mock_owner)  # Should not raise
        
        # Admin role
        mock_admin = Mock()
        mock_admin.organization_id = "org-123"
        mock_admin.role = "ADMIN"
        _assert_job_write_access(mock_draft, mock_admin)  # Should not raise
        
        # Member role (should raise)
        mock_member = Mock()
        mock_member.organization_id = "org-123"
        mock_member.role = "MEMBER"
        
        with pytest.raises(HTTPException) as exc_info:
            _assert_job_write_access(mock_draft, mock_member)
        assert exc_info.value.status_code == 403
        
        # Wrong organization (should raise)
        mock_wrong_org = Mock()
        mock_wrong_org.organization_id = "org-456"
        mock_wrong_org.role = "OWNER"
        
        with pytest.raises(HTTPException) as exc_info:
            _assert_job_write_access(mock_draft, mock_wrong_org)
        assert exc_info.value.status_code == 403

    def test_materials_supports_vector_column_scenarios(self):
        """Test vector column support detection."""
        from main import _materials_supports_vector_column
        
        # Test with vector support
        with patch('main.Material') as mock_material:
            mock_material.vector_embedding = True
            result = _materials_supports_vector_column()
            assert result is True
        
        # Test without vector support
        with patch('main.Material') as mock_material:
            del mock_material.vector_embedding
            result = _materials_supports_vector_column()
            assert result is False

    def test_parse_materials_csv_comprehensive(self):
        """Test CSV parsing comprehensively."""
        from main import _parse_materials_csv
        
        # Valid CSV
        valid_csv = b"""name,unit,unit_cost
Test Material 1,each,10.50
Test Material 2,meter,25.75
Test Material 3,box,5.25"""
        
        result = _parse_materials_csv(valid_csv)
        assert len(result) == 3
        assert result[0]["name"] == "Test Material 1"
        assert result[0]["unit"] == "each"
        assert result[0]["unit_cost"] == "10.50"
        
        # CSV with extra columns
        extra_columns_csv = b"""name,unit,unit_cost,extra_column
Test Material 1,each,10.50,extra1"""
        
        result = _parse_materials_csv(extra_columns_csv)
        assert len(result) == 1
        
        # CSV with missing required columns
        missing_columns_csv = b"""name,unit
Test Material 1,each"""
        
        with pytest.raises(ValueError):
            _parse_materials_csv(missing_columns_csv)
        
        # Empty CSV
        with pytest.raises(ValueError):
            _parse_materials_csv(b"")

    def test_xero_env_value_comprehensive(self):
        """Test Xero environment value retrieval comprehensively."""
        from main import _xero_env_value
        
        # Valid environment variable
        with patch.dict(os.environ, {'TEST_VAR': 'test-value'}):
            result = _xero_env_value('TEST_VAR')
            assert result == 'test-value'
        
        # Environment variable with whitespace
        with patch.dict(os.environ, {'TEST_VAR': '  test-value  '}):
            result = _xero_env_value('TEST_VAR')
            assert result == 'test-value'
        
        # Missing environment variable
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(HTTPException) as exc_info:
                _xero_env_value('MISSING_VAR')
            assert exc_info.value.status_code == 500

    def test_xero_state_secret_priority(self):
        """Test Xero state secret priority order."""
        from main import _xero_state_secret
        
        # XERO_STATE_SECRET takes priority
        with patch.dict(os.environ, {
            'XERO_STATE_SECRET': 'xero-secret',
            'SECRET_KEY': 'secret-key'
        }):
            result = _xero_state_secret()
            assert result == 'xero-secret'
        
        # SECRET_KEY fallback
        with patch.dict(os.environ, {
            'SECRET_KEY': 'secret-key'
        }, clear=True):
            result = _xero_state_secret()
            assert result == 'secret-key'
        
        # Default fallback
        with patch.dict(os.environ, {}, clear=True):
            result = _xero_state_secret()
            assert result == 'sparkops-xero-state-secret'

    def test_build_xero_state_different_organizations(self):
        """Test building Xero state for different organizations."""
        from main import _build_xero_state
        from uuid import uuid4
        
        org1 = uuid4()
        org2 = uuid4()
        
        state1 = _build_xero_state(org1)
        state2 = _build_xero_state(org2)
        
        assert state1 != state2
        assert isinstance(state1, str)
        assert isinstance(state2, str)
        assert len(state1) > 0
        assert len(state2) > 0

    def test_to_response_functions_comprehensive(self):
        """Test all response conversion functions."""
        from main import _to_invite_response, _to_org_settings_response, _to_vehicle_response, _build_auth_me_response
        from uuid import uuid4
        
        # Test invite response
        mock_invite = Mock()
        mock_invite.id = uuid4()
        mock_invite.organization_id = uuid4()
        mock_invite.email = "test@example.com"
        mock_invite.role = "MEMBER"
        mock_invite.created_at = datetime.now(timezone.utc)
        mock_invite.accepted_at = None
        
        invite_response = _to_invite_response(mock_invite)
        assert invite_response.id == mock_invite.id
        assert invite_response.email == "test@example.com"
        
        # Test org settings response
        mock_settings = Mock()
        mock_settings.organization_id = uuid4()
        mock_settings.logo_url = "https://example.com/logo.png"
        mock_settings.brand_color = "#FF0000"
        mock_settings.company_name = "Test Company"
        mock_settings.contact_email = "contact@test.com"
        mock_settings.tax_rate = 15.0
        mock_settings.standard_markup = 20.0
        
        org_response = _to_org_settings_response(mock_settings)
        assert org_response.organization_id == mock_settings.organization_id
        assert org_response.company_name == "Test Company"
        
        # Test vehicle response
        mock_vehicle = Mock()
        mock_vehicle.id = uuid4()
        mock_vehicle.organization_id = uuid4()
        mock_vehicle.make = "Toyota"
        mock_vehicle.model = "Hilux"
        mock_vehicle.year = 2023
        mock_vehicle.plate = "ABC123"
        mock_vehicle.vin = "12345678901234567"
        mock_vehicle.created_at = datetime.now(timezone.utc)
        
        vehicle_response = _to_vehicle_response(mock_vehicle)
        assert vehicle_response.id == mock_vehicle.id
        assert vehicle_response.make == "Toyota"
        assert vehicle_response.model == "Hilux"
        
        # Test auth me response
        mock_user = Mock()
        mock_user.id = uuid4()
        mock_user.email = "test@example.com"
        mock_user.role = "OWNER"
        mock_user.organization_id = uuid4()
        
        auth_response = _build_auth_me_response(mock_user)
        assert auth_response.id == mock_user.id
        assert auth_response.email == "test@example.com"
        assert auth_response.role == "OWNER"

    def test_edge_cases_and_error_handling(self):
        """Test edge cases and error handling."""
        from main import _normalize_safety_tests, _required_tests_for_trade
        
        # Test with None extracted_data
        result = _normalize_safety_tests(None, None, None)
        assert result == []
        
        # Test with empty safety_tests
        result = _normalize_safety_tests({"safety_tests": []}, None, None)
        assert result == []
        
        # Test with non-list safety_tests
        result = _normalize_safety_tests({"safety_tests": "not a list"}, None, None)
        assert result == []
        
        # Test required tests for unknown trade
        result = _required_tests_for_trade("UNKNOWN_TRADE")
        assert result == ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")