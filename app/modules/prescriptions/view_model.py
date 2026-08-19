"""Backward-compatible import path for prescription view models."""

from app.modules.prescriptions.view_models.public_prescription import (
    AppointmentNotFound,
    PrescriptionNotFound,
    PrescriptionViewModelError,
    build_public_prescription_view_model,
)
from app.modules.prescriptions.view_models.print_prescription import (
    PrescriptionPrintAppointmentNotFound,
    PrescriptionPrintViewModelError,
    build_internal_prescription_print_view_model,
)

__all__ = [
    "AppointmentNotFound",
    "PrescriptionNotFound",
    "PrescriptionPrintAppointmentNotFound",
    "PrescriptionPrintViewModelError",
    "PrescriptionViewModelError",
    "build_internal_prescription_print_view_model",
    "build_public_prescription_view_model",
]
