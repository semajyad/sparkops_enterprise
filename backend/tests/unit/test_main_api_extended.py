"""Extended unit tests for main API functions to improve coverage."""

from __future__ import annotations

import os
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from main import (
    get_openai_client,
    transcribe_audio,
    embed_text,
    embed_text_batch,
    _assert_job_write_access,
    _materials_supports_vector_column,
    _upsert_materials_rows,
    import_materials,
    _build_auth_me_response,
    _to_invite_response,
    _to_org_settings_response,
    _to_vehicle_response,
    _xero_env_value,
    _xero_state_secret,
    _build_xero_state,
)


def test_get_openai_client() -> None:
    """Test OpenAI client creation."""
    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
        client = get_openai_client()
        assert client.api_key == "test-key"


def test_get_openai_client_missing_key() -> None:
    """Test OpenAI client creation with missing API key."""
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(HTTPException, match="OPENAI_API_KEY is not configured"):
            get_openai_client()


def test_transcribe_audio() -> None:
    """Test audio transcription."""
    audio_base64 = "dGVzdCBhdWRpbyBkYXRh"  # "test audio data" in base64
    
    with patch("main.get_openai_client") as mock_client:
        mock_audio_response = Mock()
        mock_audio_response.text = "Test transcription"
        
        mock_client.return_value.audio.transcriptions.create.return_value = mock_audio_response
        
        result = transcribe_audio(audio_base64)
        assert result == "Test transcription"


def test_embed_text() -> None:
    """Test text embedding generation."""
    with patch("main.get_openai_client") as mock_client:
        mock_embedding_response = Mock()
        mock_embedding_response.data = [Mock(embedding=[0.1, 0.2, 0.3])]
        
        mock_client.return_value.embeddings.create.return_value = mock_embedding_response
        
        result = embed_text("test text")
        assert result == [0.1, 0.2, 0.3]


def test_embed_text_batch() -> None:
    """Test batch text embedding generation."""
    texts = ["text1", "text2"]
    
    with patch("main.get_openai_client") as mock_client:
        mock_embedding_response = Mock()
        mock_embedding_response.data = [
            Mock(embedding=[0.1, 0.2, 0.3]),
            Mock(embedding=[0.4, 0.5, 0.6]),
        ]
        
        mock_client.return_value.embeddings.create.return_value = mock_embedding_response
        
        result = embed_text_batch(texts)
        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]


def test_embed_text_batch_empty() -> None:
    """Test batch embedding with empty input."""
    result = embed_text_batch([])
    assert result == []


def test_assert_job_write_access_owner() -> None:
    """Test job write access for owner."""
    draft = Mock()
    draft.organization_id = "org-123"
    
    user = Mock()
    user.organization_id = "org-123"
    user.role = "OWNER"
    
    # Should not raise exception
    _assert_job_write_access(draft, user)


def test_assert_job_write_access_field_user() -> None:
    """Test job write access for field user."""
    draft = Mock()
    draft.organization_id = "org-123"
    draft.created_by = "user-456"
    
    user = Mock()
    user.organization_id = "org-123"
    user.role = "FIELD"
    user.id = "user-456"
    
    # Should not raise exception
    _assert_job_write_access(draft, user)


def test_assert_job_write_access_wrong_org() -> None:
    """Test job write access with wrong organization."""
    draft = Mock()
    draft.organization_id = "org-123"
    
    user = Mock()
    user.organization_id = "org-456"
    user.role = "OWNER"
    
    with pytest.raises(HTTPException, match="belongs to another organization"):
        _assert_job_write_access(draft, user)


def test_assert_job_write_access_insufficient_permissions() -> None:
    """Test job write access with insufficient permissions."""
    draft = Mock()
    draft.organization_id = "org-123"
    draft.created_by = "user-789"
    
    user = Mock()
    user.organization_id = "org-123"
    user.role = "FIELD"
    user.id = "user-456"
    
    with pytest.raises(HTTPException, match="Insufficient permissions"):
        _assert_job_write_access(draft, user)


def test_materials_supports_vector_column() -> None:
    """Test vector column support detection."""
    result = _materials_supports_vector_column()
    assert isinstance(result, bool)


def test_upsert_materials_rows_with_vector() -> None:
    """Test materials upsert with vector support."""
    rows = [{"sku": "TEST001", "name": "Test Material", "price": "10.50"}]
    embeddings = [[0.1, 0.2, 0.3]]
    
    with patch("main.Session") as mock_session, \
         patch("main._materials_supports_vector_column", return_value=True):
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.exec.return_value = Mock()
        mock_session_instance.commit.return_value = None
        
        count = _upsert_materials_rows(rows, embeddings, True)
        assert count == 1


