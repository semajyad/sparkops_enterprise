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
        {"test_type": "Earth Loop", "result": "PASS"},
        {"test_type": "Polarity", "result": "PASS"},
        {"test_type": "Insulation Resistance", "result": "PASS"},
        {"test_type": "RCD Test", "result": "PASS"},
    ]
    
    status, missing, notes = _compute_guardrail_status(
        "Completed all electrical tests",
        tests,
        "ELECTRICAL"
    )
    
    assert status == "GREEN_SHIELD"
    assert len(missing) == 0
    assert "compliant to close" in notes.lower()
    assert "as/nzs 3000" in notes.lower()


def test_compute_guardrail_status_missing_tests() -> None:
    """Test guardrail status for job with missing tests."""
    
    tests = [
        {"test_type": "Earth Loop", "result": "PASS"},
        # Missing other tests
    ]
    
    status, missing, notes = _compute_guardrail_status(
        "Partial testing completed",
        tests,
        "ELECTRICAL"
    )
    
    assert status == "RED_SHIELD"
    assert len(missing) == 3  # polarity, insulation resistance, rcd test
    assert "missing" in notes.lower()
    assert "as/nzs 3000" in notes.lower()


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
    assert "as/nzs 3000" in notes.lower()


def test_compute_guardrail_status_plumbing_trade() -> None:
    """Test guardrail status for plumbing trade."""
    
    tests = [
        {"test_type": "Gas Pressure", "result": "PASS"},
        {"test_type": "Water Flow", "result": "PASS"},
        {"test_type": "Backflow Prevention", "result": "PASS"},
        {"test_type": "RCD Test", "result": "PASS"},
    ]
    
    status, missing, notes = _compute_guardrail_status(
        "Plumbing work completed",
        tests,
        "PLUMBING"
    )
    
    assert status == "GREEN_SHIELD"
    assert len(missing) == 0
    assert "as/nzs 3500" in notes.lower()
    assert "g12/g13" in notes.lower()


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
    test_types = [test.get("type") for test in normalized if test.get("type")]
    assert "Earth Loop" in test_types
    assert "Polarity" in test_types
    assert "Insulation Resistance" in test_types
    assert "RCD Test" in test_types
    assert "Gas Pressure" in test_types
    assert "Water Flow" in test_types
    assert "Backflow Prevention" in test_types
    
    # Check GPS coordinates added
    for test in normalized:
        assert test.get("gps_lat") == Decimal("-36.85")
        assert test.get("gps_lng") == Decimal("174.76")


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
    
    # Should only include valid entries - check the structure
    valid_entries = [test for test in normalized if isinstance(test, dict) and test.get("type")]
    assert len(valid_entries) == 1
    assert valid_entries[0]["type"] == "valid test"


def test_health_endpoint() -> None:
    """Test health check endpoint."""
    client = TestClient(app)
    
    response = client.get("/health")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "sparkops-data-factory"
    assert data["version"] == "1.0.0"


def test_materials_import_endpoint() -> None:
    """Test materials import endpoint requires authentication."""
    client = TestClient(app)
    
    response = client.post(
        "/api/materials/import",
        files={"file": ("test.csv", "content", "text/csv")}
    )
    
    assert response.status_code == 401  # Unauthorized without auth


def test_ingest_endpoint_requires_auth() -> None:
    """Test ingest endpoint requires authentication."""
    client = TestClient(app)
    
    response = client.post("/api/ingest", json={"call_sid": "test"})
    assert response.status_code == 401  # Unauthorized


def test_admin_endpoints_exist() -> None:
    """Test admin endpoints return 404 (not found) rather than 500 errors."""
    client = TestClient(app)
    
    # Test various admin endpoints - they should return 404 or 401, not 500
    endpoints = [
        "/api/admin/settings",
        "/api/admin/vehicles",
        "/api/users/me",
        "/api/auth/me",
    ]
    
    for endpoint in endpoints:
        response = client.get(endpoint)
        assert response.status_code in [401, 404]  # Either auth required or not found


def test_root_endpoint() -> None:
    """Test root endpoint returns health status."""
    client = TestClient(app)
    
    response = client.get("/")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "sparkops-data-factory"


def test_required_tests_for_trade() -> None:
    """Test required tests function for different trades."""
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
    assert len(any_tests) >= 4  # Should include basic tests


def test_materials_supports_vector_column() -> None:
    """Test vector column support detection."""
    from main import _materials_supports_vector_column
    
    # Should return boolean without error
    result = _materials_supports_vector_column()
    assert isinstance(result, bool)


def test_parse_materials_csv() -> None:
    """Test CSV parsing function with correct format."""
    from main import _parse_materials_csv
    
    # Use the correct CSV format expected by the function
    csv_content = b"sku,name,price\nTEST001,Test Material,10.50\nTEST002,Another Material,15.75\n"
    
    result = _parse_materials_csv(csv_content)
    assert len(result) == 2
    assert result[0]["sku"] == "TEST001"
    assert result[0]["name"] == "Test Material"
    assert result[0]["price"] == "10.50"