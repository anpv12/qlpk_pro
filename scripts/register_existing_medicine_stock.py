#!/usr/bin/env python3
"""Register verified lots for existing inventory. Default: read-only validation.

Manifest: {"medicines": [{"medicine_id": ..., "expected_stock": ...,
"source_document": "...", "batches": [{"batch_number": "...",
"import_date": "YYYY-MM-DD", "expiry_date": "YYYY-MM-DD", "quantity": ...}]}]}.
No defaults are supplied for lot identity, dates or verified quantities.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.database import SessionLocal
from app.models.user import User
from app.modules.medicines.services.inventory_service import (
    InventoryValidationError, plan_existing_stock_batches, register_existing_stock_batches,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--actor-id', type=int)
    parser.add_argument('--backup', type=Path, help='New JSON file retaining the verified before/after plan')
    args = parser.parse_args()
    entries = json.loads(args.manifest.read_text())['medicines']
    if not isinstance(entries, list) or not entries:
        parser.error('Manifest cần ít nhất một thuốc')
    ids = [entry['medicine_id'] for entry in entries]
    if any(type(item) is not int or item <= 0 for item in ids) or len(ids) != len(set(ids)):
        parser.error('medicine_id phải hợp lệ và không được lặp; gộp các lô vào cùng một thuốc')
    if args.apply and (not args.actor_id or not args.backup):
        parser.error('--apply cần --actor-id và --backup')
    plans = []
    with SessionLocal() as db, db.begin():
        if not args.apply:
            db.execute(text('SET TRANSACTION READ ONLY'))
        else:
            actor = db.query(User).filter_by(id=args.actor_id, role='admin').first()
            if not actor:
                parser.error('Tài khoản ghi hiệu chỉnh phải là quản trị viên hiện hữu')
        # Validate every medicine before writing any allocation; same lock order as dispensing.
        for entry in sorted(entries, key=lambda item: item['medicine_id']):
            medicine, prepared = plan_existing_stock_batches(db, **entry, lock=args.apply)
            plans.append({'medicine_id': medicine.id, 'name': medicine.name,
                          'before_stock': str(medicine.stock_quantity), 'after_stock': str(medicine.stock_quantity),
                          'before_batches': [], 'verified_batches': prepared,
                          'source_document': entry['source_document']})
        if args.apply:
            with args.backup.open('x', encoding='utf-8') as handle:
                json.dump({'actor_id': args.actor_id, 'plans': plans}, handle, ensure_ascii=False, indent=2, default=str)
            for entry in sorted(entries, key=lambda item: item['medicine_id']):
                register_existing_stock_batches(db, **entry, created_by=args.actor_id)
            db.flush()
    print(json.dumps({'applied': args.apply, 'plans': plans}, ensure_ascii=False, indent=2, default=str))


if __name__ == '__main__':
    try:
        main()
    except (InventoryValidationError, KeyError, TypeError, ValueError, FileExistsError) as error:
        raise SystemExit(str(error))
