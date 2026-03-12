"""Integration tests for materials import and job draft retrieval/PDF APIs."""

from __future__ import annotations

import sys
import types
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

import main
from dependencies import AuthenticatedUser
from models.database import JobDraft, SafetyTest, create_db_and_tables


@pytest.fixture(autouse=True)
def _reset_dependency_overrides() -> None:
    main.app.dependency_overrides = {}
    yield
    main.app.dependency_overrides = {}


@pytest.fixture()
def sqlite_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'sparkops_test.db'}", echo=False)
    create_db_and_tables(engine)
    monkeypatch.setattr(main, "ENGINE", engine)
    return engine


def test_materials_import_returns_summary_and_skips_malformed_rows(
    sqlite_engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=uuid4(),
        role="OWNER",
        full_name="Owner User",
    )
    main.app.dependency_overrides[main.require_owner] = lambda: owner_user

    monkeypatch.setattr(main, "_materials_supports_vector_column", lambda: True)
    monkeypatch.setattr(main, "embed_text_batch", lambda texts: [[0.0] * 3072 for _ in texts])
    monkeypatch.setattr(
        main,
        "_upsert_materials_rows",
        lambda rows, embeddings, with_vector, organization_id, user_id: len(rows),
    )

    csv_payload = """sku,name,price
SKU-001,TPS Cable,12.50
SKU-002,GPO Outlet,9.95
BAD-ROW,Missing Price,
"""

    client = TestClient(main.app)
    response = client.post(
        "/api/materials/import",
        files={"file": ("materials.csv", csv_payload, "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["imported_count"] == 2
    assert payload["failed_count"] == 1
    assert payload["total_rows"] == 3


def test_job_draft_fetch_and_pdf_download(sqlite_engine, monkeypatch: pytest.MonkeyPatch) -> None:
    draft_id = uuid4()
    second_draft_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    other_user_id = uuid4()

    authed_user = AuthenticatedUser(
        id=user_id,
        organization_id=organization_id,
        role="EMPLOYEE",
        full_name="Employee User",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: authed_user

    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=draft_id,
                user_id=user_id,
                organization_id=organization_id,
                raw_transcript="Install TPS and test circuits.",
                extracted_data={
                    "client": "Smith Residence",
                    "address": "45 Queen St",
                    "line_items": [
                        {"qty": 2, "description": "GPO Outlet", "type": "MATERIAL"},
                        {"qty": 3, "description": "Labor hours", "type": "LABOR"},
                    ],
                },
                status="DRAFT",
            )
        )
        session.add(
            JobDraft(
                id=second_draft_id,
                user_id=other_user_id,
                organization_id=organization_id,
                raw_transcript="Changeboard upgrade and test.",
                extracted_data={
                    "client": "North Shore Dental",
                    "line_items": [
                        {"qty": 5, "description": "Labor hours", "type": "LABOR"},
                    ],
                },
                status="DONE",
            )
        )
        session.commit()

    fake_pdf_module = types.ModuleType("services.pdf")
    fake_pdf_module.generate_invoice_pdf = lambda _job, _engine: b"%PDF-1.4\nFAKE\n%%EOF"
    monkeypatch.setitem(sys.modules, "services.pdf", fake_pdf_module)

    client = TestClient(main.app)

    jobs_list_response = client.get("/api/jobs")
    assert jobs_list_response.status_code == 200
    jobs_payload = jobs_list_response.json()
    assert len(jobs_payload) == 1
    assert jobs_payload[0]["id"] == str(draft_id)
    assert jobs_payload[0]["client_name"] == "Smith Residence"

    job_response = client.get(f"/api/jobs/{draft_id}")
    assert job_response.status_code == 200
    job_payload = job_response.json()
    assert job_payload["id"] == str(draft_id)
    assert "extracted_data" in job_payload
    assert job_payload["status"] == "DRAFT"

    pdf_response = client.get(f"/api/jobs/{draft_id}/pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.content.startswith(b"%PDF-1.4")

    delete_response = client.delete(f"/api/jobs/{draft_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"

    deleted_fetch_response = client.get(f"/api/jobs/{draft_id}")
    assert deleted_fetch_response.status_code == 404


def test_owner_can_list_all_org_job_drafts(sqlite_engine) -> None:
    organization_id = uuid4()
    owner_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=organization_id,
        role="OWNER",
        full_name="Owner User",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: owner_user

    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=uuid4(),
                user_id=uuid4(),
                organization_id=organization_id,
                raw_transcript="Install EV charger.",
                extracted_data={"client": "EV Homes"},
                status="DRAFT",
            )
        )
        session.add(
            JobDraft(
                id=uuid4(),
                user_id=uuid4(),
                organization_id=organization_id,
                raw_transcript="Rewire switchboard.",
                extracted_data={"client": "West Build Ltd"},
                status="SYNCING",
            )
        )
        session.commit()

    client = TestClient(main.app)
    response = client.get("/api/jobs")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2


def test_create_manual_job_draft(sqlite_engine) -> None:
    owner_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=uuid4(),
        role="OWNER",
        full_name="Dispatch Owner",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: owner_user

    client = TestClient(main.app)
    response = client.post(
        "/api/jobs",
        json={
            "client_name": "Harbor Electrical Ltd",
            "title": "Fuse board replacement",
            "location": "22 Marine Parade, Auckland",
            "scheduled_date": "2026-03-10",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "IN_PROGRESS"
    assert payload["raw_transcript"] == "Manual job: Fuse board replacement"
    assert payload["extracted_data"]["client"] == "Harbor Electrical Ltd"
    assert payload["extracted_data"]["job_title"] == "Fuse board replacement"
    assert payload["extracted_data"]["address"] == "22 Marine Parade, Auckland"

    list_response = client.get("/api/jobs")
    assert list_response.status_code == 200
    jobs = list_response.json()
    assert len(jobs) == 1
    assert jobs[0]["client_name"] == "Harbor Electrical Ltd"


def test_update_job_draft_updates_editable_fields(sqlite_engine) -> None:
    owner_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=uuid4(),
        role="OWNER",
        full_name="Dispatch Owner",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: owner_user

    draft_id = uuid4()
    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=draft_id,
                user_id=owner_user.id,
                organization_id=owner_user.organization_id,
                raw_transcript="Manual job: Old title",
                extracted_data={
                    "client": "Old Client",
                    "job_title": "Old title",
                    "location": "10 Old St",
                    "address": "10 Old St",
                },
                status="DRAFT",
            )
        )
        session.commit()

    client = TestClient(main.app)
    response = client.put(
        f"/api/jobs/{draft_id}",
        json={
            "client_name": "New Client Ltd",
            "title": "Switchboard upgrade",
            "location": "22 Marine Parade, Auckland",
            "address": "22 Marine Parade, Auckland",
            "latitude": -36.85,
            "longitude": 174.76,
            "scheduled_date": "2026-03-10T09:30:00Z",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["raw_transcript"] == "Manual job: Switchboard upgrade"
    assert payload["extracted_data"]["client"] == "New Client Ltd"
    assert payload["extracted_data"]["job_title"] == "Switchboard upgrade"
    assert payload["extracted_data"]["address"] == "22 Marine Parade, Auckland"


def test_update_job_draft_requires_write_access(sqlite_engine) -> None:
    owner_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=uuid4(),
        role="OWNER",
        full_name="Dispatch Owner",
    )

    employee_user = AuthenticatedUser(
        id=uuid4(),
        organization_id=owner_user.organization_id,
        role="EMPLOYEE",
        full_name="Field Tech",
    )

    draft_id = uuid4()
    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=draft_id,
                user_id=owner_user.id,
                organization_id=owner_user.organization_id,
                raw_transcript="Manual job: Protected job",
                extracted_data={"client": "Owner Client", "job_title": "Protected job"},
                status="DRAFT",
            )
        )
        session.commit()

    main.app.dependency_overrides[main.get_current_user] = lambda: employee_user
    client = TestClient(main.app)
    response = client.put(
        f"/api/jobs/{draft_id}",
        json={
            "client_name": "Should Fail",
            "title": "Unauthorized edit",
            "location": "1 Anywhere St",
        },
    )

    assert response.status_code == 403

def test_complete_job_auto_sends_certificate_and_persists_url(sqlite_engine, monkeypatch: pytest.MonkeyPatch) -> None:
    owner_id = uuid4()
    organization_id = uuid4()
    owner_user = AuthenticatedUser(
        id=owner_id,
        organization_id=organization_id,
        role="OWNER",
        full_name="Owner User",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: owner_user

    draft_id = uuid4()
    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=draft_id,
                user_id=uuid4(),
                organization_id=organization_id,
                raw_transcript="Replace socket and light fittings.",
                extracted_data={
                    "client": "Jane Client",
                    "address": "22 Marine Parade, Auckland",
                    "line_items": [],
                },
                status="DRAFT",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=owner_id,
                test_type="Earth Loop",
                value_text="0.45",
                unit="Ohms",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=owner_id,
                test_type="Polarity",
                result="PASS",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=owner_id,
                test_type="Insulation Resistance",
                value_text="1.20",
                unit="MOhm",
                result="PASS",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=owner_id,
                test_type="RCD Test",
                result="PASS",
            )
        )
        session.commit()

    fake_pdf_module = types.ModuleType("services.pdf")
    fake_pdf_module.generate_invoice_pdf = lambda _job, _engine: b"%PDF-1.4\nINVOICE\n%%EOF"
    fake_pdf_module.generate_certificate_pdf = lambda _job, _tests: b"%PDF-1.4\nCERT\n%%EOF"
    monkeypatch.setitem(sys.modules, "services.pdf", fake_pdf_module)

    sent_payload: dict[str, object] = {}

    def _fake_send_certificate_email(**kwargs):
        sent_payload.update(kwargs)
        return "resend-msg-123"

    monkeypatch.setattr(main, "send_certificate_email", _fake_send_certificate_email)

    client = TestClient(main.app)
    response = client.post(
        f"/api/jobs/{draft_id}/complete",
        json={"client_email": "client@example.com"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "DONE"
    assert payload["compliance_status"] == "GREEN_SHIELD"
    assert payload["certificate_pdf_url"] == f"/api/jobs/{draft_id}/certificate.pdf"

    assert sent_payload["to_email"] == "client@example.com"
    assert sent_payload["client_name"] == "Jane Client"

    details = client.get(f"/api/jobs/{draft_id}")
    assert details.status_code == 200
    details_payload = details.json()
    assert details_payload["status"] == "DONE"
    assert details_payload["certificate_pdf_url"] == f"/api/jobs/{draft_id}/certificate.pdf"


def test_complete_job_prompts_for_email_when_missing(sqlite_engine) -> None:
    employee_id = uuid4()
    organization_id = uuid4()
    employee_user = AuthenticatedUser(
        id=employee_id,
        organization_id=organization_id,
        role="EMPLOYEE",
        full_name="Field Sparky",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: employee_user

    draft_id = uuid4()
    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=draft_id,
                user_id=employee_id,
                organization_id=organization_id,
                raw_transcript="Replace socket and light fittings.",
                extracted_data={"client": "No Email Client", "address": "10 Queen St"},
                status="DRAFT",
                client_email=None,
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=employee_id,
                test_type="Earth Loop",
                value_text="0.31",
                unit="Ohms",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=employee_id,
                test_type="Polarity",
                result="PASS",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=employee_id,
                test_type="Insulation Resistance",
                value_text="1.00",
                unit="MOhm",
                result="PASS",
            )
        )
        session.add(
            SafetyTest(
                job_id=draft_id,
                organization_id=organization_id,
                user_id=employee_id,
                test_type="RCD Test",
                result="PASS",
            )
        )
        session.commit()

    client = TestClient(main.app)
    response = client.post(f"/api/jobs/{draft_id}/complete", json={})

    assert response.status_code == 422
    assert "Client email is required" in response.json()["error"]
