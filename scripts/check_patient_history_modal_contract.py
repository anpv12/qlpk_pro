#!/usr/bin/env python3
"""Guard the reusable Patient History Modal ownership contract."""

from __future__ import annotations

import re
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from module_source import read_source  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PARTIAL = ROOT / "app/templates/partials/patient-search-modal.html"
BASE_COMPONENT = ROOT / "app/static/js/components/patient-history-modal.js"
CANONICAL_CSS = ROOT / "app/static/css/patient-search-modal.css"
DOCTOR_TEMPLATE = ROOT / "app/templates/doctor-examination.html"
DOCTOR_ENTRY = ROOT / "app/static/js/doctor-examination-entry.js"
DOCTOR_PAGE = ROOT / "app/static/js/doctor-examination.js"
DOCTOR_HISTORY_BRIDGE = ROOT / "app/static/js/doctor-examination/patient-history-bridge.js"
PSYCHOLOGIST_TEMPLATE = ROOT / "app/templates/psychologist-examination.html"
PSYCHOLOGIST_HISTORY_BRIDGE = ROOT / "app/static/js/psychologist-examination/patient-history-bridge.js"
CANONICAL_INCLUDE = "{% include 'partials/patient-search-modal.html' %}"


def read(path: Path) -> str:
    return read_source(path)


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def main() -> int:
    failures: list[str] = []

    required_files = (
        CANONICAL_PARTIAL,
        BASE_COMPONENT,
        CANONICAL_CSS,
        DOCTOR_TEMPLATE,
        DOCTOR_ENTRY,
        DOCTOR_PAGE,
        DOCTOR_HISTORY_BRIDGE,
        PSYCHOLOGIST_TEMPLATE,
        PSYCHOLOGIST_HISTORY_BRIDGE,
    )
    for path in required_files:
        if not path.exists():
            failures.append(f"Thiếu file bắt buộc: {relative(path)}")

    if failures:
        print("Patient History Modal contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    modal_id_pattern = re.compile(r"\bid\s*=\s*(['\"])patientSearchModal\1", re.I)
    modal_id_owners: list[Path] = []
    for base in (ROOT / "app/templates", ROOT / "app/static/templates"):
        if not base.exists():
            continue
        for path in base.rglob("*.html"):
            if modal_id_pattern.search(read(path)):
                modal_id_owners.append(path)

    if modal_id_owners != [CANONICAL_PARTIAL]:
        owners = ", ".join(relative(path) for path in modal_id_owners) or "không có"
        failures.append(
            "#patientSearchModal phải chỉ tồn tại trong partial chuẩn; "
            f"owner hiện tại: {owners}"
        )

    for path in (DOCTOR_TEMPLATE, PSYCHOLOGIST_TEMPLATE):
        if read(path).count(CANONICAL_INCLUDE) != 1:
            failures.append(f"{relative(path)} phải include partial chuẩn đúng một lần")

    direct_factory_calls: list[str] = []
    direct_call_pattern = re.compile(r"\.createWorkflowModalSearchContext\s*\(")
    for path in (ROOT / "app/static/js").rglob("*.js"):
        if direct_call_pattern.search(read(path)):
            direct_factory_calls.append(relative(path))
    expected_factory_owner = [relative(BASE_COMPONENT)]
    if direct_factory_calls != expected_factory_owner:
        failures.append(
            "Chỉ patient-history-modal.js được gọi factory context trực tiếp; "
            f"caller hiện tại: {', '.join(direct_factory_calls) or 'không có'}"
        )

    base_source = read(BASE_COMPONENT)
    for public_api in ("QLPKPatientHistoryModal", "getOrCreate", "bindControls", "bindTrigger", "openPatient", "reset"):
        if public_api not in base_source:
            failures.append(f"Base component thiếu public contract: {public_api}")

    if "./components/patient-history-modal.js" not in read(DOCTOR_ENTRY):
        failures.append("Doctor entry chưa import Patient History Modal base")

    if "./doctor-examination/patient-history-bridge.js" not in read(DOCTOR_ENTRY):
        failures.append("Doctor entry chưa import Patient History bridge")

    doctor_page_source = read(DOCTOR_PAGE)
    doctor_bridge_source = read(DOCTOR_HISTORY_BRIDGE)
    if ".getOrCreate" in doctor_page_source:
        failures.append("Doctor orchestrator không được gọi Patient History Modal factory trực tiếp")
    if "REGISTRY.register('patientHistoryBridge'" not in doctor_bridge_source:
        failures.append("Doctor Patient History bridge chưa đăng ký module owner")
    if ".getOrCreate" not in doctor_bridge_source:
        failures.append("Doctor Patient History bridge chưa gọi shared modal contract")
    if "copyHistory: options.copyHistory" not in doctor_bridge_source:
        failures.append("Doctor Patient History bridge chưa giữ callback copyHistory")

    psychologist_asset = "/static/js/components/patient-history-modal.js"
    if psychologist_asset not in read(PSYCHOLOGIST_TEMPLATE):
        failures.append("Psychologist template chưa tải Patient History Modal base")

    psychologist_bridge_asset = "/static/js/psychologist-examination/patient-history-bridge.js"
    if psychologist_bridge_asset not in read(PSYCHOLOGIST_TEMPLATE):
        failures.append("Psychologist template chưa tải owner patient-history bridge")

    modal_css = read(CANONICAL_CSS)
    if "prescription-standard-form.css" not in modal_css:
        failures.append("Modal phải tải stylesheet biểu mẫu dùng chung với bản in")
    form_css = read(ROOT / "app/static/css/prescriptions/components/prescription-standard-form.css")
    qr_image_rule = re.search(
        r"\.moh-qr-image\s*\{(?P<body>[^}]*)\}",
        form_css,
        re.S,
    )
    if not qr_image_rule:
        failures.append("Modal thiếu owner kích thước ảnh QR xác thực")
    else:
        qr_rule_body = qr_image_rule.group("body")
        if not re.search(r"inline-size:\s*25mm\s*;", qr_rule_body):
            failures.append("QR HTML modal phải hiển thị ở kích thước chuẩn 25mm")
        if not re.search(r"max-inline-size:\s*100%\s*;", qr_rule_body):
            failures.append("QR HTML modal phải tự co trong ô chứa ở viewport hẹp")
        if not re.search(r"block-size:\s*auto\s*;", qr_rule_body):
            failures.append("QR HTML modal phải giữ đúng tỷ lệ ảnh khi tự co")

    for path in (DOCTOR_HISTORY_BRIDGE, PSYCHOLOGIST_HISTORY_BRIDGE):
        source = read(path)
        # Pages may consume the public patient-modal contract, which delegates
        # to the canonical history-modal base.  Keep accepting the explicit
        # base global for older callers, but do not require every page to know
        # the implementation name.
        uses_shared_contract = (
            "patientModalContract" in source
            and ".getOrCreate" in source
        )
        uses_shared_base = (
            "QLPKPatientHistoryModal" in source
            and ".getOrCreate" in source
        )
        if not (uses_shared_contract or uses_shared_base):
            failures.append(f"{relative(path)} chưa dùng shared modal base")

    if failures:
        print("Patient History Modal contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    print("Patient History Modal contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
