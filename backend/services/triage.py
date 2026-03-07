"""Voicemail triage service for Ladder Mode call interception.

This module downloads Twilio recordings, transcribes with gpt-4o-mini-transcribe,
classifies urgency with gpt-5-nano, and stores only minimal structured metadata.
"""

from __future__ import annotations

import io
import json
import os
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore[assignment]


@dataclass(frozen=True)
class VoiceMessage:
    """Structured voicemail notification payload."""

    id: str
    call_sid: str
    recording_sid: str
    from_number: str
    urgency: str
    summary: str
    transcript: str
    created_at: str


class TriageService:
    """Service responsible for voicemail processing and Ladder Mode state."""

    def __init__(self) -> None:
        self._messages: list[VoiceMessage] = []
        self._lock = threading.Lock()
        self._ladder_mode_enabled = False

    @staticmethod
    def _get_openai_client() -> OpenAI:
        if OpenAI is None:
            raise RuntimeError("OpenAI SDK >= 1.0.0 is required. Install `openai` from requirements.txt.")
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required.")
        return OpenAI(api_key=api_key)

    @staticmethod
    def _ensure_audio_url(recording_url: str) -> str:
        return recording_url if recording_url.endswith(".wav") else f"{recording_url}.wav"

    @staticmethod
    def _parse_classification(text: str) -> tuple[str, str]:
        try:
            payload = json.loads(text)
            urgency = str(payload.get("urgency", "Medium")).strip().title()
            summary = str(payload.get("summary", "Client callback required.")).strip()
        except json.JSONDecodeError:
            urgency = "Medium"
            summary = "Client callback required."

        if urgency not in {"High", "Medium", "Low"}:
            urgency = "Medium"
        if not summary:
            summary = "Client callback required."
        return urgency, summary[:120]

    def set_ladder_mode(self, enabled: bool) -> None:
        with self._lock:
            self._ladder_mode_enabled = enabled

    def get_ladder_mode(self) -> bool:
        with self._lock:
            return self._ladder_mode_enabled

    def list_voicemails(self) -> list[dict[str, Any]]:
        rank = {"High": 0, "Medium": 1, "Low": 2}
        with self._lock:
            ordered = sorted(self._messages, key=lambda row: (rank.get(row.urgency, 1), row.created_at), reverse=False)
        return [asdict(row) for row in ordered]

    def process_recording(self, *, recording_url: str, from_number: str, call_sid: str, recording_sid: str) -> dict[str, Any]:
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")

        if not account_sid or not auth_token:
            raise RuntimeError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for recording download.")

        audio_url = self._ensure_audio_url(recording_url)
        with httpx.Client(timeout=30.0) as client:
            audio_response = client.get(audio_url, auth=(account_sid, auth_token))
            audio_response.raise_for_status()
            audio_bytes = audio_response.content

        try:
            transcript = self._transcribe(audio_bytes)
            urgency, summary = self._classify_urgency(transcript)
        finally:
            # Privacy: clear in-memory audio bytes reference after processing.
            audio_bytes = b""

        created_at = datetime.now(tz=timezone.utc).isoformat()
        message = VoiceMessage(
            id=f"vm_{recording_sid or call_sid}",
            call_sid=call_sid,
            recording_sid=recording_sid,
            from_number=from_number,
            urgency=urgency,
            summary=summary,
            transcript=transcript,
            created_at=created_at,
        )

        with self._lock:
            self._messages.append(message)

        return asdict(message)

    def _transcribe(self, audio_bytes: bytes) -> str:
        client = self._get_openai_client()
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "voicemail.wav"
        response = client.audio.transcriptions.create(model="gpt-4o-mini-transcribe", file=audio_file)
        return response.text.strip()

    def _classify_urgency(self, transcript: str) -> tuple[str, str]:
        client = self._get_openai_client()
        response = client.responses.create(
            model="gpt-5-nano",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Analyze the transcript. Return JSON with 'urgency': 'High', "
                                "'Medium', or 'Low', and 'summary': '<10 words>'."
                            ),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": transcript}],
                },
            ],
        )
        return self._parse_classification(response.output_text)


triage_service = TriageService()
