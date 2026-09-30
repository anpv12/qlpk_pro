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


def test_python_functions_stay_short_and_simple() -> None:
    assert health.python_function_findings() == []


def test_python_complexity_counts_like_mccabe() -> None:
    import ast
    source = (
        "def sample(items):\n"
        "    for item in items:\n"
        "        if item and item.ok:\n"
        "            continue\n"
        "        elif item:\n"
        "            pass\n"
        "    try:\n"
        "        return 1\n"
        "    except ValueError:\n"
        "        return 2\n"
    )
    node = ast.parse(source).body[0]
    assert 1 + health._statements_complexity(node.body) == 5
