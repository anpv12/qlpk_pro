"""Preview/apply derived DAV routes; never change source or clinic fields."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.database import SessionLocal
from app.modules.medicines.services.reference_route import ROUTE_RULE_VERSION, route_suggestion_fields


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def prepare(db):
    rows = [dict(row) for row in db.execute(text(
        "SELECT id, source, route, dosage_form, suggested_route, suggested_route_rule_version "
        "FROM medicine_reference_catalog WHERE source='DAV' ORDER BY id"
    )).mappings()]
    changes = []
    eligible = 0
    for row in rows:
        desired = route_suggestion_fields(row['route'], row['dosage_form'])
        eligible += desired['suggested_route'] is not None
        before = {key: row[key] for key in desired}
        if before != desired:
            changes.append({'id': row['id'], 'dosage_form': row['dosage_form'],
                            'source_route': row['route'], 'before': before, 'after': desired})
    identity = dict(db.execute(text(
        'SELECT current_database() AS database, inet_server_addr()::text AS host, inet_server_port() AS port'
    )).mappings().one())
    return {'database': identity, 'rule_version': ROUTE_RULE_VERSION,
            'fingerprint': fingerprint({'database': identity, 'rows': rows, 'changes': changes,
                                        'rule_version': ROUTE_RULE_VERSION}),
            'total': len(rows), 'eligible': eligible, 'updates': len(changes), 'changes': changes}


def protected_snapshot(db):
    result = {}
    for table in ('medicine_reference_catalog', 'medicines', 'medicine_batches',
                  'medicine_transactions', 'prescription_items'):
        expression = "to_jsonb(t) - 'suggested_route' - 'suggested_route_rule_version'" if table == 'medicine_reference_catalog' else 'to_jsonb(t)'
        result[table] = dict(db.execute(text(
            f"SELECT count(*) AS rows, md5(string_agg(md5(({expression})::text), '' ORDER BY id)) AS digest FROM {table} t"
        )).mappings().one())
    return result


def apply(db, *, expected_fingerprint, expected_updates):
    # Prevent a DAV sync or another backfill from changing the reviewed plan.
    # Readers remain unblocked, and the caller owns commit/rollback.
    db.execute(text("SET LOCAL lock_timeout = '5s'"))
    db.execute(text('LOCK TABLE medicine_reference_catalog IN SHARE ROW EXCLUSIVE MODE'))
    plan = prepare(db)
    if plan['fingerprint'] != expected_fingerprint or plan['updates'] != expected_updates:
        raise ValueError('Dữ liệu/quy tắc đã thay đổi; chạy lại preview trước khi ghi.')
    protected = protected_snapshot(db)
    if plan['changes']:
        result = db.execute(text(
            'UPDATE medicine_reference_catalog SET suggested_route=:suggested_route, '
            'suggested_route_rule_version=:suggested_route_rule_version WHERE id=:id'
        ), [dict(id=row['id'], **row['after']) for row in plan['changes']])
        if result.rowcount != expected_updates:
            raise ValueError('Số dòng cập nhật không khớp kế hoạch.')
    if protected_snapshot(db) != protected:
        raise ValueError('Dữ liệu ngoài phạm vi thay đổi; hủy giao dịch.')
    after = prepare(db)
    if after['updates'] != 0 or after['eligible'] != plan['eligible']:
        raise ValueError('Kết quả lưu không khớp quy tắc.')
    return dict(plan, protected=protected, after_fingerprint=after['fingerprint'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-fingerprint')
    parser.add_argument('--expected-updates', type=int)
    parser.add_argument('--database-backup', type=Path)
    parser.add_argument('--journal', type=Path)
    args = parser.parse_args()
    if not args.apply:
        with SessionLocal() as db:
            db.execute(text('SET TRANSACTION READ ONLY'))
            print(json.dumps({k: v for k, v in prepare(db).items() if k != 'changes'}, ensure_ascii=False))
        return
    if not args.expected_fingerprint or args.expected_updates is None or not args.database_backup or not args.journal:
        parser.error('--apply cần fingerprint, số dòng dự kiến, bản sao lưu và journal mới.')
    with args.database_backup.open('rb') as backup:
        if backup.read(5) != b'PGDMP' or args.database_backup.stat().st_size < 1024:
            parser.error('Bản sao lưu phải là PostgreSQL custom dump đã kiểm tra.')
    # Reserve the journal before mutating. A failed commit is recorded as such;
    # a process interruption leaves "prepared" for read-only reconciliation.
    fd = args.journal.open('x')
    args.journal.chmod(0o600)
    with fd, SessionLocal() as db:
        report = {'status': 'started', 'backup': str(args.database_backup),
                  'started_at': datetime.now(timezone.utc).isoformat()}
        def write_report():
            fd.seek(0)
            json.dump(report, fd, ensure_ascii=False, indent=2, default=str)
            fd.truncate()
            fd.flush()
            import os
            os.fsync(fd.fileno())
        try:
            report.update(apply(db, expected_fingerprint=args.expected_fingerprint,
                                expected_updates=args.expected_updates), status='prepared')
            write_report()
            db.commit()
        except Exception:
            db.rollback()
            report['status'] = 'not_confirmed'
            write_report()
            raise
        report['status'] = 'committed'
        write_report()
    with SessionLocal() as db:
        db.execute(text('SET TRANSACTION READ ONLY'))
        after = prepare(db)
        verified = (after['fingerprint'] == report['after_fingerprint']
                    and after['updates'] == 0 and protected_snapshot(db) == report['protected'])
    if not verified:
        raise RuntimeError('Đã commit nhưng hậu kiểm chưa khớp; kiểm tra journal, không tự chạy lại.')
    with args.journal.open('w') as handle:
        report['status'] = 'verified'
        json.dump(report, handle, ensure_ascii=False, indent=2, default=str)
    print(json.dumps({'status': report['status'], 'total': report['total'],
                      'stored': report['eligible'], 'updated': report['updates'],
                      'journal': str(args.journal)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
