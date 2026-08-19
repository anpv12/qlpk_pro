"""Backward-compatible import path for internal prescription routes."""

from app.modules.prescriptions.api.internal import *  # noqa: F401,F403
from app.modules.prescriptions.api.internal import format_quantity, router
