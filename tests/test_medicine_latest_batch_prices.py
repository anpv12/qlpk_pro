"""Read-only form pricing comes from the latest receipt, never catalog fallbacks."""
from datetime import date, datetime, timezone, timedelta
from test_inventory_receipts import case, pytestmark
from app.models.medicine_batch import MedicineBatch


def receipt(db, med, imported, created, price):
    batch = MedicineBatch(medicine_id=med.id, batch_number='QA-latest', import_date=imported,
        expiry_date=date.today() + timedelta(days=365), quantity=1, remaining_quantity=0,
        import_price=price, created_at=created)
    db.add(batch)
    db.flush()
    return batch


def test_no_receipts_does_not_substitute_catalog_price(case):
    _, med, _, _, client, _ = case
    result = client.get(f'/api/medicines/{med.id}').get_json()
    assert result['unit_price'] == 2000
    assert result['latest_batch_pricing'] is None


def test_latest_receipt_order_is_import_date_then_created_then_id(case):
    db, med, _, _, client, _ = case
    today, now = date.today(), datetime.now(timezone.utc)
    receipt(db, med, today, now - timedelta(days=1), 100)
    receipt(db, med, today, now, 200)
    latest = receipt(db, med, today, now, 0)
    receipt(db, med, today - timedelta(days=1), now + timedelta(days=1), 999)
    result = client.get(f'/api/medicines/{med.id}').get_json()['latest_batch_pricing']
    assert result['batch_id'] == latest.id
    assert result['import_price'] == 0
    assert 'sale_price' not in result


def test_missing_latest_price_does_not_fall_back_to_older_receipt(case):
    db, med, _, _, client, _ = case
    today, now = date.today(), datetime.now(timezone.utc)
    receipt(db, med, today - timedelta(days=1), now, 100)
    latest = receipt(db, med, today, now, None)
    result = client.get(f'/api/medicines/{med.id}').get_json()['latest_batch_pricing']
    assert result['batch_id'] == latest.id
    assert result['import_price'] is None and 'sale_price' not in result


def test_list_endpoint_exposes_latest_batch_pricing_with_same_tie_break(case):
    db, med, _, _, client, _ = case
    today, now = date.today(), datetime.now(timezone.utc)
    receipt(db, med, today - timedelta(days=1), now, 100)
    latest = receipt(db, med, today, now, 250)
    response = client.get('/api/medicines/', query_string={'search': med.name})
    assert response.status_code == 200, response.get_json()
    rows = response.get_json()['medicines']
    row = next(item for item in rows if item['id'] == med.id)
    assert row['latest_batch_pricing']['batch_id'] == latest.id
    assert row['latest_batch_pricing']['import_price'] == 250


def test_list_endpoint_reports_no_batches_as_none(case):
    _, med, _, _, client, _ = case
    response = client.get('/api/medicines/', query_string={'search': med.name})
    row = next(item for item in response.get_json()['medicines'] if item['id'] == med.id)
    assert row['latest_batch_pricing'] is None
