"""Order catalog serializers."""

def serialize_category(category, include_inactive=False):
    children = category.children or []
    orders = category.orders or []

    if not include_inactive:
        children = [child for child in children if child.is_active]
        orders = [order for order in orders if order.is_active]

    children = sorted(children, key=lambda c: (c.sort_order or 0, c.name.lower()))
    order_payload = [serialize_order_item(order) for order in orders]
    orders_tree = build_order_tree(order_payload)

    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "parent_id": category.parent_id,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "children": [serialize_category(child, include_inactive) for child in children],
        "orders": orders_tree,
    }

def serialize_order_item(order):
    group_context = build_group_context(order)
    return {
        "id": order.id,
        "code": order.code,
        "name": order.name,
        "description": order.description,
        "performer": order.performer,
        "is_in_house": order.is_in_house,
        "group_order_item_id": order.group_order_item_id,
        "group_parent_name": group_context["parent_name"],
        "group_level": group_context["level"],
        "group_path": group_context["path"],
        "category_id": order.category_id,
        "category_name": order.category.name if order.category else None,
        "sort_order": order.sort_order,
        "is_active": order.is_active,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
    }

def serialize_category_row(category, include_inactive=False):
    children = category.children or []
    orders = category.orders or []

    if not include_inactive:
        children = [child for child in children if child.is_active]
        orders = [order for order in orders if order.is_active]

    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "parent_id": category.parent_id,
        "parent_name": category.parent.name if category.parent else None,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "child_count": len(children),
        "order_count": len(orders),
        "created_at": category.created_at.isoformat() if category.created_at else None,
        "updated_at": category.updated_at.isoformat() if category.updated_at else None,
    }

def serialize_survey_template_for_order(template):
    question_count = 0
    if template.content:
        content = template.content
        if isinstance(content, dict):
            questions = content.get('questions', [])
            question_count = len(questions)

    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "question_count": question_count,
        "service_id": template.service_id,
        "service_name": template.service.name if template.service else None,
        "pricing_type": template.pricing_type,
        "price_per_minute": float(template.price_per_minute) if template.price_per_minute else None,
        "min_price": float(template.min_price) if template.min_price else None,
        "max_price": float(template.max_price) if template.max_price else None,
        "is_survey": True,
    }

def build_group_context(order):
    chain = []
    current = order
    seen = set()

    while current:
        current_id = getattr(current, "id", None)
        if current_id and current_id in seen:
            break
        if current_id:
            seen.add(current_id)
        chain.append(current.name or "")
        current = current.group_parent

    chain = list(reversed([name for name in chain if name]))
    if not chain and order.name:
        chain = [order.name]

    group_level = max(len(chain) - 1, 0)
    parent_name = chain[-2] if len(chain) >= 2 else None
    path_parts = chain[:]

    return {
        "path": " › ".join(path_parts),
        "level": group_level,
        "parent_name": parent_name,
    }

def build_order_tree(order_items):
    nodes = {item["id"]: {**item, "children": []} for item in order_items}
    roots = []

    for node in nodes.values():
        parent_id = node.get("group_order_item_id")
        if parent_id and parent_id in nodes:
            nodes[parent_id]["children"].append(node)
        else:
            roots.append(node)

    def sort_nodes(items):
        items.sort(key=lambda x: ((x.get("sort_order") or 0), (x.get("name") or "").lower()))
        for child in items:
            if child["children"]:
                sort_nodes(child["children"])

    sort_nodes(roots)
    return roots
