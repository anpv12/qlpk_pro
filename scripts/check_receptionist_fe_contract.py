#!/usr/bin/env python3
"""Static guardrail for the receptionist frontend contract.

This check is intentionally narrow. It protects the cleaned receptionist screen
from legacy hidden modal/search bridges and repeated row actions drifting back
to raw Bootstrap button styling.
"""

from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from module_source import read_source  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]

GENERAL_SCOPE = [
    "app/templates/receptionist-new.html",
    "app/static/js/receptionist-new.js",
    "app/static/js/receptionist",
]

ACTION_RENDER_SCOPE = [
    "app/static/js/receptionist/appointment-list-controls.js",
    "app/static/js/receptionist/document-attachment-list.js",
    "app/static/js/relative-table.js",
    "app/static/css/pages/receptionist-new.css",
]

FORBIDDEN_GENERAL = [
    "severity-level-control.js",
    "ReceptionistSeverityLevelControl",
    "hiddenMainReason",
    "hiddenSeverityLevel",
    "detailInfoBtn",
    "savePatientBtn",
    "medical-info-modal.js",
    "receptionist/patient-search.js",
    "icd-legacy-multiselect",
    "<style",
    "style=",
    "console.log",
]

FORBIDDEN_ACTION_RENDER = [
    "btn-outline-primary",
    "btn-outline-danger",
    "btn-success",
]


def iter_files(paths):
    for relative in paths:
        path = ROOT / relative
        if path.is_dir():
            yield from sorted(child for child in path.rglob("*") if child.is_file())
        elif path.exists():
            yield path


def scan(files, patterns, label):
    failures = []
    for path in files:
        text = read_source(path)
        for line_no, line in enumerate(text.splitlines(), start=1):
            for pattern in patterns:
                if pattern in line:
                    failures.append((label, path.relative_to(ROOT), line_no, pattern, line.strip()))
    return failures


def main():
    failures = []
    failures.extend(scan(iter_files(GENERAL_SCOPE), FORBIDDEN_GENERAL, "legacy/receptionist"))
    failures.extend(scan(iter_files(ACTION_RENDER_SCOPE), FORBIDDEN_ACTION_RENDER, "action-render"))

    if failures:
        print("Receptionist FE contract failed:")
        for label, path, line_no, pattern, line in failures:
            print(f"- [{label}] {path}:{line_no} contains {pattern!r}: {line}")
        raise SystemExit(1)

    print("Receptionist FE contract OK")


if __name__ == "__main__":
    main()
