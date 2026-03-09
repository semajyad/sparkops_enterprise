"""Unit tests for AI-adjacent services (triage, vision, pdf) using mocks only."""

from __future__ import annotations

import io
import sys
import types
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


if "reportlab" not in sys.modules:
    reportlab = types.ModuleType("reportlab")
    reportlab_lib = types.ModuleType("reportlab.lib")
    reportlab_colors = types.ModuleType("reportlab.lib.colors")
    reportlab_pagesizes = types.ModuleType("reportlab.lib.pagesizes")
    reportlab_units = types.ModuleType("reportlab.lib.units")
    reportlab_pdfgen = types.ModuleType("reportlab.pdfgen")
    reportlab_canvas = types.ModuleType("reportlab.pdfgen.canvas")

    class _ColorStub:
        white = "white"
        black = "black"

        @staticmethod
        def HexColor(value: str) -> str:
            return value

    class _CanvasStub:
        def __init__(self, buffer: io.BytesIO, pagesize: tuple[int, int]) -> None:
            self.buffer = buffer

        def setFillColor(self, *_args: object, **_kwargs: object) -> None:
            return None

        def rect(self, *_args: object, **_kwargs: object) -> None:
            return None

        def setFont(self, *_args: object, **_kwargs: object) -> None:
            return None

        def drawString(self, *_args: object, **_kwargs: object) -> None:
            return None

        def drawRightString(self, *_args: object, **_kwargs: object) -> None:
            return None

        def line(self, *_args: object, **_kwargs: object) -> None:
            return None

        def showPage(self) -> None:
            return None

        def save(self) -> None:
            self.buffer.write(b"%PDF-stub")

    reportlab_colors.HexColor = _ColorStub.HexColor
    reportlab_colors.white = _ColorStub.white
    reportlab_colors.black = _ColorStub.black
    reportlab_pagesizes.A4 = (595, 842)
    reportlab_units.mm = 1
    reportlab_canvas.Canvas = _CanvasStub

    sys.modules["reportlab"] = reportlab
    sys.modules["reportlab.lib"] = reportlab_lib
    sys.modules["reportlab.lib.colors"] = reportlab_colors
    sys.modules["reportlab.lib.pagesizes"] = reportlab_pagesizes
    sys.modules["reportlab.lib.units"] = reportlab_units
    sys.modules["reportlab.pdfgen"] = reportlab_pdfgen
    sys.modules["reportlab.pdfgen.canvas"] = reportlab_canvas

from services.pdf import _extract_invoice_lines, generate_certificate_pdf, generate_invoice_pdf
from services.triage import TriageService
from services.vision import ReceiptVisionEngine


def test_triage_parse_classification_defaults_on_invalid_json() -> None:
    urgency, summary = TriageService._parse_classification("not-json")
    assert urgency == "Medium"
    assert summary == "Client callback required."


def test_triage_extract_json_payload_handles_markdown_fences() -> None:
    payload = TriageService._extract_json_payload("```json\n{\"client\": \"Acme\"}\n```")
    assert payload == {"client": "Acme"}


def test_triage_extract_json_payload_raises_on_missing_json() -> None:
    with pytest.raises(ValueError, match="did not contain valid JSON"):
        TriageService._extract_json_payload("plain text only")


def test_triage_normalize_extraction_coerces_item_and_test_shapes() -> None:
    normalized = TriageService._normalize_extraction(
        {
            "client": "Acme Ltd",
            "address": "101 Queen St",
            "scope": "Switchboard repair",
            "line_items": [
                {"qty": "2", "description": "TPS Cable", "type": "material"},
                {"qty": "1", "description": "Install", "type": "invalid"},
            ],
            "safety_tests": [
                {"type": "earth loop", "value": "0.32", "unit": "Ohms", "result": "pass"},
                {"type": "rcd", "result": "fail"},
            ],
        }
    )

    assert normalized["line_items"][0]["type"] == "MATERIAL"
    assert normalized["line_items"][1]["type"] == "LABOR"
    assert normalized["safety_tests"][0]["type"] == "Earth Loop"
    assert normalized["safety_tests"][1]["type"] == "RCD"


def test_triage_analyze_transcript_uses_mocked_openai_client() -> None:
    service = TriageService()
    fake_client = MagicMock()
    fake_client.responses.create.return_value = SimpleNamespace(
        output_text=(
            '{"client":"Acme","address":"Auckland","scope":"Repair",'
            '"line_items":[{"qty":"1","description":"Labor","type":"LABOR"}],'
            '"safety_tests":[{"type":"polarity","result":"PASS"}]}'
        )
    )

    with patch.object(TriageService, "_get_openai_client", return_value=fake_client):
        payload = service.analyze_transcript("Repair job with polarity pass")

    assert payload["client"] == "Acme"
    assert payload["line_items"][0]["type"] == "LABOR"
    assert payload["safety_tests"][0]["type"] == "Polarity"


