"""Comprehensive tests for main.py to achieve 85% coverage target."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta
from typing import Any
import json
import base64
import io

# Import the main app
from main import app

# Create test client
client = TestClient(app)

class TestMainAPIComprehensive:
    """Comprehensive test suite for main.py API endpoints and utilities."""

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

    @patch('main.get_openai_client')
    def test_ingest_endpoint_success(self, mock_get_client):
        """Test successful audio ingestion."""
        # Mock OpenAI client
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Mock transcription response
        mock_transcription = Mock()
        mock_transcription.text = "Installed new lighting fixtures at client location"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        # Mock classification response
        mock_classification = Mock()
        mock_classification.choices[0].message.content = json.dumps({
            "urgency": "Medium",
            "summary": "Lighting installation work"
        })
        mock_client.chat.completions.create.return_value = mock_classification
        
        # Create test audio file
        audio_content = b"fake audio data"
        files = {"audio": ("test.wav", audio_content, "audio/wav")}
        
        response = client.post("/api/ingest", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "urgency" in data
        assert "summary" in data
        assert "transcript" in data

    @patch('main.get_openai_client')
    def test_ingest_endpoint_with_audio_bytes(self, mock_get_client):
        """Test audio ingestion with raw audio bytes."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Mock responses
        mock_transcription = Mock()
        mock_transcription.text = "Test transcription"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        mock_classification = Mock()
        mock_classification.choices[0].message.content = json.dumps({
            "urgency": "High",
            "summary": "Urgent electrical work"
        })
        mock_client.chat.completions.create.return_value = mock_classification
        
        # Test with audio bytes
        audio_bytes = b"fake audio content"
        files = {"audio": ("audio.mp3", io.BytesIO(audio_bytes), "audio/mpeg")}
        
        response = client.post("/api/ingest", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert data["urgency"] == "High"
        assert data["summary"] == "Urgent electrical work"

    @patch('main.get_openai_client')
    def test_ingest_endpoint_transcription_failure(self, mock_get_client):
        """Test ingestion when transcription fails."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        mock_client.audio.transcriptions.create.side_effect = Exception("Transcription failed")
        
        audio_content = b"fake audio data"
        files = {"audio": ("test.wav", audio_content, "audio/wav")}
        
        response = client.post("/api/ingest", files=files)
        
        assert response.status_code == 200  # Should still return 200 with error handling
        data = response.json()
        assert "urgency" in data
        assert "summary" in data

    @patch('main.get_openai_client')
    def test_ingest_endpoint_classification_failure(self, mock_get_client):
        """Test ingestion when classification fails."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Mock successful transcription
        mock_transcription = Mock()
        mock_transcription.text = "Test transcription"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        # Mock classification failure
        mock_client.chat.completions.create.side_effect = Exception("Classification failed")
        
        audio_content = b"fake audio data"
        files = {"audio": ("test.wav", audio_content, "audio/wav")}
        
        response = client.post("/api/ingest", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert "transcript" in data

    def test_ingest_endpoint_no_audio(self):
        """Test ingestion endpoint with no audio file."""
        response = client.post("/api/ingest", files={})
        assert response.status_code == 422  # Validation error

    @patch('main.get_openai_client')
    @patch('main.analyze_transcript')
    def test_ingest_endpoint_with_analysis(self, mock_analyze, mock_get_client):
        """Test ingestion with transcript analysis."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        # Mock transcription
        mock_transcription = Mock()
        mock_transcription.text = "Installed TPS cable and worked for 3 hours"
        mock_client.audio.transcriptions.create.return_value = mock_transcription
        
        # Mock classification
        mock_classification = Mock()
        mock_classification.choices[0].message.content = json.dumps({
            "urgency": "Medium",
            "summary": "Cable installation work"
        })
        mock_client.chat.completions.create.return_value = mock_classification
        
        # Mock analysis
        mock_analyze.return_value = {
            "line_items": [
                {"type": "MATERIAL", "description": "TPS cable", "qty": 1},
                {"type": "LABOR", "description": "Installation work", "qty": 3}
            ]
        }
        
        audio_content = b"fake audio data"
        files = {"audio": ("test.wav", audio_content, "audio/wav")}
        
        response = client.post("/api/ingest", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert "extracted_data" in data
        assert "line_items" in data["extracted_data"]

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
        result = transcribe_audio(b"audio data")
        
        assert result == "Transcribed text"
        mock_client.audio.transcriptions.create.assert_called_once()

    @patch('main.get_openai_client')
    def test_classify_urgency(self, mock_get_client):
        """Test urgency classification."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.choices[0].message.content = json.dumps({
            "urgency": "High",
            "summary": "Urgent work needed"
        })
        mock_client.chat.completions.create.return_value = mock_response
        
        from main import classify_urgency
        urgency, summary = classify_urgency("Test transcript")
        
        assert urgency == "High"
        assert summary == "Urgent work needed"

    @patch('main.get_openai_client')
    def test_classify_urgency_invalid_json(self, mock_get_client):
        """Test urgency classification with invalid JSON response."""
        mock_client = Mock()
        mock_get_client.return_value = mock_client
        
        mock_response = Mock()
        mock_response.choices[0].message.content = "invalid json"
        mock_client.chat.completions.create.return_value = mock_response
        
        from main import classify_urgency
        urgency, summary = classify_urgency("Test transcript")
        
        assert urgency == "Medium"  # Default value
        assert summary == "Client callback required."  # Default value

    def test_parse_classification_valid_json(self):
        """Test parsing valid classification JSON."""
        from main import parse_classification
        json_str = '{"urgency": "High", "summary": "Test summary"}'
        
        urgency, summary = parse_classification(json_str)
        
        assert urgency == "High"
        assert summary == "Test summary"

    def test_parse_classification_invalid_json(self):
        """Test parsing invalid classification JSON."""
        from main import parse_classification
        json_str = "invalid json"
        
        urgency, summary = parse_classification(json_str)
        
        assert urgency == "Medium"  # Default value
        assert summary == "Client callback required."  # Default value

    def test_parse_classification_missing_fields(self):
        """Test parsing JSON with missing fields."""
        from main import parse_classification
        json_str = '{"urgency": "High"}'  # Missing summary
        
        urgency, summary = parse_classification(json_str)
        
        assert urgency == "High"
        assert summary == "Client callback required."  # Default value

    def test_normalize_safety_test_valid(self):
        """Test normalizing valid safety test names."""
        from main import normalize_safety_test
        
        assert normalize_safety_test("earth_loop") == "earth_loop"
        assert normalize_safety_test("EARTH_LOOP") == "earth_loop"
        assert normalize_safety_test("Earth Loop") == "earth_loop"
        assert normalize_safety_test("  earth_loop  ") == "earth_loop"

    def test_normalize_safety_test_invalid(self):
        """Test normalizing invalid safety test names."""
        from main import normalize_safety_test
        
        assert normalize_safety_test("invalid_test") is None
        assert normalize_safety_test("") is None
        assert normalize_safety_test(None) is None

    def test_normalize_trade_valid(self):
        """Test normalizing valid trade names."""
        from main import normalize_trade
        
        assert normalize_trade("electrical") == "ELECTRICAL"
        assert normalize_trade("ELECTRICAL") == "ELECTRICAL"
        assert normalize_trade("plumbing") == "PLUMBING"
        assert normalize_trade("PLUMBING") == "PLUMBING"
        assert normalize_trade("any") == "ANY"

    def test_normalize_trade_invalid(self):
        """Test normalizing invalid trade names."""
        from main import normalize_trade
        
        assert normalize_trade("invalid") == "ELECTRICAL"  # Default
        assert normalize_trade("") == "ELECTRICAL"
        assert normalize_trade(None) == "ELECTRICAL"

    def test_compute_guardrail_status_compliant(self):
        """Test guardrail status for compliant evidence."""
        from main import compute_guardrail_status
        
        evidence = {
            "earth_loop": {"status": "PASS", "value": "0.32 Ohms"},
            "polarity": {"status": "PASS", "value": "Correct"},
            "insulation": {"status": "PASS", "value": "500MΩ"},
            "rcd": {"status": "PASS", "value": "Trip time 20ms"}
        }
        
        status = compute_guardrail_status(evidence, "ELECTRICAL")
        
        assert status == "COMPLIANT"

    def test_compute_guardrail_status_non_compliant(self):
        """Test guardrail status for non-compliant evidence."""
        from main import compute_guardrail_status
        
        evidence = {
            "earth_loop": {"status": "PASS", "value": "0.32 Ohms"},
            "polarity": {"status": "FAIL", "value": "Incorrect"},
            "insulation": {"status": "PASS", "value": "500MΩ"},
            "rcd": {"status": "PASS", "value": "Trip time 20ms"}
        }
        
        status = compute_guardrail_status(evidence, "ELECTRICAL")
        
        assert status == "NON_COMPLIANT"

    def test_compute_guardrail_status_missing_tests(self):
        """Test guardrail status with missing tests."""
        from main import compute_guardrail_status
        
        evidence = {
            "earth_loop": {"status": "PASS", "value": "0.32 Ohms"},
            "polarity": {"status": "PASS", "value": "Correct"}
            # Missing insulation and rcd
        }
        
        status = compute_guardrail_status(evidence, "ELECTRICAL")
        
        assert status == "ACTION_REQUIRED"

    def test_compute_guardrail_status_empty_evidence(self):
        """Test guardrail status with empty evidence."""
        from main import compute_guardrail_status
        
        status = compute_guardrail_status({}, "ELECTRICAL")
        
        assert status == "ACTION_REQUIRED"

    def test_has_job_write_access_owner(self):
        """Test job write access for owner."""
        from main import has_job_write_access
        
        # Mock user as owner
        mock_user = Mock()
        mock_user.id = "owner-id"
        
        with patch('main.ORGANIZATION_OWNER_ID', "owner-id"):
            assert has_job_write_access(mock_user, "job-id") is True

    def test_has_job_write_access_non_owner(self):
        """Test job write access for non-owner."""
        from main import has_job_write_access
        
        # Mock user as non-owner
        mock_user = Mock()
        mock_user.id = "user-id"
        
        with patch('main.ORGANIZATION_OWNER_ID', "owner-id"):
            assert has_job_write_access(mock_user, "job-id") is False

    def test_generate_embedding(self):
        """Test embedding generation."""
        with patch('main.get_openai_client') as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            
            mock_embedding = Mock()
            mock_embedding.data[0].embedding = [0.1, 0.2, 0.3]
            mock_client.embeddings.create.return_value = mock_embedding
            
            from main import generate_embedding
            result = generate_embedding("test text")
            
            assert result == [0.1, 0.2, 0.3]

    def test_generate_embedding_failure(self):
        """Test embedding generation failure."""
        with patch('main.get_openai_client') as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            mock_client.embeddings.create.side_effect = Exception("API Error")
            
            from main import generate_embedding
            result = generate_embedding("test text")
            
            assert result is None

    def test_materials_upsert_success(self):
        """Test successful materials upsert."""
        mock_db = Mock()
        mock_material = Mock()
        mock_material.id = "material-id"
        
        with patch('main.get_database', return_value=mock_db):
            with patch('main.Material', return_value=mock_material):
                from main import materials_upsert
                
                material_data = {
                    "name": "Test Material",
                    "unit": "each",
                    "unit_cost": 10.50
                }
                
                result = materials_upsert(material_data)
                
                assert result is not None
                mock_db.add.assert_called()
                mock_db.commit.assert_called()

    def test_materials_upsert_failure(self):
        """Test materials upsert failure."""
        mock_db = Mock()
        mock_db.add.side_effect = Exception("Database error")
        
        with patch('main.get_database', return_value=mock_db):
            from main import materials_upsert
            
            material_data = {
                "name": "Test Material",
                "unit": "each",
                "unit_cost": 10.50
            }
            
            with pytest.raises(HTTPException) as exc_info:
                materials_upsert(material_data)
            
            assert exc_info.value.status_code == 500

    def test_import_materials_csv_success(self):
        """Test successful CSV materials import."""
        csv_content = """name,unit,unit_cost
Test Material 1,each,10.50
Test Material 2,meter,25.75
Test Material 3,box,5.25"""
        
        mock_db = Mock()
        
        with patch('main.get_database', return_value=mock_db):
            with patch('main.Material') as mock_material_class:
                mock_material = Mock()
                mock_material.id = "material-id"
                mock_material_class.return_value = mock_material
                
                from main import import_materials
                
                file_obj = io.StringIO(csv_content)
                result = import_materials(file_obj)
                
                assert result["imported"] == 3
                assert mock_db.add.call_count == 3
                assert mock_db.commit.call_count == 3

    def test_import_materials_csv_invalid_format(self):
        """Test CSV import with invalid format."""
        csv_content = """invalid,header,format
test,data"""
        
        from main import import_materials
        
        file_obj = io.StringIO(csv_content)
        
        with pytest.raises(HTTPException) as exc_info:
            import_materials(file_obj)
        
        assert exc_info.value.status_code == 400

    def test_import_materials_empty_csv(self):
        """Test importing empty CSV."""
        csv_content = ""
        
        from main import import_materials
        
        file_obj = io.StringIO(csv_content)
        result = import_materials(file_obj)
        
        assert result["imported"] == 0

    def test_build_auth_response_success(self):
        """Test building successful auth response."""
        mock_user = Mock()
        mock_user.id = "user-id"
        mock_user.email = "test@example.com"
        
        mock_session = Mock()
        mock_session.access_token = "access-token"
        mock_session.refresh_token = "refresh-token"
        mock_session.expires_at = 1234567890
        
        from main import build_auth_response
        result = build_auth_response(mock_user, mock_session)
        
        assert result["user"]["id"] == "user-id"
        assert result["user"]["email"] == "test@example.com"
        assert result["access_token"] == "access-token"
        assert result["refresh_token"] == "refresh-token"

    def test_build_auth_response_no_session(self):
        """Test building auth response with no session."""
        mock_user = Mock()
        mock_user.id = "user-id"
        mock_user.email = "test@example.com"
        
        from main import build_auth_response
        result = build_auth_response(mock_user, None)
        
        assert result["user"]["id"] == "user-id"
        assert result["access_token"] is None
        assert result["refresh_token"] is None

    def test_get_xero_environment(self):
        """Test getting Xero environment."""
        with patch.dict(os.environ, {'XERO_ENVIRONMENT': 'production'}):
            from main import get_xero_environment
            assert get_xero_environment() == 'production'

    def test_get_xero_environment_default(self):
        """Test getting Xero environment with default."""
        with patch.dict(os.environ, {}, clear=True):
            from main import get_xero_environment
            assert get_xero_environment() == 'development'

    def test_generate_xero_state(self):
        """Test generating Xero state."""
        with patch('secrets.token_urlsafe', return_value='test-token'):
            from main import generate_xero_state
            state = generate_xero_state()
            
            assert state == 'test-token'

    def test_verify_xero_state_success(self):
        """Test successful Xero state verification."""
        mock_state = "test-state"
        mock_signature = "test-signature"
        
        with patch('main.XERO_STATE_SECRET', 'test-secret'):
            with patch('hmac.compare_digest', return_value=True):
                from main import verify_xero_state
                result = verify_xero_state(mock_state, mock_signature)
                
                assert result is True

    def test_verify_xero_state_failure(self):
        """Test failed Xero state verification."""
        mock_state = "test-state"
        mock_signature = "test-signature"
        
        with patch('main.XERO_STATE_SECRET', 'test-secret'):
            with patch('hmac.compare_digest', return_value=False):
                from main import verify_xero_state
                result = verify_xero_state(mock_state, mock_signature)
                
                assert result is False

    def test_format_invoice_line_items(self):
        """Test formatting invoice line items."""
        line_items = [
            {"type": "MATERIAL", "description": "Cable", "qty": 10, "unit_price": 5.50},
            {"type": "LABOR", "description": "Installation", "qty": 2, "unit_price": 75.00}
        ]
        
        from main import format_invoice_line_items
        result = format_invoice_line_items(line_items)
        
        assert len(result) == 2
        assert result[0]["description"] == "Cable"
        assert result[0]["quantity"] == 10
        assert result[0]["unit_amount"] == 5.50
        assert result[1]["description"] == "Installation"
        assert result[1]["quantity"] == 2
        assert result[1]["unit_amount"] == 75.00

    def test_format_invoice_line_items_empty(self):
        """Test formatting empty line items."""
        from main import format_invoice_line_items
        result = format_invoice_line_items([])
        
        assert result == []

    def test_format_invoice_line_items_missing_fields(self):
        """Test formatting line items with missing fields."""
        line_items = [
            {"type": "MATERIAL", "description": "Cable"}  # Missing qty and unit_price
        ]
        
        from main import format_invoice_line_items
        result = format_invoice_line_items(line_items)
        
        assert len(result) == 1
        assert result[0]["description"] == "Cable"
        assert result[0]["quantity"] == 0  # Default
        assert result[0]["unit_amount"] == 0  # Default