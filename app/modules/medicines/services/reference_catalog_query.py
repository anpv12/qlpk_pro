from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.medicine_reference_catalog import MedicineReferenceCatalog
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
                normalized_contains(MedicineReferenceCatalog.manufacturer_name, search),
            )
        )

    return query


def list_reference_catalog(db: Session, search=None, page=1, per_page=20, status="active"):
    page = _normalize_page(page, default=1, minimum=1)
    per_page = _normalize_page(per_page, default=20, minimum=1, maximum=100)

    query = build_reference_catalog_query(db, search=search, status=status)
    total = query.count()
    items = (
        query
        .order_by(MedicineReferenceCatalog.name.asc(), MedicineReferenceCatalog.registration_number.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "items": [item.to_dict() for item in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
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
    data = item.to_dict()
    data["raw_payload"] = item.raw_payload or {}
    return data