def test_triage_process_recording_uses_mocked_http_and_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "tok")

    service = TriageService()
    mocked_http_client = MagicMock()
    mocked_http_response = MagicMock()
    mocked_http_response.content = b"wav-bytes"
    mocked_http_response.raise_for_status.return_value = None
    mocked_http_client.get.return_value = mocked_http_response

    mocked_http_cm = MagicMock()
    mocked_http_cm.__enter__.return_value = mocked_http_client

    with patch("services.triage.httpx.Client", return_value=mocked_http_cm), patch.object(
        service, "_transcribe", return_value="urgent outage at switchboard"
    ), patch.object(service, "_classify_urgency", return_value=("High", "Urgent outage callback")):
        result = service.process_recording(
            recording_url="https://api.twilio.com/recordings/RE123",
            from_number="+6421000000",
            call_sid="CA123",
            recording_sid="RE123",
        )

    assert result["urgency"] == "High"
    assert result["recording_sid"] == "RE123"
    mocked_http_client.get.assert_called_once()
    assert service.list_voicemails()[0]["id"] == "vm_RE123"


def test_vision_extract_receipt_uses_lowest_available_price_from_mocked_response() -> None:
    engine = ReceiptVisionEngine(api_key="test-key")
    fake_client = MagicMock()
    fake_client.responses.create.return_value = SimpleNamespace(
        output_text=(
            '{"supplier":"Corys","date":"2026-03-09","line_items":['
            '{"description":"RCD","quantity":"2","trade_price":"10.00","retail_price":"14.00"},'
            '{"description":"Cable","quantity":"1","unit_price":"5.00","trade_price":"7.00"},'
            '{"description":"","quantity":"1","unit_price":"9.00"}'
            ']}'
        )
    )

    with patch.object(engine, "_get_client", return_value=fake_client):
        extraction = engine.extract_receipt("base64-image")

    assert extraction.supplier == "Corys"
    assert extraction.date == "2026-03-09"
    assert len(extraction.line_items) == 2
    assert extraction.line_items[0].unit_price == Decimal("10.00")
    assert extraction.line_items[1].unit_price == Decimal("5.00")


def test_vision_get_client_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    engine = ReceiptVisionEngine(api_key=None)

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
        engine._get_client()


def test_pdf_extract_invoice_lines_handles_material_markup_and_labor_defaults() -> None:
    job = SimpleNamespace(
        extracted_data={
            "line_items": [
                {"description": "TPS Cable", "qty": "2", "type": "MATERIAL"},
                {"description": "Fault finding", "qty": "1", "type": "LABOR"},
                {"description": "Explicit", "qty": "1", "type": "MATERIAL", "unit_price": "88.50"},
            ]
        }
    )

    with patch("services.pdf._get_markup", return_value=Decimal("0.20")), patch(
        "services.pdf._resolve_material_trade_price", return_value=Decimal("10.00")
    ):
        lines = _extract_invoice_lines(job, engine=None)

    assert len(lines) == 3
    assert lines[0]["unit_price"] == Decimal("12.00")
    assert lines[1]["unit_price"] == Decimal("95.00")
    assert lines[2]["unit_price"] == Decimal("88.50")


def test_pdf_generators_return_pdf_bytes() -> None:
    job = SimpleNamespace(extracted_data={"client": "Acme", "address": "101 Queen St"})

    with patch(
        "services.pdf._extract_invoice_lines",
        return_value=[{"description": "Labor", "qty": Decimal("1"), "unit_price": Decimal("95.00"), "line_total": Decimal("95.00")}],
    ):
        invoice_pdf = generate_invoice_pdf(job, engine=None)

    cert_pdf_empty = generate_certificate_pdf(job, safety_tests=[])
    cert_pdf_with_rows = generate_certificate_pdf(
        job,
        safety_tests=[
            {
                "type": "Earth Loop",
                "result": "PASS",
                "value": "0.32",
                "unit": "Ohms",
                "gps_lat": -36.85,
                "gps_lng": 174.76,
            }
        ],
    )

    assert invoice_pdf.startswith(b"%PDF")
    assert cert_pdf_empty.startswith(b"%PDF")
    assert cert_pdf_with_rows.startswith(b"%PDF")


