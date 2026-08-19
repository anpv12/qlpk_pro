from datetime import datetime

from app.models.appointment import Appointment
from app.modules.appointments.view_models.appointment_response import (
    build_appointment_response,
    get_examination_status_text,
)


def format_appointment_response(appointment: Appointment, db=None) -> dict:
    """
    Backward-compatible wrapper for legacy imports.

    The appointment response view-model lives in
    app.modules.appointments.view_models.appointment_response so route handlers can pass their
    active DB session instead of opening hidden sessions during formatting.
    """
    return build_appointment_response(appointment, db=db)


def parse_appointment_date(date_str: str) -> datetime:
    """
    Parse and validate appointment date.
    """
    try:
        parsed_dt = datetime.fromisoformat(date_str)
        if parsed_dt.tzinfo is not None:
            parsed_dt = parsed_dt.replace(tzinfo=None)
        return parsed_dt
    except ValueError as e:
        raise ValueError(
            f'Invalid date format: {date_str}. Expected ISO format (e.g., YYYY-MM-DDTHH:MM:SS).'
        ) from e
