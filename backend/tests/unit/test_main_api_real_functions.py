"""Comprehensive tests for real functions in main.py to achieve 85% coverage target."""

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

# Import the main app
from main import app

# Create test client
client = TestClient(app)

class TestMainAPIRealFunctions:
    """Test suite for real functions in main.py."""

    def test_root_endpoint(self):
        """Test the root health check endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        assert "SparkOps API" in response.json()["message"]

    def test_health_endpoint(self):
        """Test the health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_get_openai_client_success(self):
        """Test successful OpenAI client creation."""
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
            from main import get_openai_client
            client = get_openai_client()
            assert client is not None

    def test_get_openai_client_missing_key(self):
        """Test OpenAI client creation with missing API key."""
        with patch.dict(os.environ, {}, clear=True):
            from main import get_openai_client
            with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
                get_openai_client()

    @patch('main.get_openai_client')
    def test_transcribe_audio(self, mock_get_client):
        """Test audio transcription."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_transcription = Mock()
        mock_transcription.text = "Transcribed text"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        from main import transcribe_audio
        result = transcribe_audio("dGVzdCBhdWRpbyBkYXRh")  # base64 encoded "test audio data"
        
        assert result == "Transcribed text"

    @patch('main.get_openai_client')
    def test_transcribe_audio_failure(self, mock_get_client):
        """Test audio transcription failure."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.audio.transcriptions.create.side_effect = Exception("Transcription failed")
        
        from main import transcribe_audio
        result = transcribe_audio("dGVzdCBhdWRpbyBkYXRh")
        
        assert result == ""

    @patch('main.get_openai_client')
    def test_embed_text(self, mock_get_client):
        """Test text embedding generation."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_embedding = Mock()
        mock_embedding.data = [Mock(embedding=[0.1, 0.2, 0.3])]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text
        result = embed_text("test text")
        
        assert result == [0.1, 0.2, 0.3]

    @patch('main.get_openai_client')
    def test_embed_text_failure(self, mock_get_client):
        """Test text embedding generation failure."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.embeddings.create.side_effect = Exception("API Error")
        
        from main import embed_text
        result = embed_text("test text")
        
        assert result == []

    @patch('main.get_openai_client')
    def test_embed_text_batch(self, mock_get_client):
        """Test batch text embedding generation."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_embedding = Mock()
        mock_embedding.data = [
            Mock(embedding=[0.1, 0.2, 0.3]),
            Mock(embedding=[0.4, 0.5, 0.6])
        ]
        mock_client.embeddings.create.return_value = mock_embedding
        
        from main import embed_text_batch
        result = embed_text_batch(["text1", "text2"])
        
        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    def test_embed_text_batch_empty(self):
        """Test batch embedding with empty list."""
        from main import embed_text_batch
        result = embed_text_batch([])
        
        assert result == []

    def test_normalize_safety_tests_valid(self):
        """Test normalizing valid safety tests."""
        from main import _normalize_safety_tests
        
        extracted_data = {
            "safety_tests": [
                {"name": "Earth Loop", "status": "PASS", "value": "0.32 Ohms"},
                {"name": "Polarity", "status": "PASS", "value": "Correct"}
            ]
        }
        
        result = _normalize_safety_tests(extracted_data, None, None)
        
        assert len(result) == 2
        assert result[0]["name"] == "Earth Loop"
        assert result[0]["status"] == "PASS"
        assert result[1]["name"] == "Polarity"
        assert result[1]["status"] == "PASS"

    def test_normalize_safety_tests_invalid_structure(self):
        """Test normalizing safety tests with invalid structure."""
        from main import _normalize_safety_tests
        
        # Test with non-dict
        result = _normalize_safety_tests("invalid", None, None)
        assert result == []
        
        # Test with non-list
        result = _normalize_safety_tests({"safety_tests": "invalid"}, None, None)
        assert result == []

    def test_normalize_safety_tests_empty(self):
        """Test normalizing empty safety tests."""
        from main import _normalize_safety_tests
        
        result = _normalize_safety_tests({}, None, None)
        
        assert result == []

    def test_normalize_trade_valid(self):
        """Test normalizing valid trade names."""
        from main import _normalize_trade
        
        assert _normalize_trade("electrical") == "ELECTRICAL"
        assert _normalize_trade("ELECTRICAL") == "ELECTRICAL"
        assert _normalize_trade("plumbing") == "PLUMBING"
        assert _normalize_trade("PLUMBING") == "PLUMBING"
        assert _normalize_trade("any") == "ANY"

    def test_normalize_trade_invalid(self):
        """Test normalizing invalid trade names."""
        from main import _normalize_trade
        
        assert _normalize_trade("invalid") == "ELECTRICAL"  # Default
        assert _normalize_trade("") == "ELECTRICAL"
        assert _normalize_trade(None) == "ELECTRICAL"
        assert _normalize_trade("  ", default="PLUMBING") == "PLUMBING"

    def test_normalize_trade_custom_default(self):
        """Test normalizing trade with custom default."""
        from main import _normalize_trade
        
        assert _normalize_trade("invalid", default="PLUMBING") == "PLUMBING"

    def test_required_tests_for_trade(self):
        """Test getting required tests for different trades."""
        from main import _required_tests_for_trade
        
        electrical_tests = _required_tests_for_trade("ELECTRICAL")
        assert "Earth Loop" in electrical_tests
        assert "Polarity" in electrical_tests
        assert "Insulation Resistance" in electrical_tests
        assert "RCD Test" in electrical_tests
        
        plumbing_tests = _required_tests_for_trade("PLUMBING")
        assert "Gas Pressure" in plumbing_tests
        assert "Water Flow" in plumbing_tests
        assert "Backflow Prevention" in plumbing_tests
        assert "RCD Test" in plumbing_tests
        
        any_tests = _required_tests_for_trade("ANY")
        assert len(any_tests) == 0  # No required tests for ANY

    def test_compute_guardrail_status_compliant(self):
        """Test guardrail status for compliant evidence."""
        from main import _compute_guardrail_status
        
        tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Polarity", "status": "PASS"},
            {"name": "Insulation Resistance", "status": "PASS"},
            {"name": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ELECTRICAL")
        
        assert status == "GREEN_SHIELD"
        assert len(missing) == 0
        assert "compliant" in message.lower()

    def test_compute_guardrail_status_non_compliant(self):
        """Test guardrail status for non-compliant evidence."""
        from main import _compute_guardrail_status
        
        tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Polarity", "status": "FAIL"},
            {"name": "Insulation Resistance", "status": "PASS"},
            {"name": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ELECTRICAL")
        
        assert status == "RED_SHIELD"
        assert len(missing) == 0
        assert "non-compliant" in message.lower()

    def test_compute_guardrail_status_missing_tests(self):
        """Test guardrail status with missing tests."""
        from main import _compute_guardrail_status
        
        tests = [
            {"name": "Earth Loop", "status": "PASS"},
            {"name": "Polarity", "status": "PASS"}
            # Missing Insulation Resistance and RCD Test
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ELECTRICAL")
        
        assert status == "AMBER_SHIELD"
        assert len(missing) == 2
        assert "Insulation Resistance" in missing
        assert "RCD Test" in missing

    def test_compute_guardrail_status_empty_tests(self):
        """Test guardrail status with empty tests."""
        from main import _compute_guardrail_status
        
        status, missing, message = _compute_guardrail_status("test transcript", [], "ELECTRICAL")
        
        assert status == "AMBER_SHIELD"
        assert len(missing) == 4  # All 4 electrical tests missing

    def test_assert_job_write_access_owner(self):
        """Test job write access assertion for owner."""
        from main import _assert_job_write_access
        
        mock_draft = Mock()
        mock_draft.organization_id = "org-123"
        
        mock_user = Mock()
        mock_user.organization_id = "org-123"
        mock_user.role = "OWNER"
        mock_user.trade = "ELECTRICAL"
        mock_user.organization_default_trade = "ELECTRICAL"
        
        # Should not raise exception
        _assert_job_write_access(mock_draft, mock_user)

    def test_assert_job_write_access_admin(self):
        """Test job write access assertion for admin."""
        from main import _assert_job_write_access
        
        mock_draft = Mock()
        mock_draft.organization_id = "org-123"
        
        mock_user = Mock()
        mock_user.organization_id = "org-123"
        mock_user.role = "ADMIN"
        
        # Should not raise exception
        _assert_job_write_access(mock_draft, mock_user)

    def test_assert_job_write_access_wrong_org(self):
        """Test job write access assertion with wrong organization."""
        from main import _assert_job_write_access
        
        mock_draft = Mock()
        mock_draft.organization_id = "org-456"
        
        mock_user = Mock()
        mock_user.organization_id = "org-123"
        mock_user.role = "OWNER"
        mock_user.trade = "ELECTRICAL"
        mock_user.organization_default_trade = "ELECTRICAL"
        
        with pytest.raises(HTTPException) as exc_info:
            _assert_job_write_access(mock_draft, mock_user)
        
        assert exc_info.value.status_code == 403

    def test_assert_job_write_access_insufficient_permissions(self):
        """Test job write access assertion with insufficient permissions."""
        from main import _assert_job_write_access
        
        mock_draft = Mock()
        mock_draft.organization_id = "org-123"
        
        mock_user = Mock()
        mock_user.organization_id = "org-123"
        mock_user.role = "MEMBER"  # Not OWNER or ADMIN
        
        with pytest.raises(HTTPException) as exc_info:
            _assert_job_write_access(mock_draft, mock_user)
        
        assert exc_info.value.status_code == 403

    def test_materials_supports_vector_column_true(self):
        """Test vector column support check when supported."""
        from main import _materials_supports_vector_column
        
        with patch('main.Material') as mock_material:
            # Mock hasattr to return True
            mock_material.vector_embedding = True
            result = _materials_supports_vector_column()
            assert result is True

    def test_materials_supports_vector_column_false(self):
        """Test vector column support check when not supported."""
        from main import _materials_supports_vector_column
        
        with patch('main.Material') as mock_material:
            # Mock hasattr to return False
            del mock_material.vector_embedding
            result = _materials_supports_vector_column()
            assert result is False

    def test_parse_materials_csv_success(self):
        """Test successful CSV parsing."""
        from main import _parse_materials_csv
        
        csv_content = b"""name,unit,unit_cost
