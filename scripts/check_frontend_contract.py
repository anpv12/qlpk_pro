#!/usr/bin/env python3
"""Frontend contract guardrail for QLPK.

This is not a cosmetic audit. It is a regression gate:
- Things already cleaned must stay at zero.
- Legacy debt that still exists is locked to the current baseline and may only
  decrease. If a count increases, the change is adding new frontend debt.
"""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path



ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {"_archive", "uploads", "node_modules", "__pycache__", ".git", ".venv", "venv"}


@dataclass(frozen=True)
class Metric:
    name: str
    pattern: str
    roots: tuple[str, ...]
    suffixes: tuple[str, ...]
    max_count: int
    flags: int = 0
    description: str = ""
    exclude: tuple[str, ...] = ()


METRICS = [
    Metric(
        name="html_inline_style_blocks",
        pattern=r"<style\b",
        roots=("app/templates", "app/static/templates"),
        suffixes=(".html",),
        max_count=0,
        flags=re.I,
        description="Templates must not contain inline <style> blocks.",
    ),
    Metric(
        name="html_inline_style_attrs",
        pattern=r"\bstyle\s*=",
        roots=("app/templates", "app/static/templates"),
        suffixes=(".html",),
        max_count=0,
        flags=re.I,
        description="Templates must not contain style= attributes.",
    ),
    Metric(
        name="console_log",
        pattern=r"console\.log",
        roots=("app/templates", "app/static/templates", "app/static/js"),
        suffixes=(".html", ".js"),
        max_count=0,
        description="Debug console.log must not return to frontend runtime.",
    ),
    Metric(
        name="js_set_style_attr",
        pattern=r"setAttribute\(['\"]style",
        roots=("app/static/js",),
        suffixes=(".js",),
        max_count=0,
        description="JS must not inject raw style attributes.",
    ),
    Metric(
        name="css_hard_font_weight",
        pattern=r"font-weight\s*:\s*[0-9]",
        roots=("app/static/css",),
        suffixes=(".css",),
        max_count=0,
        description="CSS font-weight must use typography tokens.",
    ),
    Metric(
        name="css_hard_font_size",
        pattern=r"font-size\s*:\s*(?!0\s*[;}])[0-9]",
        roots=("app/static/css",),
        suffixes=(".css",),
        max_count=0,
        description="Font sizes come from typography tokens; font-size: 0 (hiding native control text) is not a type size.",
    ),
    Metric(
        name="js_jquery_css",
        pattern=r"\.css\s*\(",
        roots=("app/static/js",),
        suffixes=(".js",),
        max_count=2,
        description="Legacy jQuery .css() dynamic debt is locked; prefer classes/CSS variables.",
    ),
    Metric(
        name="js_style_css_text",
        pattern=r"\.style\.cssText",
        roots=("app/static/js",),
        suffixes=(".js",),
        max_count=0,
        description="Inline cssText is gone; set CSS variables with style.setProperty or toggle classes.",
    ),
    Metric(
        name="bootstrap_action_raw",
        pattern=r"\bbtn-(?:outline-primary|outline-danger|success)\b",
        roots=("app/templates", "app/static/templates", "app/static/js", "app/static/css"),
        suffixes=(".html", ".js", ".css"),
        max_count=210,
        description="Legacy raw Bootstrap action styling is locked; use QLPKIconSystem for new repeated actions.",
    ),
	Metric(
		name="css_important",
		pattern=r"!important",
		roots=("app/static/css",),
		suffixes=(".css",),
		max_count=45,
		description="!important is locked at the overrides proven necessary by cascade analysis (438 -> 94 -> 43 declarations on 29/09/2026; the count includes 2 comment mentions); do not add new ones.",
	),
	Metric(
		name="css_id_selector",
		pattern=r"(?<![\"'])#[A-Za-z_][\w-]*(?=[^{}]*\{)",
		roots=("app/static/css",),
		suffixes=(".css",),
		max_count=0,
		description="Styling targets classes/data attributes, never ids (quoted attribute values such as [data-color=\"#f44336\"] are not ids).",
	),
	Metric(
		name="css_hard_color",
		pattern=r":\s*[^;{}]*?(?:#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d|hsla?\()",
		roots=("app/static/css",),
		suffixes=(".css",),
		max_count=0,
		exclude=("shared/color-tokens.css", "shared/color-tokens/", "shared/feedback-tokens.css", "shared/feedback-tokens/", "print/vat_invoice.css"),
		description="Colours come from shared tokens (the last 12 alpha-hex literals moved to tokens on 30/09/2026).",
	),
	Metric(
		name="html_inline_event_handlers",
		pattern=r"\bon(?:click|dblclick|mousedown|mouseup|change|submit|input|keyup|keydown|load|blur|focus)\s*=",
		roots=("app/templates", "app/static/templates"),
		suffixes=(".html",),
		max_count=0,
		description="Inline event handlers block a script-src CSP; use data-qlpk-call (shared/inline-actions.js).",
	),
	Metric(
		name="html_external_assets",
		pattern=r"<(?:script|link)\b[^>]*\b(?:src|href)=\"(?:https?:)?//",
		roots=("app/templates", "app/static/templates"),
		suffixes=(".html",),
		max_count=0,
		description="Third-party scripts/styles/fonts are self-hosted under /static/vendor (no CDN).",
	),
	Metric(
		name="css_js_external_assets",
		pattern=r"https?://(?:cdn\.jsdelivr\.net|code\.jquery\.com|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)",
		roots=("app/static/js", "app/static/css"),
		suffixes=(".js", ".css"),
		max_count=0,
		description="Dynamic loaders and @import use /static/vendor copies, not CDNs.",
	),
	Metric(
		name="js_inline_event_handlers",
		pattern=r"\bon(?:click|dblclick|mousedown|mouseup|change|submit|input|keyup|keydown|load|blur|focus)=[\"']",
		roots=("app/static/js",),
		suffixes=(".js",),
		max_count=0,
		description="Inline handlers in JS-built markup are locked; use data-action delegation.",
	),
	Metric(
		name="css_px",
		pattern=r"\b\d+(?:\.\d+)?px\b",
		roots=("app/static/css",),
		suffixes=(".css",),
		max_count=978,
		description="px -> rem done (6115 -> 978, 30/09/2026) except stylesheets loaded by the three pages whose html root is 13px (payment-waiting, survey-template-create/-management): rem there would shrink shared UI. Do not add px.",
	),
]


