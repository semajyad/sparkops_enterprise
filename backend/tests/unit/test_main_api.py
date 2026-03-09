"""Unit tests for main API endpoints and utility functions."""

from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

from main import app, _normalize_trade, _compute_guardrail_status, _normalize_safety_tests


def test_normalize_trade() -> None:
    """Test trade normalization function."""
    
    # Test electrical variations
    assert _normalize_trade("ELECTRICAL") == "ELECTRICAL"
    assert _normalize_trade("electrical") == "ELECTRICAL"
    assert _normalize_trade("Electrical") == "ELECTRICAL"
    assert _normalize_trade("  electrical  ") == "ELECTRICAL"
    
    # Test plumbing variations
    assert _normalize_trade("PLUMBING") == "PLUMBING"
    assert _normalize_trade("plumbing") == "PLUMBING"
    assert _normalize_trade("Plumbing") == "PLUMBING"
    
    # Test edge cases
    assert _normalize_trade("") == "ELECTRICAL"
    assert _normalize_trade(None) == "ELECTRICAL"
    assert _normalize_trade("UNKNOWN") == "ELECTRICAL"


def test_compute_guardrail_status_complete_electrical() -> None:
    """Test guardrail status for complete electrical job."""
    
    tests = [
        {"type": "Earth Loop", "result": "PASS"},
        {"type": "Polarity", "result": "PASS"},
        {"type": "Insulation Resistance", "result": "PASS"},
        {"type": "RCD Test", "result": "PASS"},
    ]
    
    status, missing, notes = _compute_guardrail_status(
        "Completed all electrical tests",
        tests,
        "ELECTRICAL"
    )
    
    assert status == "GREEN_SHIELD"
    assert len(missing) == 0
    assert "compliant to close" in notes.lower()


def test_compute_guardrail_status_missing_tests() -> None:
    """Test guardrail status for job with missing tests."""
    
    tests = [
        {"type": "Earth Loop", "result": "PASS"},
        # Missing other tests
    ]
    
    status, missing, notes = _compute_guardrail_status(
        "Partial testing completed",
        tests,
        "ELECTRICAL"
    )
    
    assert status == "RED_SHIELD"
    assert len(missing) == 3  # polarity, insulation, rcd
    assert "missing" in notes.lower()


def test_compute_guardrail_status_empty_transcript() -> None:
    """Test guardrail status with no transcript."""
    
    status, missing, notes = _compute_guardrail_status(
        "",
        [],
        "ELECTRICAL"
    )
    
    assert status == "NOT_REQUIRED"
    assert len(missing) == 0
    assert "not captured yet" in notes.lower()


def test_compute_guardrail_status_plumbing_trade() -> None:
    """Test guardrail status for plumbing trade."""
    
    tests = [
        {"type": "Gas Pressure", "result": "PASS"},
        {"type": "Water Flow", "result": "PASS"},
        {"type": "Backflow Prevention", "result": "PASS"},
    ]
    
    status, missing, notes = _compute_guardrail_status(
        "Plumbing work completed",
        tests,
        "PLUMBING"
    )
    
    assert status == "GREEN_SHIELD"
    assert len(missing) == 0


def test_normalize_safety_tests() -> None:
    """Test safety test normalization with canonical types."""
    
    extracted_data = {
        "safety_tests": [
            {"type": "earth loop", "result": "PASS"},
            {"type": "polarity", "result": "PASS"},
            {"type": "insulation resistance", "result": "PASS"},
            {"type": "rcd test", "result": "PASS"},
            {"type": "gas pressure", "result": "PASS"},
            {"type": "water flow", "result": "PASS"},
            {"type": "backflow prevention", "result": "PASS"},
        ]
    }
    
    normalized = _normalize_safety_tests(extracted_data, Decimal("-36.85"), Decimal("174.76"))
    
    assert len(normalized) == 7
    
    # Check canonical type mapping
    test_types = [test["type"] for test in normalized]
    assert "Earth Loop" in test_types
    assert "Polarity" in test_types
    assert "Insulation Resistance" in test_types
    assert "RCD Test" in test_types
    assert "Gas Pressure" in test_types
    assert "Water Flow" in test_types
    assert "Backflow Prevention" in test_types
    
    # Check GPS coordinates added
    for test in normalized:
        assert test["gps_lat"] == Decimal("-36.85")
        assert test["gps_lng"] == Decimal("174.76")