def test_compliance_agent_summarize_electrical_trade() -> None:
    """Test compliance summary for electrical trade with all required tests."""
    from services.triage import ComplianceAgent
    
    agent = ComplianceAgent()
    transcript = "Performed earth loop test with 0.32 ohms, polarity test passed, insulation resistance was 500M ohms, and RCD trip time was 12ms"
    
    result = agent.summarize(transcript, "ELECTRICAL")
    
    assert result.status == "COMPLETE"
    assert len(result.missing_items) == 0
    assert "mandatory tests" in result.notes.lower()
    
    # Check all electrical tests are present
    test_keys = {check.key for check in result.checks}
    expected_keys = {"earth_loop", "polarity", "insulation", "rcd"}
    assert test_keys == expected_keys


def test_compliance_agent_summarize_plumbing_trade() -> None:
    """Test compliance summary for plumbing trade with gas and water tests."""
    from services.triage import ComplianceAgent
    
    agent = ComplianceAgent()
    transcript = "Gas pressure test passed at 2.5kPa, water flow rate was 15L/min, backflow prevention device installed"
    
    result = agent.summarize(transcript, "PLUMBING")
    
    assert result.status == "COMPLETE"
    assert len(result.missing_items) == 0
    
    # Check plumbing-specific tests
    test_keys = {check.key for check in result.checks}
    expected_keys = {"gas_pressure", "water_flow", "backflow"}
    assert expected_keys.issubset(test_keys)


def test_compliance_agent_summarize_missing_tests() -> None:
    """Test compliance summary with missing mandatory tests."""
    from services.triage import ComplianceAgent
    
    agent = ComplianceAgent()
    transcript = "Only performed earth loop test"
    
    result = agent.summarize(transcript, "ELECTRICAL")
    
    assert result.status == "ACTION_REQUIRED"
    assert len(result.missing_items) == 3  # polarity, insulation, rcd
    assert "missing mandatory safety evidence" in result.notes.lower()


def test_compliance_agent_summarize_empty_transcript() -> None:
    """Test compliance summary with no transcript."""
    from services.triage import ComplianceAgent
    
    agent = ComplianceAgent()
    result = agent.summarize("", "ELECTRICAL")
    
    assert result.status == "COMPLETE"  # No transcript means no tests required yet
    assert "No transcript captured yet" in result.notes


def test_compliance_agent_normalizes_trade() -> None:
    """Test trade normalization handles various input formats."""
    from services.triage import ComplianceAgent
    
    agent = ComplianceAgent()
    
    # Test various trade formats
    test_cases = [
        ("electrical", "ELECTRICAL"),
        ("ELECTRICAL", "ELECTRICAL"),
        ("plumbing", "PLUMBING"),
        ("PLUMBING", "PLUMBING"),
        ("Electrical", "ELECTRICAL"),
        ("  electrical  ", "ELECTRICAL"),
        ("unknown", "ELECTRICAL"),  # Falls back to electrical
    ]
    
    for input_trade, expected_trade in test_cases:
        transcript = "earth loop test passed"
        result = agent.summarize(transcript, input_trade)
        # Should not raise error and should use expected tests
        assert isinstance(result.checks, list)


def test_voice_message_dataclass() -> None:
    """Test VoiceMessage dataclass creation and attributes."""
    from services.triage import VoiceMessage
    
    message = VoiceMessage(
        id="test-id",
        call_sid="call-123",
        recording_sid="rec-456",
        from_number="+64211234567",
        urgency="HIGH",
        summary="Emergency call",
        transcript="Power outage reported",
        created_at="2026-03-10T11:30:00Z"
    )
    
    assert message.id == "test-id"
    assert message.urgency == "HIGH"
    assert message.from_number == "+64211234567"


def test_compliance_check_dataclass() -> None:
    """Test ComplianceCheck dataclass."""
    from services.triage import ComplianceCheck
    
    check = ComplianceCheck(
        key="earth_loop",
        label="Earth Loop",
        present=True
    )
    
    assert check.key == "earth_loop"
    assert check.present is True


def test_compliance_summary_dataclass() -> None:
    """Test ComplianceSummary dataclass."""
    from services.triage import ComplianceSummary, ComplianceCheck
    
    checks = [
        ComplianceCheck(key="earth_loop", label="Earth Loop", present=True),
        ComplianceCheck(key="polarity", label="Polarity", present=False)
    ]
    
    summary = ComplianceSummary(
        checks=checks,
        missing_items=["Polarity"],
        status="ACTION_REQUIRED",
        notes="Missing polarity test"
    )
    
    assert len(summary.checks) == 2
    assert summary.missing_items == ["Polarity"]
    assert summary.status == "ACTION_REQUIRED"
