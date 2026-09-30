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


def test_no_stylesheet_exceeds_line_limit() -> None:
    assert health.stylesheet_files()
    assert health.oversized_stylesheets() == []


def test_split_stylesheet_entries_import_existing_topic_parts_in_order() -> None:
    import re
    part_import = re.compile(r"^@import url\('\./([\w-]+)/([\w-]+\.css)'\);$", re.M)
    for folder in (path for path in health.CSS_ROOT.rglob("*") if path.is_dir() and path.with_suffix(".css").is_file()):
        entry = folder.with_suffix(".css")
        imports = [folder / name for stem, name in part_import.findall(entry.read_text(encoding="utf-8")) if stem == folder.name]
        if not imports:
            continue
        assert all(path.is_file() for path in imports), entry
        assert sorted(imports) == sorted(folder.glob("*.css")), f"{entry}: every topic part is imported exactly once"
        assert len(set(imports)) == len(imports), entry


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


def test_window_globals_do_not_grow() -> None:
    assert health.window_global_findings() == []