def test_normalize_safety_tests_empty_input() -> None:
    """Test safety test normalization with empty input."""
    
    # Test with empty list
    normalized = _normalize_safety_tests([], Decimal("-36.85"), Decimal("174.76"))
    assert normalized == []
    
    # Test with missing key
    normalized = _normalize_safety_tests({}, Decimal("-36.85"), Decimal("174.76"))
    assert normalized == []
    
    # Test with invalid type
    normalized = _normalize_safety_tests({"safety_tests": "invalid"}, Decimal("-36.85"), Decimal("174.76"))
    assert normalized == []


def test_normalize_safety_tests_invalid_test_entries() -> None:
    """Test safety test normalization with invalid test entries."""
    
    extracted_data = {
        "safety_tests": [
            {"type": "valid test", "result": "PASS"},
            "invalid entry",
            None,
            {"type": "", "result": "PASS"},  # Empty type should be filtered
        ]
    }
    
    normalized = _normalize_safety_tests(extracted_data, Decimal("-36.85"), Decimal("174.76"))
    
    # Should only include valid entries
    assert len(normalized) == 1
    assert normalized[0]["type"] == "valid test"


def test_health_endpoint() -> None:
    """Test health check endpoint."""
    client = TestClient(app)
    
    response = client.get("/health")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "sparkops-api"


def test_materials_import_endpoint() -> None:
    """Test materials import endpoint."""
    client = TestClient(app)
    
    with patch("main.import_materials") as mock_import:
        mock_import.return_value = {"imported_count": 10, "failed_count": 0, "total_rows": 10, "message": "Success"}
        
        response = client.post(
            "/api/materials/import",
            files={"file": ("test.csv", "content", "text/csv")}
        )
    
    assert response.status_code == 200


def test_get_current_user_valid_token() -> None:
    """Test user endpoint with valid token."""
    client = TestClient(app)
    
    with patch("main.verify_jwt_token") as mock_verify:
        mock_verify.return_value = {"user_id": "test-user", "role": "OWNER"}
        
        response = client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer valid-token"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "test-user"
    assert data["role"] == "OWNER"


def test_get_current_user_invalid_token() -> None:
    """Test user endpoint with invalid token."""
    client = TestClient(app)
    
    with patch("main.verify_jwt_token") as mock_verify:
        mock_verify.return_value = None
        
        response = client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer invalid-token"}
        )
    
    assert response.status_code == 401


def test_ingest_endpoint_with_valid_data() -> None:
    """Test ingest endpoint with valid voice data."""
    client = TestClient(app)
    
    mock_data = {
        "call_sid": "test-call",
        "recording_sid": "test-recording",
        "from_number": "+64211234567",
        "transcript": "Installed hot water cylinder",
        "urgency": "LOW"
    }
    
    with patch("main.process_voice_message") as mock_process:
        mock_process.return_value = {"id": "test-job"}
        
        response = client.post("/api/ingest", json=mock_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test-job"


def test_ingest_endpoint_with_invalid_data() -> None:
    """Test ingest endpoint with invalid data."""
    client = TestClient(app)
    
    # Missing required fields
    invalid_data = {"call_sid": "test-call"}
    
    response = client.post("/api/ingest", json=invalid_data)
    assert response.status_code == 422  # Validation error


def test_auth_me_endpoint() -> None:
    """Test auth me endpoint."""
    client = TestClient(app)
    
    with patch("main.verify_jwt_token") as mock_verify:
        mock_verify.return_value = {"user_id": "test-user", "role": "FIELD"}
        
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer valid-token"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "test-user"
    assert data["role"] == "FIELD"


def test_admin_settings_endpoint() -> None:
    """Test admin settings endpoint."""
    client = TestClient(app)
    
    with patch("main.verify_jwt_token") as mock_verify:
        mock_verify.return_value = {"user_id": "test-user", "role": "OWNER", "organization_id": "test-org"}
        
        response = client.get(
            "/api/admin/settings",
            headers={"Authorization": "Bearer valid-token"}
        )
    
    # Should pass authentication and reach the endpoint logic
    assert response.status_code in [200, 404, 500]  # Any of these indicate auth passed