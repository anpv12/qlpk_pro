"""Server-timed prices; all integration writes roll back."""
from datetime import datetime, timezone
from decimal import Decimal
import pytest
from test_inventory_receipts import case, pytestmark
from test_medicine_reference_review import reviewer
from test_medicine_dav_link import dav
from app.models.medicine_price_history import MedicinePriceHistory
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction


def read(client, med):
    response = client.get(f'/api/medicines/{med.id}/price')
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def change(client, med, price, snapshot=None, **extra):
    snapshot = snapshot or read(client, med)
    return client.post(f'/api/medicines/{med.id}/price', json={
        'new_price': price, 'expected_price': snapshot['current_price'],
        'expected_revision': snapshot['revision'], **extra})


def test_intervals_server_clock_no_backfill_and_noop(reviewer):
    db, med, client, actor = reviewer
    initial = read(client, med)
    assert initial['history'] == [] and initial['revision'] is None
    before = datetime.now(timezone.utc)
    response = change(client, med, '1000.25')
    assert response.status_code == 200, response.get_json()
    first = response.get_json()['history'][0]
    assert first['old_price'] == '2000.00' and first['new_price'] == '1000.25'
    assert first['difference'] == '-999.75' and first['effective_to'] is None
    assert before <= datetime.fromisoformat(first['effective_from']) <= datetime.now(timezone.utc)
    assert db.get(MedicinePriceHistory, first['id']).changed_by == actor
    result = change(client, med, 0).get_json()
    assert result['history'][1]['effective_to'] == result['history'][0]['effective_from']
    assert result['history'][0]['effective_to'] is None
    assert change(client, med, 0).get_json() == result
    db.expire_all()
    assert med.unit_price == 0


def test_stale_writers_including_return_to_original_price(reviewer):
    _, med, client, _ = reviewer
    original = read(client, med)
    assert change(client, med, 1000, original).status_code == 200
    assert change(client, med, 3000, original).status_code == 409
    assert change(client, med, 2000).status_code == 200
    assert change(client, med, 3000, original).status_code == 409
    assert len(read(client, med)['history']) == 2


@pytest.mark.parametrize('price', [-1, 'NaN', 'Infinity', '1.001', '100000000', True, None, '', {}, []])
def test_invalid_prices_never_write(reviewer, price):
    db, med, client, _ = reviewer
    assert change(client, med, price).status_code == 400
    db.expire_all()
    assert med.unit_price == 2000 and read(client, med)['history'] == []


def test_cannot_spoof_time_or_bypass_price_workflow(reviewer):
    _, med, client, _ = reviewer
    assert change(client, med, 3000, effective_from='2020-01-01').status_code == 400
    assert client.put(f'/api/medicines/{med.id}', json={'unit_price':3000}).status_code == 409
    assert client.put(f'/api/medicines/{med.id}', json={'unit_price':2000, 'description':'Ghi chú'}).status_code == 200
    assert read(client, med)['history'] == []


def test_creation_records_initial_price_and_unused_medicine_can_still_be_deleted(reviewer):
    db, _, client, actor = reviewer
    source = dav(db)
    response = client.post('/api/medicines/', json={'reference_catalog_id':source.id, 'unit':'viên', 'unit_price':'1234.50'})
    assert response.status_code == 201, response.get_json()
    medicine_id = response.get_json()['medicine']['id']
    row = db.query(MedicinePriceHistory).filter_by(medicine_id=medicine_id).one()
    assert row.old_price is None and row.new_price == Decimal('1234.50')
    assert row.changed_by == actor and row.effective_to is None
    # Price history alone is not real usage; only prescriptions or inventory
    # transactions block deletion (see test_medicine_delete.py). The history
    # row belongs to the medicine and is removed together with it.
    assert client.delete(f'/api/medicines/{medicine_id}').status_code == 200
    db.expire_all()
    assert db.query(MedicinePriceHistory).filter_by(medicine_id=medicine_id).first() is None


def test_price_failure_rolls_back_current_price(reviewer, monkeypatch):
    db, med, client, _ = reviewer
    import app.modules.medicines.services.price_history as service
    def fail(*args):
        raise RuntimeError('test rollback')
    monkeypatch.setattr(service, 'record_price', fail)
    assert change(client, med, 3000).status_code == 500
    db.expire_all()
    assert med.unit_price == 2000 and read(client, med)['history'] == []


def test_receipts_and_stock_are_unchanged(case, reviewer):
    db, med, client, _ = reviewer
    assert client.post('/api/medicine-batches/', json=case[-1]).status_code == 201
    db.expire_all()
    def rows(model):
        return [tuple(getattr(row, c.name) for c in model.__table__.columns)
                for row in db.query(model).filter_by(medicine_id=med.id).order_by(model.id)]
    batches, ledger = rows(MedicineBatch), rows(MedicineTransaction)
    assert change(client, med, 5000).status_code == 200
    db.expire_all()
    assert med.stock_quantity == 100 and batches == rows(MedicineBatch) and ledger == rows(MedicineTransaction)


def test_history_pagination_has_no_overlap(reviewer):
    _, med, client, _ = reviewer
    for price in range(1, 23):
        assert change(client, med, price).status_code == 200
    first = read(client, med)
    second = client.get(f'/api/medicines/{med.id}/price?before_id={first["next_before_id"]}').get_json()
    assert len(first['history']) == 20 and len(second['history']) == 2
    assert second['next_before_id'] is None
    assert not {r['id'] for r in first['history']} & {r['id'] for r in second['history']}


def test_unauthenticated_price_access_is_rejected(reviewer):
    _, med, client, _ = reviewer
    client.environ_base.pop('HTTP_AUTHORIZATION')
    assert client.get(f'/api/medicines/{med.id}/price').status_code == 401
    assert client.post(f'/api/medicines/{med.id}/price', json={}).status_code == 401
