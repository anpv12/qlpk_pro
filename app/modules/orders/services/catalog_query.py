"""Query services for order catalog screens."""

from dataclasses import dataclass

from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from app.models.order_category import OrderCategory, OrderItem
from app.models.survey_template import SurveyTemplate

@dataclass
class OrderCategoryTreeResult:
    roots: list
    total_categories: int
    total_orders: int

@dataclass
class OrderCategoryListResult:
    categories: list

@dataclass
class OrderItemListResult:
    items: list
    default_category_id: int | None

def get_order_category_tree_result(db, include_inactive=False) -> OrderCategoryTreeResult:
    query = (
        db.query(OrderCategory)
        .options(
            selectinload(OrderCategory.children).selectinload(OrderCategory.children),
            selectinload(OrderCategory.children).selectinload(OrderCategory.orders),
            selectinload(OrderCategory.orders).selectinload(OrderItem.group_parent),
        )
        .filter(OrderCategory.parent_id.is_(None))
        .order_by(OrderCategory.sort_order, OrderCategory.name)
    )

    stats_query = db.query(OrderCategory)
    order_stats_query = db.query(OrderItem)
    if not include_inactive:
        query = query.filter(OrderCategory.is_active.is_(True))
        stats_query = stats_query.filter(OrderCategory.is_active.is_(True))
        order_stats_query = order_stats_query.filter(OrderItem.is_active.is_(True))

    return OrderCategoryTreeResult(
        roots=query.all(),
        total_categories=stats_query.count(),
        total_orders=order_stats_query.count(),
    )

def get_order_categories_result(db, include_inactive=False, search="") -> OrderCategoryListResult:
    query = (
        db.query(OrderCategory)
        .options(
            selectinload(OrderCategory.parent),
            selectinload(OrderCategory.children),
            selectinload(OrderCategory.orders),
        )
    )

    if not include_inactive:
        query = query.filter(OrderCategory.is_active.is_(True))

    if search:
        like_pattern = f"%{search}%"
        query = query.filter(
            or_(
                OrderCategory.name.ilike(like_pattern),
                OrderCategory.description.ilike(like_pattern),
            )
        )

    return OrderCategoryListResult(
        categories=query.order_by(OrderCategory.sort_order, OrderCategory.name).all()
    )

def get_order_items_result(db, category_id=None, include_inactive=False, search="") -> OrderItemListResult:
    query = db.query(OrderItem).options(
        selectinload(OrderItem.category),
        selectinload(OrderItem.group_parent),
    )

    if category_id:
        query = query.filter(OrderItem.category_id == category_id)

    if not include_inactive:
        query = query.filter(OrderItem.is_active.is_(True))

    if search:
        like_pattern = f"%{search}%"
        query = query.filter(
            or_(
                OrderItem.name.ilike(like_pattern),
                OrderItem.code.ilike(like_pattern),
                OrderItem.description.ilike(like_pattern),
                OrderItem.performer.ilike(like_pattern),
            )
        )

    default_category = _get_default_category(db)
    return OrderItemListResult(
        items=query.order_by(OrderItem.sort_order, OrderItem.name).all(),
        default_category_id=default_category.id if default_category else None,
    )

def get_survey_templates_for_order_result(db):
    return (
        db.query(SurveyTemplate)
        .filter(
            SurveyTemplate.is_active.is_(True),
            SurveyTemplate.content.isnot(None)
        )
        .order_by(SurveyTemplate.name)
        .all()
    )

def _get_default_category(db):
    return (
        db.query(OrderCategory)
        .filter(OrderCategory.is_active.is_(True))
        .order_by(OrderCategory.sort_order, OrderCategory.id)
        .first()
    )
