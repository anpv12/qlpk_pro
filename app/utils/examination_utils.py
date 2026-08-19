"""Canonical helpers for examination data and ICD display."""

from app.models.examination import ExaminationStatus


def current_examination(appointment):
    """Return the active, newest examination for an appointment."""
    examinations = getattr(appointment, 'examinations', None) or []
    if not examinations:
        return None
    active = [exam for exam in examinations if getattr(exam, 'is_active', True)]
    return max(active or examinations, key=lambda exam: getattr(exam, 'id', 0) or 0)


def is_psychologist_examination(examination):
    """Return whether an examination belongs to the psychologist workflow."""
    if not examination:
        return False
    if examination.status == ExaminationStatus.PSYCHOLOGIST_EXAM:
        return True
    appointment = getattr(examination, 'appointment', None)
    return bool(getattr(appointment, 'psychologist', None))


def normalize_icd_ids(diagnosis_data) -> list[int]:
    """Return ICD integer IDs from the canonical diagnosis payload."""
    if not diagnosis_data:
        return []

    values = diagnosis_data if isinstance(diagnosis_data, list) else [diagnosis_data]
    ids = []
    for value in values:
        if isinstance(value, bool):
            continue
        if isinstance(value, dict):
            value = value.get('id')
        try:
            if value is not None and str(value).strip().isdigit():
                ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return ids


def resolve_diagnosis_to_str(db, diagnosis_data) -> str:
    """Resolve stored ICD IDs to display text."""
    if not diagnosis_data:
        return ""

    icd_ids = normalize_icd_ids(diagnosis_data)
    if icd_ids:
        from app.models.icd import ICD

        icd_list = db.query(ICD).filter(
            ICD.id.in_(icd_ids),
            ICD.is_deleted == False,
        ).all()
        icd_dict = {icd.id: icd for icd in icd_list}
        return "; ".join(
            f"{icd_dict[icd_id].icd_code} - {icd_dict[icd_id].disease_name}"
            for icd_id in icd_ids
            if icd_id in icd_dict
        )

    return "" if isinstance(diagnosis_data, list) else str(diagnosis_data)


def build_icd_display_contract(db, diagnosis_data) -> dict:
    """Build the display text and raw-ID edit contract."""
    return {
        'text': resolve_diagnosis_to_str(db, diagnosis_data),
        'ids': normalize_icd_ids(diagnosis_data),
    }
