"""Extended unit tests for triage service to achieve 85% coverage."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import Mock, patch

import pytest

from services.triage import (
    VoiceMessage,
    ComplianceCheck,
    ComplianceSummary,
    ComplianceAgent,
    TriageService,
)


def test_voice_message_dataclass() -> None:
    """Test VoiceMessage dataclass."""
    voice_msg = VoiceMessage(
        id="msg-123",
        call_sid="call-456",
        recording_sid="rec-789",
        from_number="+64211234567",
        urgency="High",
        summary="Urgent electrical issue",
        transcript="The power is out at the property",
        created_at="2023-01-01T00:00:00Z"
    )
    
    assert voice_msg.id == "msg-123"
    assert voice_msg.call_sid == "call-456"
    assert voice_msg.recording_sid == "rec-789"
    assert voice_msg.from_number == "+64211234567"
    assert voice_msg.urgency == "High"
    assert voice_msg.summary == "Urgent electrical issue"
    assert voice_msg.transcript == "The power is out at the property"


def test_compliance_check_dataclass() -> None:
    """Test ComplianceCheck dataclass."""
    check = ComplianceCheck(
        key="earth_loop",
        label="Earth Loop Test",
        present=True
    )
    
    assert check.key == "earth_loop"
    assert check.label == "Earth Loop Test"
    assert check.present is True


def test_compliance_summary_dataclass() -> None:
    """Test ComplianceSummary dataclass."""
    checks = [
        ComplianceCheck(key="earth_loop", label="Earth Loop", present=True),
        ComplianceCheck(key="polarity", label="Polarity", present=False)
    ]
    
    summary = ComplianceSummary(
        checks=checks,
        missing_items=["Polarity test"],
        status="PARTIAL",
        notes="Missing polarity test"
    )
    
    assert len(summary.checks) == 2
    assert summary.checks[0].present is True
    assert summary.checks[1].present is False
    assert "Polarity test" in summary.missing_items
    assert summary.status == "PARTIAL"
    assert "Missing polarity test" in summary.notes


def test_compliance_agent_with_missing_required_tests() -> None:
    """Test compliance agent with missing required tests."""
    agent = ComplianceAgent()
    
    # Test with transcript but missing electrical tests
    transcript = "Installed some outlets but didn't test earth loop"
    
    result = agent.summarize(transcript, "ELECTRICAL")
    
    assert result.status != "COMPLETE"
    assert len([c for c in result.checks if not c.present]) > 0


def test_compliance_agent_with_complete_tests() -> None:
    """Test compliance agent with complete tests."""
    agent = ComplianceAgent()
    
    transcript = """
    Completed all required electrical tests:
    - Earth Loop: 0.32 Ohms PASS
    - Polarity: PASS
    - Insulation Resistance: 500MΩ PASS
    - RCD Test: PASS
    """
    
    result = agent.summarize(transcript, "ELECTRICAL")
    
    assert result.status == "COMPLETE"
    assert all(check.present for check in result.checks)


def test_compliance_agent_with_plumbing_tests() -> None:
    """Test compliance agent with plumbing tests."""
    agent = ComplianceAgent()
    
    transcript = """
    Plumbing work completed:
    - Gas pressure test: 2.5kPa PASS
    - Water flow: 15 L/min PASS
    - Backflow prevention: PASS
    - RCD test: PASS
    """
    
    result = agent.summarize(transcript, "PLUMBING")
    
    assert result.status == "COMPLETE"
    assert all(check.present for check in result.checks)


def test_compliance_agent_with_any_trade() -> None:
    """Test compliance agent with ANY trade (requires all tests)."""
    agent = ComplianceAgent()
    
    transcript = "Basic electrical work done"
    
    result = agent.summarize(transcript, "ANY")
    
    # Should require all tests for ANY trade
    assert len(result.checks) >= 4  # All tests


def test_compliance_agent_with_invalid_trade() -> None:
    """Test compliance agent with invalid trade input."""
    agent = ComplianceAgent()
    
    transcript = "Some work was done"
    
    result = agent.summarize(transcript, "INVALID")
    
    # Should default to electrical
    electrical_keys = {"earth_loop", "polarity", "insulation", "rcd"}
    result_keys = {check.key for check in result.checks}
    assert electrical_keys.issubset(result_keys)


def test_triage_service_init() -> None:
    """Test TriageService initialization."""
    service = TriageService()
    
    assert hasattr(service, '_lock')
    assert service._lock is not None


def test_triage_service_parse_classification() -> None:
    """Test classification parsing."""
    service = TriageService()
    
    # Test valid JSON
    valid_json = '{"urgency": "High", "summary": "Critical issue"}'
    urgency, summary = service._parse_classification(valid_json)
    assert urgency == "High"
    assert summary == "Critical issue"
    
    # Test with different urgency case
    lower_case_json = '{"urgency": "medium", "summary": "Normal issue"}'
    urgency, summary = service._parse_classification(lower_case_json)
    assert urgency == "Medium"
    assert summary == "Normal issue"
    
    # Test with missing urgency
    missing_urgency = '{"summary": "No urgency field"}'
    urgency, summary = service._parse_classification(missing_urgency)
    assert urgency == "Medium"  # Default
    assert summary == "No urgency field"
    
    # Test with invalid JSON
    invalid_json = '{ invalid json }'
    urgency, summary = service._parse_classification(invalid_json)
    assert urgency == "Medium"  # Default
    assert summary == "Client callback required."  # Default error message


def test_triage_service_extract_json_payload() -> None:
    """Test JSON payload extraction."""
    service = TriageService()
    
    # Test valid JSON
    valid_json = '{"key": "value"}'
    result = service._extract_json_payload(valid_json)
    assert result == {"key": "value"}
    
    # Test with JSON surrounded by text
    text_with_json = 'Some text {"key": "value"} more text'
    result = service._extract_json_payload(text_with_json)
    assert result == {"key": "value"}
    
    # Test with empty string - should raise ValueError
    with pytest.raises(ValueError, match="did not contain valid JSON"):
        service._extract_json_payload("")


def test_triage_service_get_openai_client() -> None:
    """Test OpenAI client creation."""
    service = TriageService()
    
    with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
        client = service._get_openai_client()
        assert client.api_key == "test-key"


def test_triage_service_get_openai_client_missing_key() -> None:
    """Test OpenAI client creation with missing API key."""
    service = TriageService()
    
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
            service._get_openai_client()


def test_triage_service_transcribe() -> None:
    """Test audio transcription."""
    service = TriageService()
    
    audio_bytes = b"fake audio data"
    
    with patch.object(service, '_get_openai_client') as mock_client:
        mock_response = Mock()
        mock_response.text = "Transcribed text"
        
        mock_client.return_value.audio.transcriptions.create.return_value = mock_response
        
        result = service._transcribe(audio_bytes)
        
        assert result == "Transcribed text"


def test_triage_service_classify_urgency() -> None:
    """Test urgency classification."""
    service = TriageService()
    
    transcript = "Urgent electrical emergency"
    
    with patch.object(service, '_get_openai_client') as mock_client:
        mock_response = Mock()
        mock_response.output_text = '{"urgency": "High", "summary": "Emergency"}'
        
        mock_client.return_value.responses.create.return_value = mock_response
        
        urgency, summary = service._classify_urgency(transcript)
        
        assert urgency == "High"
        assert summary == "Emergency"


def test_compliance_agent_edge_cases() -> None:
    """Test compliance agent edge cases."""
    agent = ComplianceAgent()
    
    # Test with very long transcript
    long_transcript = "Test " * 1000
    result = agent.summarize(long_transcript, "ELECTRICAL")
    assert isinstance(result.status, str)
    
    # Test with special characters
    special_transcript = "Test @#$%^&*() electrical work"
    result = agent.summarize(special_transcript, "ELECTRICAL")
    assert isinstance(result.status, str)
    
    # Test with numbers and units
    numeric_transcript = "Earth loop test: 0.32 Ohms, Polarity: PASS, Voltage: 230V"
    result = agent.summarize(numeric_transcript, "ELECTRICAL")
    assert isinstance(result.status, str)
    
    # Test with empty transcript
    empty_result = agent.summarize("", "ELECTRICAL")
    assert empty_result.status == "ACTION_REQUIRED"  # Actual status
    
    # Test with None transcript
    with pytest.raises(AttributeError):  # None has no .lower() method
        agent.summarize(None, "ELECTRICAL")  # type: ignore