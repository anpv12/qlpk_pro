"""Access boundaries for patient-scoped clinical workflows."""

from __future__ import annotations

from app.models.appointment import Appointment


def user_role_value(user) -> str:
    role = getattr(user, "role", "") if user else ""
    return str(getattr(role, "value", role) or "").replace("UserRole.", "").strip().lower()


def has_full_patient_scope(user) -> bool:
    """Return whether the actor may search/read any patient clinical record."""
    role = user_role_value(user)
    return role in {"admin", "staff"} or bool(getattr(user, "can_view_all_patients", False))


def is_clinical_user(user) -> bool:
    return user_role_value(user) in {"doctor", "psychologist"}


def appointment_in_user_scope(user, appointment) -> bool:
    """Check one loaded appointment without performing a second query."""
    if not user or not appointment:
        return False
    if has_full_patient_scope(user):
        return True

    role = user_role_value(user)
    user_id = getattr(user, "id", None)
    if role == "doctor":
        return appointment.doctor_id == user_id
    if role == "psychologist":
        # Legacy records may keep the psychologist in doctor_id only.
        return appointment.psychologist_id == user_id or appointment.doctor_id == user_id
    return False


def patient_in_user_scope(db, user, patient_id: int) -> bool:
    """Check whether a patient has a non-deleted appointment in actor scope."""
    if has_full_patient_scope(user):
        return True
    if not is_clinical_user(user) or not patient_id:
        return False

    role = user_role_value(user)
    user_id = getattr(user, "id", None)
    query = db.query(Appointment.id).filter(
        Appointment.patient_id == patient_id,
        Appointment.is_deleted == False,
    )
    if role == "doctor":
        query = query.filter(Appointment.doctor_id == user_id)
    else:
        query = query.filter(
            (Appointment.psychologist_id == user_id) | (Appointment.doctor_id == user_id)
        )
    return db.query(query.exists()).scalar()


def scoped_patient_ids(db, user) -> set[int] | None:
    """Return a reusable patient-id scope, or None when the actor is unrestricted."""
    if has_full_patient_scope(user):
        return None
    if not is_clinical_user(user):
        return None

    role = user_role_value(user)
    user_id = getattr(user, "id", None)
    query = db.query(Appointment.patient_id).filter(
        Appointment.is_deleted == False,
        Appointment.patient_id.isnot(None),
    )
    if role == "doctor":
        query = query.filter(Appointment.doctor_id == user_id)
    else:
        query = query.filter(
            (Appointment.psychologist_id == user_id) | (Appointment.doctor_id == user_id)
        )
    return {int(patient_id) for (patient_id,) in query.distinct().all()}


def appointment_access_error(user, appointment) -> str | None:
    if appointment_in_user_scope(user, appointment):
        return None
    return "Bạn không có quyền truy cập lượt khám này."


def examination_access_error(db, user, examination) -> str | None:
    appointment = getattr(examination, "appointment", None)
    if appointment is None and examination is not None:
        appointment = db.query(Appointment).filter(Appointment.id == examination.appointment_id).first()
    return appointment_access_error(user, appointment)


def patient_access_error(db, user, patient_id: int) -> str | None:
    if patient_in_user_scope(db, user, patient_id):
        return None
    return "Bạn không có quyền truy cập dữ liệu bệnh nhân này."
