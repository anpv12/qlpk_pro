#!/usr/bin/env python3
"""Read-only inventory audit; never infer lot numbers, expiry dates or balances.

Run with --output-dir to retain a dated JSON/CSV report for reconciliation.
This is deliberately not a stock importer: registering existing stock as a
new import would add that stock twice.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.database import engine


def classify_stock(stock, batches, today):
    stock = Decimal(str(stock or 0))
    total = sum((Decimal(str(b['remaining_quantity'])) for b in batches), Decimal(0))
    valid = sum((Decimal(str(b['remaining_quantity'])) for b in batches
                 if b['expiry_date'] and b['expiry_date'] >= today
                 and Decimal(str(b['remaining_quantity'])) > 0), Decimal(0))
    cases = []
    if stock < 0 or any(Decimal(str(b['remaining_quantity'])) < 0 for b in batches):
        cases.append('negative_balance')
    if stock > 0 and not batches:
        cases.append('missing_batches')
    if batches and stock != total:
        cases.append('aggregate_batch_mismatch')
    if stock > 0 and batches and valid == 0:
        cases.append('no_valid_batch_stock')
    if any(not b['expiry_date'] or not (b['batch_number'] or '').strip() for b in batches):
        cases.append('missing_batch_identity')
    if any('import_price' in b and b['import_price'] is None and Decimal(str(b['remaining_quantity'])) > 0 for b in batches):
        cases.append('missing_import_cost')
    if any(b.get('import_price') == 0 and Decimal(str(b['remaining_quantity'])) > 0 for b in batches):
        cases.append('zero_import_cost_review')
    if any((b['batch_number'] or '').startswith('SEED-LOCAL-') for b in batches):
        cases.append('synthetic_batch')
    return {
        'cases': cases, 'batch_count': len(batches),
        'aggregate_stock': stock, 'batch_stock': total,
        'valid_batch_stock': valid, 'available_to_dispense': max(Decimal(0), min(stock, valid)),
        'aggregate_minus_batches': stock - total,
    }


def read_audit():
    with engine.connect() as conn, conn.begin():
        conn.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
        clock = conn.execute(text('SELECT current_date AS today, now() AS checked_at')).mappings().one()
        medicines = conn.execute(text('''
            SELECT id, internal_code, name, unit, stock_quantity, expiry_date
            FROM medicines ORDER BY id
        ''')).mappings().all()
        batches = defaultdict(list)
        for batch in conn.execute(text('''
            SELECT id, medicine_id, batch_number, import_date, expiry_date,
                   quantity, remaining_quantity, import_price, supplier_id, invoice_number
            FROM medicine_batches ORDER BY medicine_id, expiry_date, id
        ''')).mappings():
            batches[batch['medicine_id']].append(dict(batch))
        movements = {r['medicine_id']: dict(r) for r in conn.execute(text('''
            SELECT medicine_id, count(*) AS movement_count,
                   count(*) FILTER (WHERE batch_id IS NULL) AS movements_without_batch
            FROM medicine_transactions GROUP BY medicine_id
        ''')).mappings()}
        invalid_links = [dict(r) for r in conn.execute(text('''
            SELECT t.id, t.medicine_id, t.batch_id, b.medicine_id AS batch_medicine_id
            FROM medicine_transactions t LEFT JOIN medicine_batches b ON b.id=t.batch_id
            WHERE t.batch_id IS NOT NULL AND (b.id IS NULL OR b.medicine_id<>t.medicine_id)
        ''')).mappings()]
        rows = []
        for med in medicines:
            rows.append({
                'medicine_id': med['id'], 'internal_code': med['internal_code'],
                'name': med['name'], 'unit': med['unit'],
                'legacy_catalog_expiry': med['expiry_date'],
                **classify_stock(med['stock_quantity'], batches[med['id']], clock['today']),
                'batches': batches[med['id']],
                'movement_count': movements.get(med['id'], {}).get('movement_count', 0),
                'movements_without_batch': movements.get(med['id'], {}).get('movements_without_batch', 0),
            })
    counts = Counter(case for row in rows for case in row['cases'])
    return {'checked_at': clock['checked_at'], 'total_medicines': len(rows),
            'flagged_medicines': sum(bool(row['cases']) for row in rows),
            'case_counts': dict(counts), 'invalid_movement_links': invalid_links,
            'medicines': rows}


def write_reports(report, directory):
    # Refuse overwriting earlier evidence or a partially completed worksheet.
    directory.mkdir(parents=True, exist_ok=False)
    (directory / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str) + '\n')
    columns = ['medicine_id', 'internal_code', 'name', 'unit', 'cases',
               'aggregate_stock', 'batch_stock', 'valid_batch_stock', 'available_to_dispense',
               'aggregate_minus_batches', 'batch_count', 'legacy_catalog_expiry',
               'movement_count', 'movements_without_batch']
    with (directory / 'inventory.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        for row in report['medicines']:
            writer.writerow({**row, 'cases': '; '.join(row['cases'])})
    with (directory / 'missing-lots-to-verify.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['medicine_id', 'internal_code', 'name', 'recorded_stock',
                         'legacy_catalog_expiry_reference_only', 'verified_batch_number',
                         'verified_expiry_date', 'verified_quantity_in_this_batch', 'source_document'])
        for row in report['medicines']:
            if 'missing_batches' in row['cases']:
                writer.writerow([row['medicine_id'], row['internal_code'], row['name'],
                                 row['aggregate_stock'], row['legacy_catalog_expiry'], '', '', '', ''])
    with (directory / 'receipt-costs-to-verify.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['medicine_id', 'medicine_name', 'receipt_reference', 'batch_number',
                         'import_date', 'expiry_date', 'remaining_quantity', 'recorded_import_price',
                         'invoice_number', 'verified_import_price', 'source_document'])
        for row in report['medicines']:
            for batch in row['batches']:
                if batch['import_price'] is None or batch['import_price'] == 0 or batch['batch_number'].startswith('SEED-LOCAL-'):
                    writer.writerow([row['medicine_id'], row['name'], f"NK-{batch['id']}", batch['batch_number'],
                                     batch['import_date'], batch['expiry_date'], batch['remaining_quantity'],
                                     batch['import_price'], batch['invoice_number'], '', ''])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args()
    report = read_audit()
    if args.output_dir:
        write_reports(report, args.output_dir)
    print(json.dumps({key: value for key, value in report.items() if key != 'medicines'},
                     ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
