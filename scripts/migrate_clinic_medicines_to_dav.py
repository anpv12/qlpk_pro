#!/usr/bin/env python3
"""Apply an explicitly reviewed DAV mapping manifest; default is read-only.

Every entry pins full medicine/reference fingerprints and includes evidence.
No fuzzy matching, merging, stock correction or source-catalog rewriting.
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.database import SessionLocal
from app.models.medicine import Medicine
from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from app.models.user import User, UserRole
from app.modules.medicines.services.catalog_service import (
    CatalogValidationError, reference_preview, selectable_reference, write_clinic_medicine,
)

CHANGED_COLUMNS = {'reference_catalog_id', 'reference_snapshot', 'name', 'generic_name',
                   'strength', 'origin', 'category_type', 'administration_method', 'is_imported', 'updated_at'}
DEPENDENTS = ('medicine_batches', 'medicine_transactions', 'prescription_items')


def serialize(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def fingerprint(value):
    return hashlib.sha256(serialize(value).encode()).hexdigest()


def row_snapshot(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def database_identity(db):
    return dict(db.execute(text('SELECT current_database() AS database, '
                               'inet_server_addr()::text AS host, inet_server_port() AS port')).mappings().one())


def related_fingerprints(db, medicine_ids):
    result = {}
    for table in DEPENDENTS:
        rows = db.execute(text(f'SELECT row_to_json(t) FROM {table} t '
                               'WHERE medicine_id = ANY(:ids) ORDER BY id'), {'ids': medicine_ids}).scalars().all()
        result[table] = {'rows': len(rows), 'sha256': fingerprint(rows)}
    return result


def prepare(db, manifest, *, lock=False):
    if database_identity(db) != manifest.get('database'):
        raise ValueError('Manifest không thuộc cơ sở dữ liệu hiện tại.')
    entries = manifest.get('medicines')
    if not isinstance(entries, list) or not entries:
        raise ValueError('Manifest cần danh sách thuốc đã đối chiếu.')
    for key in ('medicine_id', 'reference_catalog_id'):
        ids = [entry.get(key) for entry in entries]
        if any(type(value) is not int or value <= 0 for value in ids) or len(ids) != len(set(ids)):
            raise ValueError(f'{key} phải hợp lệ, duy nhất; không gộp thuốc.')
    plans = []
    for entry in sorted(entries, key=lambda item: item['medicine_id']):
        if not str(entry.get('evidence', '')).strip():
            raise ValueError('Mỗi thuốc cần căn cứ đối chiếu.')
        medicine_query = db.query(Medicine).filter_by(id=entry['medicine_id']).populate_existing()
        medicine = (medicine_query.with_for_update() if lock else medicine_query).one()
        reference_query = db.query(MedicineReferenceCatalog).filter_by(id=entry['reference_catalog_id']).populate_existing()
        reference = (reference_query.with_for_update() if lock else reference_query).one()
        before = row_snapshot(medicine)
        if fingerprint(before) != entry.get('medicine_sha256') or fingerprint(row_snapshot(reference)) != entry.get('reference_sha256'):
            raise ValueError(f'Thuốc {medicine.id}: dữ liệu đã thay đổi; phải đối chiếu lại.')
        if medicine.reference_catalog_id is not None:
            raise ValueError(f'Thuốc {medicine.id} đã liên kết; không tự thay nguồn.')
        if not medicine.internal_code:
            raise ValueError(f'Thuốc {medicine.id} thiếu mã nội bộ; không tự sinh mã trong migration.')
        if not selectable_reference(reference):
            raise ValueError(f'Thuốc {medicine.id}: nguồn DAV không còn hợp lệ.')
        if db.query(Medicine.id).filter_by(reference_catalog_id=reference.id).first():
            raise ValueError(f'Nguồn DAV {reference.id} đã thuộc thuốc khác.')
        preview = reference_preview(medicine, reference)
        if not preview['can_apply']:
            raise ValueError(f'Thuốc {medicine.id}: {preview["message"]}')
        registration = entry.get('registration_number')
        if not registration or registration not in (reference.registration_number, reference.old_registration_number):
            raise ValueError(f'Thuốc {medicine.id}: số đăng ký không khớp nguồn đã chốt.')
        payload = {'reference_catalog_id': reference.id, 'reference_link_confirmed': True,
                   'reference_registration_number': registration,
                   'reference_version': reference.updated_at.isoformat() if reference.updated_at else None,
                   'reference_medicine_version': preview['medicine_version']}
        plans.append((medicine, before, payload, entry['evidence']))
    return plans


def apply_plans(db, plans, actor_id):
    actor = db.get(User, actor_id)
    if not actor or not actor.is_active or actor.role != UserRole.ADMIN:
        raise ValueError('Migration cần tài khoản quản trị hiện hữu.')
    ids = [medicine.id for medicine, *_ in plans]
    related_before = related_fingerprints(db, ids)
    changes = []
    for medicine, before, payload, evidence in plans:
        write_clinic_medicine(db, payload, actor_id, medicine, allow_reference_mapping=True)
        after = row_snapshot(medicine)
        if any(before[key] != after[key] for key in before if key not in CHANGED_COLUMNS):
            raise ValueError(f'Thuốc {medicine.id}: có thay đổi ngoài thông tin nguồn, hủy migration.')
        changes.append({'medicine_id': medicine.id, 'before': before, 'after': after, 'evidence': evidence})
    if related_fingerprints(db, ids) != related_before:
        raise ValueError('Lô, giao dịch hoặc đơn thuốc thay đổi; hủy migration.')
    return {'changes': changes, 'preserved_dependents': related_before}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--actor-id', type=int)
    parser.add_argument('--database-backup', type=Path)
    parser.add_argument('--journal', type=Path, help='New private before/after JSON journal')
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if args.apply:
        if not args.actor_id or not args.database_backup or not args.journal:
            parser.error('--apply cần --actor-id, --database-backup và --journal')
        with args.database_backup.open('rb') as handle:
            if handle.read(5) != b'PGDMP' or args.database_backup.stat().st_size < 1024:
                parser.error('Backup phải là PostgreSQL custom dump đã kiểm tra.')
    with SessionLocal() as db:
        with db.begin():
            db.execute(text("SET LOCAL lock_timeout = '5s'"))
            if args.apply:
                db.execute(text('SELECT pg_advisory_xact_lock(20260914, 1)'))
            else:
                db.execute(text('SET TRANSACTION READ ONLY'))
            plans = prepare(db, manifest, lock=args.apply)
            if args.apply:
                report = apply_plans(db, plans, args.actor_id)
                report.update(database=database_identity(db), actor_id=args.actor_id,
                              manifest_sha256=fingerprint(manifest), backup=str(args.database_backup),
                              status='prepared_before_commit')
                # Keep a durable journal before commit; its status is not proof of commit.
                fd = os.open(args.journal, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, 'w') as handle:
                    handle.write(serialize(report)); handle.flush(); os.fsync(handle.fileno())
            summary = [{'medicine_id': medicine.id, 'reference_catalog_id': payload['reference_catalog_id'],
                        'name': before['name'], 'evidence': evidence} for medicine, before, payload, evidence in plans]
        print(serialize({'applied': args.apply, 'count': len(plans), 'medicines': summary}))


if __name__ == '__main__':
    main()
