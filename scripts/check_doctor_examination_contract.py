#!/usr/bin/env python3
"""Static owner and dependency guardrail for the Doctor examination screen."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

import sys as _sys
_sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from module_source import read_source  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
PAGE_TEMPLATE = ROOT / "app/templates/doctor-examination.html"
WORKSPACE_TEMPLATES = (
    ROOT / "app/templates/partials/doctor-clinical-workspace.html",
    ROOT / "app/templates/partials/doctor-indications-panel.html",
)
ACTIVE_JS_ROOT = ROOT / "app/static/js/doctor-examination"
ACTIVE_JS = (
    ROOT / "app/static/js/doctor-examination.js",
    *ACTIVE_JS_ROOT.glob("*.js"),
    ROOT / "app/static/js/components/doctor-component-config.js",
    ROOT / "app/static/js/components/medical-history-form.js",
    ROOT / "app/static/js/components/medical-history-substance-fields.js",
    ROOT / "app/static/js/components/clinical-examination-form.js",
    ROOT / "app/static/js/components/doctor-services-form.js",
    ROOT / "app/static/js/components/doctor-indications-form.js",
)
ATTACHMENT_JS = (
    ROOT / "app/static/js/shared/confirmation-dialog.js",
    ROOT / "app/static/js/receptionist/document-attachment-utils.js",
    ROOT / "app/static/js/receptionist/document-attachment-list.js",
    ROOT / "app/static/js/doctor-examination/document-attachments-bridge.js",
    ROOT / "app/static/js/receptionist-new.js",
)

DOCTOR_ENTRY_ASSET = "/static/js/doctor-examination-entry.js"
CLASSIC_SHARED_ASSETS = {
    "/static/js/app-version-check.js",
    "/static/js/flatpickr-vn.js",
    "/static/js/datepicker-init.js",
    "/static/js/shared/icon-system.js",
    "/static/js/shared/confirmation-dialog.js",
    "/static/js/sidebar-dry-loader.js",
}

ROOT_SECTION_IDS = (
    "doctorReceptionistIntakePanel",
    "doctorHistoryPanel",
    "doctorClinicalDecisionPanel",
    "doctorServicePanel",
    "doctorIndicationsPanel",
)

REGISTRY_OWNERS = {
    "doctorComponentConfig": "app/static/js/components/doctor-component-config.js",
    "medicalHistoryForm": "app/static/js/components/medical-history-form.js",
    "medicalHistorySubstanceFields": "app/static/js/components/medical-history-substance-fields.js",
    "supportRuntime": "app/static/js/doctor-examination/support-runtime.js",
    "prescriptionModel": "app/static/js/doctor-examination/prescription-model.js",
    "prescriptionRows": "app/static/js/doctor-examination/prescription-row-renderer.js",
    "prescriptionHistory": "app/static/js/doctor-examination/prescription-history-ui.js",
    "prescriptionReExam": "app/static/js/doctor-examination/prescription-reexam-ui.js",
    "prescriptionMedicineSearch": "app/static/js/doctor-examination/prescription-medicine-search-ui.js",
    "prescriptionForm": "app/static/js/doctor-examination/prescription-ui.js",
    "servicesForm": "app/static/js/components/doctor-services-form.js",
    "indicationsForm": "app/static/js/components/doctor-indications-form.js",
    "supportModulesUi": "app/static/js/doctor-examination/support-modules-ui.js",
    "clinicalDetails": "app/static/js/doctor-examination/clinical-detail-persistence.js",
    "clinicalExaminationForm": "app/static/js/components/clinical-examination-form.js",
    "workspaceSaveController": "app/static/js/doctor-examination/workspace-save-controller.js",
    "clinicalWorkspace": "app/static/js/doctor-examination/clinical-workspace-ui.js",
    "draftRecovery": "app/static/js/doctor-examination/draft-recovery.js",
    "draftRecoveryPolicy": "app/static/js/doctor-examination/draft-recovery-policy.js",
    "draftRecoveryStore": "app/static/js/doctor-examination/draft-recovery-store.js",
    "documentAttachments": "app/static/js/doctor-examination/document-attachments-bridge.js",
    "medicalHistoryBridge": "app/static/js/doctor-examination/medical-history-bridge.js",
    "workspaceLeaveGuard": "app/static/js/doctor-examination/workspace-leave-guard.js",
    "doctorPlatformBoundaries": "app/static/js/doctor-examination/platform-boundaries.js",
}

RETIRED_ALIASES = (
    "QLPKDoctorComponentConfig",
    "QLPKSupportRuntime",
    "QLPKMedicalHistoryForm",
    "QLPKMedicalHistorySubstanceFields",
    "QLPKMedicalHistoryBridge",
    "QLPKClinicalDetails",
    "QLPKClinicalExaminationForm",
    "QLPKPrescriptionForm",
    "QLPKServicesForm",
    "QLPKIndicationsForm",
    "QLPKSupportModulesUi",
    "QLPKClinicalWorkspace",
    "QLPKDoctorWorkspaceSaveController",
    "QLPKDoctorDraftRecovery",
    "QLPKDoctorDocumentAttachments",
	"QLPKDoctorClinicalWorkspace",
    "QLPKDoctorSupportModulesUi",
    "QLPKDoctorServicesForm",
    "QLPKDoctorIndicationsForm",
	"QLPKDoctorPrescriptionUi",
	"QLPKDoctorMedicalHistoryBridge",
	"QLPKDoctorSupportRuntime",
	"QLPKDoctorPrescriptionModel",
	"QLPKDoctorPrescriptionRows",
	"QLPKDoctorPrescriptionHistory",
)


class MarkupContractParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[str] = []
        self.module_scripts: list[str] = []
        self.ids: list[str] = []
        self.root_section_ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag.lower() == "script" and attributes.get("src"):
            self.scripts.append(urlsplit(attributes["src"]).path)
            if (attributes.get("type") or "").lower() == "module":
                self.module_scripts.append(urlsplit(attributes["src"]).path)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        classes = set((attributes.get("class") or "").split())
        if "doctor-workspace-section" in classes and attributes.get("id"):
            self.root_section_ids.append(attributes["id"])


def read_markup() -> MarkupContractParser:
    parser = MarkupContractParser()
    parser.feed(read_source(PAGE_TEMPLATE))
    for path in WORKSPACE_TEMPLATES:
        parser.feed(read_source(path))
    return parser


def source_text() -> str:
    paths = sorted({path for path in (*ACTIVE_JS, ROOT / "app/static/js/doctor-examination-entry.js") if path.exists()})
    return "\n".join(read_source(path) for path in paths)


def registry_registration_count(name: str) -> int:
    marker = f"register('{name}'"
    return sum(
        text.count(marker)
        for text in (
            read_source(path)
            for path in ACTIVE_JS
            if path.exists()
        )
    )


def main() -> int:
    failures: list[str] = []
    parser = read_markup()

    duplicate_assets = sorted({asset for asset in parser.scripts if parser.scripts.count(asset) > 1})
    if duplicate_assets:
        failures.extend(f"duplicate script asset: {asset}" for asset in duplicate_assets)

    if parser.module_scripts != [DOCTOR_ENTRY_ASSET]:
        failures.append(
            f"Doctor template must have exactly one module entry {DOCTOR_ENTRY_ASSET}; "
            f"found {parser.module_scripts}"
        )

    classic_local_assets = [
        asset for asset in parser.scripts
        if asset.startswith("/static/js/")
        and asset != DOCTOR_ENTRY_ASSET
        and asset not in CLASSIC_SHARED_ASSETS
    ]
    if classic_local_assets:
        failures.extend(f"Doctor local asset still loaded as classic script: {asset}" for asset in classic_local_assets)

    entry_path = ROOT / "app/static/js/doctor-examination-entry.js"
    entry_text = read_source(entry_path) if entry_path.exists() else ""
    required_entry_imports = (
        "./doctor-examination/module-registry.js",
        "./components/doctor-component-config.js",
        "./components/medical-history-form.js",
        "./doctor-examination/medical-history-context.js",
        "./doctor-examination/medical-history-core.js",
        "./doctor-examination/medical-history-workbench.js",
        "./doctor-examination/medical-history-allergy.js",
        "./doctor-examination/medical-history-risk.js",
        "./doctor-examination/medical-history-suggestions.js",
        "./doctor-examination/safety-plan.js",
        "./orders/order-autocomplete-utils.js",
        "./doctor-examination/platform-boundaries.js",
        "./doctor-examination.js",
    )
    for import_path in required_entry_imports:
        if f"'{import_path}'" not in entry_text and f'"{import_path}"' not in entry_text:
            failures.append(f"Doctor ESM entry missing import: {import_path}")

    platform_import = "./doctor-examination/platform-boundaries.js"
    root_import = "./doctor-examination.js"
    if platform_import in entry_text and root_import in entry_text:
        if entry_text.index(platform_import) > entry_text.index(root_import):
            failures.append("platform boundaries phải được import trước page orchestrator")
        boundaries_index = entry_text.index(platform_import)
        for shared_import in (
            "./components/icd-autocomplete.js",
            "./components/icd-data-loader.js",
            "./orders/order-selection-state-utils.js",
            "./orders/order-autocomplete-utils.js",
            "./receptionist/document-attachment-controls.js",
            "./prescriptions/pages/doctor-prescription-print.js",
            "./transfer-modal-dry.js",
        ):
            if f"'{shared_import}'" not in entry_text or entry_text.index(f"'{shared_import}'") > boundaries_index:
                failures.append(f"shared asset phải được import trước platform boundaries: {shared_import}")
        for feature_import in (
            "./components/medical-history-form.js",
            "./doctor-examination/medical-history-icd-bridge.js",
            "./components/doctor-indications-form.js",
            "./doctor-examination/document-attachments-bridge.js",
        ):
            if f"'{feature_import}'" in entry_text and entry_text.index(f"'{feature_import}'") < boundaries_index:
                failures.append(f"Doctor feature phải được import sau platform boundaries: {feature_import}")
    else:
        failures.append("Doctor entry thiếu thứ tự platform boundaries/page orchestrator")

    registry_fallback = re.compile(
        r"(?:REGISTRY|registry)\??\.get\([^)]*\)\s*\|\|\s*(?:window\.|\{\s*\})"
        r"|\|\|\s*window\.QLPKConfirmationDialog"
        r"|\.get\('(?:doctorComponentConfig|confirmationDialog)'\)"
    )
    shared_global_read = re.compile(r"window\.(?:ReceptionistDocumentAttachment\w+|ClinicalOrder\w+Utils|QLPKIcdAutocomplete|ClinicalIcdDataLoader|QLPKConfirmationDialog|Swal)\b")
    for path in (
        *ACTIVE_JS_ROOT.glob("*.js"),
        ROOT / "app/static/js/doctor-examination.js",
        ROOT / "app/static/js/components/doctor-indications-form.js",
        ROOT / "app/static/js/components/doctor-services-form.js",
        ROOT / "app/static/js/components/clinical-examination-form.js",
    ):
        if path.name == "platform-boundaries.js" or not path.exists():
            continue
        text = read_source(path)
        if registry_fallback.search(text):
            failures.append(f"Doctor module còn nhánh registry/window dự phòng: {path.relative_to(ROOT)}")
        if shared_global_read.search(text):
            failures.append(f"Doctor module đọc thẳng tài sản dùng chung qua window: {path.relative_to(ROOT)}")

    manual_change_tracking = re.compile(
        r"\b(?:STATE|state)\.(?:prescription|services|orders|main|manual)(?:Revision\s*(?:\+=|=(?!=))|Dirty\s*=(?!=))"
        r"|\bstate\.detailDirtySections\.(?:add|delete|clear)\("
        r"|\bstate\.detailRevisions\s*(?:\[[^\]]*\]\s*=(?!=)|=(?!=))"
    )
    for relative_path in (
        "app/static/js/doctor-examination/prescription-ui.js",
        "app/static/js/components/doctor-services-form.js",
        "app/static/js/components/doctor-indications-form.js",
        "app/static/js/doctor-examination/clinical-workspace-ui.js",
        "app/static/js/doctor-examination/workspace-save-controller.js",
        "app/static/js/components/clinical-examination-form.js",
        "app/static/js/doctor-examination/clinical-detail-persistence.js",
        "app/static/js/components/medical-history-form.js",
    ):
        path = ROOT / relative_path
        text = read_source(path) if path.exists() else ""
        if manual_change_tracking.search(text):
            failures.append(f"Doctor module tự tăng revision/dirty thay vì dùng createChangeTracker: {relative_path}")

    raw_color_literal = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d")
    contract_color_fallbacks = (
        "var(--qlpk-feedback-warning, #c2410c)",
        "var(--qlpk-feedback-success, #15803d)",
    )
    for relative_path in (
        "app/static/css/components/doctor-component-base.css",
        "app/static/css/pages/doctor-examination.css",
        "app/static/css/pages/doctor-indications.css",
        "app/static/css/pages/doctor-prescription.css",
    ):
        path = ROOT / relative_path
        text = read_source(path) if path.exists() else ""
        text = re.sub(r"/\*.*?\*/", lambda match: "\n" * match[0].count("\n"), text, flags=re.DOTALL)
        for fallback in contract_color_fallbacks:
            text = text.replace(fallback, " " * len(fallback))
        for match in raw_color_literal.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            failures.append(f"{relative_path}:{line}: dùng token màu trong shared/color-tokens.css thay vì {match[0]}")

    unpinned_cdn = re.compile(r"cdn\.jsdelivr\.net/npm/((?:@[\w.-]+/)?[\w.-]+?)(?:@(\d+))?(?=[\"'/])")
    for template in sorted((ROOT / "app/templates").rglob("*.html")):
        source = read_source(template)
        for match in unpinned_cdn.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            failures.append(
                f"{template.relative_to(ROOT)}:{line}: CDN {match[1]} phải ghim phiên bản đầy đủ (x.y.z)"
            )

    for section_id in ROOT_SECTION_IDS:
        count = parser.root_section_ids.count(section_id)
        if count != 1:
            failures.append(f"root section {section_id}: expected 1, found {count}")
    if len(parser.root_section_ids) != len(ROOT_SECTION_IDS):
        failures.append(
            f"root section count: expected {len(ROOT_SECTION_IDS)}, found {len(parser.root_section_ids)}"
        )
    if parser.ids.count("doctorPrescriptionWorkspace") != 1:
        failures.append(
            f"doctorPrescriptionWorkspace: expected 1, found {parser.ids.count('doctorPrescriptionWorkspace')}"
        )
    for control_id in (
        "doctorPrescriptionUsageMode",
        "doctorPrescriptionMedicineDays",
        "doctorPrescriptionReExamButton",
        "doctorPrescriptionReExamDateTime",
    ):
        if parser.ids.count(control_id) != 1:
            failures.append(f"prescription overview control {control_id}: expected 1, found {parser.ids.count(control_id)}")
    if parser.ids.count("doctorPrescriptionUsageInstructions"):
        failures.append("retired Doctor prescription general-usage control returned")

    indications_markup = read_source((ROOT / "app/templates/partials/doctor-indications-panel.html"))
    for marker in (
        'id="doctorIndicationName"',
        'placeholder="Tìm khảo sát hoặc nhập tên"',
        'role="combobox"',
        'aria-autocomplete="list"',
        'id="doctorIndicationNameDropdown"',
        'role="listbox"',
    ):
        if marker not in indications_markup:
            failures.append(f"Doctor indication source/autocomplete thiếu markup contract: {marker}")
    for marker in (
        'value="catalog"',
        'doctorIndicationCatalog',
        'doctorIndicationCatalogId',
        'doctorIndicationSource',
        'doctorIndicationSourceFieldset',
        'Loại chỉ định',
    ):
        if marker in indications_markup:
            failures.append(f"Doctor indication còn markup legacy/selector đã bỏ: {marker}")

    indications_runtime = read_source((ROOT / "app/static/js/components/doctor-indications-form.js"))
    for marker in (
        "setupOrderFormAutocomplete",
        "normalizeSearch: true",
        "selectFirstOnEnter: true",
        "--doctor-indication-dropdown-inline-start",
        "--doctor-indication-dropdown-max-block-size",
        "ownerDocument.addEventListener('scroll', syncIfOpen, true)",
        "const VALID_SOURCES = Object.freeze(['custom', 'survey']);",
        "getSurveyTemplates: () => STATE.surveyTemplates",
        "isEnabled: () => Boolean(STATE.appointmentId && STATE.ordersLoaded && STATE.surveyLoaded && !STATE.saving)",
        "showSurveyDescription: false",
        "setSurveySelection(doc, item)",
        "STATE.surveyIndex = buildSurveyIndex(STATE.surveyTemplates);",
        "const hasSelectedSurvey = Boolean(selectedSurveyId && selectedSurveyName && typedName === selectedSurveyName);",
        "source: hasSelectedSurvey ? 'survey' : 'custom'",
        "surveyTemplateId: hasSelectedSurvey ? selectedSurveyId : null",
        "survey_template_id: survey.surveyTemplateId",
        "source: survey.source",
    ):
        if marker not in indications_runtime:
            failures.append(f"Doctor indication source/autocomplete thiếu runtime contract: {marker}")
    for marker in (
        "includeCatalogWhenEmpty",
        "syncCatalogDropdownGeometry",
        "clearCatalogSelection",
        "STATE.catalogIndex",
        "buildCatalogIndex",
        "/api/order-items",
        "doctorIndicationSource",
        "STATE.source",
        "setSource",
        "allowedSources",
    ):
        if marker in indications_runtime:
            failures.append(f"Doctor indication còn runtime catalog đã nghỉ: {marker}")

    indications_css = read_source((ROOT / "app/static/css/pages/doctor-indications.css"))
    for marker in (
        "position: fixed;",
        "--doctor-indication-dropdown-inline-start",
        "--doctor-indication-dropdown-inline-size",
        "--doctor-indication-dropdown-max-block-size",
        ".doctor-indications-autocomplete__dropdown--upward",
    ):
        if marker not in indications_css:
            failures.append(f"Doctor indication autocomplete thiếu layout contract: {marker}")
    for marker in (
        "doctor-indications-source-badge",
        "renderSourceBadge",
        "getSourceConfig",
    ):
        if marker in indications_runtime or marker in indications_css:
            failures.append(f"Doctor indication không được render badge nguồn: {marker}")

    runtime = source_text()
    for alias in RETIRED_ALIASES:
        if alias in runtime:
            failures.append(f"retired Doctor alias still present: {alias}")

    attachment_runtime = "\n".join(
        read_source(path)
        for path in ATTACHMENT_JS
        if path.exists()
    )
    if "window.confirm" in attachment_runtime or "confirm: window.confirm" in attachment_runtime:
        failures.append("attachment runtime still contains native window.confirm")
    if "/static/js/shared/confirmation-dialog.js" not in parser.scripts:
        failures.append("shared confirmation dialog is not loaded by Doctor template")

    for module_name, relative_path in REGISTRY_OWNERS.items():
        expected_path = ROOT / relative_path
        count = registry_registration_count(module_name)
        if count != 1:
            failures.append(f"registry module {module_name}: expected 1 registration, found {count}")
        if not expected_path.exists():
            failures.append(f"registry owner file missing: {relative_path}")

    support_modules = read_source((ROOT / "app/static/js/doctor-examination/support-modules-ui.js"))
    if "prescriptionRows" in support_modules or "renderPrescription" in support_modules:
        failures.append("support-modules-ui.js contains prescription row/render ownership")
    if "catalogLoaded" in support_modules:
        failures.append("support-modules-ui.js còn kiểm tra cờ catalog đã nghỉ")
    if "surveyLoaded" not in support_modules:
        failures.append("support-modules-ui.js thiếu readiness check surveyLoaded")

    orchestrator = read_source((ROOT / "app/static/js/doctor-examination.js"))
    forbidden_orchestrator_fallbacks = (
        "|| window.QLPKCurrentAppointment",
        "window.QLPKPatientModalContract ||",
        "window.setupPrescriptionTabPagination",
    )
    for fallback in forbidden_orchestrator_fallbacks:
        if fallback in orchestrator:
            failures.append(f"page orchestrator còn fallback global không hợp lệ: {fallback}")

    draft_recovery = read_source((ROOT / "app/static/js/doctor-examination/draft-recovery.js"))
    draft_policy = read_source((ROOT / "app/static/js/doctor-examination/draft-recovery-policy.js"))
    required_draft_policy_contracts = (
        "function classifyDraftRecord",
        "function mergeFailedSaveDraft",
        "function resolveDraftRecord",
        "if (sameValue(baseline, record.snapshot)) return 'redundant';",
        "if (!sameValue(baseline, record.baseSnapshot)) return 'superseded';",
        "if (disposition === 'superseded' && record.recoveryMode !== 'failed-save')",
    )
    for marker in required_draft_policy_contracts:
        if marker not in draft_policy:
            failures.append(f"Doctor draft recovery policy thiếu contract: {marker}")
    required_draft_contracts = (
        "await deleteRecordIfMatches(record);",
        "if (options.recoveryMode === 'failed-save') STATE.recoveryMode = 'failed-save';",
        "recoveryMode: STATE.recoveryMode",
    )
    for marker in required_draft_contracts:
        if marker not in draft_recovery:
            failures.append(f"Doctor draft recovery thiếu contract: {marker}")
    forbidden_draft_contracts = (
        "baseConflict",
        "confirmBaseConflict",
        "Bản nháp đã cũ hơn dữ liệu hiện tại",
        "Vẫn khôi phục",
    )
    for marker in forbidden_draft_contracts:
        if marker in draft_recovery:
            failures.append(f"Doctor draft recovery còn conflict UX đã loại bỏ: {marker}")

    prescription_ui = read_source((ROOT / "app/static/js/doctor-examination/prescription-ui.js"))
    prescription_model = read_source((ROOT / "app/static/js/doctor-examination/prescription-model.js"))
    prescription_css = read_source((ROOT / "app/static/css/pages/doctor-prescription.css"))
    if "doctorPrescriptionUsageInstructions" in prescription_ui or "doctorPrescriptionUsageInstructions" in draft_recovery:
        failures.append("retired Doctor prescription general-usage runtime returned")
    for marker in (
        "preservedGlobalUsage: ''",
        "STATE.preservedGlobalUsage = usageState.globalUsage || '';",
        "STATE.preservedGlobalUsage,",
    ):
        if marker not in prescription_ui:
            failures.append(f"Doctor prescription thiếu bảo toàn general_usage legacy: {marker}")
    if "delete candidate.usageInstructions;" not in draft_policy:
        failures.append("Doctor draft comparison chưa loại key general-usage đã nghỉ")
    for marker in (
        "const days = parseMedicineDays(medicineDays, 1);",
    ):
        if marker not in prescription_model:
            failures.append(f"Doctor prescription quantity thiếu công thức ngày trống: {marker}")
    for marker in (
        "const medicineDaysMissing = parseMedicineDays(medicineDays) === null;",
        "if (medicineDaysMissing && preserveWhenDaysMissing) return;",
    ):
        if marker not in prescription_ui:
            failures.append(f"Doctor prescription quantity thiếu lifecycle bảo toàn đơn cũ: {marker}")
    active_recalculation_marker = (
        "syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });"
    )
    if prescription_ui.count(active_recalculation_marker) != 4:
        failures.append(
            "Doctor prescription quantity phải tính lại ở đúng 4 tương tác: "
            "chọn thuốc, sửa liều, sửa số ngày và đổi cách tính liều"
        )
    for marker in (
        "grid-template-columns: max-content max-content minmax(0, 1fr);",
        "@container doctor-prescription-main (max-width: 66rem)",
        "@container doctor-prescription-main (max-width: 38rem)",
        "@container doctor-prescription-main (max-width: 26rem)",
    ):
        if marker not in prescription_css:
            failures.append(f"Doctor prescription overview thiếu layout contract: {marker}")
    for marker in (
        ".doctor-prescription-summary-field__input-line input:focus",
        ".doctor-prescription-summary-field--days .doctor-prescription-summary-field__input-line input:focus-visible",
        "-moz-appearance: textfield;",
        'input[type="number"]::-webkit-inner-spin-button',
        "-webkit-appearance: none;",
    ):
        if marker not in prescription_css:
            failures.append(f"Doctor prescription medicine-days input thiếu control contract: {marker}")

    days_rules = {
        ".doctor-prescription-summary-field__input-line": (
            "display: flex;", "justify-content: center;", "gap: 0.35rem;",
        ),
        ".doctor-prescription-summary-field__input-line input": (
            "flex: 0 1 3ch;", "inline-size: 3ch;", "text-align: center;",
            "min-inline-size: 0;", "min-block-size: 0;", "padding-inline: 0;",
        ),
        ".doctor-prescription-summary-field__input-line small": (
            "padding-inline-end: 0;", "white-space: nowrap;",
        ),
    }
    for selector, markers in days_rules.items():
        matched_rule = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", prescription_css)
        declarations = matched_rule.group(1) if matched_rule else ""
        for marker in markers:
            if marker not in declarations:
                failures.append(f"Doctor prescription centered medicine-days thiếu {selector}: {marker}")

    save_controller = read_source((ROOT / "app/static/js/doctor-examination/workspace-save-controller.js"))
    after_save_call = "if (typeof afterSave === 'function') await afterSave();"
    success_return = "return noChanges ? { status: 'success', noChanges: true, ...results } : { status: 'success', ...results };"
    if (
        after_save_call not in save_controller
        or success_return not in save_controller
        or save_controller.index(after_save_call) > save_controller.index(success_return)
    ):
        failures.append("Doctor save owner phải rebase/xóa nháp sau cả save có thay đổi và save sạch")
    if "captureNow({ silent: true, recoveryMode: 'failed-save' })" not in save_controller:
        failures.append("Doctor save failure phải đánh dấu nháp để rebase an toàn sau partial save")
    if "return draftRecovery.rebaseAfterSave();" not in orchestrator:
        failures.append("Doctor orchestrator không trả Promise xóa nháp cho save owner")

    policy_check = subprocess.run(
        ["node", "scripts/check_doctor_draft_recovery_policy.js"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if policy_check.returncode != 0:
        failures.append(f"Doctor draft recovery policy failed:\n{policy_check.stdout.strip()}")

    prescription_quantity_policy_check = subprocess.run(
        ["node", "scripts/check_doctor_prescription_quantity_policy.js"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if prescription_quantity_policy_check.returncode != 0:
        failures.append(
            "Doctor prescription quantity policy failed:\n"
            f"{prescription_quantity_policy_check.stdout.strip()}"
        )

    context_source = read_source((ROOT / "app/static/js/doctor-examination/component-context.js"))
    if "setCurrent" not in context_source or "getCurrent" not in context_source:
        failures.append("Doctor component context thiếu current-context contract")

    base_css = read_source((ROOT / "app/static/css/components/doctor-component-base.css"))
    for marker in ("[data-doctor-component]", "aria-busy", "focus-visible", "data-state='empty'"):
        if marker not in base_css:
            failures.append(f"Doctor component base thiếu state/layout contract: {marker}")

    if failures:
        print("Doctor examination contract failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"[OK] Doctor assets: one ESM entry plus {len(CLASSIC_SHARED_ASSETS)} intentional shared classic boundaries")
    print(f"[OK] Doctor root sections: {len(ROOT_SECTION_IDS)} unique sections")
    print("[OK] Doctor registry modules: one registration each")
    print("[OK] Retired aliases: none in active Doctor runtime")
    print("[OK] Prescription owner: single state/render owner")
    print(policy_check.stdout.strip())
    print(prescription_quantity_policy_check.stdout.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
