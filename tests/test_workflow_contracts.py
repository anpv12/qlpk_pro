"""Fast, dependency-light regression tests for the clinical workflow owners.

These tests intentionally inspect the source contracts rather than importing
``main.py``.  Importing the Flask app can initialize database state, while the
regressions covered here are ownership/field/lifecycle regressions that should
fail before a browser smoke is attempted.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def run_script(relative_path: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(ROOT / relative_path), *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def run_node(relative_path: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(ROOT / relative_path)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def test_static_smoke_contracts_pass() -> None:
    result = run_script("scripts/smoke_health.py")
    assert result.returncode == 0, result.stdout


def test_frontend_contract_passes() -> None:
    result = run_script("scripts/check_frontend_contract.py")
    assert result.returncode == 0, result.stdout


def test_psychologist_fields_have_one_config_owner() -> None:
    config = read("app/static/js/components/psychologist-component-config.js")
    template = read("app/templates/partials/psychologist-clinical-workspace.html")
    clinical_block = template.split('id="psychologistClinicalDecisionPanel"', 1)[1].split(
        'id="doctorServicePanel"', 1
    )[0]

    config_fields = {
        field_id: (section, field_name)
        for field_id, _label, section, field_name in re.findall(
            r"\{ id: '([^']+)', label: '([^']+)', section: '([^']+)', field: '([^']+)' \}",
            config,
        )
    }
    config_ids = set(config_fields)
    template_ids = set(re.findall(r'<textarea[^>]+\bid="([^"]+)"', clinical_block))
    hidden_doctor_ids = set(
        re.findall(r"'([^']+)'", config.split("hiddenDoctorFieldIds", 1)[1].split(
            "]", 1
        )[0])
    )

    assert template_ids
    assert template_ids <= config_ids
    assert not template_ids & hidden_doctor_ids
    assert config_fields["examDetailMedicalHistory"] == (
        "tam_ly_gia_kham_tien_su",
        "medical_history",
    )


def test_survey_order_performer_and_source_contract() -> None:
    survey_model = read("app/models/survey_template.py")
    survey_serializer = read("app/modules/orders/view_models/clinical_order.py")
    indications = read("app/static/js/components/doctor-indications-form.js")
    support_modules = read("app/static/js/doctor-examination/support-modules-ui.js")
    psychologist_config = read("app/static/js/components/psychologist-component-config.js")
    indications_template = read("app/templates/partials/doctor-indications-panel.html")

    assert "default_performer_id" in survey_model
    assert "default_performer_name" in survey_model
    assert '"default_performer_id": template.default_performer_id' in survey_serializer
    assert '"default_performer_name": template.default_performer.full_name' in survey_serializer
    assert "rootId: 'doctorIndicationsPanel'" in psychologist_config
    assert "const VALID_SOURCES = Object.freeze(['custom', 'survey']);" in indications
    assert "loadCatalog" not in indications
    assert "/api/order-items" not in indications
    assert "catalogLoaded" not in support_modules
    assert "surveyLoaded" in support_modules
    assert "const defaultPerformerId = normalizeId(item.default_performer_id);" in indications
    assert 'value="catalog"' not in indications_template
    assert 'placeholder="Tìm khảo sát hoặc nhập tên"' in indications_template
    assert 'doctorIndicationSource' not in indications_template
    assert "getSurveyTemplates: () => STATE.surveyTemplates" in indications
    assert "const hasSelectedSurvey = Boolean(selectedSurveyId && selectedSurveyName && typedName === selectedSurveyName);" in indications
    assert "const source = hasSelectedSurvey ? 'survey' : 'custom';" in indications
    assert "renderSourceBadge" not in indications
    assert "getSourceConfig" not in indications
    assert "doctor-indications-source-badge" not in indications
    assert "doctor-indications-source-badge" not in read("app/static/css/pages/doctor-indications.css")


def test_clinical_order_scope_and_validation_contract() -> None:
    order_api = read("app/modules/orders/api/chi_dinh.py")
    order_mutation = read("app/modules/orders/services/clinical_order_mutation.py")
    order_query = read("app/modules/orders/services/clinical_order_query.py")
    result_files = read("app/modules/orders/services/result_file_service.py")
    survey_sessions = read("app/api/survey_sessions.py")
    order_management = read("app/static/js/order-management.js")

    assert "def _get_accessible_chi_dinh" in order_api
    assert order_api.count("_get_accessible_chi_dinh(db, user, chi_dinh_id)") >= 5
    assert "class InvalidChiDinhPayload" in order_mutation
    assert "VALID_ORDER_STATUSES" in order_mutation
    assert "class InvalidPagination" in order_query
    assert "MAX_FILE_SIZE = 25 * 1024 * 1024" in result_files
    assert "def _safe_result_path" in result_files
    assert "_get_accessible_examination" in survey_sessions
    assert "Mẫu khảo sát lấy từ chỉ định đã chọn." in order_management
    assert "Chỉ định này nhập text, không gắn mẫu khảo sát." in order_management
    assert "/api/survey-templates/active/public" not in order_management
    assert "surveyTemplateSelectResults.addEventListener('change'" not in order_management


def test_order_management_survey_completion_contract() -> None:
    order_management = read("app/static/js/order-management.js")
    survey_templates = read("app/api/survey_templates.py")
    survey_sessions = read("app/api/survey_sessions.py")
    notifications = read("app/services/notification_service.py")

    assert "questions_by_criteria" in survey_templates
    assert "const completionTimestamp = response.updated_at || response.created_at;" in order_management
    assert "currentSurveySession = surveySession;" in order_management
    assert "if (previousStatus !== currentStatus)" in order_management
    assert "create_clinical_order_assignment_notifications" in notifications
    assert "create_survey_completed_notifications" in notifications
    assert "clinical_order_assigned" in notifications
    assert "survey_completed" in notifications
    assert "completed_transition" not in survey_sessions
    assert "submit_order_survey" in (ROOT / "app/api/survey_responses.py").read_text()


def test_order_catalog_surface_is_removed() -> None:
    removed_paths = [
        "app/models/order_category.py",
        "app/modules/orders/api/catalog.py",
        "app/modules/orders/services/catalog_query.py",
        "app/modules/orders/services/catalog_mutation.py",
        "app/modules/orders/view_models/catalog.py",
        "app/api/order_catalog.py",
        "app/templates/order-catalog.html",
        "app/static/js/order-catalog.js",
        "app/static/css/pages/order-catalog.css",
    ]
    assert all(not (ROOT / path).exists() for path in removed_paths)

    chi_dinh_model = read("app/models/chi_dinh.py")
    assert "order_item_id" not in chi_dinh_model
    assert "group_path" not in chi_dinh_model

    main = read("main.py")
    assert "order_catalog" not in main
    assert "order-catalog.html" not in main

    workspace_tabs = read("app/static/js/app-shell/workspace-tabs.js")
    assert "RETIRED_WORKSPACE_PATHS" in workspace_tabs
    assert "'/order-catalog.html'" in workspace_tabs
    assert "!isRetiredWorkspaceTab(tab)" in workspace_tabs


def test_psychologist_has_one_runtime_load_writer() -> None:
    runtime = read("app/static/js/psychologist-examination/workspace-runtime.js")
    page = read("app/static/js/psychologist-examination.js")
    template = read("app/templates/psychologist-examination.html")
    history_bridge = read("app/static/js/psychologist-examination/patient-history-bridge.js")

    assert runtime.count("/api/appointments/${numericAppointmentId}/edit") == 1
    assert "psychologistWorkspaceRuntime.loadAppointment" in page
    assert "QLPKPsychologistPatientHistoryBridge.create" in page
    assert "patientModalContract.getOrCreate" not in page
    assert "/static/js/psychologist-examination/patient-history-bridge.js" in template
    assert "QLPKPsychologistPatientHistoryBridge" in history_bridge
    assert "/api/appointments/${" not in page
    assert "async function initializeExaminationForm" not in page


def test_removed_psychologist_legacy_adapter_is_not_referenced() -> None:
    removed = APP / "static/js/psychologist-examination/examination-data-load-flow-utils.js"
    assert not removed.exists()

    callers = []
    for path in APP.rglob("*"):
        if not path.is_file() or path.suffix not in {".html", ".js", ".py"}:
            continue
        if "examination-data-load-flow-utils" in path.read_text(errors="ignore"):
            callers.append(path.relative_to(ROOT).as_posix())
    assert callers == []


def test_psychologist_runtime_lifecycle_is_executable() -> None:
    result = run_node("tests/psychologist_workspace_runtime.test.js")
    assert result.returncode == 0, result.stdout


def test_psychologist_orchestrator_has_no_verified_dead_bridges() -> None:
    page = read("app/static/js/psychologist-examination.js")
    assert "psychologistPreviousVitalsLoader" not in page
    assert "async function loadPreviousVitals" not in page
    assert "const uploadFile = documentSectionAdapter.uploadFile" not in page


def test_doctor_orchestrator_resolves_clinical_owner_from_registry() -> None:
    doctor = read("app/static/js/doctor-examination.js")
    assert "getModule('clinicalWorkspace')" in doctor
    assert "getModule('supportModulesUi')" in doctor
    assert "getModule('medicalHistoryBridge')" in doctor
    assert "clinicalExaminationForm').create" not in doctor


def test_doctor_patient_history_has_one_bridge_owner() -> None:
    doctor = read("app/static/js/doctor-examination.js")
    bridge = read("app/static/js/doctor-examination/patient-history-bridge.js")
    entry = read("app/static/js/doctor-examination-entry.js")

    assert "requireModule('patientHistoryBridge')" in doctor
    assert "historyBridge.create" in doctor
    assert "patientModalContract.getOrCreate" not in doctor
    assert "REGISTRY.register('patientHistoryBridge'" in bridge
    assert "modalContract.getOrCreate" in bridge
    assert "./doctor-examination/patient-history-bridge.js" in entry
    assert "copyHistory: options.copyHistory" in bridge


def test_doctor_patient_history_bridge_lifecycle_is_executable() -> None:
    result = run_node("tests/doctor_patient_history_bridge.test.js")
    assert result.returncode == 0, result.stdout
