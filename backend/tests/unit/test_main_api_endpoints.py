"""Comprehensive tests for main API endpoints to achieve 85% coverage."""

from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from main import app, get_current_user, require_owner
from models.database import JobDraft, OrganizationSettings, Vehicle


def test_root_endpoint() -> None:
    """Test root health endpoint."""
    client = TestClient(app)
    response = client.get("/")
    
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "tradeops-data-factory"
    assert data["version"] == "1.0.0"
    assert "uptime" in data


def test_ingest_endpoint_success() -> None:
    """Test successful ingest endpoint."""
    client = TestClient(app)
    
    app.dependency_overrides[get_current_user] = lambda: Mock(id="user-123", organization_id="org-123")
    
    payload = {
        "voice_notes": "Install TPS cable and outlets",
        "audio_base64": None,
        "receipt_image_base64": None
    }
    
    with patch("main.transcribe_audio", return_value="Install TPS cable and outlets"), \
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
    
    app.dependency_overrides.clear()


def test_ingest_endpoint_with_audio() -> None:
    """Test ingest endpoint with audio data."""
    client = TestClient(app)
    
    app.dependency_overrides[get_current_user] = lambda: Mock(id="user-123", organization_id="org-123")
    
    payload = {
        "voice_notes": None,
        "audio_base64": "dGVzdCBhdWRpbyBkYXRh",  # "test audio data" in base64
        "receipt_image_base64": None
    }
    
    with patch("main.transcribe_audio", return_value="Test audio transcription"), \
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
    
    app.dependency_overrides.clear()


def test_ingest_endpoint_with_receipt() -> None:
    """Test ingest endpoint with receipt data."""
    client = TestClient(app)
    
    app.dependency_overrides[get_current_user] = lambda: Mock(id="user-123", organization_id="org-123")
    
    payload = {
        "voice_notes": None,
        "audio_base64": None,
        "receipt_image_base64": "dGVzdCByZWNlaXB0IGRhdGE="  # "test receipt data" in base64
    }
    
    with patch("main.transcribe_audio", return_value=""), \
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
        
    app.dependency_overrides.clear()


def test_ingest_endpoint_unauthorized() -> None:
    """Test ingest endpoint without authentication."""
    client = TestClient(app)
    
    def override_get_current_user():
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    payload = {
        "voice_notes": "Test note",
        "audio_base64": None,
        "receipt_image_base64": None
    }
    
    response = client.post("/api/ingest", json=payload)
    assert response.status_code == 401
    
    app.dependency_overrides.clear()


def test_auth_me_endpoint() -> None:
    """Test auth me endpoint."""
    client = TestClient(app)
    
    mock_user = Mock()
    mock_user.id = "user-123"
    mock_user.organization_id = "org-123"
    mock_user.role = "OWNER"
    mock_user.email = "test@example.com"
    mock_user.trade = "ELECTRICAL"
    mock_user.organization_default_trade = "ELECTRICAL"
    mock_user.full_name = "Test User"
    
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    response = client.get("/api/auth/me")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "user-123"
    assert data["organization_id"] == "org-123"
    assert data["role"] == "OWNER"
    assert data["email"] == "test@example.com"
    
    app.dependency_overrides.clear()


def test_auth_handshake_v1_endpoint() -> None:
    """Test auth handshake v1 endpoint."""
    client = TestClient(app)
    
    mock_user = Mock()
    mock_user.id = "user-456"
    mock_user.organization_id = "org-456"
    mock_user.role = "FIELD"
    mock_user.email = "field@example.com"
    mock_user.trade = "PLUMBING"
    mock_user.organization_default_trade = "PLUMBING"
    mock_user.full_name = "Field User"
    
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    response = client.get("/api/v1/auth/handshake")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "user-456"
    assert data["organization_id"] == "org-456"
    assert data["role"] == "FIELD"
    assert data["email"] == "field@example.com"
    
    app.dependency_overrides.clear()