def test_upsert_materials_rows_without_vector() -> None:
    """Test materials upsert without vector support."""
    rows = [{"sku": "TEST001", "name": "Test Material", "price": "10.50"}]
    
    with patch("main.Session") as mock_session, \
         patch("main._materials_supports_vector_column", return_value=False):
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.exec.return_value = Mock()
        mock_session_instance.commit.return_value = None
        
        count = _upsert_materials_rows(rows, None, False)
        assert count == 1


def test_import_materials() -> None:
    """Test materials import."""
    csv_content = b"sku,name,price\nTEST001,Test Material,10.50\n"
    
    with patch("main._parse_materials_csv") as mock_parse, \
         patch("main._materials_supports_vector_column", return_value=False), \
         patch("main._upsert_materials_rows", return_value=1):
        
        mock_parse.return_value = [{"sku": "TEST001", "name": "Test Material", "price": "10.50"}]
        
        user = Mock()
        result = import_materials(csv_content, "test.csv", user)
        
        assert result.imported == 1
        assert result.failed == 0


def test_build_auth_me_response() -> None:
    """Test auth me response building."""
    user = Mock()
    user.id = "user-123"
    user.organization_id = "org-123"
    user.role = "OWNER"
    user.email = "test@example.com"
    
    response = _build_auth_me_response(user)
    
    assert response.user_id == "user-123"
    assert response.organization_id == "org-123"
    assert response.role == "OWNER"
    assert response.email == "test@example.com"


def test_to_invite_response() -> None:
    """Test invite response building."""
    invite = Mock()
    invite.id = "invite-123"
    invite.organization_id = "org-123"
    invite.email = "test@example.com"
    invite.role = "FIELD"
    invite.created_at = "2023-01-01T00:00:00Z"
    invite.accepted_at = None
    
    response = _to_invite_response(invite)
    
    assert response.id == "invite-123"
    assert response.organization_id == "org-123"
    assert response.email == "test@example.com"
    assert response.role == "FIELD"
    assert response.accepted_at is None


def test_to_org_settings_response() -> None:
    """Test organization settings response building."""
    settings = Mock()
    settings.organization_id = "org-123"
    settings.logo_url = "https://example.com/logo.png"
    settings.business_name = "Test Business"
    settings.contact_email = "contact@example.com"
    settings.phone = "+64 21 123 4567"
    settings.address = "123 Test St"
    settings.xero_tenant_id = "tenant-123"
    
    response = _to_org_settings_response(settings)
    
    assert response.organization_id == "org-123"
    assert response.logo_url == "https://example.com/logo.png"
    assert response.business_name == "Test Business"
    assert response.contact_email == "contact@example.com"


def test_to_vehicle_response() -> None:
    """Test vehicle response building."""
    vehicle = Mock()
    vehicle.id = "vehicle-123"
    vehicle.organization_id = "org-123"
    vehicle.make = "Toyota"
    vehicle.model = "Hilux"
    vehicle.license_plate = "ABC123"
    vehicle.year = 2023
    vehicle.created_at = "2023-01-01T00:00:00Z"
    
    response = _to_vehicle_response(vehicle)
    
    assert response.id == "vehicle-123"
    assert response.make == "Toyota"
    assert response.model == "Hilux"
    assert response.license_plate == "ABC123"
    assert response.year == 2023


def test_xero_env_value() -> None:
    """Test Xero environment value retrieval."""
    with patch.dict(os.environ, {"XERO_CLIENT_ID": "test-client-id"}):
        result = _xero_env_value("XERO_CLIENT_ID")
        assert result == "test-client-id"


def test_xero_env_value_missing() -> None:
    """Test Xero environment value retrieval with missing value."""
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(HTTPException, match="XERO_CLIENT_ID is not configured"):
            _xero_env_value("XERO_CLIENT_ID")


def test_xero_state_secret() -> None:
    """Test Xero state secret generation."""
    with patch.dict(os.environ, {"XERO_STATE_SECRET": "test-secret"}):
        result = _xero_state_secret()
        assert result == "test-secret"


def test_xero_state_secret_fallback() -> None:
    """Test Xero state secret fallback to SECRET_KEY."""
    with patch.dict(os.environ, {"SECRET_KEY": "fallback-secret"}, clear=True):
        result = _xero_state_secret()
        assert result == "fallback-secret"


def test_xero_state_secret_default() -> None:
    """Test Xero state secret default value."""
    with patch.dict(os.environ, {}, clear=True):
        result = _xero_state_secret()
        assert result == "sparkops-xero-state-secret"


def test_build_xero_state() -> None:
    """Test Xero state building."""
    org_id = "org-123"
    
    with patch("main._xero_state_secret", return_value="test-secret"):
        with patch("main.jwt.encode", return_value="encoded-state"):
            result = _build_xero_state(org_id)
            assert result == "encoded-state"