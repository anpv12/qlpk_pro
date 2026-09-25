import json
import logging
from datetime import datetime
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from sqlalchemy.orm import Session

from app.models.medicine_reference_catalog import MedicineReferenceCatalog

logger = logging.getLogger(__name__)

DAV_REFERENCE_URL = "https://dichvucong.dav.gov.vn/api/services/app/soDangKy/GetAllPublicServerPaging"
DAV_REFERER = "https://dichvucong.dav.gov.vn/congbothuoc/index"


class DavReferenceSyncError(Exception):
    pass


def _parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def fetch_dav_page(skip_count=0, max_result_count=1000, timeout=30):
    body = {
        "filterText": "",
        "SoDangKyThuoc": {},
        "KichHoat": True,
        "skipCount": skip_count,
        "maxResultCount": max_result_count,
        "sorting": None,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urlrequest.Request(
        DAV_REFERENCE_URL,
        data=data,
        method="POST",
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://dichvucong.dav.gov.vn",
            "Referer": DAV_REFERER,
            "X-Requested-With": "XMLHttpRequest",
        },
    )

    try:
        with urlrequest.urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            payload = json.loads(response.read().decode(charset, errors="replace"))
    except HTTPError as exc:
        raise DavReferenceSyncError(f"DAV trả HTTP {exc.code}") from exc
    except URLError as exc:
        raise DavReferenceSyncError(f"Không kết nối được DAV: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise DavReferenceSyncError("DAV trả dữ liệu không phải JSON hợp lệ") from exc

    if not payload.get("success", False):
        raise DavReferenceSyncError(f"DAV trả lỗi: {payload.get('error') or 'unknown error'}")

    result = payload.get("result") or {}
    return {
        "total_count": int(result.get("totalCount") or 0),
        "items": result.get("items") or [],
    }


def correct_verified_dav_identity(values):
    """Two verified upstream column swaps; preserve the original raw payload.

    Exidamin: dav.gov.vn/upload_images/files/718_QD_QLD%202024_signed.pdf
    Mebamrol: spm.com.vn/mebamrol (VD-28332-17).
    Match source ID, registration, name AND the known malformed values.
    New/unknown source changes must be reviewed, not heuristically swapped.
    """
    from app.modules.medicines.services.catalog_mapping import normalized
    fixes = {
        '16739': ('Exidamin', {'893110043900', 'VD-28330-17'}, '10mg',
                  'Escitalopram (dưới dạng Escitalopram oxalat)'),
        '16723': ('Mebamrol', {'893110045400', 'VD-28332-17'}, '100mg', 'Clozapin'),
    }
    fix = fixes.get(values.get('source_id')) if values.get('source') == 'DAV' else None
    if fix:
        name, registrations, quantity, ingredient = fix
        if (normalized(values.get('name')) == normalized(name)
                and values.get('registration_number') in registrations
                and normalized(values.get('active_ingredient')) == normalized(quantity)
                and normalized(values.get('strength')) == normalized(ingredient)):
            return dict(values, active_ingredient=values['strength'], strength=values['active_ingredient'])
    return values


def normalize_dav_item(item):
    from app.modules.medicines.services.reference_route import route_suggestion_fields
    basic = item.get("thongTinThuocCoBan") or {}
    registration = item.get("thongTinDangKyThuoc") or {}
    manufacturer = item.get("congTySanXuat") or {}
    registrant = item.get("congTyDangKy") or {}

    values = correct_verified_dav_identity({
        "source": "DAV",
        "source_id": str(item.get("id")) if item.get("id") is not None else None,
        "registration_number": item.get("soDangKy"),
        "old_registration_number": item.get("soDangKyCu"),
        "name": item.get("tenThuoc") or "Chưa có tên thuốc",
        "active_ingredient": basic.get("hoatChatChinh") or item.get("hoatChatChinh"),
        "strength": basic.get("hamLuong") or item.get("hamLuong"),
        "dosage_form": basic.get("dangBaoChe") or item.get("dangBaoChe"),
        "packaging": basic.get("dongGoi") or item.get("dongGoi"),
        "route": basic.get("tenDuongDung"),
        "standard": basic.get("tieuChuan") or item.get("tieuChuan"),
        "shelf_life": basic.get("tuoiTho") or item.get("tuoiTho"),
        "manufacturer_name": manufacturer.get("tenCongTySanXuat") or item.get("tenCongTySanXuat"),
        "manufacturer_country": manufacturer.get("nuocSanXuat") or item.get("nuocSanXuat"),
        "registrant_name": registrant.get("tenCongTyDangKy") or item.get("tenCongTyDangKy"),
        "registrant_country": registrant.get("nuocDangKy") or item.get("nuocDangKy"),
        "registration_issue_date": _parse_datetime(registration.get("ngayCapSoDangKy") or item.get("ngayCapSoDangKy")),
        "registration_expiry_date": _parse_datetime(registration.get("ngayHetHanSoDangKy")),
        "decision_number": registration.get("soQuyetDinh") or item.get("soQuyetDinh"),
        "approval_batch": registration.get("dotCap") or item.get("dotCap"),
        "is_active": bool(item.get("isActive", True)),
        "is_expired": bool(item.get("isHetHan", False)),
        "is_deleted": bool(item.get("isDeleted", False)),
        "dav_last_modified_at": _parse_datetime(item.get("lastModificationTime")),
        "raw_payload": item,
    })
    values.update(route_suggestion_fields(values['route'], values['dosage_form']))
    return values


def _find_existing(db: Session, normalized):
    source_id = normalized.get("source_id")
    if not source_id:
        return None

    return db.query(MedicineReferenceCatalog).filter(
        MedicineReferenceCatalog.source == "DAV",
        MedicineReferenceCatalog.source_id == source_id,
    ).order_by(MedicineReferenceCatalog.id.desc()).first()


def upsert_dav_item(db: Session, item):
    normalized = normalize_dav_item(item)
    if not normalized.get("source_id"):
        logger.warning("Skip DAV reference item without source id: %s", normalized.get("registration_number"))
        return "skipped"

    existing = _find_existing(db, normalized)
    if existing:
        for field, value in normalized.items():
            setattr(existing, field, value)
        return "updated"

    db.add(MedicineReferenceCatalog(**normalized))
    return "inserted"


def sync_dav_reference_catalog(db: Session, page_size=1000, timeout=30):
    page_size = max(1, min(int(page_size or 1000), 1000))

    skip_count = 0
    page_count = 0
    total_count = None
    inserted = 0
    updated = 0
    skipped = 0

    while True:
        page = fetch_dav_page(skip_count=skip_count, max_result_count=page_size, timeout=timeout)
        items = page["items"]
        total_count = page["total_count"]
        if not items:
            break

        for item in items:
            action = upsert_dav_item(db, item)
            if action == "inserted":
                inserted += 1
            elif action == "updated":
                updated += 1
            elif action == "skipped":
                skipped += 1

        page_count += 1
        skip_count += len(items)
        logger.info("Synced DAV reference page %s: %s/%s", page_count, skip_count, total_count)

        if skip_count >= total_count:
            break

    db.commit()
    return {
        "total_source": total_count or 0,
        "fetched": inserted + updated,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "pages": page_count,
        "page_size": page_size,
        "completed": total_count is not None and skip_count >= total_count,
    }
