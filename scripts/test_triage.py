"""Local verification script for GPT-5 triage extraction."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_PATH = REPO_ROOT / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

from services.triage import triage_service  # noqa: E402


def main() -> None:
    transcript = (
        "I'm at the Smith Residence, 45 Queen St. Installed 50m of TPS cable and 2 GPOs. Took 3 hours."
    )

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required to run triage verification.")

    extracted = triage_service.analyze_transcript(transcript)
    print(json.dumps(extracted, indent=2))

    line_items = extracted.get("line_items", [])
    material_hit = any(
        isinstance(item, dict)
        and item.get("type") == "MATERIAL"
        and "tps cable" in str(item.get("description", "")).lower()
        for item in line_items
    )
    labor_hit = any(
        isinstance(item, dict)
        and item.get("type") == "LABOR"
        and "3" in str(item.get("qty", ""))
        and "hour" in str(item.get("description", "")).lower()
        for item in line_items
    )

    assert material_hit, "Expected a MATERIAL line item for TPS cable."
    assert labor_hit, "Expected a LABOR line item for 3 hours."

    print("\nTriage verification passed.")


if __name__ == "__main__":
    main()
