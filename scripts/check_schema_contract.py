#!/usr/bin/env python3
"""Read-only schema contract check for QLPK.

This intentionally avoids importing ``main.py`` because application import can
run startup side effects. The check compares live PostgreSQL schema with the
SQLAlchemy model registry and verifies that model files are imported into
``app.models``.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import inspect

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TECHNICAL_TABLES = {"alembic_version"}


def _load_model_metadata():
    sys.path.insert(0, str(ROOT))
    from app.core.database import Base, engine

    import app.models  # noqa: F401 - register model classes into Base.metadata

    return engine, Base.metadata


def _declared_model_tables() -> dict[str, str]:
    tables: dict[str, str] = {}
    model_root = ROOT / "app" / "models"
    for path in sorted(model_root.glob("*.py")):
        if path.name == "__init__.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            value: ast.AST | None = None
            if isinstance(node, ast.Assign):
                if any(isinstance(target, ast.Name) and target.id == "__tablename__" for target in node.targets):
                    value = node.value
            elif isinstance(node, ast.AnnAssign):
                if isinstance(node.target, ast.Name) and node.target.id == "__tablename__":
                    value = node.value
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                tables[value.value] = str(path.relative_to(ROOT))
    return tables


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name, schema="public")}


def _build_report(technical_tables: set[str]) -> dict[str, Any]:
    engine, metadata = _load_model_metadata()
    inspector = inspect(engine)

    db_tables = set(inspector.get_table_names(schema="public"))
    metadata_tables = set(metadata.tables.keys())
    declared_tables = _declared_model_tables()

    registry_missing = sorted(set(declared_tables) - metadata_tables)
    extra_tables = sorted(db_tables - metadata_tables - technical_tables)
    missing_tables = sorted(metadata_tables - db_tables)

    extra_columns: list[dict[str, str]] = []
    missing_columns: list[dict[str, str]] = []
    for table_name in sorted(db_tables & metadata_tables):
        db_columns = _column_names(inspector, table_name)
        model_columns = set(metadata.tables[table_name].columns.keys())
        for column_name in sorted(db_columns - model_columns):
            extra_columns.append({"table": table_name, "column": column_name})
        for column_name in sorted(model_columns - db_columns):
            missing_columns.append({"table": table_name, "column": column_name})

    return {
        "ok": not any([registry_missing, extra_tables, missing_tables, extra_columns, missing_columns]),
        "db_table_count": len(db_tables),
        "model_table_count": len(metadata_tables),
        "declared_model_table_count": len(declared_tables),
        "technical_tables": sorted(technical_tables),
        "registry_missing_tables": [
            {"table": table_name, "model_file": declared_tables[table_name]}
            for table_name in registry_missing
        ],
        "extra_tables": extra_tables,
        "missing_tables": missing_tables,
        "extra_columns": extra_columns,
        "missing_columns": missing_columns,
    }


def _print_text_report(report: dict[str, Any]) -> None:
    status = "OK" if report["ok"] else "FAIL"
    print(f"[{status}] schema_contract")
    print(f"  db_tables={report['db_table_count']}")
    print(f"  model_tables={report['model_table_count']}")
    print(f"  declared_model_tables={report['declared_model_table_count']}")
    print(f"  technical_tables={', '.join(report['technical_tables']) or '-'}")

    sections = [
        ("registry_missing_tables", "Model file has __tablename__ but is not registered in app.models"),
        ("extra_tables", "DB table is not represented by SQLAlchemy metadata"),
        ("missing_tables", "SQLAlchemy table is missing in DB"),
        ("extra_columns", "DB column is not represented by model"),
        ("missing_columns", "Model column is missing in DB"),
    ]
    for key, title in sections:
        items = report[key]
        if not items:
            print(f"  {key}: 0")
            continue
        print(f"  {key}: {len(items)}")
        for item in items:
            if isinstance(item, dict):
                if "model_file" in item:
                    print(f"    - {item['table']} ({item['model_file']})")
                else:
                    print(f"    - {item['table']}.{item['column']}")
            else:
                print(f"    - {item}")
        print(f"    reason: {title}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check DB schema against SQLAlchemy model registry")
    parser.add_argument(
        "--allow-table",
        action="append",
        default=[],
        help="additional technical table name allowed to exist outside SQLAlchemy metadata",
    )
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON report")
    args = parser.parse_args()

    technical_tables = DEFAULT_TECHNICAL_TABLES | set(args.allow_table)
    report = _build_report(technical_tables)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        _print_text_report(report)

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
