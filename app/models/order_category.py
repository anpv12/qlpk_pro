from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import relationship, backref, foreign
from sqlalchemy.sql import func

from app.core.database import Base


class OrderCategory(Base):
    __tablename__ = "order_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("order_categories.id"), nullable=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    parent = relationship(
        "OrderCategory",
        remote_side=[id],
        backref=backref(
            "children",
            cascade="all, delete-orphan",
            order_by="OrderCategory.sort_order",
        ),
    )
    orders = relationship(
        "OrderItem",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="OrderItem.sort_order",
    )

    def __repr__(self):
        return f"<OrderCategory {self.name}>"

    def to_dict(self, include_children=True, include_orders=True):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "parent_id": self.parent_id,
            "sort_order": self.sort_order,
            "is_active": self.is_active,
        }

        if include_children:
            data["children"] = [child.to_dict(True, include_orders) for child in self.children]

        if include_orders:
            data["orders"] = [order.to_dict() for order in self.orders if order.is_active]

        return data


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    performer = Column(String(255), nullable=True)
    is_in_house = Column(Boolean, default=True)
    group_order_item_id = Column(Integer, nullable=True)
    category_id = Column(Integer, ForeignKey("order_categories.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("OrderCategory", back_populates="orders")
    group_parent = relationship(
        "OrderItem",
        primaryjoin="foreign(OrderItem.group_order_item_id) == OrderItem.id",
        remote_side=[id],
        foreign_keys=[group_order_item_id],
        backref="group_children",
    )

    def __repr__(self):
        return f"<OrderItem {self.name}>"

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "description": self.description,
            "performer": self.performer,
            "is_in_house": self.is_in_house,
            "group_order_item_id": self.group_order_item_id,
            "group_parent_name": self.group_parent.name if self.group_parent else None,
            "category_id": self.category_id,
            "sort_order": self.sort_order,
            "is_active": self.is_active,
        }