def test_get_organization_settings() -> None:
    """Test getting organization settings."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    with patch("main.Session") as mock_session:
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock settings
        settings = Mock()
        settings.organization_id = "org-123"
        settings.logo_url = "https://example.com/logo.png"
        settings.business_name = "Test Business"
        settings.contact_email = "contact@example.com"
        settings.website_url = "https://example.com"
        settings.gst_number = "123-456"
        settings.default_trade = "ELECTRICAL"
        settings.tax_rate = 15.0
        settings.standard_markup = 20.0
        settings.terms_and_conditions = ""
        settings.bank_account_name = ""
        settings.bank_account_number = ""
        settings.subscription_status = "ACTIVE"
        settings.plan_type = "BASE"
        settings.licensed_seats = 1
        settings.trial_started_at = None
        settings.trial_ends_at = None
        settings.stripe_customer_id = None
        settings.stripe_subscription_id = None
        settings.updated_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.get.return_value = settings
        
        response = client.get("/api/admin/settings")
        
        assert response.status_code == 200
        data = response.json()
        assert data["organization_id"] == "org-123"
        assert data["business_name"] == "Test Business"
        
    app.dependency_overrides.clear()


def test_upsert_organization_settings() -> None:
    """Test updating organization settings."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    payload = {
        "logo_url": "https://example.com/new-logo.png",
        "business_name": "Updated Business",
        "contact_email": "updated@example.com",
        "website_url": "https://example.com",
        "gst_number": "123",
        "default_trade": "ELECTRICAL",
        "tax_rate": 15.0,
        "standard_markup": 20.0,
        "terms_and_conditions": "",
        "bank_account_name": "",
        "bank_account_number": ""
    }
    
    with patch("main.Session") as mock_session:
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
        updated_settings.website_url = payload["website_url"]
        updated_settings.gst_number = payload["gst_number"]
        updated_settings.default_trade = payload["default_trade"]
        updated_settings.tax_rate = payload["tax_rate"]
        updated_settings.standard_markup = payload["standard_markup"]
        updated_settings.terms_and_conditions = payload["terms_and_conditions"]
        updated_settings.bank_account_name = payload["bank_account_name"]
        updated_settings.bank_account_number = payload["bank_account_number"]
        updated_settings.subscription_status = "ACTIVE"
        updated_settings.plan_type = "BASE"
        updated_settings.licensed_seats = 1
        updated_settings.trial_started_at = None
        updated_settings.trial_ends_at = None
        updated_settings.stripe_customer_id = None
        updated_settings.stripe_subscription_id = None
        updated_settings.updated_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = updated_settings
        
        response = client.put("/api/admin/settings", json=payload)
        
        assert response.status_code == 200
        
    app.dependency_overrides.clear()


