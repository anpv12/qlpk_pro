#!/usr/bin/env python3
"""Read-only Alembic graph audit for QLPK.

Default mode reports migration graph risks without failing on the current
legacy multi-head state. Use ``--strict`` in CI/staging once the graph is
normalized.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_DIR = ROOT / "alembic"
ALEMBIC_INI = ALEMBIC_DIR / "alembic.ini"


def _load_script_directory() -> ScriptDirectory:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    return ScriptDirectory.from_config(config)


def _current_db_versions() -> list[str]:
    sys.path.insert(0, str(ROOT))
    from app.core.database import engine

    inspector = inspect(engine)
    if "alembic_version" not in inspector.get_table_names(schema="public"):
        return []
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num")).fetchall()
    return [row[0] for row in rows]


def _build_report() -> dict[str, Any]:
    script = _load_script_directory()
    revisions = list(script.walk_revisions())
    revision_ids = {revision.revision for revision in revisions}
    heads = sorted(script.get_heads())
    bases = sorted(script.get_bases())
    current_versions = _current_db_versions()
    warnings: list[str] = []

    if len(heads) > 1:
        warnings.append(f"multiple_heads:{len(heads)}")
    if len(bases) > 1:
        warnings.append(f"multiple_bases:{len(bases)}")
    if not current_versions:
        warnings.append("db_has_no_alembic_version")

    unknown_current_versions = sorted(set(current_versions) - revision_ids)
    if unknown_current_versions:
        warnings.append("db_current_revision_not_found_in_repo")

    unapplied_heads = sorted(set(heads) - set(current_versions))
    if unapplied_heads:
        warnings.append(f"db_not_at_all_heads:{len(unapplied_heads)}")

    return {
        "ok": not unknown_current_versions and bool(current_versions),
        "warnings": warnings,
        "revision_count": len(revisions),
        "heads": heads,
        "bases": bases,
        "branch_points": sorted(revision.revision for revision in revisions if revision.is_branch_point),
        "merge_points": sorted(revision.revision for revision in revisions if revision.is_merge_point),
        "current_db_versions": current_versions,
        "unknown_current_versions": unknown_current_versions,
        "unapplied_heads": unapplied_heads,
    }


def _print_text_report(report: dict[str, Any], strict: bool) -> None:
    status = "OK" if report["ok"] and (not strict or not report["warnings"]) else "WARN"
    if not report["ok"]:
        status = "FAIL"
    print(f"[{status}] alembic_contract")
    print(f"  revisions={report['revision_count']}")
    print(f"  current_db_versions={', '.join(report['current_db_versions']) or '-'}")
    print(f"  heads={len(report['heads'])}")
    for head in report["heads"]:
        marker = " (current)" if head in report["current_db_versions"] else ""
        print(f"    - {head}{marker}")
    print(f"  bases={len(report['bases'])}")
    for base in report["bases"]:
        print(f"    - {base}")
    print(f"  branch_points={len(report['branch_points'])}")
    for revision in report["branch_points"]:
        print(f"    - {revision}")
    print(f"  merge_points={len(report['merge_points'])}")
    for revision in report["merge_points"]:
        print(f"    - {revision}")
    print(f"  unapplied_heads={len(report['unapplied_heads'])}")
    for revision in report["unapplied_heads"]:
        print(f"    - {revision}")
    print(f"  warnings={', '.join(report['warnings']) or '-'}")
    if report["warnings"] and not strict:
        print("  note=warnings are advisory in default mode; use --strict to fail on graph debt")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Alembic migration graph and DB revision")
    parser.add_argument("--strict", action="store_true", help="fail on graph warnings such as multiple heads")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON report")
    args = parser.parse_args()

    report = _build_report()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        _print_text_report(report, args.strict)

    if not report["ok"]:
        return 1
    if args.strict and report["warnings"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
