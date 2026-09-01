"""Orders API routes."""

from app.modules.orders.api.chi_dinh import router as chi_dinh_router
from app.modules.orders.api.survey import survey_order_bp

__all__ = [
    "chi_dinh_router",
    "survey_order_bp",
]
