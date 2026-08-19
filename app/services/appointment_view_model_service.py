"""Backward-compatible import path for appointment view models."""

from app.modules.appointments.view_models.appointment_response import (
    build_appointment_response,
    get_examination_status_text,
)

__all__ = [
    "build_appointment_response",
    "get_examination_status_text",
]
