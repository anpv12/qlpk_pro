#!/usr/bin/env python3
"""Static smoke checks for the QLPK codebase.

The checks intentionally avoid importing main.py because application import can
initialize database tables and depend on local services.
"""

from __future__ import annotations

import argparse
import ast
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from template_source import rendered_page  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {"_archive", "uploads", "__pycache__", ".git", ".venv", "venv", "node_modules"}
SMOKE_PAGES = [
    "/login.html",
    "/index.html",
    "/appointment-management.html",
    "/doctor-examination.html",
    "/psychologist-examination.html",
    "/receptionist-new.html",
    "/medicine-management.html",
    "/user-management.html",
    "/permission-management.html",
    "/chi-tieu.html",
    "/group-management.html",
    "/service-category.html",
    "/service-management.html",
    "/package-management.html",
    "/order-management.html",
    "/payment-waiting.html",
    "/medicine-reference-catalog.html",
    "/medicine-statistics.html",
    "/drug-interaction.html",
	"/document-management.html",
    "/patient-survey.html",
    "/survey-template-management.html",
    "/survey-template-create.html",
    "/icd-management.html",
    "/text-expansion-management.html",
    "/holiday-management.html",
    "/doctor-busy-schedule.html",
    "/shortcut-settings.html",
    "/privacy-policy",
    "/terms-of-service",
]
DYNAMIC_STATIC_REFS = [
    "/static/js/app-header-loader.js",
    "/static/js/app-shell/navigation.config.js",
    "/static/templates/app-header/header.html",
]


def iter_files(root: Path, pattern: str):
    for path in root.rglob(pattern):
        if path.is_file() and not (set(path.parts) & SKIP_PARTS):
            yield path


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def check_python_ast() -> list[str]:
    errors: list[str] = []
    for path in iter_files(ROOT / "app", "*.py"):
        try:
            ast.parse(path.read_text(errors="ignore"), filename=str(path))
        except SyntaxError as exc:
            errors.append(f"{rel(path)}:{exc.lineno}: {exc.msg}")
    return errors


def check_css_braces() -> list[str]:
    errors: list[str] = []
    for path in iter_files(ROOT / "app" / "static" / "css", "*.css"):
        depth = 0
        for index, char in enumerate(path.read_text(errors="ignore"), 1):
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            if depth < 0:
                errors.append(f"{rel(path)}: extra closing brace at char {index}")
                break
        else:
            if depth != 0:
                errors.append(f"{rel(path)}: unclosed brace depth {depth}")
    return errors


