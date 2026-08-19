"""Mutation services for order catalog setup."""

from sqlalchemy.orm import selectinload

from app.models.order_category import OrderCategory, OrderItem

class RequiredName(Exception):
    """Raised when a category or order item name is missing."""

class CategoryNotFound(Exception):
    """Raised when an order category is missing."""

class ParentCategoryNotFound(Exception):
    """Raised when a parent category is missing."""

class CategoryParentLoop(Exception):
    """Raised when a category parent would create a loop."""

class CategoryHasChildren(Exception):
    """Raised when deleting a category that still has children."""

class CategoryHasOrders(Exception):
    """Raised when deleting a category that still has order items."""

class OrderItemNotFound(Exception):
    """Raised when an order item is missing."""

class OrderItemHasChildren(Exception):
    """Raised when deleting an order item that is still a group parent."""

class DefaultCategoryMissing(Exception):
    """Raised when an order item needs a default category but none exists."""

def create_order_category_record(db, data):
    name = (data.get("name") or "").strip()
    if not name:
        raise RequiredName()

    parent_id = data.get("parent_id")
    parent = validate_parent(db, parent_id)
    if parent_id and not parent:
        raise ParentCategoryNotFound()

    category = OrderCategory(
        name=name,
        description=data.get("description"),
        parent_id=parent_id,
        sort_order=parse_sort_order(data.get("sort_order")),
        is_active=bool(data.get("is_active", True)),
    )
    db.add(category)
    return category

def update_order_category_record(db, category_id, data):
    name = (data.get("name") or "").strip()
    if not name:
        raise RequiredName()

    category = db.query(OrderCategory).get(category_id)
    if not category:
        raise CategoryNotFound()

    parent_id = data.get("parent_id")
    parent = validate_parent(db, parent_id)
    if parent_id and not parent:
        raise ParentCategoryNotFound()

    if parent_id:
        current = parent
        while current:
            if current.id == category.id:
                raise CategoryParentLoop()
            current = current.parent

    category.name = name
    category.description = data.get("description")
    category.parent_id = parent_id
    category.sort_order = parse_sort_order(data.get("sort_order"))
    category.is_active = bool(data.get("is_active", True))
    return category

def delete_order_category_record(db, category_id):
    category = (
        db.query(OrderCategory)
        .options(selectinload(OrderCategory.children), selectinload(OrderCategory.orders))
        .get(category_id)
    )
    if not category:
        raise CategoryNotFound()
    if category.children:
        raise CategoryHasChildren()
    if category.orders:
        raise CategoryHasOrders()
    db.delete(category)

def create_order_item_record(db, data):
    name = (data.get("name") or "").strip()
    if not name:
        raise RequiredName()

    group_parent = validate_group_parent(db, None, data.get("group_order_item_id"))

    category_id = None
    if group_parent and category_id is None:
        category_id = group_parent.category_id

    if category_id is None:
        default_category = get_default_category(db)
        if not default_category:
            raise DefaultCategoryMissing()
        category_id = default_category.id

    category = db.query(OrderCategory).get(category_id)
    if not category:
        raise CategoryNotFound()

    item = OrderItem(
        code=(data.get("code") or "").strip() or None,
        name=name,
        description=data.get("description"),
        performer=(data.get("performer") or "").strip() or None,
        is_in_house=bool(data.get("is_in_house", True)),
        group_order_item_id=group_parent.id if group_parent else None,
        category_id=category_id,
        sort_order=parse_sort_order(data.get("sort_order")),
        is_active=bool(data.get("is_active", True)),
    )
    db.add(item)
    return item

def update_order_item_record(db, item_id, data):
    name = (data.get("name") or "").strip()
    if not name:
        raise RequiredName()

    item = (
        db.query(OrderItem)
        .options(
            selectinload(OrderItem.category),
            selectinload(OrderItem.group_parent),
            selectinload(OrderItem.group_children),
        )
        .get(item_id)
    )
    if not item:
        raise OrderItemNotFound()

    group_parent = validate_group_parent(
        db,
        None,
        data.get("group_order_item_id"),
        current_item=item,
    )

    if group_parent:
        item.group_order_item_id = group_parent.id
        item.category_id = group_parent.category_id
    else:
        item.group_order_item_id = None
        if item.category_id is None:
            default_category = get_default_category(db)
            if not default_category:
                raise DefaultCategoryMissing()
            item.category_id = default_category.id

    item.code = (data.get("code") or "").strip() or None
    item.name = name
    item.description = data.get("description")
    item.performer = (data.get("performer") or "").strip() or None
    item.is_in_house = bool(data.get("is_in_house", True))
    item.sort_order = parse_sort_order(data.get("sort_order"))
    item.is_active = bool(data.get("is_active", True))
    return item

def delete_order_item_record(db, item_id):
    item = (
        db.query(OrderItem)
        .options(selectinload(OrderItem.group_children))
        .get(item_id)
    )
    if not item:
        raise OrderItemNotFound()
    if item.group_children:
        raise OrderItemHasChildren()
    db.delete(item)

def validate_parent(db, parent_id):
    if parent_id is None:
        return None
    parent = db.query(OrderCategory).get(parent_id)
    if not parent:
        return None
    return parent

def validate_group_parent(db, category_id, parent_id, current_item=None):
    if parent_id in (None, "", "null"):
        return None

    try:
        parent_id = int(parent_id)
    except (TypeError, ValueError):
        raise ValueError("Nhóm chỉ định không hợp lệ")

    parent = (
        db.query(OrderItem)
        .options(selectinload(OrderItem.group_parent))
        .get(parent_id)
    )

    if not parent:
        raise ValueError("Nhóm chỉ định không tồn tại")

    if category_id and parent.category_id != category_id:
        raise ValueError("Nhóm chỉ định phải thuộc cùng danh mục")

    if current_item and parent.id == current_item.id:
        raise ValueError("Không thể chọn chính nó làm nhóm")

    seen = set()
    cursor = parent
    while cursor:
        cursor_id = getattr(cursor, "id", None)
        if cursor_id in seen:
            break
        if current_item and cursor_id == current_item.id:
            raise ValueError("Nhóm chỉ định gây vòng lặp")
        seen.add(cursor_id)
        cursor = cursor.group_parent

    return parent

def parse_sort_order(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

def get_default_category(db):
    return (
        db.query(OrderCategory)
        .filter(OrderCategory.is_active.is_(True))
        .order_by(OrderCategory.sort_order, OrderCategory.id)
        .first()
    )
