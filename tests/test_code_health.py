"""Source files stay reviewable: none over the size limit (lint part runs in scripts/check_code_health.py)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("check_code_health", ROOT / "scripts/check_code_health.py")
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


def test_no_source_file_exceeds_line_limit() -> None:
    assert health.oversized() == []
