"""Backward-compatible import path for public prescription routes."""

from app.modules.prescriptions.api.public import public_prescription_bp

__all__ = ["public_prescription_bp"]
