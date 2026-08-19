#!/usr/bin/env python3
"""Fast regression checks for Doctor medical-history contracts and access policy."""

from __future__ import annotations

from dataclasses import dataclass
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.utils.clinical_access import (
    appointment_in_user_scope,
    has_full_patient_scope,
)
from app.utils.medical_history_contract import (
    MedicalHistoryContractError,
    normalize_family_history,
    normalize_physical_history,
    normalize_safety_plan,
    normalize_substance_use_history,
)
from app.utils.risk_assessment import RiskAssessmentContractError, validate_risk_assessment


@dataclass
class FakeUser:
    id: int
    role: str
    can_view_all_patients: bool = False


@dataclass
class FakeAppointment:
    doctor_id: int | None = None
    psychologist_id: int | None = None


def expect_error(callback, error_type):
    try:
        callback()
    except error_type:
        return
    raise AssertionError(f"Expected {error_type.__name__}")


def main() -> int:
    assert normalize_physical_history(None, [{"type": "text", "value": "hen"}]) == [
        {"type": "text", "value": "hen"}
    ]
    assert normalize_family_history([{"type": "icd", "id": "12"}]) == [
        {"type": "icd", "id": 12}
    ]
    expect_error(lambda: normalize_family_history({}), MedicalHistoryContractError)

    assert normalize_substance_use_history({"alcohol_used": True, "alcohol_duration": "2 năm"}) == {
        "alcohol_used": True,
        "alcohol_duration": "2 năm",
    }
    expect_error(lambda: normalize_substance_use_history({"alcohol_used": "true"}), MedicalHistoryContractError)

    assert normalize_safety_plan({"nhan_dien": "  dấu hiệu  ", "nguoi_ho_tro": []})["nhan_dien"] == "dấu hiệu"
    expect_error(lambda: normalize_safety_plan({"nguoi_ho_tro": [{"order": 1}]}), MedicalHistoryContractError)

    valid_risk = {
        "schema_version": 1,
        "suicide_history": [{"code": "Z91.5", "note": ""}],
        "assessment": {"ideation": {"value": "khong", "note": ""}, "level": "thap"},
    }
    assert validate_risk_assessment(valid_risk)["schema_version"] == 1
    expect_error(lambda: validate_risk_assessment("[TSH] legacy"), RiskAssessmentContractError)

    doctor = FakeUser(7, "doctor")
    doctor_full = FakeUser(7, "doctor", True)
    assert not has_full_patient_scope(doctor)
    assert has_full_patient_scope(doctor_full)
    assert appointment_in_user_scope(doctor, FakeAppointment(doctor_id=7))
    assert not appointment_in_user_scope(doctor, FakeAppointment(doctor_id=8))
    assert appointment_in_user_scope(doctor_full, FakeAppointment(doctor_id=8))

    print("[OK] medical_history_boundaries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
