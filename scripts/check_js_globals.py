#!/usr/bin/env python3
"""Page-level JavaScript global resolution gate.

Classic (non-module) scripts share globals through ``window``. ESLint reports
those as ``no-undef`` because it lints each file in isolation, so this script
resolves every ``no-undef`` identifier against the scripts each page really
loads (classic ``<script src>`` tags, included partials and the ES module
graph of ``<script type="module">``). A page fails when it references a global
that none of its scripts defines. Library globals provided by CDN tags are
whitelisted.

Usage: python scripts/check_js_globals.py [--eslint /path/to/eslint] [--json]
Exit code 0 when every page resolves, 1 otherwise, 0 with a notice when ESLint
is not available (the gate needs ESLint >= 9 with flat config).
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from template_source import rendered_page  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "scripts" / "eslint.health.config.mjs"
JS_ROOT = ROOT / "app" / "static" / "js"
TEMPLATES = ROOT / "app" / "templates"
LIBRARY_GLOBALS = {
    "XLSX", "Sortable", "FullCalendar", "JsBarcode", "define", "exports", "module", "require",
    "IDBKeyRange", "QRCode", "Chart", "echarts", "flatpickr", "Swal", "bootstrap", "io",
}
# Globals created at runtime by the page shell (app header / navigation) rather than a page script.
RUNTIME_GLOBALS = {"QLPKIconSystem"}


def find_eslint(explicit: str | None) -> str | None:
    if explicit:
        return explicit
    env = os.environ.get("QLPK_ESLINT")
    if env:
        return env
    found = shutil.which("eslint")
    if found:
        return found
    nvm = Path.home() / ".nvm" / "versions" / "node"
    if nvm.exists():
        for candidate in sorted(nvm.glob("*/bin/eslint"), reverse=True):
            return str(candidate)
    return None


def eslint_undefined(eslint: str) -> dict[str, set[str]]:
    files = sorted(str(p) for p in JS_ROOT.rglob("*.js"))
    result = subprocess.run(
        [eslint, "--no-config-lookup", "-c", str(CONFIG), "-f", "json", *files],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if not result.stdout.strip():
        raise RuntimeError(f"ESLint produced no output: {result.stderr[:400]}")
    undefined: dict[str, set[str]] = collections.defaultdict(set)
    for entry in json.loads(result.stdout):
        rel = str(Path(entry["filePath"]).resolve().relative_to(ROOT))
        for message in entry["messages"]:
            if message.get("ruleId") != "no-undef":
                continue
            name = re.search(r"'([^']+)'", message["message"])
            if name:
                undefined[rel].add(name.group(1))
        undefined[rel].update(declared_globals(Path(entry["filePath"])))
    return undefined


def declared_globals(path: Path) -> set[str]:
    """Names a classic script declares with ``/* global */``; they must still resolve on every page."""
    names: set[str] = set()
    for block in re.findall(r"/\*\s*global\s+([^*]*)\*/", path.read_text(encoding="utf-8", errors="ignore")):
        names.update(item.split(":")[0].strip() for item in block.split(",") if item.strip())
    return names


def page_scripts(template: Path) -> list[str]:
    text = rendered_page(template, TEMPLATES)
    scripts = ["app/static/js/" + s for s in re.findall(r'<script(?![^>]*type="module")[^>]*\bsrc="/static/js/([^"?]+)', text)]
    seen: list[Path] = []

    def walk(path: Path) -> None:
        path = path.resolve()
        if path in seen or not path.exists():
            return
        seen.append(path)
        for match in re.finditer(r"""import\s+(?:[^'"]*?from\s+)?['"](\.{1,2}/[^'"]+)['"]""", path.read_text(encoding="utf-8")):
            walk(path.parent / match.group(1))

    for entry in re.findall(r'<script[^>]*type="module"[^>]*\bsrc="/static/js/([^"?]+)', text):
        walk(JS_ROOT / entry)
    scripts += [str(p.relative_to(ROOT)) for p in seen]
    return list(dict.fromkeys(scripts))


_source_cache: dict[str, str] = {}


def defines(script: str, name: str) -> bool:
    source = _source_cache.get(script)
    if source is None:
        path = ROOT / script
        source = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
        _source_cache[script] = source
    pattern = (
        r"(?m)^\s*(?:async\s+)?function\s+" + re.escape(name) + r"\b"
        r"|window\." + re.escape(name) + r"\s*=[^=]"
        r"|^\s*(?:const|let|var|class)\s+" + re.escape(name) + r"\b"
        r"|^\s*(?:const|let|var)\s+\{[^}]*\b" + re.escape(name) + r"\b"
        r"|^\s*(?:const|let|var)\s+(?:[\w$]+\s*(?:=\s*[^,;]*)?,\s*)+" + re.escape(name) + r"\b"
    )
    return re.search(pattern, source) is not None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eslint")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    eslint = find_eslint(args.eslint)
    if not eslint:
        print("[SKIP] check_js_globals: ESLint không có sẵn (đặt QLPK_ESLINT=/path/to/eslint)")
        return 0
    undefined = eslint_undefined(eslint)
    report = []
    failures = 0
    for template in sorted(TEMPLATES.glob("*.html")):
        scripts = page_scripts(template)
        if not scripts:
            continue
        missing: dict[str, list[str]] = collections.defaultdict(list)
        for script in scripts:
            for name in undefined.get(script, ()):
                if name == 'event':
                    missing[name].append(script)
                    continue
                if name in LIBRARY_GLOBALS or name in RUNTIME_GLOBALS:
                    continue
                if not any(defines(other, name) for other in scripts):
                    missing[name].append(script)
        failures += len(missing)
        report.append({"page": template.name, "scripts": len(scripts), "unresolved": dict(missing)})
    if args.json:
        print(json.dumps(report, indent=1, ensure_ascii=False))
    else:
        for row in report:
            status = "FAIL" if row["unresolved"] else "OK"
            extra = f" -> {sorted(row['unresolved'])}" if row["unresolved"] else ""
            print(f"[{status}] {row['page']:36s} scripts={row['scripts']:3d}{extra}")
        print(f"pages={len(report)} unresolved={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
