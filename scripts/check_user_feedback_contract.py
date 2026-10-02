#!/usr/bin/env python3
"""Regression guardrail for the shared QLPK user-feedback contract."""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from module_source import read_source  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "app/templates"
STATIC_JS = ROOT / "app/static/js"
RUNTIME_PARTIAL = TEMPLATES / "partials/user-feedback-runtime.html"
RUNTIME_JS = STATIC_JS / "shared/user-feedback.js"
API_CONTRACT = ROOT / "app/utils/api_error_contract.py"
MAIN = ROOT / "main.py"
DOCTOR_SUPPORT_RUNTIME = STATIC_JS / "doctor-examination/support-runtime.js"
DOCTOR_SAVE_CONTROLLER = STATIC_JS / "doctor-examination/workspace-save-controller.js"

RUNTIME_INCLUDE = "{% include 'partials/user-feedback-runtime.html' %}"
INTERACTIVE_MARKERS = ("<script", "<form", "onclick=")
LEGACY_RENDERER_MARKERS = (
    'class="toast-container',
    'id="mainToast"',
    'id="toastMessage"',
    'customToastContainer',
)
REQUIRED_ADAPTERS = (
    "app/static/js/utils.js",
    "app/static/js/doctor-examination/page-runtime.js",
    "app/static/js/receptionist/page-core-utils.js",
    "app/static/js/appointment-management/feedback-utils.js",
    "app/static/js/order-management.js",
    "app/static/js/payment-waiting.js",
    "app/static/js/medicine-management.js",
)

UI_SINK = re.compile(
    r"showCustomToast|showToast|showAlert|notify\s*\(|showMessage|setMessage|"
    r"alert\s*\(|\.text\s*\(|textContent\s*=|innerHTML\s*="
)
RAW_TECHNICAL_VALUE = re.compile(
    r"\bxhr\.responseText|\bresponseJSON|"
    r"\b(?:error|err|e)\.message|"
    r"\b(?:response|res|result|json|data)\.(?:message|error|detail)"
)
BANNED_UI_PHRASES = (
    "Unknown error",
    "Lỗi kết nối server",
    "Lỗi: Module",
    "(manual save)",
    "Token đã hết hạn",
    "Hướng dẫn:",
)


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def check_runtime(errors: list[str]) -> None:
    if not RUNTIME_PARTIAL.exists():
        fail(errors, "missing shared feedback runtime partial")
        return
    partial = read_source(RUNTIME_PARTIAL)
    for needle in ("shared/feedback-tokens.css", "shared/user-feedback.js"):
        if needle not in partial:
            fail(errors, f"feedback runtime partial missing {needle}")

    runtime = RUNTIME_JS.read_text(encoding="utf-8")
    for needle in (
        "export const QLPKUserFeedback",
        "resolveError",
        "reportError",
        "network.unavailable",
        "inventory.insufficient",
        "Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.",
    ):
        if needle not in runtime:
            fail(errors, f"shared feedback owner missing {needle}")


def check_templates(errors: list[str]) -> None:
    for path in sorted(TEMPLATES.glob("*.html")):
        source = path.read_text(encoding="utf-8", errors="ignore")
        if any(marker in source for marker in INTERACTIVE_MARKERS) and RUNTIME_INCLUDE not in source:
            fail(errors, f"interactive template missing feedback runtime: {path.relative_to(ROOT)}")
        for marker in LEGACY_RENDERER_MARKERS:
            if marker in source:
                fail(errors, f"legacy toast renderer returned in {path.relative_to(ROOT)}: {marker}")


def check_adapters(errors: list[str]) -> None:
    for relative in REQUIRED_ADAPTERS:
        path = ROOT / relative
        source = path.read_text(encoding="utf-8")
        if "QLPKUserFeedback" not in source:
            fail(errors, f"feedback adapter bypasses shared owner: {relative}")


def check_ui_leaks(errors: list[str]) -> None:
    for path in sorted(STATIC_JS.rglob("*.js")):
        if ".min." in path.name:
            continue
        for line_number, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if not UI_SINK.search(line):
                continue
            if RAW_TECHNICAL_VALUE.search(line):
                fail(
                    errors,
                    f"raw technical value reaches UI: {path.relative_to(ROOT)}:{line_number}: {line.strip()[:180]}",
                )
            for phrase in BANNED_UI_PHRASES:
                if phrase in line:
                    fail(
                        errors,
                        f"banned feedback phrase: {path.relative_to(ROOT)}:{line_number}: {phrase}",
                    )


def check_api_contract(errors: list[str]) -> None:
    contract = API_CONTRACT.read_text(encoding="utf-8")
    main = MAIN.read_text(encoding="utf-8")
    for needle in ("attach_stable_error_code", 'normalized["code"]'):
        if needle not in contract:
            fail(errors, f"API error contract missing {needle}")
    for needle in ("attach_stable_error_code", "add_json_error_code"):
        if needle not in main:
            fail(errors, f"application bootstrap missing {needle}")


def check_doctor_error_code_pipeline(errors: list[str]) -> None:
    runtime = read_source(DOCTOR_SUPPORT_RUNTIME)
    controller = read_source(DOCTOR_SAVE_CONTROLLER)
    for needle in ("readResponseFailure", "error.code = failure.code", "error.payload = failure.payload"):
        if needle not in runtime:
            fail(errors, f"Doctor support runtime drops response error metadata: {needle}")
    for needle in ("module.error?.code", "inventory.insufficient"):
        if needle not in controller:
            fail(errors, f"Doctor save controller does not classify coded failures: {needle}")


def main() -> int:
    errors: list[str] = []
    check_runtime(errors)
    check_templates(errors)
    check_adapters(errors)
    check_ui_leaks(errors)
    check_api_contract(errors)
    check_doctor_error_code_pipeline(errors)

    if errors:
        print("[FAIL] user_feedback_contract")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("[OK] user_feedback_contract")
    return 0


if __name__ == "__main__":
    sys.exit(main())
