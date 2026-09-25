from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from app.models.medicine import Medicine
from app.utils.search_normalization import normalized_contains


def _not_withdrawn_registration_filter():
    withdrawn = MedicineReferenceCatalog.raw_payload["isDaRutSoDangKy"].as_boolean()
    return or_(withdrawn.is_(False), withdrawn.is_(None))


def _withdrawn_registration_filter():
    return MedicineReferenceCatalog.raw_payload["isDaRutSoDangKy"].as_boolean().is_(True)


def _normalize_page(value, default=1, minimum=1, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def build_reference_catalog_query(db: Session, search=None, status="active"):
    query = db.query(MedicineReferenceCatalog)

    if status == "active":
        query = query.filter(
            MedicineReferenceCatalog.is_active.is_(True),
            MedicineReferenceCatalog.is_expired.is_(False),
            MedicineReferenceCatalog.is_deleted.is_(False),
            _not_withdrawn_registration_filter(),
        )
    elif status == "expired":
        query = query.filter(MedicineReferenceCatalog.is_expired.is_(True))
    elif status == "withdrawn":
        query = query.filter(_withdrawn_registration_filter())
    elif status == "deleted":
        query = query.filter(MedicineReferenceCatalog.is_deleted.is_(True))
    elif status == "all":
        pass
    else:
        query = query.filter(
            MedicineReferenceCatalog.is_active.is_(True),
            MedicineReferenceCatalog.is_expired.is_(False),
            MedicineReferenceCatalog.is_deleted.is_(False),
            _not_withdrawn_registration_filter(),
        )

    if search:
        query = query.filter(
            or_(
                normalized_contains(MedicineReferenceCatalog.name, search),
                normalized_contains(MedicineReferenceCatalog.active_ingredient, search),
                normalized_contains(MedicineReferenceCatalog.registration_number, search),
                normalized_contains(MedicineReferenceCatalog.old_registration_number, search),
                normalized_contains(MedicineReferenceCatalog.source_id, search),
                normalized_contains(MedicineReferenceCatalog.manufacturer_name, search),
            )
        )

    return query


def list_reference_catalog(db: Session, search=None, page=1, per_page=20, status="active", autocomplete=False,
                           registration_number=None, clinic_medicine_id=None):
    from app.modules.medicines.services.catalog_mapping import clinic_defaults
    page = _normalize_page(page, default=1, minimum=1)
    per_page = _normalize_page(per_page, default=20, minimum=1, maximum=100)

    query = build_reference_catalog_query(db, search=search, status=status)
    if registration_number is not None:
        registration = str(registration_number).strip().upper()
        query = query.filter(or_(func.upper(func.trim(MedicineReferenceCatalog.registration_number)) == registration,
                                 func.upper(func.trim(MedicineReferenceCatalog.old_registration_number)) == registration))
    medicine = db.get(Medicine, clinic_medicine_id) if clinic_medicine_id else None
    if clinic_medicine_id and not medicine:
        raise ValueError('Không tìm thấy thuốc trong kho.')
    total = None if autocomplete else query.count()
    if autocomplete:
        # Keep the lookup bounded: no aggregate scans or wide DAV raw payload.
        fields = ('id', 'source_id', 'name', 'active_ingredient', 'strength',
                  'manufacturer_name', 'manufacturer_country', 'registration_number', 'old_registration_number',
                  'dosage_form', 'packaging', 'route', 'suggested_route', 'updated_at')
        query = query.with_entities(*(getattr(MedicineReferenceCatalog, field) for field in fields))
    items = (
        query
        .order_by(MedicineReferenceCatalog.name.asc(), MedicineReferenceCatalog.registration_number.asc(), MedicineReferenceCatalog.id.asc())
        .offset((page - 1) * per_page)
        .limit(per_page + 1 if autocomplete else per_page)
        .all()
    )

    has_more = len(items) > per_page if autocomplete else page * per_page < total
    items = items[:per_page]
    linked = dict(db.query(Medicine.reference_catalog_id, Medicine.id).filter(Medicine.reference_catalog_id.in_([item.id for item in items])).all()) if items else {}
    serialized = []
    for item in items:
        data = dict(item._mapping) if autocomplete else item.to_dict()
        if autocomplete:
            data['updated_at'] = item.updated_at.isoformat() if item.updated_at else None
            if str(item.route or '').strip():
                data['suggested_route'] = None
        data.update(clinic_medicine_id=linked.get(item.id), clinic_defaults=clinic_defaults(item))
        if medicine:
            from app.modules.medicines.services.catalog_service import reference_preview
            data['reference_preview'] = reference_preview(medicine, item)
        serialized.append(data)
    return {
        "items": serialized,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": None if autocomplete else (total + per_page - 1) // per_page,
        "has_more": has_more,
    }


def get_reference_catalog_summary(db: Session):
    total = db.query(MedicineReferenceCatalog).count()
    active = db.query(MedicineReferenceCatalog).filter(
        MedicineReferenceCatalog.is_active.is_(True),
        MedicineReferenceCatalog.is_expired.is_(False),
        MedicineReferenceCatalog.is_deleted.is_(False),
        _not_withdrawn_registration_filter(),
    ).count()
    expired = db.query(MedicineReferenceCatalog).filter(MedicineReferenceCatalog.is_expired.is_(True)).count()
    withdrawn = db.query(MedicineReferenceCatalog).filter(_withdrawn_registration_filter()).count()
    deleted = db.query(MedicineReferenceCatalog).filter(MedicineReferenceCatalog.is_deleted.is_(True)).count()

    return {
        "total": total,
        "active": active,
        "expired": expired,
        "withdrawn": withdrawn,
        "deleted": deleted,
    }


def get_reference_catalog_detail(db: Session, catalog_id: int):
    item = db.query(MedicineReferenceCatalog).filter(MedicineReferenceCatalog.id == catalog_id).first()
    if not item:
        return None
    return item.to_dict()
