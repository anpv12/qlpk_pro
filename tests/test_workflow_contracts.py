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
