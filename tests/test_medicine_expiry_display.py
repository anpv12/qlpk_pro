"""`expiry_date` on Medicine is a dead legacy column; real expiry lives on
active batches (remaining_quantity > 0). Display/warning fields must derive
from the nearest expiring active batch, not the unused per-medicine column.
"""
import os
from datetime import date, timedelta
import pytest
from test_inventory_receipts import case, pytestmark
from app.models.medicine_batch import MedicineBatch


def receipt(db, med, expiry, remaining):
    batch = MedicineBatch(medicine_id=med.id, batch_number='QA-'+str(remaining)+str(expiry),
        import_date=date.today(), expiry_date=expiry, quantity=10,
        remaining_quantity=remaining, import_price=100)
    db.add(batch)
    db.flush()
    return batch


def test_no_active_batches_reports_no_expiry(case):
    _, med, _, _, client, _ = case
    result = client.get(f'/api/medicines/{med.id}').get_json()
    assert result['nearest_expiry_date'] is None
    assert result['is_expiring_soon'] is None


def test_depleted_batch_is_excluded_even_if_soonest(case):
    db, med, _, _, client, _ = case
    receipt(db, med, date.today() + timedelta(days=1), 0)
    later = date.today() + timedelta(days=90)
    receipt(db, med, later, 5)
    result = client.get(f'/api/medicines/{med.id}').get_json()
    assert result['nearest_expiry_date'] == later.isoformat()


def test_is_expiring_soon_uses_nearest_active_batch_and_warning_threshold(case):
    db, med, _, _, client, _ = case
    med.expiry_warning_days = 30
    db.flush()
    soon = date.today() + timedelta(days=10)
    receipt(db, med, soon, 5)
    receipt(db, med, date.today() + timedelta(days=200), 5)
    result = client.get(f'/api/medicines/{med.id}').get_json()
    assert result['nearest_expiry_date'] == soon.isoformat()
    assert result['is_expiring_soon'] is True
    assert result['days_to_expiry'] == 10


def test_legacy_expiry_date_column_never_drives_the_computed_fields(case):
    db, med, _, _, client, _ = case
    med.expiry_date = date.today() + timedelta(days=1)
    med.expiry_warning_days = 30
    db.flush()
    result = client.get(f'/api/medicines/{med.id}').get_json()
    assert result['expiry_date'] == med.expiry_date.isoformat()
    assert result['nearest_expiry_date'] is None
    assert result['is_expiring_soon'] is None


def test_list_endpoint_exposes_nearest_expiry_date_from_active_batches(case):
    db, med, _, _, client, _ = case
    soon = date.today() + timedelta(days=5)
    receipt(db, med, soon, 5)
    receipt(db, med, date.today() + timedelta(days=1), 0)
    response = client.get('/api/medicines/', query_string={'search': med.name})
    row = next(item for item in response.get_json()['medicines'] if item['id'] == med.id)
    assert row['nearest_expiry_date'] == soon.isoformat()


def test_sort_by_expiry_date_orders_soonest_active_batch_first(case):
    from app.models.medicine import Medicine
    db, med, _, _, client, _ = case
    other = Medicine(name='QA sort '+med.name, unit='viên', unit_price=1000, stock_quantity=0)
    db.add(other)
    db.flush()
    receipt(db, other, date.today() + timedelta(days=60), 5)
    receipt(db, med, date.today() + timedelta(days=3), 5)
    response = client.get('/api/medicines/', query_string={'sort_by': 'expiry_date', 'per_page': 1000})
    ids = [item['id'] for item in response.get_json()['medicines']]
    assert ids.index(med.id) < ids.index(other.id)


def test_dashboard_excludes_depleted_lots_from_expiry_warning(case):
    db, med, _, _, client, _ = case
    med.expiry_warning_days = 400
    db.flush()
    before = client.get('/api/medicines/dashboard').get_json()['warning_count']
    receipt(db, med, date.today() + timedelta(days=5), 0)
    after = client.get('/api/medicines/dashboard').get_json()['warning_count']
    assert after == before


def test_dashboard_counts_active_lot_within_medicines_own_threshold(case):
    db, med, _, _, client, _ = case
    med.expiry_warning_days = 90
    db.flush()
    before = client.get('/api/medicines/dashboard').get_json()['warning_count']
    receipt(db, med, date.today() + timedelta(days=45), 5)
    after = client.get('/api/medicines/dashboard').get_json()['warning_count']
    assert after == before + 1


def test_dashboard_without_threshold_never_warns_even_if_expired(case):
    db, med, _, _, client, _ = case
    before = client.get('/api/medicines/dashboard').get_json()['warning_count']
    receipt(db, med, date.today() - timedelta(days=1), 5)
    after = client.get('/api/medicines/dashboard').get_json()['warning_count']
    assert after == before
