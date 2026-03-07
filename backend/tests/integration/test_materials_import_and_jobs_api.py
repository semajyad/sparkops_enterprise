"""Integration tests for materials import and job draft retrieval/PDF APIs."""

from __future__ import annotations

import sys
import types
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, select

import main
from models.database import JobDraft, Material, create_db_and_tables


@pytest.fixture()
def sqlite_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'sparkops_test.db'}", echo=False)
    create_db_and_tables(engine)
    monkeypatch.setattr(main, "ENGINE", engine)
    return engine


def test_materials_import_returns_summary_and_skips_malformed_rows(
    sqlite_engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main, "_materials_supports_vector_column", lambda: True)
    monkeypatch.setattr(main, "embed_text_batch", lambda texts: [[0.0] * 3072 for _ in texts])
    monkeypatch.setattr(main, "_upsert_materials_rows", lambda rows, embeddings, with_vector: len(rows))

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
    with Session(sqlite_engine) as session:
        session.add(
            JobDraft(
                id=draft_id,
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
        session.commit()

    fake_pdf_module = types.ModuleType("services.pdf")
    fake_pdf_module.generate_invoice_pdf = lambda _job, _engine: b"%PDF-1.4\nFAKE\n%%EOF"
    monkeypatch.setitem(sys.modules, "services.pdf", fake_pdf_module)

    client = TestClient(main.app)

    job_response = client.get(f"/api/jobs/{draft_id}")
    assert job_response.status_code == 200
    assert job_response.json()["id"] == str(draft_id)

    pdf_response = client.get(f"/api/jobs/{draft_id}/pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.content.startswith(b"%PDF-1.4")
