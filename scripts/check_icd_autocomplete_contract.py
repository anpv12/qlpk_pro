#!/usr/bin/env python3
"""Lock the shared ICD autocomplete markup and label contract."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_ROOT = ROOT / "app/templates"
MACRO_PATH = TEMPLATE_ROOT / "components/_icd_autocomplete.html"
MACRO_IMPORT = "components/_icd_autocomplete.html"
MACRO_CALL = "render_icd_autocomplete("
SHARED_PATH = TEMPLATE_ROOT / "components/_autocomplete_field.html"


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def main() -> int:
    failures: list[str] = []
    if not MACRO_PATH.exists():
        failures.append(f"Missing canonical ICD template: {relative(MACRO_PATH)}")
    else:
        macro = MACRO_PATH.read_text(encoding="utf-8")
        if "components/_autocomplete_field.html" not in macro or macro.count("render_autocomplete_field(") != 1:
            failures.append("ICD adapter must delegate once to the canonical autocomplete field")
        if re.search(r"<(?:div|input|button)\b", macro, re.I):
            failures.append("ICD adapter must not recreate shared autocomplete markup")
        for marker in (
            "data-icd-autocomplete",
            "data-icd-autocomplete-tags",
            "data-icd-autocomplete-input",
            "data-icd-autocomplete-dropdown",
            "data-icd-autocomplete-list",
        ):
            marker_count = len(re.findall(rf"['\"]{re.escape(marker)}['\"]\s*:", macro))
            if marker_count != 1:
                failures.append(f"Canonical ICD template must own exactly one {marker} marker")
        if re.search(r"<label\b", macro, re.I):
            failures.append("Canonical ICD template must not wrap interactive controls in <label>")

    if not SHARED_PATH.exists():
        failures.append("Missing canonical generic autocomplete template")
    else:
        shared = SHARED_PATH.read_text(encoding="utf-8")
        for marker in ("data-autocomplete-field", "data-autocomplete-control", "data-autocomplete-tags",
                       "data-autocomplete-input", "data-autocomplete-dropdown", "data-autocomplete-list"):
            if len(re.findall(rf"\b{marker}(?=[\s=>])", shared)) != 1:
                failures.append(f"Shared autocomplete must own exactly one {marker}")
        if re.search(r"<label\b", shared, re.I):
            failures.append("Shared autocomplete must not wrap interactive controls in a label")

    call_count = 0
    label_pattern = re.compile(r"<label\b[^>]*>.*?</label\s*>", re.I | re.S)
    for path in TEMPLATE_ROOT.rglob("*.html"):
        if path in (MACRO_PATH, SHARED_PATH):
            continue
        text = path.read_text(encoding="utf-8")
        if re.search(r"\bdata-autocomplete-(field|control|tags|input|dropdown|list)(?=[\s=>])", text):
            failures.append(f"{relative(path)} recreates shared autocomplete markup")
        if "data-icd-autocomplete" in text:
            failures.append(
                f"{relative(path)} renders raw ICD markup; use {MACRO_IMPORT} instead"
            )
        if MACRO_CALL not in text:
            continue
        call_count += text.count(MACRO_CALL)
        if MACRO_IMPORT not in text:
            failures.append(f"{relative(path)} calls the ICD macro without importing its owner")
        for label in label_pattern.finditer(text):
            if MACRO_CALL in label.group(0):
                line = text.count("\n", 0, label.start()) + 1
                failures.append(
                    f"{relative(path)}:{line} nests ICD autocomplete inside <label>; "
                    "use an explicit label[for] before the component"
                )

    if call_count == 0:
        failures.append("No template consumes the canonical ICD autocomplete macro")

    if failures:
        print("ICD autocomplete contract failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"ICD autocomplete contract OK ({call_count} shared field instances)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
