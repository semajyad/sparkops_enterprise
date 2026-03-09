"""Comprehensive tests for main API endpoints to achieve 85% coverage."""

from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from main import app
from models.database import JobDraft, OrganizationSettings, Vehicle


def test_root_endpoint() -> None:
    """Test root health endpoint."""
    client = TestClient(app)
    response = client.get("/")
    
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "sparkops-data-factory"
    assert data["version"] == "1.0.0"
    assert "uptime" in data


def test_ingest_endpoint_success() -> None:
    """Test successful ingest endpoint."""
    client = TestClient(app)
    
    payload = {
        "voice_notes": "Install TPS cable and outlets",
        "audio_base64": None,
        "receipt_image_base64": None
    }
    
    with patch("main.get_current_user", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.transcribe_audio", return_value="Install TPS cable and outlets"), \
         patch("main.embed_text", return_value=[[0.1, 0.2, 0.3]]), \
         patch("main._normalize_trade", return_value="ELECTRICAL"), \
         patch("main._normalize_safety_tests", return_value=[]), \
         patch("main._compute_guardrail_status", return_value=("GREEN_SHIELD", [], "All tests passed")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.add.return_value = None
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = None
        
        # Mock the job draft
        job_draft = Mock()
        job_draft.id = "job-123"
        job_draft.extracted_data = {"client": "Test Client"}
        job_draft.sync_status = "pending"
        job_draft.created_at = "2023-01-01T00:00:00Z"
        job_draft.updated_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.add.return_value = None
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = None
        
        response = client.post("/api/ingest", json=payload)
        
        assert response.status_code == 200


def test_ingest_endpoint_with_audio() -> None:
    """Test ingest endpoint with audio data."""
    client = TestClient(app)
    
    payload = {
        "voice_notes": None,
        "audio_base64": "dGVzdCBhdWRpbyBkYXRh",  # "test audio data" in base64
        "receipt_image_base64": None
    }
    
    with patch("main.get_current_user", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.transcribe_audio", return_value="Test audio transcription"), \
         patch("main.embed_text", return_value=[[0.1, 0.2, 0.3]]), \
         patch("main._normalize_trade", return_value="ELECTRICAL"), \
         patch("main._normalize_safety_tests", return_value=[]), \
         patch("main._compute_guardrail_status", return_value=("GREEN_SHIELD", [], "All tests passed")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.add.return_value = None
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = None
        
        response = client.post("/api/ingest", json=payload)
        
        assert response.status_code == 200


def test_ingest_endpoint_with_receipt() -> None:
    """Test ingest endpoint with receipt data."""
    client = TestClient(app)
    
    payload = {
        "voice_notes": None,
        "audio_base64": None,
        "receipt_image_base64": "dGVzdCByZWNlaXB0IGRhdGE="  # "test receipt data" in base64
    }
    
    with patch("main.get_current_user", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.transcribe_audio", return_value=""), \
         patch("main.embed_text", return_value=[[0.1, 0.2, 0.3]]), \
         patch("main._normalize_trade", return_value="ELECTRICAL"), \
         patch("main._normalize_safety_tests", return_value=[]), \
         patch("main._compute_guardrail_status", return_value=("GREEN_SHIELD", [], "All tests passed")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.add.return_value = None
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = None
        
        response = client.post("/api/ingest", json=payload)
        
        assert response.status_code == 200


def test_ingest_endpoint_unauthorized() -> None:
    """Test ingest endpoint without authentication."""
    client = TestClient(app)
    
    payload = {
        "voice_notes": "Test note",
        "audio_base64": None,
        "receipt_image_base64": None
    }
    
    with patch("main.get_current_user", side_effect=HTTPException(status_code=401, detail="Unauthorized")):
        response = client.post("/api/ingest", json=payload)
        assert response.status_code == 401


def test_auth_me_endpoint() -> None:
    """Test auth me endpoint."""
    client = TestClient(app)
    
    with patch("main.get_current_user", return_value=Mock(
        id="user-123",
        organization_id="org-123", 
        role="OWNER",
        email="test@example.com"
    )):
        response = client.get("/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "user-123"
        assert data["organization_id"] == "org-123"
        assert data["role"] == "OWNER"
        assert data["email"] == "test@example.com"


def test_auth_handshake_v1_endpoint() -> None:
    """Test auth handshake v1 endpoint."""
    client = TestClient(app)
    
    with patch("main.get_current_user", return_value=Mock(
        id="user-456",
        organization_id="org-456", 
        role="FIELD",
        email="field@example.com"
    )):
        response = client.get("/api/v1/auth/handshake")
        
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "user-456"
        assert data["organization_id"] == "org-456"
        assert data["role"] == "FIELD"
        assert data["email"] == "field@example.com"


def test_get_organization_settings() -> None:
    """Test getting organization settings."""
    client = TestClient(app)
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock settings
        settings = Mock()
        settings.organization_id = "org-123"
        settings.logo_url = "https://example.com/logo.png"
        settings.business_name = "Test Business"
        settings.contact_email = "contact@example.com"
        settings.phone = "+64 21 123 4567"
        settings.address = "123 Test St"
        settings.xero_tenant_id = "tenant-123"
        
        mock_session_instance.get.return_value = settings
        
        response = client.get("/api/admin/settings")
        
        assert response.status_code == 200
        data = response.json()
        assert data["organization_id"] == "org-123"
        assert data["business_name"] == "Test Business"


def test_upsert_organization_settings() -> None:
    """Test updating organization settings."""
    client = TestClient(app)
    
    payload = {
        "logo_url": "https://example.com/new-logo.png",
        "business_name": "Updated Business",
        "contact_email": "updated@example.com",
        "phone": "+64 21 987 6543",
        "address": "456 Updated St",
        "xero_tenant_id": "new-tenant-123"
    }
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock existing settings
        existing_settings = Mock()
        existing_settings.organization_id = "org-123"
        mock_session_instance.get.return_value = existing_settings
        
        # Mock updated settings
        updated_settings = Mock()
        updated_settings.organization_id = "org-123"
        updated_settings.logo_url = payload["logo_url"]
        updated_settings.business_name = payload["business_name"]
        updated_settings.contact_email = payload["contact_email"]
        updated_settings.phone = payload["phone"]
        updated_settings.address = payload["address"]
        updated_settings.xero_tenant_id = payload["xero_tenant_id"]
        
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = updated_settings
        
        response = client.put("/api/admin/settings", json=payload)
        
        assert response.status_code == 200


def test_list_vehicles() -> None:
    """Test listing vehicles."""
    client = TestClient(app)
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock vehicles
        vehicles = [
            Mock(
                id="vehicle-1",
                organization_id="org-123",
                make="Toyota",
                model="Hilux",
                license_plate="ABC123",
                year=2023,
                created_at="2023-01-01T00:00:00Z"
            ),
            Mock(
                id="vehicle-2", 
                organization_id="org-123",
                make="Ford",
                model="Ranger",
                license_plate="XYZ789",
                year=2022,
                created_at="2023-01-02T00:00:00Z"
            )
        ]
        
        mock_session_instance.exec.return_value.all.return_value = vehicles
        
        response = client.get("/api/admin/vehicles")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["make"] == "Toyota"
        assert data[1]["make"] == "Ford"


def test_create_vehicle() -> None:
    """Test creating a vehicle."""
    client = TestClient(app)
    
    payload = {
        "make": "Nissan",
        "model": "Navara",
        "license_plate": "DEF456",
        "year": 2023
    }
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock created vehicle
        vehicle = Mock()
        vehicle.id = "vehicle-new"
        vehicle.organization_id = "org-123"
        vehicle.make = payload["make"]
        vehicle.model = payload["model"]
        vehicle.license_plate = payload["license_plate"]
        vehicle.year = payload["year"]
        vehicle.created_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.add.return_value = None
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = vehicle
        
        response = client.post("/api/admin/vehicles", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["make"] == "Nissan"
        assert data["model"] == "Navara"


def test_update_vehicle() -> None:
    """Test updating a vehicle."""
    client = TestClient(app)
    
    vehicle_id = "vehicle-123"
    payload = {
        "make": "Updated Toyota",
        "model": "Updated Hilux",
        "license_plate": "UPD123",
        "year": 2024
    }
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock existing vehicle
        existing_vehicle = Mock()
        existing_vehicle.id = vehicle_id
        existing_vehicle.organization_id = "org-123"
        mock_session_instance.get.return_value = existing_vehicle
        
        # Mock updated vehicle
        updated_vehicle = Mock()
        updated_vehicle.id = vehicle_id
        updated_vehicle.organization_id = "org-123"
        updated_vehicle.make = payload["make"]
        updated_vehicle.model = payload["model"]
        updated_vehicle.license_plate = payload["license_plate"]
        updated_vehicle.year = payload["year"]
        updated_vehicle.created_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = updated_vehicle
        
        response = client.put(f"/api/admin/vehicles/{vehicle_id}", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["make"] == "Updated Toyota"
        assert data["license_plate"] == "UPD123"


def test_delete_vehicle() -> None:
    """Test deleting a vehicle."""
    client = TestClient(app)
    
    vehicle_id = "vehicle-123"
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock existing vehicle
        existing_vehicle = Mock()
        existing_vehicle.id = vehicle_id
        existing_vehicle.organization_id = "org-123"
        mock_session_instance.get.return_value = existing_vehicle
        
        mock_session_instance.delete.return_value = None
        mock_session_instance.commit.return_value = None
        
        response = client.delete(f"/api/admin/vehicles/{vehicle_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        assert data["id"] == vehicle_id


def test_delete_vehicle_not_found() -> None:
    """Test deleting a vehicle that doesn't exist."""
    client = TestClient(app)
    
    vehicle_id = "nonexistent-vehicle"
    
    with patch("main.require_owner", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.Session") as mock_session:
        
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.get.return_value = None  # Vehicle not found
        
        response = client.delete(f"/api/admin/vehicles/{vehicle_id}")
        
        assert response.status_code == 404


def test_ingest_endpoint_validation_error() -> None:
    """Test ingest endpoint with invalid payload."""
    client = TestClient(app)
    
    # Empty payload should fail validation
    response = client.post("/api/ingest", json={})
    
    assert response.status_code == 422  # Validation error


def test_ingest_endpoint_processing_error() -> None:
    """Test ingest endpoint with processing error."""
    client = TestClient(app)
    
    payload = {
        "voice_notes": "Test note",
        "audio_base64": None,
        "receipt_image_base64": None
    }
    
    with patch("main.get_current_user", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.transcribe_audio", side_effect=Exception("Processing failed")):
        
        response = client.post("/api/ingest", json=payload)
        
        assert response.status_code == 500


def test_materials_import_endpoint() -> None:
    """Test materials import endpoint."""
    client = TestClient(app)
    
    csv_content = "sku,name,price\nTEST001,Test Material,10.50\n"
    
    with patch("main.get_current_user", return_value=Mock(id="user-123", organization_id="org-123")), \
         patch("main.import_materials", return_value=Mock(imported=1, failed=0)):
        
        response = client.post(
            "/api/materials/import",
            files={"file": ("test.csv", csv_content, "text/csv")}
        )
        
        assert response.status_code == 200


def test_materials_import_endpoint_unauthorized() -> None:
    """Test materials import endpoint without authentication."""
    client = TestClient(app)
    
    csv_content = "sku,name,price\nTEST001,Test Material,10.50\n"
    
    with patch("main.get_current_user", side_effect=HTTPException(status_code=401, detail="Unauthorized")):
        response = client.post(
            "/api/materials/import",
            files={"file": ("test.csv", csv_content, "text/csv")}
        )
        
        assert response.status_code == 401