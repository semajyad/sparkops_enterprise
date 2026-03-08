"""Integration tests for Sprint 1 ingest pipeline.



These tests exercise the `/api/ingest` flow end-to-end inside FastAPI while

mocking external OpenAI-dependent calls.

"""



from __future__ import annotations



import base64

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

    engine = create_engine(f"sqlite:///{tmp_path / 'ingest_test.db'}", echo=False)

    create_db_and_tables(engine)

    monkeypatch.setattr(main, "ENGINE", engine)





def test_ingest_audio_creates_job_draft_with_mocked_triage(monkeypatch: pytest.MonkeyPatch) -> None:

    """Verify ingest persists triage extraction and returns a JobDraft payload."""



    monkeypatch.setattr(main, "transcribe_audio", lambda _audio_base64: "Hot water cylinder in cupboard")

    monkeypatch.setattr(

        main.triage_service,

        "analyze_transcript",

        lambda _text: {

            "client": "Smith Residence",

            "address": "45 Queen St",

            "scope": "Install cable and GPOs",

            "line_items": [

                {"qty": "50", "description": "TPS cable", "type": "MATERIAL"},

                {"qty": "3", "description": "3 hours labour", "type": "LABOR"},

            ],

        },

    )



    test_user = AuthenticatedUser(

        id=uuid4(),

        organization_id=uuid4(),

        role="EMPLOYEE",

        full_name="Test Employee",

    )

    main.app.dependency_overrides[main.get_current_user] = lambda: test_user



    client = TestClient(main.app)

    audio_base64 = base64.b64encode(b"fake-wav-bytes").decode("utf-8")



    response = client.post(

        "/api/ingest",

        json={

            "audio_base64": audio_base64,

            "receipt_image_base64": "ZmFrZS1yZWNlaXB0LWJ5dGVz",

        },

    )



    assert response.status_code == 200

    payload = response.json()



    assert payload["raw_transcript"] == "Hot water cylinder in cupboard"

    assert payload["status"] == "DRAFT"

    assert payload["extracted_data"]["client"] == "Smith Residence"

    assert len(payload["extracted_data"]["line_items"]) == 2

    assert payload["id"]

    assert payload["created_at"]





def test_ingest_rejects_payload_without_voice_or_audio() -> None:

    """Ensure ingest endpoint enforces mandatory voice/audio input contract."""



    test_user = AuthenticatedUser(

        id=uuid4(),

        organization_id=uuid4(),

        role="EMPLOYEE",

        full_name="Test Employee",

    )

    main.app.dependency_overrides[main.get_current_user] = lambda: test_user



    client = TestClient(main.app)

    response = client.post("/api/ingest", json={"receipt_image_base64": "abc"})



    assert response.status_code == 400

    assert "Provide voice_notes or audio_base64" in response.json()["error"]


def test_ingest_persists_safety_tests_with_gps_and_green_shield(monkeypatch: pytest.MonkeyPatch) -> None:

    test_user = AuthenticatedUser(

        id=uuid4(),

        organization_id=uuid4(),

        role="EMPLOYEE",

        full_name="Safety Tester",

    )

    main.app.dependency_overrides[main.get_current_user] = lambda: test_user

    monkeypatch.setattr(

        main.triage_service,

        "analyze_transcript",

        lambda _text: {

            "client": "Smith Residence",

            "address": "45 Queen St",

            "scope": "Socket and light replacement",

            "line_items": [],

            "safety_tests": [

                {"type": "Earth Loop", "value": "0.45", "unit": "Ohms", "result": None},

                {"type": "Polarity", "result": "PASS"},

                {"type": "RCD", "result": "PASS"},

            ],

        },

    )

    client = TestClient(main.app)
    response = client.post(
        "/api/ingest",
        json={
            "voice_notes": "Installed socket and light circuits, Earth loop zero point four five, polarity pass",
            "gps_lat": "-36.848500",
            "gps_lng": "174.763300",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["compliance_status"] == "GREEN_SHIELD"
    assert payload["extracted_data"]["compliance_summary"]["status"] == "GREEN_SHIELD"

    job_id = payload["id"]
    details = client.get(f"/api/jobs/{job_id}")
    assert details.status_code == 200
    details_payload = details.json()
    tests = details_payload["extracted_data"]["safety_tests"]
    assert len(tests) == 3
    assert any(test["type"] == "Earth Loop" and test["gps_lat"] == -36.8485 and test["gps_lng"] == 174.7633 for test in tests)
    assert any(test["type"] == "Polarity" and test["result"] == "PASS" for test in tests)





def test_ingest_rejects_payload_without_any_content() -> None:

    """Ensure ingest rejects fully empty payloads."""



    test_user = AuthenticatedUser(

        id=uuid4(),

        organization_id=uuid4(),

        role="EMPLOYEE",

        full_name="Test Employee",

    )

    main.app.dependency_overrides[main.get_current_user] = lambda: test_user



    client = TestClient(main.app)

    response = client.post("/api/ingest", json={})



    assert response.status_code == 400

    assert "Provide voice_notes or audio_base64" in response.json()["error"]

