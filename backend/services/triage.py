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
    def _limit_summary_words(summary: str, max_words: int = 10) -> str:
        words = summary.split()
        if not words:
            return "Client callback required."
        return " ".join(words[:max_words])

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
        return urgency, TriageService._limit_summary_words(summary, max_words=10)

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
        response = client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",
            file=audio_file,
        )
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

    @staticmethod
    def _extract_json_payload(text: str) -> dict[str, Any]:
        """Parse JSON content from model output with markdown-fence fallback."""

        candidate = text.strip()
        if candidate.startswith("```"):
            candidate = candidate.strip("`")
            if candidate.startswith("json"):
                candidate = candidate[4:]
            candidate = candidate.strip()

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise ValueError("GPT-5 triage output did not contain valid JSON.") from None
            parsed = json.loads(candidate[start : end + 1])

        if not isinstance(parsed, dict):
            raise ValueError("GPT-5 triage output must be a JSON object.")
        return parsed

    @staticmethod
    def _normalize_extraction(payload: dict[str, Any]) -> dict[str, Any]:
        """Normalize and validate triage extraction payload shape."""

        line_items = payload.get("line_items", [])
        if not isinstance(line_items, list):
            line_items = []

        normalized_items: list[dict[str, Any]] = []
        for item in line_items:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type", "LABOR")).strip().upper()
            if item_type not in {"MATERIAL", "LABOR"}:
                item_type = "LABOR"
            normalized_items.append(
                {
                    "qty": item.get("qty", "1"),
                    "description": str(item.get("description", "")).strip(),
                    "type": item_type,
                }
            )

        return {
            "client": str(payload.get("client", "")).strip(),
            "address": str(payload.get("address", "")).strip(),
            "scope": str(payload.get("scope", "")).strip(),
            "line_items": normalized_items,
        }

    def analyze_transcript(self, text: str) -> dict[str, Any]:
        """Extract structured job draft data from transcript using GPT-5."""

        transcript = text.strip()
        if not transcript:
            raise ValueError("Transcript text is required for triage analysis.")

        client = self._get_openai_client()
        response = client.responses.create(
            model="gpt-5",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "You are a Quantity Surveyor. Extract 'client', 'address', 'scope', and a list of "
                                "'line_items' (qty, description, type=MATERIAL/LABOR) from this text. Return only "
                                "valid JSON with keys: client, address, scope, line_items."
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

        parsed = self._extract_json_payload(response.output_text)
        return self._normalize_extraction(parsed)


triage_service = TriageService()
