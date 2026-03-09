"""Comprehensive unit tests for mailer service to achieve 85% coverage."""

from __future__ import annotations

import base64
from datetime import datetime
from unittest.mock import Mock, patch

import pytest
import httpx

from services.mailer import send_certificate_email, MailDeliveryError


def test_mail_delivery_error() -> None:
    """Test MailDeliveryError exception."""
    error = MailDeliveryError("Test error message")
    assert str(error) == "Test error message"
    assert isinstance(error, RuntimeError)


def test_send_certificate_email_success() -> None:
    """Test successful certificate email sending."""
    to_email = "client@example.com"
    client_name = "John Doe"
    address = "123 Test St"
    issued_at = datetime(2023, 1, 1, 12, 0, 0)
    pdf_bytes = b"fake pdf content"
    filename = "certificate.pdf"
    
    with patch.dict("os.environ", {
        "RESEND_API_KEY": "test-api-key",
        "RESEND_FROM_EMAIL": "test@sparkops.nz"
    }), \
    patch("httpx.Client") as mock_client_class:
        
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "msg-123"}'
        mock_response.json.return_value = {"id": "msg-123"}
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == "msg-123"
        
        # Verify the API call
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        
        assert call_args[0][0] == "https://api.resend.com/emails"
        assert call_args[1]["headers"]["Authorization"] == "Bearer test-api-key"
        assert call_args[1]["headers"]["Content-Type"] == "application/json"
        
        payload = call_args[1]["json"]
        assert payload["from"] == "test@sparkops.nz"
        assert payload["to"] == [to_email]
        assert "Electrical Safety Certificate for 123 Test St - 2023-01-01" in payload["subject"]
        assert "Hi John Doe" in payload["html"]
        assert len(payload["attachments"]) == 1
        assert payload["attachments"][0]["filename"] == filename


def test_send_certificate_email_default_from_email() -> None:
    """Test certificate email with default from email."""
    to_email = "client@example.com"
    client_name = "Jane Doe"
    address = "456 Default St"
    issued_at = datetime(2023, 2, 1, 14, 30, 0)
    pdf_bytes = b"fake pdf content"
    filename = "cert.pdf"
    
    with patch.dict("os.environ", {
        "RESEND_API_KEY": "test-api-key"
        # No RESEND_FROM_EMAIL set
    }), \
    patch("httpx.Client") as mock_client_class:
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "msg-456"}'
        mock_response.json.return_value = {"id": "msg-456"}
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == "msg-456"
        
        # Verify default from email is used
        call_args = mock_client.post.call_args
        payload = call_args[1]["json"]
        assert payload["from"] == "compliance@sparkops.nz"


def test_send_certificate_email_missing_api_key() -> None:
    """Test certificate email with missing API key."""
    to_email = "client@example.com"
    client_name = "Test Client"
    address = "789 Error St"
    issued_at = datetime(2023, 3, 1, 10, 15, 0)
    pdf_bytes = b"fake pdf content"
    filename = "error.pdf"
    
    with patch.dict("os.environ", {}, clear=True):  # No environment variables
        with pytest.raises(MailDeliveryError, match="RESEND_API_KEY is missing"):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_empty_api_key() -> None:
    """Test certificate email with empty API key."""
    to_email = "client@example.com"
    client_name = "Test Client"
    address = "789 Error St"
    issued_at = datetime(2023, 3, 1, 10, 15, 0)
    pdf_bytes = b"fake pdf content"
    filename = "error.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": ""}):  # Empty API key
        with pytest.raises(MailDeliveryError, match="RESEND_API_KEY is missing"):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_whitespace_api_key() -> None:
    """Test certificate email with whitespace-only API key."""
    to_email = "client@example.com"
    client_name = "Test Client"
    address = "789 Error St"
    issued_at = datetime(2023, 3, 1, 10, 15, 0)
    pdf_bytes = b"fake pdf content"
    filename = "error.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "   \t  "}):  # Whitespace only
        with pytest.raises(MailDeliveryError, match="RESEND_API_KEY is missing"):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_api_error_400() -> None:
    """Test certificate email with API error (400 status)."""
    to_email = "client@example.com"
    client_name = "Error Client"
    address = "400 Error St"
    issued_at = datetime(2023, 4, 1, 9, 0, 0)
    pdf_bytes = b"fake pdf content"
    filename = "error.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        # Mock error response
        mock_response = Mock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        with pytest.raises(MailDeliveryError, match="Certificate email send failed \\(400\\): Bad Request"):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_api_error_500() -> None:
    """Test certificate email with API error (500 status)."""
    to_email = "client@example.com"
    client_name = "Server Error Client"
    address = "500 Error St"
    issued_at = datetime(2023, 5, 1, 16, 45, 0)
    pdf_bytes = b"fake pdf content"
    filename = "server_error.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        # Mock server error response
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        with pytest.raises(MailDeliveryError, match="Certificate email send failed \\(500\\): Internal Server Error"):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_empty_response() -> None:
    """Test certificate email with empty response."""
    to_email = "client@example.com"
    client_name = "Empty Response Client"
    address = "Empty Response St"
    issued_at = datetime(2023, 6, 1, 11, 30, 0)
    pdf_bytes = b"fake pdf content"
    filename = "empty.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        # Mock empty response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b""  # Empty content
        mock_response.json.return_value = {}
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == ""  # Empty string when no ID in response


