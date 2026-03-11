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
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data

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
    @patch('main.AudioSegment')
    def test_transcribe_audio(self, mock_audio_segment, mock_get_client):
        """Test audio transcription endpoint with mocked OpenAI client."""
        from main import transcribe_audio
        
        # Mock the wav conversion
        mock_segment_instance = Mock()
        mock_segment_instance.export.return_value = io.BytesIO(b"mock_wav_data")
        mock_audio_segment.from_file.return_value = mock_segment_instance
        
        # Mock OpenAI client
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Mock response
        mock_message = Mock()
        mock_message.content = "Test transcription"
        mock_choice = Mock()
        mock_choice.message = mock_message
        mock_response = Mock()
        mock_response.choices = [mock_choice]
        
        mock_client.chat.completions.create.return_value = mock_response
        
        # Test valid base64
        valid_base64 = base64.b64encode(b"fake audio data").decode('utf-8')
        result = transcribe_audio(valid_base64)
        
        assert result == "Test transcription"
        
        # Verify OpenAI was called correctly
        mock_client.chat.completions.create.assert_called_once()
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini-audio-preview"
        assert "messages" in call_kwargs

    @patch('main.get_openai_client')
    @patch('main.AudioSegment')
    def test_transcribe_audio_failure(self, mock_audio_segment, mock_get_client):
        """Test audio transcription failure handling."""
        from main import transcribe_audio
        
        # Mock the wav conversion
        mock_segment_instance = Mock()
        mock_segment_instance.export.return_value = io.BytesIO(b"mock_wav_data")
        mock_audio_segment.from_file.return_value = mock_segment_instance
        
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Make OpenAI raise an exception
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        valid_base64 = base64.b64encode(b"fake audio data").decode('utf-8')
        
        with pytest.raises(HTTPException) as exc_info:
            transcribe_audio(valid_base64)
            
        assert exc_info.value.status_code == 500
        assert "Transcription failed" in str(exc_info.value.detail)

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
        
        with pytest.raises(Exception, match="API Error"):
            embed_text("test text")

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
                {"type": "Earth Loop", "result": "PASS", "value": "0.32", "unit": "Ohms"},
                {"type": "Polarity", "result": "PASS", "value": "Correct"}
            ]
        }
        
        result = _normalize_safety_tests(extracted_data, None, None)
        
        assert len(result) == 2
        assert result[0]["test_type"] == "Earth Loop"
        assert result[0]["result"] == "PASS"
        assert result[0]["value_text"] == "0.32"
        assert result[0]["unit"] == "Ohms"
        assert result[1]["test_type"] == "Polarity"
        assert result[1]["result"] == "PASS"
        assert result[1]["value_text"] == "Correct"

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
        assert len(any_tests) == 7  # All tests are required for ANY trade

    def test_compute_guardrail_status_compliant(self):
        """Test guardrail status for compliant evidence."""
        from main import _compute_guardrail_status
        
        tests = [
            {"test_type": "Earth Loop", "status": "PASS"},
            {"test_type": "Polarity", "status": "PASS"},
            {"test_type": "Insulation Resistance", "status": "PASS"},
            {"test_type": "RCD Test", "status": "PASS"}
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ELECTRICAL")
        
        assert status == "GREEN_SHIELD"
        assert len(missing) == 0
        assert "compliant" in message.lower()

    def test_compute_guardrail_status_non_compliant(self):
        """Test guardrail status for missing tests (non-compliant)."""
        from main import _compute_guardrail_status
        
        tests = [
            {"test_type": "Earth Loop", "status": "PASS"},
            {"test_type": "Polarity", "status": "FAIL"},
            # Missing Insulation Resistance and RCD Test
        ]
        
        status, missing, message = _compute_guardrail_status("test transcript", tests, "ELECTRICAL")
        
        assert status == "RED_SHIELD"
        assert len(missing) == 2
        assert "Insulation Resistance" in missing
        assert "RCD Test" in missing

    def test_compute_guardrail_status_empty_tests(self):
        """Test guardrail status with empty tests."""
        from main import _compute_guardrail_status
        
        # When transcript is empty and tests are empty, it should be NOT_REQUIRED
        status, missing, message = _compute_guardrail_status("", [], "ELECTRICAL")
        
        assert status == "NOT_REQUIRED"
        
        # When transcript exists but tests are empty, it should be RED_SHIELD
        status, missing, message = _compute_guardrail_status("test transcript", [], "ELECTRICAL")
        
        assert status == "RED_SHIELD"
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
        mock_user.id = mock_draft.user_id # Ensure it passes if role is not OWNER but user_id matches
        
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
        mock_draft.user_id = "user-abc"
        
        mock_user = Mock()
        mock_user.id = "user-xyz"
        mock_user.organization_id = "org-123"
        mock_user.role = "MEMBER"  # Not OWNER
        
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
        
        csv_content = b"""sku,name,price
SKU1,Test Material 1,10.50
SKU2,Test Material 2,25.75
SKU3,Test Material 3,5.25"""
        
        result = _parse_materials_csv(csv_content)
        
        assert len(result) == 3
        assert result[0]["name"] == "Test Material 1"
        assert result[0]["sku"] == "SKU1"
        assert result[0]["price"] == "10.50"

    def test_parse_materials_csv_invalid_format(self):
        """Test CSV parsing with invalid format."""
        from main import _parse_materials_csv
        
        csv_content = b"""invalid,header,format
test,data,missing"""
        
        with pytest.raises(ValueError) as exc_info:
            _parse_materials_csv(csv_content)
        
        assert "CSV did not contain valid materials rows" in str(exc_info.value)

    def test_parse_materials_csv_empty(self):
        """Test parsing empty CSV."""
        from main import _parse_materials_csv
        
        csv_content = b""
        
        with pytest.raises(ValueError) as exc_info:
            _parse_materials_csv(csv_content)
        
        assert "CSV headers are required" in str(exc_info.value)

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
        mock_invite.full_name = "Test User"
        mock_invite.role = "MEMBER"
        mock_invite.status = "PENDING"
        mock_invite.invited_by_user_id = uuid4()
        mock_invite.created_at = datetime.now(timezone.utc)
        mock_invite.accepted_at = None
        
        response = _to_invite_response(mock_invite)
        
        assert response.id == mock_invite.id
        assert response.organization_id == mock_invite.organization_id
        assert response.email == "test@example.com"
        assert response.full_name == "Test User"
        assert response.role == "MEMBER"
        assert response.status == "PENDING"
        assert response.invited_by_user_id == mock_invite.invited_by_user_id

    def test_to_org_settings_response(self):
        """Test converting organization settings to response."""
        from main import _to_org_settings_response
        from uuid import uuid4
        
        mock_settings = Mock()
        mock_settings.organization_id = uuid4()
        mock_settings.logo_url = "https://example.com/logo.png"
        mock_settings.business_name = "Test Business"
        mock_settings.website_url = "https://example.com"
        mock_settings.gst_number = "123-456-789"
        mock_settings.default_trade = "ELECTRICAL"
        mock_settings.terms_and_conditions = "Terms"
        mock_settings.bank_account_name = "Test Account"
        mock_settings.bank_account_number = "12-3456-1234567-00"
        mock_settings.tax_rate = 15.0
        mock_settings.standard_markup = 20.0
        mock_settings.licensed_seats = 1
        mock_settings.subscription_status = "ACTIVE"
        mock_settings.plan_type = "BASE"
        mock_settings.trial_started_at = None
        mock_settings.trial_ends_at = None
        mock_settings.stripe_customer_id = None
        mock_settings.stripe_subscription_id = None
        mock_settings.updated_at = datetime.now(timezone.utc)
        
        response = _to_org_settings_response(mock_settings)
        
        assert response.organization_id == mock_settings.organization_id
        assert response.logo_url == "https://example.com/logo.png"
        assert response.business_name == "Test Business"
        assert response.website_url == "https://example.com"
        assert response.gst_number == "123-456-789"
        assert response.tax_rate == 15.0
        assert response.standard_markup == 20.0

    def test_to_vehicle_response(self):
        """Test converting vehicle to response."""
        from main import _to_vehicle_response
        from uuid import uuid4
        
        mock_vehicle = Mock()
        mock_vehicle.id = uuid4()
        mock_vehicle.organization_id = uuid4()
        mock_vehicle.name = "Toyota Hilux"
        mock_vehicle.plate = "ABC123"
        mock_vehicle.notes = "Company truck"
        mock_vehicle.created_at = datetime.now(timezone.utc)
        mock_vehicle.updated_at = datetime.now(timezone.utc)
        
        response = _to_vehicle_response(mock_vehicle)
        
        assert response.id == mock_vehicle.id
        assert response.organization_id == mock_vehicle.organization_id
        assert response.name == "Toyota Hilux"
        assert response.plate == "ABC123"
        assert response.notes == "Company truck"

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