def iter_files(metric: Metric):
    for root in metric.roots:
        base = ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in metric.suffixes:
                continue
            if set(path.parts) & SKIP_PARTS:
                continue
            if any(fragment in rel(path) for fragment in metric.exclude):
                continue
            yield path


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def collect_metric(metric: Metric):
    regex = re.compile(metric.pattern, metric.flags)
    count = 0
    files: dict[Path, int] = {}
    examples: list[str] = []
    for path in iter_files(metric):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if path.suffix == ".css":
            text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        matches = list(regex.finditer(text))
        if not matches:
            continue
        count += len(matches)
        files[path] = len(matches)
        if len(examples) < 8:
            lines = text.splitlines()
            for match in matches[:2]:
                line_no = text.count("\n", 0, match.start()) + 1
                line = lines[line_no - 1].strip() if line_no - 1 < len(lines) else ""
                examples.append(f"{rel(path)}:{line_no}: {line[:180]}")
                if len(examples) >= 8:
                    break
    return count, files, examples


def run_receptionist_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_receptionist_fe_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] receptionist_fe_contract")
        return []
    return ["receptionist_fe_contract failed", result.stdout.strip()]


def run_patient_history_modal_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_patient_history_modal_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] patient_history_modal_contract")
        return []
    return ["patient_history_modal_contract failed", result.stdout.strip()]


def run_workspace_tabs_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_workspace_tabs_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] workspace_tabs_contract")
        return []
    return ["workspace_tabs_contract failed", result.stdout.strip()]


def run_prescription_print_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_prescription_print_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] prescription_print_contract")
        return []
    return ["prescription_print_contract failed", result.stdout.strip()]


def run_icd_autocomplete_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_icd_autocomplete_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] icd_autocomplete_contract")
        return []
    return ["icd_autocomplete_contract failed", result.stdout.strip()]


def run_user_feedback_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_user_feedback_contract.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] user_feedback_contract")
        return []
    return ["user_feedback_contract failed", result.stdout.strip()]



def run_brand_theme_contract() -> list[str]:
    result = subprocess.run(
        [sys.executable, "scripts/check_brand_theme.py"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode == 0:
        print("[OK] brand_theme_contract")
        return []
    return ["brand_theme_contract failed", result.stdout.strip()]


def main() -> int:
    failures: list[str] = []
    failures.extend(run_receptionist_contract())
    failures.extend(run_patient_history_modal_contract())
    failures.extend(run_workspace_tabs_contract())
    failures.extend(run_prescription_print_contract())
    failures.extend(run_icd_autocomplete_contract())
    failures.extend(run_user_feedback_contract())
    failures.extend(run_brand_theme_contract())

    for metric in METRICS:
        count, files, examples = collect_metric(metric)
        status = "OK" if count <= metric.max_count else "FAIL"
        print(f"[{status}] {metric.name}: count={count} max={metric.max_count} files={len(files)}")
        if count > metric.max_count:
            failures.append(f"{metric.name}: count {count} exceeds max {metric.max_count}. {metric.description}")
            failures.extend(f"  - {example}" for example in examples)

    if failures:
        print("\nFrontend contract failed:")
        for failure in failures:
            print(failure)
        return 1

    print("Frontend contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
