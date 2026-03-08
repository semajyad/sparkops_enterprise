"""Contract tests for auth handshake JWT parsing and response schema."""

from __future__ import annotations

from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

import main
from dependencies import AuthenticatedUser, get_current_user


@pytest.fixture(autouse=True)
def _reset_dependency_overrides() -> None:
    main.app.dependency_overrides = {}
    yield
    main.app.dependency_overrides = {}


def test_v1_auth_handshake_returns_contract_fields() -> None:
    user = AuthenticatedUser(
        id=uuid4(),
        organization_id=uuid4(),
        role="OWNER",
        full_name="Contract Owner",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: user

    client = TestClient(main.app)
    response = client.get("/api/v1/auth/handshake")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(user.id)
    assert payload["organization_id"] == str(user.organization_id)
    assert payload["role"] == "OWNER"
    assert payload["full_name"] == "Contract Owner"


def test_get_current_user_rejects_invalid_jwt_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    invalid_payload = {
        # missing required `sub`
        "exp": 9_999_999_999,
        "email": "sparky@example.com",
    }
    token = jwt.encode(invalid_payload, "test-secret", algorithm="HS256")
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(credentials)

    assert exc_info.value.status_code == 401
    assert "contract" in str(exc_info.value.detail).lower()
