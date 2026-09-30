#!/usr/bin/env python3
"""Code-health gate: file size, ESLint errors and function complexity.

- Every app Python/JS source file (vendor/minified excluded) stays at or under MAX_LINES.
- ESLint (scripts/eslint.health.config.mjs) reports 0 errors, 0 warnings outside the
  size/complexity metrics, no function with complexity >= MAX_COMPLEXITY and no function
  longer than the max-lines-per-function limit (80).
- Every app Python function stays at or under MAX_FUNCTION_LINES code lines and has
  McCabe complexity (same counting as ruff C901) at or under MAX_PY_COMPLEXITY.
  Skipped with a notice when ESLint is unavailable.
"""

from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_LINES = 600
# Size/complexity metrics stay advisory below the hard limits; every other ESLint warning is a finding.
METRIC_RULES = {"complexity", "max-lines-per-function", "max-lines"}
MAX_COMPLEXITY = 16
JS_ROOT = ROOT / "app" / "static" / "js"
MAX_FUNCTION_LINES = 80
MAX_PY_COMPLEXITY = 15


def source_files() -> list[Path]:
    files = [p for p in (ROOT / "app").rglob("*.py") if "__pycache__" not in p.parts]
    files += [p for p in JS_ROOT.rglob("*.js") if ".min." not in p.name]
    return sorted(files)


def oversized() -> list[str]:
    out = []
    for path in source_files():
        count = path.read_text(encoding="utf-8", errors="ignore").count("\n")
        if count > MAX_LINES:
            out.append(f"{path.relative_to(ROOT)}: {count} dòng (> {MAX_LINES})")
    return out


def _statements_complexity(statements) -> int:
    total = 0
    for statement in statements:
        total += _statement_complexity(statement)
    return total


def _if_complexity(node) -> int:
    total = 1 + _statements_complexity(node.body)
    orelse = node.orelse
    while orelse:
        if len(orelse) == 1 and isinstance(orelse[0], ast.If):
            total += 1 + _statements_complexity(orelse[0].body)
            orelse = orelse[0].orelse
        else:
            total += _statements_complexity(orelse)
            orelse = []
    return total


def _try_complexity(node) -> int:
    total = _statements_complexity(node.body) + _statements_complexity(node.orelse) + _statements_complexity(node.finalbody)
    for handler in node.handlers:
        total += 1 + _statements_complexity(handler.body)
    if node.orelse and node.handlers:
        total += 1
    return total


def _statement_complexity(node) -> int:
    if isinstance(node, ast.If):
        return _if_complexity(node)
    if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
        return 1 + _statements_complexity(node.body) + _statements_complexity(node.orelse)
    if isinstance(node, (ast.With, ast.AsyncWith, ast.ClassDef)):
        return _statements_complexity(node.body)
    if isinstance(node, ast.Try) or type(node).__name__ == 'TryStar':
        return _try_complexity(node)
    if isinstance(node, ast.Match):
        return sum(1 + _statements_complexity(case.body) for case in node.cases)
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return 1 + _statements_complexity(node.body)
    return 0


def python_function_findings() -> list[str]:
    findings = []
    for path in source_files():
        if path.suffix != '.py':
            continue
        source = path.read_text(encoding='utf-8', errors='ignore')
        lines = source.splitlines()
        for node in ast.walk(ast.parse(source)):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            length = sum(1 for line in lines[node.lineno - 1:node.end_lineno]
                         if line.strip() and not line.strip().startswith('#'))
            complexity = 1 + _statements_complexity(node.body)
            rel = path.relative_to(ROOT)
            if length > MAX_FUNCTION_LINES:
                findings.append(f"{rel}:{node.lineno}: {node.name} dài {length} dòng (> {MAX_FUNCTION_LINES})")
            if complexity > MAX_PY_COMPLEXITY:
                findings.append(f"{rel}:{node.lineno}: {node.name} complexity {complexity} (> {MAX_PY_COMPLEXITY})")
    return findings


def eslint_findings() -> list[str] | None:
    eslint = shutil.which("eslint")
    if not eslint:
        return None
    result = subprocess.run([eslint, "--no-config-lookup", "-c", str(ROOT / "scripts/eslint.health.config.mjs"), "-f", "json", "."],
                            cwd=JS_ROOT, capture_output=True, text=True)
    findings = []
    for entry in json.loads(result.stdout or "[]"):
        rel = Path(entry["filePath"]).resolve().relative_to(ROOT)
        for message in entry["messages"]:
            if message["severity"] == 2:
                findings.append(f"{rel}:{message.get('line')}: {message['message']}")
            elif message.get("ruleId") not in METRIC_RULES:
                findings.append(f"{rel}:{message.get('line')}: {message.get('ruleId')}: {message['message']}")
            elif message.get("ruleId") == "complexity":
                value = int(re.search(r"complexity of (\d+)", message["message"]).group(1))
                if value >= MAX_COMPLEXITY:
                    findings.append(f"{rel}:{message.get('line')}: complexity {value} (>= {MAX_COMPLEXITY})")
            elif message.get("ruleId") == "max-lines-per-function":
                findings.append(f"{rel}:{message.get('line')}: {message['message']}")
    return findings


def main() -> int:
    failures = oversized() + python_function_findings()
    lint = eslint_findings()
    if lint is None:
        print("[SKIP] eslint không có sẵn; chỉ kiểm kích thước file")
    else:
        failures += lint
    for line in failures:
        print("- " + line)
    print(f"[{'FAIL' if failures else 'OK'}] code_health: files={len(source_files())} findings={len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
