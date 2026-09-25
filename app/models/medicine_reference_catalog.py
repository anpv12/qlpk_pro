from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base
from app.utils.search_normalization import normalized_text_expression


class MedicineReferenceCatalog(Base):
    __tablename__ = "medicine_reference_catalog"
    __table_args__ = (
        UniqueConstraint('source', 'source_id', name='uq_medicine_reference_source'),
        Index('idx_dav_name_order', 'name', 'registration_number', 'id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50), nullable=False, default="DAV")
    source_id = Column(String(100), nullable=True)

    registration_number = Column(String(100), nullable=True)
    old_registration_number = Column(String(100), nullable=True)

    name = Column(String(500), nullable=False)
    active_ingredient = Column(Text, nullable=True)
    strength = Column(Text, nullable=True)
    dosage_form = Column(Text, nullable=True)
    packaging = Column(Text, nullable=True)
    route = Column(Text, nullable=True)
    suggested_route = Column(Text, nullable=True)
    suggested_route_rule_version = Column(String(32), nullable=True)
    standard = Column(Text, nullable=True)
    shelf_life = Column(Text, nullable=True)

    manufacturer_name = Column(String(500), nullable=True)
    manufacturer_country = Column(String(255), nullable=True)
    registrant_name = Column(String(500), nullable=True)
    registrant_country = Column(String(255), nullable=True)

    registration_issue_date = Column(DateTime(timezone=True), nullable=True)
    registration_expiry_date = Column(DateTime(timezone=True), nullable=True)
    decision_number = Column(String(255), nullable=True)
    approval_batch = Column(String(255), nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    is_expired = Column(Boolean, nullable=False, default=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    dav_last_modified_at = Column(DateTime(timezone=True), nullable=True)

    raw_payload = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    @property
    def is_registration_withdrawn(self):
        payload = self.raw_payload or {}
        return bool(payload.get("isDaRutSoDangKy")) if isinstance(payload, dict) else False

    def to_dict(self):
        return {
            "id": self.id,
            "source": self.source,
            "source_id": self.source_id,
            "registration_number": self.registration_number,
            "old_registration_number": self.old_registration_number,
            "name": self.name,
            "active_ingredient": self.active_ingredient,
            "strength": self.strength,
            "dosage_form": self.dosage_form,
            "packaging": self.packaging,
            "route": self.route,
            "suggested_route": None if str(self.route or '').strip() else self.suggested_route,
            "standard": self.standard,
            "shelf_life": self.shelf_life,
            "manufacturer_name": self.manufacturer_name,
            "manufacturer_country": self.manufacturer_country,
            "registrant_name": self.registrant_name,
            "registrant_country": self.registrant_country,
            "registration_issue_date": self.registration_issue_date.isoformat() if self.registration_issue_date else None,
            "registration_expiry_date": self.registration_expiry_date.isoformat() if self.registration_expiry_date else None,
            "decision_number": self.decision_number,
            "approval_batch": self.approval_batch,
            "is_active": self.is_active,
            "is_expired": self.is_expired,
            "is_deleted": self.is_deleted,
            "is_registration_withdrawn": self.is_registration_withdrawn,
            "dav_last_modified_at": self.dav_last_modified_at.isoformat() if self.dav_last_modified_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


for _field in ('name', 'active_ingredient', 'registration_number',
               'old_registration_number', 'source_id', 'manufacturer_name'):
    Index(
        f'idx_dav_norm_{_field}_trgm',
        normalized_text_expression(getattr(MedicineReferenceCatalog, _field)).label('normalized_value'),
        postgresql_using='gin',
        postgresql_ops={'normalized_value': 'gin_trgm_ops'},
    )
