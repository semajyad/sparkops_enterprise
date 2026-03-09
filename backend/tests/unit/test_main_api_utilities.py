"""Additional utility tests for main.py to boost coverage to 85% target."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi import HTTPException
from datetime import datetime, timezone, timedelta
from typing import Any
import json
import base64
import io
import os

# Import the main app
from main import app

class TestMainAPIUtilities:
    """Additional test suite for main.py utility functions."""

    def test_health_endpoint(self):
        """Test the health check endpoint."""
        from fastapi.testclient import TestClient
        client = TestClient(app)
        
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_root_endpoint_detailed(self):
        """Test the root endpoint with detailed response."""
        from fastapi.testclient import TestClient
        client = TestClient(app)
        
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "SparkOps API" in data["message"]

    @patch('main.get_openai_client')
    def test_embed_text_with_client_error(self, mock_get_client):
        """Test text embedding with client error."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.embeddings.create.side_effect = Exception("Connection failed")
        
        from main import embed_text
        result = embed_text("test text")
        
        assert result == []

    @patch('main.get_openai_client')
    def test_embed_text_batch_with_partial_failure(self, mock_get_client):
        """Test batch embedding with partial failure."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Mock successful response but with fewer embeddings than texts
        mock_embedding = Mock()
        mock_embedding.data = [
            Mock(embedding=[0.1, 0.2, 0.3])
            # Only one embedding for two texts
        ]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text_batch
        result = embed_text_batch(["text1", "text2"])
        
        # Should still return what we got
        assert len(result) == 1
        assert result[0] == [0.1, 0.2, 0.3]

    def test_normalize_trade_edge_cases(self):
        """Test trade normalization with edge cases."""
        from main import _normalize_trade
        
        # Test with whitespace variations
        assert _normalize_trade("  electrical  ") == "ELECTRICAL"
        assert _normalize_trade("\tplumbing\t") == "PLUMBING"
        assert _normalize_trade("\n any \n") == "ANY"
        
        # Test with mixed case
        assert _normalize_trade("eLeCtRiCaL") == "ELECTRICAL"
        assert _normalize_trade("PlUmBiNg") == "PLUMBING"
        assert _normalize_trade("AnY") == "ANY"

    def test_required_tests_for_trade_edge_cases(self):
        """Test required tests for trade with edge cases."""
        from main import _required_tests_for_trade
        
        # Test with lowercase
        assert _required_tests_for_trade("electrical") == ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")
        assert _required_tests_for_trade("plumbing") == ("Gas Pressure", "Water Flow", "Backflow Prevention", "RCD Test")
        
        # Test with mixed case
        assert _required_tests_for_trade("ELECTRICAL") == ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")
        assert _required_tests_for_trade("PLUMBING") == ("Gas Pressure", "Water Flow", "Backflow Prevention", "RCD Test")

    def test_normalize_safety_tests_with_gps(self):
        """Test safety test normalization with GPS coordinates."""
        from main import _normalize_safety_tests
        from decimal import Decimal
        
        extracted_data = {
            "safety_tests": [
                {"name": "Earth Loop", "status": "PASS", "value": "0.32 Ohms"},
                {"name": "Polarity", "status": "PASS", "value": "Correct"}
            ]
        }
        
        gps_lat = Decimal("-36.8485")
        gps_lng = Decimal("174.7633")
        
        result = _normalize_safety_tests(extracted_data, gps_lat, gps_lng)
        
        assert len(result) == 2
        assert result[0]["name"] == "Earth Loop"
        assert result[0]["status"] == "PASS"
        assert result[1]["name"] == "Polarity"
        assert result[1]["status"] == "PASS"

    def test_normalize_safety_tests_with_invalid_gps(self):
        """Test safety test normalization with invalid GPS."""
        from main import _normalize_safety_tests
        
        extracted_data = {
            "safety_tests": [
                {"name": "Earth Loop", "status": "PASS", "value": "0.32 Ohms"}
            ]
        }
        
        # Test with None GPS coordinates
        result = _normalize_safety_tests(extracted_data, None, None)
        assert len(result) == 1

    def test_compute_guardrail_status_edge_cases(self):
        """Test guardrail status computation with edge cases."""
        from main import _compute_guardrail_status
        
        # Test with duplicate test names
        tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Earth Loop", "status": "PASS"},  # Duplicate
            {"name": "Polarity", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ELECTRICAL")
        
        # Should handle duplicates gracefully
        assert status in ["GREEN_SHIELD", "AMBER_SHIELD"]

    def test_compute_guardrail_status_plumbing_trade(self):
        """Test guardrail status for plumbing trade."""
        from main import _compute_guardrail_status
        
        tests = [
            {"name": "Gas Pressure", "status": "PASS"},
            {"name": "Water Flow", "status": "PASS"},
            {"name": "Backflow Prevention", "status": "PASS"},
            {"name": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "PLUMBING")
        
        assert status == "GREEN_SHIELD"
        assert len(missing) == 0

    def test_compute_guardrail_status_any_trade(self):
        """Test guardrail status for ANY trade (no required tests)."""
        from main import _compute_guardrail_status
        
        tests = [
            {"name": "Some Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ANY")
        
        # ANY trade should always be compliant if no tests are required
        assert status == "GREEN_SHIELD"

    def test_assert_job_write_access_edge_cases(self):
        """Test job write access assertion with edge cases."""
        from main import _assert_job_write_access
        
        # Test with matching org IDs but different roles
        mock_draft = Mock()
        mock_draft.organization_id = "org-123"
        
        mock_user = Mock()
        mock_user.organization_id = "org-123"
        mock_user.role = "MEMBER"
        
        with pytest.raises(HTTPException) as exc_info:
            _assert_job_write_access(mock_draft, mock_user)
        
        assert exc_info.value.status_code == 403

    def test_parse_materials_csv_with_extra_columns(self):
        """Test CSV parsing with extra columns."""
        from main import _parse_materials_csv
        
        csv_content = b"""name,unit,unit_cost,extra_column,another_extra
