from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from test_inventory_receipts import case, pytestmark
from test_medicine_reference_review import reviewer
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.models.user import User, UserRole


def missing_batch(db, medicine, suffix='one'):
    batch = MedicineBatch(medicine_id=medicine.id, batch_number='QA-missing-'+suffix,
                          import_date=date.today(), expiry_date=date.today()+timedelta(days=30),
                          quantity=100, remaining_quantity=80, import_price=None)
    db.add(batch)
    db.flush()
    return batch


def test_supply_preserves_stock_history_and_rejects_overwrite(reviewer):
    db, medicine, client, actor = reviewer
    batch = missing_batch(db, medicine)
    historical = MedicineTransaction(medicine_id=medicine.id, batch_id=batch.id,
                                    type='export', quantity=-20, price=None)
    db.add(historical)
    db.flush()
    stock = medicine.stock_quantity
    response = client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':'2500.50'})
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert batch.import_price == Decimal('2500.50')
    assert batch.remaining_quantity == 80 and batch.quantity == 100
    assert medicine.stock_quantity == stock and medicine.unit_price == 2000
    assert historical.price is None
    journal = db.query(MedicineTransaction).filter_by(batch_id=batch.id, type='adjustment').one()
    assert journal.quantity == 0 and journal.price == Decimal('2500.50') and journal.created_by == actor
    assert client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':2000}).status_code == 409
    assert client.put(f'/api/medicine-batches/{batch.id}', json={'import_price':2000}).status_code == 409


@pytest.mark.parametrize('value', [None, '', -1, True, 'NaN', 'Infinity', '1.001', '100000000', {}, []])
def test_invalid_price(reviewer, value):
    db, medicine, client, _ = reviewer
    batch = missing_batch(db, medicine)
    assert client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':value}).status_code == 400
    db.expire_all()
    assert batch.import_price is None
    assert db.query(MedicineTransaction).filter_by(batch_id=batch.id).count() == 0


def test_distinct_filter_count_and_zero_is_known(reviewer):
    db, medicine, client, _ = reviewer
    baseline = client.get('/api/medicines/dashboard').get_json()['missing_import_price_count']
    first = missing_batch(db, medicine)
    second = missing_batch(db, medicine, 'two')
    assert client.get('/api/medicines/dashboard').get_json()['missing_import_price_count'] == baseline+1
    result = client.get('/api/medicines/', query_string={'missing_import_price':'true','search':medicine.name}).get_json()
    assert result['total'] == 1
    for batch in (first, second):
        assert client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':0}).status_code == 200
    assert client.get('/api/medicines/dashboard').get_json()['missing_import_price_count'] == baseline
    assert client.get('/api/medicines/', query_string={'missing_import_price':'true','search':medicine.name}).get_json()['total'] == 0


def test_menu_permission_for_non_admin(reviewer, monkeypatch):
    import app.api.auth as auth
    from app.models.group import Group
    from app.models.user import UserGroup
    from uuid import uuid4
    db, medicine, client, _ = reviewer
    actor = User(username='QA-cost-'+uuid4().hex, full_name='QA menu cost', hashed_password='unused',
                 role=UserRole.DOCTOR, is_active=True)
    db.add(actor)
    db.flush()
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor.id, role='doctor', is_active=True))
    batch = missing_batch(db, medicine)
    assert client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':1000}).status_code == 403
    group = Group(code='QA-'+uuid4().hex[:12], name='QA-cost-'+uuid4().hex, permissions='["ql-kho-thuoc"]')
    db.add(group)
    db.flush()
    db.add(UserGroup(user_id=actor.id, group_id=group.id))
    db.flush()
    result = client.get('/api/medicine-batches/', query_string={'medicine_id':medicine.id}).get_json()
    assert result['batches'][0]['can_supply_import_price'] is True
    assert client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':1000}).status_code == 200


def test_journal_failure_rolls_back_price(reviewer, monkeypatch):
    import app.api.medicine_batch as api
    db, medicine, client, _ = reviewer
    batch = missing_batch(db, medicine)
    def fail(*args, **kwargs):
        raise RuntimeError('QA journal failure')
    monkeypatch.setattr(api, 'add_movement', fail)
    assert client.post(f'/api/medicine-batches/{batch.id}/import-price', json={'import_price':1000}).status_code == 500
    db.expire_all()
    assert batch.import_price is None


def test_payload_cannot_change_other_fields(reviewer):
    db, medicine, client, _ = reviewer
    batch = missing_batch(db, medicine)
    response = client.post(f'/api/medicine-batches/{batch.id}/import-price',
                           json={'import_price':1000,'remaining_quantity':50})
    assert response.status_code == 400
    db.expire_all()
    assert batch.import_price is None and batch.remaining_quantity == 80
