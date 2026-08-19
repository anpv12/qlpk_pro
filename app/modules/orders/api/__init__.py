"""Orders API routes."""

from app.modules.orders.api.catalog import order_catalog_bp
from app.modules.orders.api.chi_dinh import router as chi_dinh_router

__all__ = [
    "chi_dinh_router",
    "order_catalog_bp",
]