Test Material 1,each,10.50,extra1,extra2
Test Material 2,meter,25.75,extra3,extra4"""
        
        result = _parse_materials_csv(csv_content)
        
        assert len(result) == 2
        assert result[0]["name"] == "Test Material 1"
        assert result[0]["unit"] == "each"
        assert result[0]["unit_cost"] == "10.50"
        # Extra columns should be ignored

    def test_parse_materials_csv_with_missing_columns(self):
        """Test CSV parsing with missing required columns."""
        from main import _parse_materials_csv
        
        csv_content = b"""name,unit
Test Material 1,each
Test Material 2,meter"""
        
        with pytest.raises(ValueError) as exc_info:
            _parse_materials_csv(csv_content)
        
        assert "CSV must contain" in str(exc_info.value)

    def test_parse_materials_csv_with_empty_rows(self):
        """Test CSV parsing with empty rows."""
        from main import _parse_materials_csv
        
        csv_content = b"""name,unit,unit_cost
Test Material 1,each,10.50

Test Material 2,meter,25.75"""
        
        result = _parse_materials_csv(csv_content)
        
        # Should skip empty rows
        assert len(result) == 2

    def test_xero_env_value_with_whitespace(self):
        """Test Xero environment value with whitespace."""
        from main import _xero_env_value
        
        with patch.dict(os.environ, {'TEST_VAR': '  test-value  '}):
            result = _xero_env_value('TEST_VAR')
            assert result == 'test-value'  # Should be trimmed

    def test_xero_state_secret_priority(self):
        """Test Xero state secret priority order."""
        from main import _xero_state_secret
        
        # XERO_STATE_SECRET should take priority over SECRET_KEY
        with patch.dict(os.environ, {
            'XERO_STATE_SECRET': 'xero-secret',
            'SECRET_KEY': 'secret-key'
        }):
            result = _xero_state_secret()
            assert result == 'xero-secret'

    def test_build_xero_state_different_orgs(self):
        """Test building Xero state with different organizations."""
        from main import _build_xero_state
        from uuid import uuid4, UUID
        
        # Test with different org IDs
        org_id1 = uuid4()
        org_id2 = uuid4()
        
        state1 = _build_xero_state(org_id1)
        state2 = _build_xero_state(org_id2)
        
        # Should generate different states
        assert state1 != state2
        assert isinstance(state1, str)
        assert isinstance(state2, str)

    def test_to_invite_response_with_accepted_at(self):
        """Test converting invite with accepted timestamp."""
        from main import _to_invite_response
        from uuid import uuid4
        
        mock_invite = Mock()
        mock_invite.id = uuid4()
        mock_invite.organization_id = uuid4()
        mock_invite.email = "test@example.com"
        mock_invite.role = "MEMBER"
        mock_invite.created_at = datetime.now(timezone.utc)
        mock_invite.accepted_at = datetime.now(timezone.utc)
        
        response = _to_invite_response(mock_invite)
        
        assert response.id == mock_invite.id
        assert response.accepted_at is not None

    def test_to_org_settings_response_with_optional_fields(self):
        """Test converting org settings with optional fields."""
        from main import _to_org_settings_response
        from uuid import uuid4
        
        mock_settings = Mock()
        mock_settings.organization_id = uuid4()
        mock_settings.logo_url = None
        mock_settings.brand_color = None
        mock_settings.company_name = "Test Company"
        mock_settings.contact_email = "contact@test.com"
        mock_settings.tax_rate = 15.0
        mock_settings.standard_markup = 20.0
        
        response = _to_org_settings_response(mock_settings)
        
        assert response.organization_id == mock_settings.organization_id
        assert response.logo_url is None
        assert response.brand_color is None

    def test_to_vehicle_response_with_optional_fields(self):
        """Test converting vehicle with optional fields."""
        from main import _to_vehicle_response
        from uuid import uuid4
        
        mock_vehicle = Mock()
        mock_vehicle.id = uuid4()
        mock_vehicle.organization_id = uuid4()
        mock_vehicle.make = "Toyota"
        mock_vehicle.model = "Hilux"
        mock_vehicle.year = 2023
        mock_vehicle.plate = None  # Optional field
        mock_vehicle.vin = None   # Optional field
        mock_vehicle.created_at = datetime.now(timezone.utc)
        
        response = _to_vehicle_response(mock_vehicle)
        
        assert response.id == mock_vehicle.id
        assert response.plate is None
        assert response.vin is None

    def test_build_auth_me_response_with_all_fields(self):
        """Test building auth me response with all fields."""
        from main import _build_auth_me_response
        from uuid import uuid4
        
        mock_user = Mock()
        mock_user.id = uuid4()
        mock_user.email = "test@example.com"
        mock_user.role = "OWNER"
        mock_user.organization_id = uuid4()
        mock_user.full_name = "Test User"
        
        response = _build_auth_me_response(mock_user)
        
        assert response.id == mock_user.id
        assert response.email == "test@example.com"
        assert response.role == "OWNER"
        assert response.organization_id == mock_user.organization_id

    @patch('main.get_openai_client')
    def test_transcribe_audio_with_invalid_base64(self, mock_get_client):
        """Test audio transcription with invalid base64."""
        from main import transcribe_audio
        
        # Invalid base64 should be handled gracefully
        result = transcribe_audio("invalid-base64")
        
        # Should return empty string on error
        assert result == ""

    @patch('main.get_openai_client')
    def test_embed_text_with_empty_text(self, mock_get_client):
        """Test embedding generation with empty text."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_embedding = Mock()
        mock_embedding.data = [Mock(embedding=[])]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text
        result = embed_text("")
        
        assert result == []

    def test_embed_text_batch_with_empty_list(self):
        """Test batch embedding with empty list."""
        from main import embed_text_batch
        
        result = embed_text_batch([])
        
        assert result == []

    def test_normalize_safety_tests_with_non_list_data(self):
        """Test safety test normalization with non-list data."""
        from main import _normalize_safety_tests
        
        extracted_data = {
            "safety_tests": "not a list"
        }
        
        result = _normalize_safety_tests(extracted_data, None, None)
        
        assert result == []

    def test_normalize_safety_tests_with_malformed_test_data(self):
        """Test safety test normalization with malformed test data."""
        from main import _normalize_safety_tests
        
        extracted_data = {
            "safety_tests": [
                "not a dict",
                {"name": "Earth Loop"},  # Missing status
                {"status": "PASS"}  # Missing name
            ]
        }
        
        result = _normalize_safety_tests(extracted_data, None, None)
        
        # Should handle malformed data gracefully
        assert isinstance(result, list)

    def test_required_tests_for_trade_unknown_trade(self):
        """Test required tests for unknown trade."""
        from main import _required_tests_for_trade
        
        result = _required_tests_for_trade("UNKNOWN_TRADE")
        
        # Should return electrical tests as default
        assert result == ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")