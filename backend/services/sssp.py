"""Site Specific Safety Plan (SSSP) generation service."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI


DEFAULT_HAZARDS = {
    "ELECTRICAL": ["Live electrical conductors", "Arc flash", "Working at height"],
    "PLUMBING": ["Pressurised pipework", "Hot work exposure", "Confined spaces"],
    "ANY": ["Manual handling", "Slips/trips/falls", "Traffic/public interface"],
}


class SafetyPlanError(RuntimeError):
    """Raised when SSSP generation fails."""


def _fallback_plan(transcript: str, trade: str) -> dict[str, Any]:
    normalized_trade = (trade or "ELECTRICAL").strip().upper()
    hazards = DEFAULT_HAZARDS.get(normalized_trade, DEFAULT_HAZARDS["ANY"])
    controls = [
        "Confirm site induction and toolbox talk before starting.",
        "Use PPE suitable for the identified hazards.",
        "Isolate/lock-out hazardous energy sources before work.",
        "Record incidents and stop work if conditions change.",
    ]
    return {
        "site_summary": transcript.strip()[:300],
        "trade": normalized_trade,
        "hazards": hazards,
        "controls": controls,
        "emergency_plan": "Call 111, isolate area, notify supervisor/client immediately.",
        "signoff_checklist": [
            "PPE checked",
            "Hazards communicated",
            "Emergency path confirmed",
            "Client briefed",
        ],
    }


def generate_site_safety_plan(*, transcript: str, trade: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return _fallback_plan(transcript, trade)

    try:
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model="gpt-5.4",
            input=[
                {
                    "role": "system",
                    "content": (
                        "You are a New Zealand WorkSafe safety planner for field trades. "
                        "Return strict JSON with keys: site_summary, trade, hazards (array), controls (array), emergency_plan, signoff_checklist (array)."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Trade: {trade}\nTranscript: {transcript}",
                },
            ],
        )
        content = getattr(response, "output_text", "")
        payload = json.loads(content)
        if not isinstance(payload, dict):
            raise SafetyPlanError("LLM returned non-object JSON.")
        return payload
    except Exception:
        return _fallback_plan(transcript, trade)
