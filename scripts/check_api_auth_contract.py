#!/usr/bin/env python3
"""Read-only API auth boundary audit for QLPK.

The script parses Flask route decorators from source files without importing
``main.py``. Default mode is advisory and exits 0 so the current legacy app can
be audited without breaking local smoke checks. Use ``--strict`` once the public
allowlist has been approved and missing auth findings are resolved.
"""

from __future__ import annotations

import argparse
import ast
import fnmatch
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AUTH_DECORATORS = {"require_auth", "require_admin"}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass(frozen=True)
class PublicRule:
    file: str
    route: str
    methods: tuple[str, ...] = ("*",)
    function: str = "*"
    reason: str = ""


@dataclass
class RouteRecord:
    file: str
    line: int
    function: str
    route: str
    methods: list[str]
    decorators: list[str]
    has_auth: bool
    is_allowed_public: bool
    public_reason: str | None
    severity: str | None


PUBLIC_RULES = [
    PublicRule("main.py", "/", reason="public page route"),
    PublicRule("main.py", "/*.html", reason="server-rendered page route"),
    PublicRule("main.py", "/favicon.ico", reason="public static asset route"),
    PublicRule("main.py", "/login", reason="login redirect page route"),
    PublicRule("main.py", "/medicine-statistics", reason="legacy page route"),
    PublicRule("main.py", "/chi-tieu", reason="legacy page route"),
    PublicRule("main.py", "/privacy-policy", reason="public policy page"),
    PublicRule("main.py", "/terms-of-service", reason="public terms page"),
    PublicRule("main.py", "/health", reason="health check"),
    PublicRule("main.py", "/uploads/*", methods=("GET",), reason="public-static upload categories only"),
    PublicRule("main.py", "/downloads/*", methods=("GET",), reason="legacy public export download route"),
    PublicRule("app/api/auth.py", "/login", methods=("POST",), function="login", reason="login endpoint"),
    PublicRule("app/modules/prescriptions/api/public.py", "/verify/rx/*", reason="public QR prescription verification page"),
    PublicRule("app/modules/prescriptions/api/public.py", "/api/public/prescription/*", methods=("GET",), reason="public QR prescription verification API"),
    PublicRule("app/api/patient.py", "*/public", methods=("GET",), function="get_patient_public", reason="public survey patient DTO"),
    PublicRule("app/api/survey_templates.py", "*/public", methods=("GET",), reason="public survey template DTO"),
    PublicRule("app/api/survey_template_management.py", "/public/survey-templates", methods=("GET",), reason="public survey template list"),
    PublicRule("app/api/survey_responses.py", "*/public", reason="public survey response flow"),
    PublicRule("app/api/survey_sessions.py", "/survey-sessions/status/*", methods=("GET",), reason="token-based public survey session status"),
    PublicRule("app/api/survey_sessions.py", "/survey-sessions/update-status-by-token", methods=("PUT",), reason="token-based public survey status update"),
    PublicRule("app/api/survey_sessions.py", "/survey-sessions/close/*", methods=("POST",), reason="token-based public survey close"),
    PublicRule("app/api/calendar.py", "/oauth/google/callback", methods=("GET",), reason="Google OAuth redirect callback cannot send JWT Authorization header"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/regions", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/regions/*/units", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/provinces", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/districts", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/districts/*", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/wards", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/wards/*", methods=("GET",), reason="public address catalog"),
    PublicRule("app/api/vietnam_address.py", "/vietnam-address/ward-by-name", methods=("GET",), reason="public address catalog"),
]


def _iter_python_files() -> list[Path]:
    roots = [ROOT / "main.py", ROOT / "app" / "api", ROOT / "app" / "modules"]
    files: list[Path] = []
    for item in roots:
        if item.is_file():
            files.append(item)
        elif item.is_dir():
            files.extend(path for path in item.rglob("*.py") if "__pycache__" not in path.parts)
    return sorted(files)


def _decorator_name(node: ast.AST) -> str:
    if isinstance(node, ast.Call):
        return _decorator_name(node.func)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = _decorator_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return ""


def _literal_string(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _literal_methods(node: ast.AST | None) -> list[str]:
    if node is None:
        return ["GET"]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        values = [_literal_string(item) for item in node.elts]
        return [value.upper() for value in values if value]
    value = _literal_string(node)
    return [value.upper()] if value else ["GET"]


def _route_from_decorator(node: ast.AST) -> tuple[str, list[str]] | None:
    if not isinstance(node, ast.Call):
        return None
    if not isinstance(node.func, ast.Attribute) or node.func.attr != "route":
        return None

    route = _literal_string(node.args[0]) if node.args else None
    for keyword in node.keywords:
        if keyword.arg == "rule" and route is None:
            route = _literal_string(keyword.value)
    if route is None:
        return None

    methods_node = None
    for keyword in node.keywords:
        if keyword.arg == "methods":
            methods_node = keyword.value
            break
    return route, _literal_methods(methods_node)


def _route_pattern_to_fnmatch(route: str) -> str:
    route = re.sub(r"<[^>]+>", "*", route)
    route = route.replace("//", "/")
    return route


def _public_reason(record: RouteRecord) -> str | None:
    route_pattern = _route_pattern_to_fnmatch(record.route)
    for rule in PUBLIC_RULES:
        if not fnmatch.fnmatch(record.file, rule.file):
            continue
        if rule.function != "*" and record.function != rule.function:
            continue
        if not fnmatch.fnmatch(route_pattern, rule.route):
            continue
        if "*" not in rule.methods and not set(record.methods).issubset(set(rule.methods)):
            continue
        return rule.reason
    return None


def _route_severity(record: RouteRecord) -> str:
    route = record.route.lower()
    if route == "/api/token/refresh" or record.function in {"register", "refresh_token_api"}:
        return "critical"
    if set(record.methods) & MUTATING_METHODS:
        return "critical"
    sensitive_terms = [
        "patient",
        "appointment",
        "examination",
        "prescription",
        "payment",
        "dashboard",
        "user",
        "group",
        "notification",
        "attachment",
        "document",
        "medicine",
        "expense",
        "calendar",
    ]
    if any(term in route for term in sensitive_terms):
        return "high"
    return "medium"


def _scan_file(path: Path) -> list[RouteRecord]:
    relative_path = str(path.relative_to(ROOT))
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    records: list[RouteRecord] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        route_decorators = []
        decorator_names = [_decorator_name(decorator) for decorator in node.decorator_list]
        has_auth = any(name.split(".")[-1] in AUTH_DECORATORS for name in decorator_names)

        for decorator in node.decorator_list:
            route_info = _route_from_decorator(decorator)
            if route_info:
                route_decorators.append(route_info)

        for route, methods in route_decorators:
            record = RouteRecord(
                file=relative_path,
                line=node.lineno,
                function=node.name,
                route=route,
                methods=methods,
                decorators=decorator_names,
                has_auth=has_auth,
                is_allowed_public=False,
                public_reason=None,
                severity=None,
            )
            reason = _public_reason(record)
            record.public_reason = reason
            record.is_allowed_public = bool(reason)
            if not record.has_auth and not record.is_allowed_public:
                record.severity = _route_severity(record)
            records.append(record)

    return records


def _build_report() -> dict[str, Any]:
    records: list[RouteRecord] = []
    for path in _iter_python_files():
        records.extend(_scan_file(path))

    missing_auth = [record for record in records if not record.has_auth and not record.is_allowed_public]
    allowed_public = [record for record in records if not record.has_auth and record.is_allowed_public]
    protected = [record for record in records if record.has_auth]
    severity_counts: dict[str, int] = {}
    for record in missing_auth:
        severity_counts[record.severity or "unknown"] = severity_counts.get(record.severity or "unknown", 0) + 1

    return {
        "ok": not missing_auth,
        "route_count": len(records),
        "protected_count": len(protected),
        "allowed_public_count": len(allowed_public),
        "missing_auth_count": len(missing_auth),
        "missing_auth_severity_counts": dict(sorted(severity_counts.items())),
        "missing_auth": [asdict(record) for record in sorted(missing_auth, key=lambda item: (item.severity or "", item.file, item.line))],
        "allowed_public": [asdict(record) for record in sorted(allowed_public, key=lambda item: (item.file, item.line))],
    }


def _format_route(record: dict[str, Any]) -> str:
    methods = ",".join(record["methods"])
    return f"{record['file']}:{record['line']} {methods} {record['route']} -> {record['function']}"


def _print_text_report(report: dict[str, Any], show_allowed: bool, max_items: int | None) -> None:
    status = "OK" if report["ok"] else "WARN"
    print(f"[{status}] api_auth_contract")
    print(f"  routes={report['route_count']}")
    print(f"  protected={report['protected_count']}")
    print(f"  allowed_public={report['allowed_public_count']}")
    print(f"  missing_auth={report['missing_auth_count']}")
    print(f"  severity_counts={report['missing_auth_severity_counts'] or {}}")

    missing = report["missing_auth"]
    if missing:
        print("  missing_auth_routes:")
        for record in missing[:max_items]:
            print(f"    - [{record['severity']}] {_format_route(record)}")
        if max_items is not None and len(missing) > max_items:
            print(f"    ... {len(missing) - max_items} more")

    if show_allowed and report["allowed_public"]:
        print("  allowed_public_routes:")
        for record in report["allowed_public"][:max_items]:
            print(f"    - {_format_route(record)} reason={record['public_reason']}")
        if max_items is not None and len(report["allowed_public"]) > max_items:
            print(f"    ... {len(report['allowed_public']) - max_items} more")

    if missing:
        print("  note=default mode is advisory; use --strict to fail on missing auth")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Flask routes for missing auth decorators")
    parser.add_argument("--strict", action="store_true", help="return non-zero when missing auth routes exist")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON report")
    parser.add_argument("--show-allowed", action="store_true", help="also print allowlisted public routes")
    parser.add_argument("--max-items", type=int, default=80, help="maximum routes to print per section; use 0 for all")
    args = parser.parse_args()

    report = _build_report()
    max_items = None if args.max_items == 0 else args.max_items
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        _print_text_report(report, args.show_allowed, max_items)

    return 1 if args.strict and not report["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
