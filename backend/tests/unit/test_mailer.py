"""Unit tests for certificate email delivery helper."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock

import pytest

from services.mailer import MailDeliveryError, send_certificate_email


def test_send_certificate_email_raises_when_api_key_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    with pytest.raises(MailDeliveryError, match="RESEND_API_KEY is missing"):
        send_certificate_email(
            to_email="client@example.com",
            client_name="Client",
            address="21 Churchill Road",
            issued_at=datetime(2026, 3, 9),
            pdf_bytes=b"%PDF-1.7",
            filename="certificate.pdf",
        )


def test_send_certificate_email_posts_expected_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", "resend-test-key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "compliance@sparkops.nz")

    response = MagicMock()
    response.status_code = 200
    response.content = b'{"id":"mail_123"}'
    response.json.return_value = {"id": "mail_123"}

    post_mock = MagicMock(return_value=response)
    client_mock = MagicMock()
    client_mock.post = post_mock

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            assert timeout == 20.0

        def __enter__(self):
            return client_mock

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("services.mailer.httpx.Client", FakeClient)

    message_id = send_certificate_email(
        to_email="client@example.com",
        client_name="Client",
        address="21 Churchill Road",
        issued_at=datetime(2026, 3, 9),
        pdf_bytes=b"pdf-bytes",
        filename="certificate.pdf",
    )

    assert message_id == "mail_123"
    assert post_mock.call_count == 1
    _, kwargs = post_mock.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer resend-test-key"
    assert kwargs["json"]["to"] == ["client@example.com"]
    assert kwargs["json"]["attachments"][0]["filename"] == "certificate.pdf"


def test_send_certificate_email_raises_on_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", "resend-test-key")

    response = MagicMock()
    response.status_code = 502
    response.text = "upstream error"
    response.content = b""

    client_mock = MagicMock()
    client_mock.post = MagicMock(return_value=response)

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            assert timeout == 20.0

        def __enter__(self):
            return client_mock

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("services.mailer.httpx.Client", FakeClient)

    with pytest.raises(MailDeliveryError, match="Certificate email send failed"):
        send_certificate_email(
            to_email="client@example.com",
            client_name="Client",
            address="21 Churchill Road",
            issued_at=datetime(2026, 3, 9),
            pdf_bytes=b"pdf-bytes",
            filename="certificate.pdf",
        )
