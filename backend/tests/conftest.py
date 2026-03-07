"""Pytest configuration for SparkOps backend tests.

This module ensures the backend package root is available on ``sys.path`` when
running tests from either repository root or backend directory.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
