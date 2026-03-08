"""Twilio webhook routes for Ladder Mode call triage."""

from __future__ import annotations

import os

from fastapi import APIRouter, Form, Header, HTTPException, Request, Response
from pydantic import BaseModel

try:
    from twilio.request_validator import RequestValidator
    from twilio.twiml.voice_response import VoiceResponse
except ImportError:  # pragma: no cover
    RequestValidator = None  # type: ignore[assignment]
    VoiceResponse = None  # type: ignore[assignment]

from services.triage import triage_service

router = APIRouter(prefix="/api/twilio", tags=["twilio"])


def api_success(data: object) -> dict[str, object]:
    """Return standard API success envelope."""

    return {"success": True, "data": data}


class LadderModePayload(BaseModel):
    """Request body for ladder mode state updates."""

    enabled: bool


def verify_twilio_request(request: Request, twilio_signature: str | None) -> bool:
    """Validate Twilio webhook signature when auth token is configured."""

    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    if not auth_token:
        return True
    if not twilio_signature:
        return False
    if RequestValidator is None:
        return False

    validator = RequestValidator(auth_token)
    return validator.validate(str(request.url), dict(request.query_params), twilio_signature)


def build_twiml_response(*, ladder_mode_enabled: bool, callback_url: str) -> str:
    """Build TwiML using SDK when available, otherwise XML fallback."""

    if VoiceResponse is None:
        if not ladder_mode_enabled:
            return (
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                "<Response><Say voice=\"alice\" language=\"en-NZ\">"
                "Ladder mode is currently off. Please call back shortly."
                "</Say><Hangup/></Response>"
            )

        return (
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            "<Response><Say voice=\"alice\" language=\"en-NZ\">"
            "Dave is on site. Please leave a detailed message."
            "</Say>"
            f"<Record maxLength=\"120\" playBeep=\"true\" recordingStatusCallback=\"{callback_url}\" "
            "recordingStatusCallbackMethod=\"POST\"/>"
            "<Hangup/></Response>"
        )

    response = VoiceResponse()
    if not ladder_mode_enabled:
        response.say(
            "Ladder mode is currently off. Please call back shortly.",
            voice="alice",
            language="en-NZ",
        )
        response.hangup()
        return str(response)

    response.say(
        "Dave is on site. Please leave a detailed message.",
        voice="alice",
        language="en-NZ",
    )
    response.record(
        max_length=120,
        play_beep=True,
        recording_status_callback=callback_url,
        recording_status_callback_method="POST",
    )
    response.hangup()
    return str(response)


@router.post("/voice")
async def twilio_voice_webhook(
    request: Request,
    from_number: str = Form("", alias="From"),
    call_sid: str = Form("", alias="CallSid"),
    twilio_signature: str | None = Header(default=None, alias="X-Twilio-Signature"),
) -> Response:
    """Return TwiML instructions to capture a voicemail while in ladder mode."""

    if not verify_twilio_request(request, twilio_signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature.")

    _ = from_number
    _ = call_sid
    callback_url = f"{request.base_url}api/twilio/recording"
    twiml = build_twiml_response(ladder_mode_enabled=triage_service.get_ladder_mode(), callback_url=callback_url)
    return Response(content=twiml, media_type="application/xml")


@router.post("/recording")
async def twilio_recording_callback(
    request: Request,
    recording_url: str = Form(..., alias="RecordingUrl"),
    from_number: str = Form("", alias="From"),
    call_sid: str = Form("", alias="CallSid"),
    recording_sid: str = Form("", alias="RecordingSid"),
    twilio_signature: str | None = Header(default=None, alias="X-Twilio-Signature"),
) -> dict[str, object]:
    """Process Twilio recording callback with transcription and urgency triage."""

    if not verify_twilio_request(request, twilio_signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature.")

    message = triage_service.process_recording(
        recording_url=recording_url,
        from_number=from_number,
        call_sid=call_sid,
        recording_sid=recording_sid,
    )
    return api_success({"status": "processed", "message": message})


@router.get("/voicemails")
def list_voicemails() -> dict[str, object]:
    """Return triaged voicemail feed sorted by urgency."""

    return api_success({"items": triage_service.list_voicemails()})


@router.get("/ladder-mode")
def get_ladder_mode() -> dict[str, bool]:
    """Return current ladder mode state."""

    return api_success({"enabled": triage_service.get_ladder_mode()})


@router.post("/ladder-mode")
def set_ladder_mode(payload: LadderModePayload) -> dict[str, bool]:
    """Toggle ladder mode call interception behavior."""

    triage_service.set_ladder_mode(payload.enabled)
    return api_success({"enabled": triage_service.get_ladder_mode()})
