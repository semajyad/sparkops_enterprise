"""Functional tests for the Sprint 1 ingest endpoint."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine

pytest.importorskip("sqlmodel")
import main
from dependencies import AuthenticatedUser
from models.database import create_db_and_tables


@pytest.fixture(autouse=True)
def _reset_dependency_overrides() -> None:
    main.app.dependency_overrides = {}
    yield
    main.app.dependency_overrides = {}


@pytest.fixture(autouse=True)
def _sqlite_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'ingest_functional_test.db'}", echo=False)
    create_db_and_tables(engine)
    monkeypatch.setattr(main, "ENGINE", engine)


def test_ingest_endpoint_returns_verified_invoice(monkeypatch) -> None:
    """Verify /api/ingest returns persisted triage draft payload."""

    test_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=uuid4(),
        role="EMPLOYEE",
        full_name="Functional Tester",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: test_user

    monkeypatch.setattr(
        main.triage_service,
        "analyze_transcript",
        lambda _text: {
            "client": "Smith Residence",
            "scope": "Switchboard and RCD check",
            "line_items": [
                {"qty": "1", "description": "RCD", "type": "MATERIAL"},
                {"qty": "2", "description": "Labour hours", "type": "LABOR"},
            ],
        },
    )

    client = TestClient(main.app)
    response = client.post(
        "/api/ingest",
        json={
            "voice_notes": "Hori in the cupboard",
            "receipt_image_base64": "ZmFrZS1pbWFnZQ==",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"]
    assert payload["status"] == "DRAFT"
    assert payload["raw_transcript"] == "Hori in the cupboard"
    assert payload["extracted_data"]["client"] == "Smith Residence"
