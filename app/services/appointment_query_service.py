"""Backward-compatible import path for appointment query services."""

from app.modules.appointments.services.query_service import (
    AppointmentListResult,
    get_appointment_list,
)

__all__ = [
    "AppointmentListResult",
    "get_appointment_list",
]
