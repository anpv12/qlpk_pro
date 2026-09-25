"""Doctor waiting queue arrival policy; ordinary clinical edits never reorder it."""
from datetime import datetime, timezone

_UNSPECIFIED = object()


def mark_doctor_queue_entry(appointment, previous_status, next_status, previous_doctor_id=_UNSPECIFIED):
    previous = getattr(previous_status, 'value', previous_status)
    next_value = getattr(next_status, 'value', next_status)
    if next_value not in ('DOCTOR_EXAM', 'CONCLUSION'):
        return
    if previous != next_value or (
        previous_doctor_id is not _UNSPECIFIED and previous_doctor_id != appointment.doctor_id
    ):
        appointment.doctor_queue_entered_at = datetime.now(timezone.utc)
