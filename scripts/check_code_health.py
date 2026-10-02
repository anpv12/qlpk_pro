#!/usr/bin/env python3
"""Code-health gate: file size, ESLint errors and function complexity.

- Every app Python/JS source file (vendor/minified excluded) stays at or under MAX_LINES.
- ESLint (scripts/eslint.health.config.mjs) reports 0 errors, 0 warnings outside the
  size/complexity metrics, no function with complexity >= MAX_COMPLEXITY and no function
  longer than the max-lines-per-function limit (80).
- Every app Python function stays at or under MAX_FUNCTION_LINES code lines and has
  McCabe complexity (same counting as ruff C901) at or under MAX_PY_COMPLEXITY.
- No app Python handler catches Exception/BaseException (or bare except) silently: it must
  re-raise or log with the traceback (logger.exception / exc_info=True), as ruff BLE001 requires.
- Every page template/partial stays at or under MAX_LINES; large ones compose partials via {% include %}.
- Every app stylesheet (vendor excluded) stays at or under MAX_CSS_LINES; large sheets are split by
  topic into <stem>/ and the entry keeps the @import order (the cascade order).
- The number of distinct window.X globals assigned by page scripts never exceeds MAX_WINDOW_GLOBALS.
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
MAX_LINES = 500
# Size/complexity metrics stay advisory below the hard limits; every other ESLint warning is a finding.
METRIC_RULES = {"complexity", "max-lines-per-function", "max-lines"}
MAX_COMPLEXITY = 16
JS_ROOT = ROOT / "app" / "static" / "js"
MAX_FUNCTION_LINES = 80
MAX_PY_COMPLEXITY = 10
# Ratchet: page scripts share state through window globals; new code must not add more (lower it when removing).
MAX_WINDOW_GLOBALS = 164
CSS_ROOT = ROOT / "app" / "static" / "css"
MAX_CSS_LINES = 500


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


LOG_METHODS = {"error", "warning", "info", "debug", "critical"}


def _is_blind(handler: ast.ExceptHandler) -> bool:
    if handler.type is None:
        return True
    names = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return any(isinstance(name, ast.Name) and name.id in {"Exception", "BaseException"} for name in names)


def _reports_failure(handler: ast.ExceptHandler) -> bool:
    for node in ast.walk(ast.Module(body=handler.body, type_ignores=[])):
        if isinstance(node, ast.Raise):
            return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and "log" in ast.unparse(node.func.value).lower():
            if node.func.attr == "exception" or (node.func.attr in LOG_METHODS and any(k.arg == "exc_info" for k in node.keywords)):
                return True
    return False


def blind_except_findings() -> list[str]:
    findings = []
    for path in source_files():
        if path.suffix != ".py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ExceptHandler) and _is_blind(node) and not _reports_failure(node):
                findings.append(f"{path.relative_to(ROOT)}:{node.lineno}: except Exception nuốt lỗi; bắt đúng loại lỗi hoặc log kèm traceback")
    return findings


def template_files() -> list[Path]:
    return sorted((ROOT / "app" / "templates").rglob("*.html"))


def oversized_templates() -> list[str]:
    out = []
    for path in template_files():
        count = path.read_text(encoding="utf-8", errors="ignore").count("\n")
        if count > MAX_LINES:
            out.append(f"{path.relative_to(ROOT)}: {count} dòng (> {MAX_LINES}); tách modal/khối thành partial")
    return out


def stylesheet_files() -> list[Path]:
    return sorted(p for p in CSS_ROOT.rglob("*.css") if "vendor" not in p.parts and ".min." not in p.name)


def oversized_stylesheets() -> list[str]:
    out = []
    for path in stylesheet_files():
        count = path.read_text(encoding="utf-8", errors="ignore").count("\n")
        if count > MAX_CSS_LINES:
            out.append(f"{path.relative_to(ROOT)}: {count} dòng (> {MAX_CSS_LINES}); tách theo chủ đề vào thư mục cùng tên")
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


def window_global_names() -> set[str]:
    names = set()
    for path in JS_ROOT.rglob('*.js'):
        if 'vendor' in path.parts or '.min.' in path.name:
            continue
        for match in re.finditer(r"\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)", path.read_text(encoding='utf-8', errors='ignore')):
            names.add(match.group(1))
    return names


def window_global_findings() -> list[str]:
    count = len(window_global_names())
    return [f"window globals: {count} (> {MAX_WINDOW_GLOBALS}); dùng registry/module thay vì biến toàn cục mới"] if count > MAX_WINDOW_GLOBALS else []


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
    failures = oversized() + oversized_templates() + oversized_stylesheets() + python_function_findings() + blind_except_findings() + window_global_findings()
    lint = eslint_findings()
    if lint is None:
        print("[SKIP] eslint không có sẵn; chỉ kiểm kích thước file")
    else:
        failures += lint
    for line in failures:
        print("- " + line)
    print(f"[{'FAIL' if failures else 'OK'}] code_health: files={len(source_files())} stylesheets={len(stylesheet_files())} findings={len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