def check_js_syntax() -> list[str]:
    errors: list[str] = []
    node = shutil.which("node")
    if not node:
        return ["node is not available; cannot run JS syntax checks"]
    for path in iter_files(ROOT / "app" / "static" / "js", "*.js"):
        result = subprocess.run(
            [node, "--check", str(path)],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()[:3]
            errors.append(f"{rel(path)}: {' | '.join(detail)}")
    return errors


def check_static_refs() -> list[str]:
    errors: list[str] = []
    pattern = re.compile(r'(?:href|src)="(/static/[^"?#]+)')
    for base in [ROOT / "app" / "templates", ROOT / "app" / "static" / "templates"]:
        for path in iter_files(base, "*.html"):
            text = path.read_text(errors="ignore")
            for ref in pattern.findall(text):
                if "{{" in ref:
                    continue
                target = ROOT / "app" / "static" / ref.removeprefix("/static/")
                if not target.exists():
                    errors.append(f"{rel(path)}: missing static ref {ref}")
    # Partial parameters (e.g. /static/js/{{ catalog.entry }}) resolve only in the rendered page.
    for path in sorted((ROOT / "app" / "templates").glob("*.html")):
        for ref in pattern.findall(rendered_page(path)):
            if not (ROOT / "app" / "static" / ref.removeprefix("/static/")).exists():
                errors.append(f"{rel(path)} (rendered): missing static ref {ref}")
    for ref in DYNAMIC_STATIC_REFS:
        target = ROOT / "app" / "static" / ref.removeprefix("/static/")
        if not target.exists():
            errors.append(f"dynamic static ref missing {ref}")
    return errors


def check_render_template_refs() -> list[str]:
    errors: list[str] = []
    pattern = re.compile(r"render_template\([\'\"]([^\'\"]+)")
    for path in iter_files(ROOT, "*.py"):
        text = path.read_text(errors="ignore")
        for template in pattern.findall(text):
            target = ROOT / "app" / "templates" / template
            if not target.exists():
                errors.append(f"{rel(path)}: missing template {template}")
    return errors


def check_duplicate_asset_includes() -> list[str]:
    errors: list[str] = []
    pattern = re.compile(r"<(?:script|link)\b[^>]*\b(?:src|href)=\"([^\"]+)\"", re.I)
    for base in [ROOT / "app" / "templates", ROOT / "app" / "static" / "templates"]:
        for path in iter_files(base, "*.html"):
            refs = [ref.split("?", 1)[0] for ref in pattern.findall(path.read_text(errors="ignore"))]
            duplicates = sorted({ref for ref in refs if refs.count(ref) > 1})
            for duplicate in duplicates:
                errors.append(f"{rel(path)}: duplicate asset include {duplicate}")
    return errors

def check_duplicate_html_attrs() -> list[str]:
    errors: list[str] = []
    tag_pattern = re.compile(r"<([a-zA-Z0-9:-]+)\b([^<>]*)>")
    attr_pattern = re.compile(r"\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=")
    for base in [ROOT / "app" / "templates", ROOT / "app" / "static" / "templates"]:
        for path in iter_files(base, "*.html"):
            text = path.read_text(errors="ignore")
            for match in tag_pattern.finditer(text):
                attrs = attr_pattern.findall(match.group(2))
                duplicate = sorted({name for name in attrs if attrs.count(name) > 1})
                if duplicate:
                    line = text.count("\n", 0, match.start()) + 1
                    errors.append(f"{rel(path)}:{line}: duplicate attrs {', '.join(duplicate)}")
    return errors

def check_duplicate_html_ids() -> list[str]:
    errors: list[str] = []
    id_pattern = re.compile(r"\bid\s*=\s*['\"]([^'\"]+)['\"]", re.I)
    for base in [ROOT / "app" / "templates", ROOT / "app" / "static" / "templates"]:
        for path in iter_files(base, "*.html"):
            ids_by_line: dict[str, list[int]] = {}
            text = path.read_text(errors="ignore")
            for match in id_pattern.finditer(text):
                value = match.group(1)
                line = text.count("\n", 0, match.start()) + 1
                ids_by_line.setdefault(value, []).append(line)
            for value, lines in sorted(ids_by_line.items()):
                if len(lines) > 1:
                    errors.append(f"{rel(path)}: duplicate id '{value}' at lines {', '.join(map(str, lines))}")
    return errors


def count_inline_css() -> list[str]:
    lines: list[str] = []
    for base in [ROOT / "app" / "templates", ROOT / "app" / "static" / "templates"]:
        files = blocks = attrs = 0
        for path in iter_files(base, "*.html"):
            text = path.read_text(errors="ignore")
            style_blocks = len(re.findall(r"<style\b", text, re.I))
            style_attrs = len(re.findall(r"\bstyle\s*=", text, re.I))
            if style_blocks or style_attrs:
                files += 1
            blocks += style_blocks
            attrs += style_attrs
        lines.append(f"{rel(base)}: files={files} style_blocks={blocks} style_attrs={attrs}")
    return lines

def check_frontend_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_frontend_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        return []
    return result.stdout.strip().splitlines()[:80]


def check_js_globals() -> list[str]:
    """Every page must resolve the globals its classic scripts reference (skips without ESLint)."""
    result = subprocess.run(
        [sys.executable, "scripts/check_js_globals.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        return []
    return [line for line in result.stdout.strip().splitlines() if line.startswith("[FAIL]")][:40] or ["check_js_globals failed"]


def check_http(base_url: str) -> list[str]:
    errors: list[str] = []
    for path in SMOKE_PAGES:
        url = base_url.rstrip("/") + path
        request = Request(url, method="GET")
        try:
            with urlopen(request, timeout=5) as response:
                code = response.getcode()
                content_type = response.headers.get("content-type", "")
                if code != 200:
                    errors.append(f"{path}: HTTP {code}")
                elif "text/html" not in content_type:
                    errors.append(f"{path}: unexpected content-type {content_type}")
        except URLError as exc:
            errors.append(f"{path}: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Run QLPK static smoke checks")
    parser.add_argument("--http", action="store_true", help="also check known pages on a running local server")
    parser.add_argument("--base-url", default="http://localhost:8000", help="base URL for --http checks")
    args = parser.parse_args()

    checks = [
        ("python_ast", check_python_ast),
        ("css_braces", check_css_braces),
        ("js_syntax", check_js_syntax),
        ("static_refs", check_static_refs),
        ("render_template_refs", check_render_template_refs),
		("duplicate_asset_includes", check_duplicate_asset_includes),
		("duplicate_html_attrs", check_duplicate_html_attrs),
		("duplicate_html_ids", check_duplicate_html_ids),
		("frontend_contract", check_frontend_contract),
		("js_globals", check_js_globals),
	]
    if args.http:
        checks.append(("http_pages", lambda: check_http(args.base_url)))

    failed = False
    for name, fn in checks:
        errors = fn()
        if errors:
            failed = True
            print(f"[FAIL] {name}: {len(errors)}")
            for error in errors[:50]:
                print(f"  - {error}")
        else:
            print(f"[OK] {name}")

    print("[INFO] inline_css")
    for line in count_inline_css():
        print(f"  - {line}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
