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
        with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
            get_openai_client()


@patch("main.get_openai_client")
@patch("main.AudioSegment")
def test_transcribe_audio(mock_audio_segment, mock_get_client) -> None:
    """Test audio transcription."""
    audio_base64 = "dGVzdCBhdWRpbyBkYXRh"  # "test audio data" in base64
    
    # Mock the wav conversion
    import io
    mock_segment_instance = Mock()
    mock_segment_instance.export.return_value = io.BytesIO(b"mock_wav_data")
    mock_audio_segment.from_file.return_value = mock_segment_instance
    
    mock_audio_response = Mock()
    # Support both property accesses
    mock_message = Mock()
    mock_message.content = "Test transcription"
    mock_choice = Mock()
    mock_choice.message = mock_message
    mock_audio_response.choices = [mock_choice]
    
    mock_get_client.return_value.chat.completions.create.return_value = mock_audio_response
    
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
    draft.user_id = "user-456"
    
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
    draft.user_id = "user-789"
    
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
    
    from uuid import uuid4
    org_id = uuid4()
    user_id = uuid4()
    
    with patch("main.Session") as mock_session, \
         patch("main._materials_supports_vector_column", return_value=True):
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.exec.return_value = Mock()
        mock_session_instance.commit.return_value = None
        
        count = _upsert_materials_rows(rows, embeddings, True, org_id, user_id)
        assert count == 1


def test_upsert_materials_rows_without_vector() -> None:
    """Test materials upsert without vector support."""
    rows = [{"sku": "TEST001", "name": "Test Material", "price": "10.50"}]
    
    from uuid import uuid4
    org_id = uuid4()
    user_id = uuid4()
    
    with patch("main.Session") as mock_session, \
         patch("main._materials_supports_vector_column", return_value=False):
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.exec.return_value = Mock()
        mock_session_instance.commit.return_value = None
        
        count = _upsert_materials_rows(rows, None, False, org_id, user_id)
        assert count == 1


def test_import_materials() -> None:
    """Test materials import."""
    csv_content = b"sku,name,price\nTEST001,Test Material,10.50\n"
    
    from uuid import uuid4
    
    with patch("main._parse_materials_csv") as mock_parse, \
         patch("main._materials_supports_vector_column", return_value=False), \
         patch("main._upsert_materials_rows", return_value=1):
        
        mock_parse.return_value = [{"sku": "TEST001", "name": "Test Material", "price": "10.50"}]
        
        user = Mock()
        user.organization_id = uuid4()
        user.id = uuid4()
        result = import_materials(csv_content, "test.csv", user)
        
        assert result.status == "ok"
        assert result.imported_count == 1
        assert result.failed_count == 0


def test_build_auth_me_response() -> None:
    """Test auth me response building."""
    from uuid import uuid4
    user = Mock()
    user.id = uuid4()
    user.organization_id = uuid4()
    user.role = "OWNER"
    user.email = "test@example.com"
    user.trade = "ELECTRICAL"
    user.organization_default_trade = "ELECTRICAL"
    user.full_name = "Test User"
    
    response = _build_auth_me_response(user)
    
    assert response.id == user.id
    assert response.organization_id == user.organization_id
    assert response.role == "OWNER"
    assert response.email == "test@example.com"


def test_to_invite_response() -> None:
    """Test invite response building."""
    from uuid import uuid4
    from datetime import datetime, timezone
    
    invite = Mock()
    invite.id = uuid4()
    invite.organization_id = uuid4()
    invite.email = "test@example.com"
    invite.full_name = "Test User"
    invite.role = "FIELD"
    invite.status = "PENDING"
    invite.invited_by_user_id = uuid4()
    invite.created_at = datetime.now(timezone.utc)
    invite.accepted_at = None
    
    response = _to_invite_response(invite)
    
    assert response.id == invite.id
    assert response.organization_id == invite.organization_id
    assert response.email == "test@example.com"
    assert response.role == "FIELD"
    assert response.accepted_at is None


def test_to_org_settings_response() -> None:
    """Test organization settings response building."""
    from uuid import uuid4
    from datetime import datetime, timezone
    settings = Mock()
    settings.organization_id = uuid4()
    settings.logo_url = "https://example.com/logo.png"
    settings.website_url = "https://example.com"
    settings.business_name = "Test Business"
    settings.gst_number = "123-456-789"
    settings.default_trade = "ELECTRICAL"
    settings.tax_rate = 15.0
    settings.standard_markup = 20.0
    settings.terms_and_conditions = "Test terms"
    settings.bank_account_name = "Test Account"
    settings.bank_account_number = "12-3456-1234567-00"
    settings.subscription_status = "ACTIVE"
    settings.plan_type = "BASE"
    settings.licensed_seats = 1
    settings.trial_started_at = None
    settings.trial_ends_at = None
    settings.stripe_customer_id = None
    settings.stripe_subscription_id = None
    settings.updated_at = datetime.now(timezone.utc)
    
    response = _to_org_settings_response(settings)
    
    assert response.organization_id == settings.organization_id
    assert response.logo_url == "https://example.com/logo.png"
    assert response.business_name == "Test Business"
    assert response.website_url == "https://example.com"


def test_to_vehicle_response() -> None:
    """Test vehicle response building."""
    from uuid import uuid4
    from datetime import datetime, timezone
    
    vehicle = Mock()
    vehicle.id = uuid4()
    vehicle.organization_id = uuid4()
    vehicle.name = "Toyota Hilux"
    vehicle.plate = "ABC123"
    vehicle.notes = "Company truck"
    vehicle.created_at = datetime.now(timezone.utc)
    vehicle.updated_at = datetime.now(timezone.utc)
    
    response = _to_vehicle_response(vehicle)
    
    assert response.id == vehicle.id
    assert response.name == "Toyota Hilux"
    assert response.plate == "ABC123"
    assert response.notes == "Company truck"


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
    from uuid import uuid4
    org_id = uuid4()
    
    with patch("main._xero_state_secret", return_value="test-secret"):
        result = _build_xero_state(org_id)
        # Should return a string in the format payload.signature
        assert isinstance(result, str)
        assert "." in result
        
        parts = result.split(".")
        assert len(parts) == 2
        assert len(parts[0]) > 0
        assert len(parts[1]) > 0