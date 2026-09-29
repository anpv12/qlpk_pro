#!/usr/bin/env python3
"""Code-health gate: file size, ESLint errors and function complexity.

- Every app Python/JS source file (vendor/minified excluded) stays at or under MAX_LINES.
- ESLint (scripts/eslint.health.config.mjs) reports 0 errors, 0 warnings outside the
  size/complexity metrics, no function with complexity >= MAX_COMPLEXITY and no function
  longer than the max-lines-per-function limit (80) outside FUNCTION_LENGTH_BASELINE.
  Skipped with a notice when ESLint is unavailable.
"""

from __future__ import annotations

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
# Files still carrying an over-long function; remove an entry once that file is split. Do not add new ones.
FUNCTION_LENGTH_BASELINE = {
    "app/static/js/appointment-management.js",
    "app/static/js/appointment-management/page-calendar.js",
}
JS_ROOT = ROOT / "app" / "static" / "js"


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
            elif message.get("ruleId") == "max-lines-per-function" and str(rel) not in FUNCTION_LENGTH_BASELINE:
                findings.append(f"{rel}:{message.get('line')}: {message['message']}")
    return findings


def main() -> int:
    failures = oversized()
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
