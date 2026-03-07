"""Integration tests for Sprint 3 Twilio webhooks."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("sqlmodel", exc_type=ImportError)
pytest.importorskip("psycopg", exc_type=ImportError)

import main
from services.triage import triage_service


def test_twilio_voice_webhook_returns_twiml(monkeypatch) -> None:
    """Verify voice webhook returns greeting + record instructions."""

    monkeypatch.setattr("routers.twilio.verify_twilio_request", lambda *_args, **_kwargs: True)

    client = TestClient(main.app)
    response = client.post(
        "/api/twilio/voice",
        data={"From": "+64210000001", "CallSid": "CA123"},
    )

    assert response.status_code == 200
    assert "application/xml" in response.headers.get("content-type", "")
    assert "Dave is on site" in response.text
    assert "recordingStatusCallback" in response.text


def test_twilio_recording_callback_processes_message(monkeypatch) -> None:
    """Verify callback processes recording and returns triage payload."""

    monkeypatch.setattr("routers.twilio.verify_twilio_request", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        triage_service,
        "process_recording",
        lambda **_kwargs: {
            "id": "vm_RE123",
            "call_sid": "CA123",
            "recording_sid": "RE123",
            "from_number": "+64210000001",
            "urgency": "High",
            "summary": "Main board smoking, urgent callback",
            "transcript": "Main board is smoking at site",
            "created_at": "2026-03-07T00:00:00+00:00",
        },
    )

    client = TestClient(main.app)
    response = client.post(
        "/api/twilio/recording",
        data={
            "RecordingUrl": "https://api.twilio.com/recording/abc",
            "From": "+64210000001",
            "CallSid": "CA123",
            "RecordingSid": "RE123",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "processed"
    assert payload["message"]["urgency"] == "High"


def test_twilio_webhook_rejects_invalid_signature(monkeypatch) -> None:
    """Verify signature validation blocks forged webhook traffic."""

    monkeypatch.setattr("routers.twilio.verify_twilio_request", lambda *_args, **_kwargs: False)

    client = TestClient(main.app)
    response = client.post("/api/twilio/voice", data={"From": "+64210000001"})

    assert response.status_code == 403
    assert "Invalid Twilio signature" in response.json()["detail"]