def test_list_vehicles() -> None:
    """Test listing vehicles."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    with patch("main.Session") as mock_session:
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock vehicles
        vehicles = [
            Mock(
                id="vehicle-1",
                organization_id="org-123",
                name="Toyota Hilux",
                plate="ABC123",
                notes="",
                created_at="2023-01-01T00:00:00Z",
                updated_at="2023-01-01T00:00:00Z"
            ),
            Mock(
                id="vehicle-2", 
                organization_id="org-123",
                name="Ford Ranger",
                plate="XYZ789",
                notes="",
                created_at="2023-01-02T00:00:00Z",
                updated_at="2023-01-01T00:00:00Z"
            )
        ]
        
        mock_session_instance.exec.return_value.all.return_value = vehicles
        
        response = client.get("/api/admin/vehicles")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Toyota Hilux"
        assert data[1]["name"] == "Ford Ranger"
        
    app.dependency_overrides.clear()


def test_create_vehicle() -> None:
    """Test creating a vehicle."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    payload = {
        "name": "Nissan Navara",
        "plate": "DEF456",
        "notes": "Work truck"
    }
    
    with patch("main.Session") as mock_session:
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        
        # Mock created vehicle
        vehicle = Mock()
        vehicle.id = "vehicle-new"
        vehicle.organization_id = "org-123"
        vehicle.name = payload["name"]
        vehicle.plate = payload["plate"]
        vehicle.notes = payload["notes"]
        vehicle.created_at = "2023-01-01T00:00:00Z"
        vehicle.updated_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.add.return_value = None
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = vehicle
        
        response = client.post("/api/admin/vehicles", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Nissan Navara"
        assert data["plate"] == "DEF456"
        
    app.dependency_overrides.clear()


def test_update_vehicle() -> None:
    """Test updating a vehicle."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    vehicle_id = "vehicle-123"
    payload = {
        "name": "Updated Toyota",
        "plate": "UPD123",
        "notes": "Updated notes"
    }
    
    with patch("main.Session") as mock_session:
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
        updated_vehicle.name = payload["name"]
        updated_vehicle.plate = payload["plate"]
        updated_vehicle.notes = payload["notes"]
        updated_vehicle.created_at = "2023-01-01T00:00:00Z"
        updated_vehicle.updated_at = "2023-01-01T00:00:00Z"
        
        mock_session_instance.commit.return_value = None
        mock_session_instance.refresh.return_value = updated_vehicle
        
        response = client.put(f"/api/admin/vehicles/{vehicle_id}", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Toyota"
        assert data["plate"] == "UPD123"
        
    app.dependency_overrides.clear()


def test_delete_vehicle() -> None:
    """Test deleting a vehicle."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    vehicle_id = "vehicle-123"
    
    with patch("main.Session") as mock_session:
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
        
    app.dependency_overrides.clear()


def test_delete_vehicle_not_found() -> None:
    """Test deleting a vehicle that doesn't exist."""
    client = TestClient(app)
    
    app.dependency_overrides[require_owner] = lambda: Mock(id="user-123", organization_id="org-123")
    
    vehicle_id = "nonexistent-vehicle"
    
    with patch("main.Session") as mock_session:
        mock_session_instance = Mock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.get.return_value = None  # Vehicle not found
        
        response = client.delete(f"/api/admin/vehicles/{vehicle_id}")
        
        assert response.status_code == 404
        
    app.dependency_overrides.clear()


def test_ingest_endpoint_validation_error() -> None:
    """Test ingest endpoint with invalid payload."""
    client = TestClient(app)
    
    app.dependency_overrides[get_current_user] = lambda: Mock(id="user-123", organization_id="org-123")
    
    # Empty payload should fail validation
    response = client.post("/api/ingest", json={})
    
    assert response.status_code == 422  # Validation error
    
    app.dependency_overrides.clear()


def test_ingest_endpoint_processing_error() -> None:
    """Test ingest endpoint with processing error."""
    client = TestClient(app)
    
    app.dependency_overrides[get_current_user] = lambda: Mock(id="user-123", organization_id="org-123")
    
    payload = {
        "voice_notes": "Test note",
        "audio_base64": None,
        "receipt_image_base64": None
    }
    
    with patch("main.transcribe_audio", side_effect=Exception("Processing failed")):
        response = client.post("/api/ingest", json=payload)
        assert response.status_code == 500
        
    app.dependency_overrides.clear()


def test_materials_import_endpoint() -> None:
    """Test materials import endpoint."""
    client = TestClient(app)
    
    app.dependency_overrides[get_current_user] = lambda: Mock(id="user-123", organization_id="org-123")
    
    csv_content = "sku,name,price\nTEST001,Test Material,10.50\n"
    
    from main import MaterialsImportResponse
    
    with patch("main.import_materials", return_value=MaterialsImportResponse(status="success", imported_count=1, failed_count=0, total_rows=1, message="Success")):
        response = client.post(
            "/api/materials/import",
            files={"file": ("test.csv", csv_content, "text/csv")}
        )
        
        assert response.status_code == 200
        
    app.dependency_overrides.clear()


def test_materials_import_endpoint_unauthorized() -> None:
    """Test materials import endpoint without authentication."""
    client = TestClient(app)
    
    def override_get_current_user():
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    csv_content = "sku,name,price\nTEST001,Test Material,10.50\n"
    
    response = client.post(
        "/api/materials/import",
        files={"file": ("test.csv", csv_content, "text/csv")}
    )
    
    assert response.status_code == 401
    
    app.dependency_overrides.clear()