Test Material 1,each,10.50
Test Material 2,meter,25.75
Test Material 3,box,5.25"""
        
        result = _parse_materials_csv(csv_content)
        
        assert len(result) == 3
        assert result[0]["name"] == "Test Material 1"
        assert result[0]["unit"] == "each"
        assert result[0]["unit_cost"] == "10.50"

    def test_parse_materials_csv_invalid_format(self):
        """Test CSV parsing with invalid format."""
        from main import _parse_materials_csv
        
        csv_content = b"""invalid,header,format
test,data"""
        
        with pytest.raises(ValueError) as exc_info:
            _parse_materials_csv(csv_content)
        
        assert "CSV must contain" in str(exc_info.value)

    def test_parse_materials_csv_empty(self):
        """Test parsing empty CSV."""
        from main import _parse_materials_csv
        
        csv_content = b""
        
        with pytest.raises(ValueError) as exc_info:
            _parse_materials_csv(csv_content)
        
        assert "No rows found" in str(exc_info.value)

    def test_xero_env_value_success(self):
        """Test getting Xero environment value successfully."""
        from main import _xero_env_value
        
        with patch.dict(os.environ, {'TEST_VAR': 'test-value'}):
            result = _xero_env_value('TEST_VAR')
            assert result == 'test-value'

    def test_xero_env_value_missing(self):
        """Test getting Xero environment value when missing."""
        from main import _xero_env_value
        
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(HTTPException) as exc_info:
                _xero_env_value('MISSING_VAR')
            
            assert exc_info.value.status_code == 500
            assert "not configured" in exc_info.value.detail

    def test_xero_state_secret(self):
        """Test getting Xero state secret."""
        from main import _xero_state_secret
        
        # Test with XERO_STATE_SECRET
        with patch.dict(os.environ, {'XERO_STATE_SECRET': 'xero-secret'}):
            result = _xero_state_secret()
            assert result == 'xero-secret'
        
        # Test with SECRET_KEY fallback
        with patch.dict(os.environ, {}, clear=True):
            with patch.dict(os.environ, {'SECRET_KEY': 'secret-key'}):
                result = _xero_state_secret()
                assert result == 'secret-key'
        
        # Test with default
        with patch.dict(os.environ, {}, clear=True):
            result = _xero_state_secret()
            assert result == 'sparkops-xero-state-secret'

    def test_build_xero_state(self):
        """Test building Xero state."""
        from main import _build_xero_state
        from uuid import uuid4
        
        org_id = uuid4()
        state = _build_xero_state(org_id)
        
        assert isinstance(state, str)
        assert len(state) > 0

    def test_to_invite_response(self):
        """Test converting invite to response."""
        from main import _to_invite_response
        from uuid import uuid4
        
        mock_invite = Mock()
        mock_invite.id = uuid4()
        mock_invite.organization_id = uuid4()
        mock_invite.email = "test@example.com"
        mock_invite.role = "MEMBER"
        mock_invite.created_at = datetime.now(timezone.utc)
        mock_invite.accepted_at = None
        
        response = _to_invite_response(mock_invite)
        
        assert response.id == mock_invite.id
        assert response.organization_id == mock_invite.organization_id
        assert response.email == "test@example.com"
        assert response.role == "MEMBER"

    def test_to_org_settings_response(self):
        """Test converting organization settings to response."""
        from main import _to_org_settings_response
        from uuid import uuid4
        
        mock_settings = Mock()
        mock_settings.organization_id = uuid4()
        mock_settings.logo_url = "https://example.com/logo.png"
        mock_settings.brand_color = "#FF0000"
        mock_settings.company_name = "Test Company"
        mock_settings.contact_email = "contact@test.com"
        mock_settings.tax_rate = 15.0
        mock_settings.standard_markup = 20.0
        
        response = _to_org_settings_response(mock_settings)
        
        assert response.organization_id == mock_settings.organization_id
        assert response.logo_url == "https://example.com/logo.png"
        assert response.brand_color == "#FF0000"
        assert response.company_name == "Test Company"
        assert response.contact_email == "contact@test.com"
        assert response.tax_rate == 15.0
        assert response.standard_markup == 20.0

    def test_to_vehicle_response(self):
        """Test converting vehicle to response."""
        from main import _to_vehicle_response
        from uuid import uuid4
        
        mock_vehicle = Mock()
        mock_vehicle.id = uuid4()
        mock_vehicle.organization_id = uuid4()
        mock_vehicle.make = "Toyota"
        mock_vehicle.model = "Hilux"
        mock_vehicle.year = 2023
        mock_vehicle.plate = "ABC123"
        mock_vehicle.vin = "12345678901234567"
        mock_vehicle.created_at = datetime.now(timezone.utc)
        
        response = _to_vehicle_response(mock_vehicle)
        
        assert response.id == mock_vehicle.id
        assert response.organization_id == mock_vehicle.organization_id
        assert response.make == "Toyota"
        assert response.model == "Hilux"
        assert response.year == 2023
        assert response.plate == "ABC123"
        assert response.vin == "12345678901234567"

    def test_build_auth_me_response(self):
        """Test building auth me response."""
        from main import _build_auth_me_response
        from uuid import uuid4
        
        mock_user = Mock()
        mock_user.id = uuid4()
        mock_user.email = "test@example.com"
        mock_user.role = "OWNER"
        mock_user.trade = "ELECTRICAL"
        mock_user.organization_default_trade = "ELECTRICAL"
        mock_user.organization_id = uuid4()
        mock_user.full_name = "Test User"
        
        response = _build_auth_me_response(mock_user)
        
        assert response.id == mock_user.id
        assert response.email == "test@example.com"
        assert response.role == "OWNER"
        assert response.organization_id == mock_user.organization_id
