"""Backward-compatible import path for order catalog routes."""

from app.modules.orders.api.catalog import order_catalog_bp

__all__ = ["order_catalog_bp"]
