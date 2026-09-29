"""Exceptions in app code must be handled or logged, never silently swallowed."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SILENT_EXCEPT = re.compile(r"except[^\n]*:[ \t]*(?:#[^\n]*)?\n[ \t]*pass\b")


def test_app_has_no_silent_except_pass() -> None:
    offenders = []
    for path in sorted((ROOT / "app").rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        for match in SILENT_EXCEPT.finditer(source):
            offenders.append(f"{path.relative_to(ROOT)}:{source.count(chr(10), 0, match.start()) + 1}")
    assert offenders == []