def test_send_certificate_email_response_without_id() -> None:
    """Test certificate email with response missing ID field."""
    to_email = "client@example.com"
    client_name = "No ID Client"
    address = "No ID St"
    issued_at = datetime(2023, 7, 1, 13, 15, 0)
    pdf_bytes = b"fake pdf content"
    filename = "no_id.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        # Mock response without ID
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"status": "sent"}'
        mock_response.json.return_value = {"status": "sent"}  # No ID field
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == ""  # Empty string when ID is None


def test_send_certificate_email_http_timeout() -> None:
    """Test certificate email with HTTP timeout."""
    to_email = "client@example.com"
    client_name = "Timeout Client"
    address = "Timeout St"
    issued_at = datetime(2023, 8, 1, 17, 20, 0)
    pdf_bytes = b"fake pdf content"
    filename = "timeout.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        mock_client = Mock()
        mock_client.post.side_effect = httpx.TimeoutException("Request timed out")
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        with pytest.raises(httpx.TimeoutException):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_http_connection_error() -> None:
    """Test certificate email with HTTP connection error."""
    to_email = "client@example.com"
    client_name = "Connection Error Client"
    address = "Connection Error St"
    issued_at = datetime(2023, 9, 1, 8, 45, 0)
    pdf_bytes = b"fake pdf content"
    filename = "connection_error.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        mock_client = Mock()
        mock_client.post.side_effect = httpx.ConnectError("Connection failed")
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        with pytest.raises(httpx.ConnectError):
            send_certificate_email(
                to_email=to_email,
                client_name=client_name,
                address=address,
                issued_at=issued_at,
                pdf_bytes=pdf_bytes,
                filename=filename
            )


def test_send_certificate_email_attachment_encoding() -> None:
    """Test PDF attachment is properly base64 encoded."""
    to_email = "client@example.com"
    client_name = "Encoding Test Client"
    address = "Encoding Test St"
    issued_at = datetime(2023, 10, 1, 12, 0, 0)
    pdf_bytes = b"fake pdf content with special chars: \x00\x01\x02"
    filename = "encoding_test.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "msg-encoding"}'
        mock_response.json.return_value = {"id": "msg-encoding"}
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == "msg-encoding"
        
        # Verify attachment encoding
        call_args = mock_client.post.call_args
        payload = call_args[1]["json"]
        attachment = payload["attachments"][0]
        
        expected_content = base64.b64encode(pdf_bytes).decode("utf-8")
        assert attachment["content"] == expected_content


def test_send_certificate_email_subject_formatting() -> None:
    """Test email subject formatting with different dates."""
    to_email = "client@example.com"
    client_name = "Subject Test Client"
    address = "Subject Test St"
    issued_at = datetime(2023, 12, 25, 23, 59, 59)  # Christmas
    pdf_bytes = b"fake pdf content"
    filename = "subject_test.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "msg-subject"}'
        mock_response.json.return_value = {"id": "msg-subject"}
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == "msg-subject"
        
        # Verify subject formatting
        call_args = mock_client.post.call_args
        payload = call_args[1]["json"]
        subject = payload["subject"]
        
        assert "Electrical Safety Certificate for Subject Test St" in subject
        assert "2023-12-25" in subject  # Date should be formatted as YYYY-MM-DD


def test_send_certificate_email_html_content() -> None:
    """Test email HTML content generation."""
    to_email = "client@example.com"
    client_name = "HTML Test Client"
    address = "HTML Test St"
    issued_at = datetime(2023, 11, 15, 14, 30, 0)
    pdf_bytes = b"fake pdf content"
    filename = "html_test.pdf"
    
    with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}), \
    patch("httpx.Client") as mock_client_class:
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "msg-html"}'
        mock_response.json.return_value = {"id": "msg-html"}
        
        mock_client = Mock()
        mock_client.post.return_value = mock_response
        mock_client_class.return_value.__enter__.return_value = mock_client
        
        result = send_certificate_email(
            to_email=to_email,
            client_name=client_name,
            address=address,
            issued_at=issued_at,
            pdf_bytes=pdf_bytes,
            filename=filename
        )
        
        assert result == "msg-html"
        
        # Verify HTML content
        call_args = mock_client.post.call_args
        payload = call_args[1]["json"]
        html_content = payload["html"]
        
        assert "<p>Hi HTML Test Client,</p>" in html_content
        assert "<p>Here is your safety certificate for the work completed today.</p>" in html_content
        assert "<p>Regards,<br/>SparkOps Compliance</p>" in html_content