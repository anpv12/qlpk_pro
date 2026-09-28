"""Opt-in PostgreSQL integration tests; every write rolls back."""
import os
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from flask import Flask
from sqlalchemy.orm import Session
from app.core.database import engine
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.models.user import User
from app.models.appointment import Appointment
from app.modules.prescriptions.services.stock_service import apply_prescription_batch_stock_deltas

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='Opt-in rollback tests')


@pytest.fixture
def case(monkeypatch):
    import app.api.auth as auth
    import app.api.medicine as medicines
    import app.api.medicine_batch as batches
    import app.api.medicine_transaction as ledger
    with engine.connect() as conn:
        outer = conn.begin()
        db = Session(bind=conn, expire_on_commit=False)
        try:
            actor = db.query(User.id).first()[0]
            appointment = db.query(Appointment.id).first()[0]
            medicine = Medicine(name='QA receipt '+uuid4().hex, unit='viên', unit_price=2000, stock_quantity=0)
            db.add(medicine)
            db.flush()
            def scoped_db():
                child = Session(bind=conn, join_transaction_mode='create_savepoint')
                yield child
            for module in (auth, medicines, batches, ledger):
                monkeypatch.setattr(module, 'get_db', scoped_db)
            for module in (medicines, batches):
                monkeypatch.setattr(module, 'emit_inventory_changed', lambda *args, **kwargs: None)
            monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor, role='admin'))
            app = Flask(__name__)
            app.register_blueprint(medicines.medicine_router, url_prefix='/api')
            app.register_blueprint(batches.medicine_batch_router, url_prefix='/api')
            app.register_blueprint(ledger.medicine_transaction_router, url_prefix='/api')
            client = app.test_client()
            client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer QA'
            payload = dict(medicine_id=medicine.id, batch_number='QA-'+uuid4().hex,
                           import_date=date.today().isoformat(), expiry_date=(date.today()+timedelta(days=365)).isoformat(),
                           quantity=100, import_price=1000)
            yield db, medicine, actor, appointment, client, payload
        finally:
            db.close()
            if outer.is_active:
                outer.rollback()


def issue(db, medicine, actor, appointment, old, new):
    def totals(quantity):
        return {medicine.id: {'medicine_name': medicine.name, 'total_in_clinic_qty': quantity}}
    apply_prescription_batch_stock_deltas(db, user_id=actor, appointment_id=appointment,
        old_totals_by_medicine={medicine.id: old}, new_totals_by_medicine=totals(new),
        medicine_catalog={medicine.id: {'name': medicine.name, 'unit': medicine.unit}})
    db.flush()


def test_same_lot_two_prices_then_issue_and_refund_preserve_receipts(case):
    db, med, actor, appointment, client, payload = case
    first = client.post('/api/medicine-batches/', json=payload)
    second = client.post('/api/medicine-batches/', json={**payload, 'import_price': 1200})
    assert first.status_code == second.status_code == 201
    a, b = first.get_json(), second.get_json()
    assert a['id'] != b['id'] and a['batch_number'] == b['batch_number']
    imports = db.query(MedicineTransaction).filter_by(medicine_id=med.id, type='import').order_by(MedicineTransaction.id).all()
    assert [row.stock_balance_after for row in imports] == [100, 200]
    db.expire_all()
    issue(db, med, actor, appointment, 0, 120)
    outgoing = db.query(MedicineTransaction).filter_by(medicine_id=med.id, type='export').order_by(MedicineTransaction.id).all()
    assert [(t.batch_id, t.quantity, t.price, t.balance_after) for t in outgoing] == [
        (a['id'], -100, 1000, 0), (b['id'], -20, 1200, 80)]
    issue(db, med, actor, appointment, 120, 90)
    db.expire_all()
    assert med.stock_quantity == 110
    assert db.get(MedicineBatch, a['id']).remaining_quantity == 10
    assert db.get(MedicineBatch, b['id']).remaining_quantity == 100
    summary = client.get(f'/api/medicines/{med.id}/batches').get_json()
    assert summary['distinct_lots'] == 1 and summary['total_batches'] == 2
    assert summary['stock_value'] == 130000 and summary['stock_difference'] == 0
    history = client.get('/api/medicine-transactions/', query_string={'batch_id':a['id'], 'per_page':1}).get_json()
    assert history['total'] == 3 and history['total_pages'] == 3
    assert history['transactions'][0]['batch_id'] == a['id']
    assert history['transactions'][0]['balance_after'] == 10


@pytest.mark.parametrize('field,value', [('stock_quantity',0),('stock_quantity',999),('import_price',None),('import_price',1000)])
def test_catalog_cannot_write_balance_or_cost_even_with_direct_payload(case, field, value):
    db, med, _, _, client, _ = case
    response = client.put(f'/api/medicines/{med.id}', json={field:value})
    assert response.status_code == 400
    response = client.post('/api/medicines/', json={field:value})
    assert response.status_code == 400
    db.expire_all()
    assert med.stock_quantity == 0 and med.import_price is None


@pytest.mark.parametrize('field,value', [('import_price',None),('import_price',''),('import_price','NaN'),
    ('import_price','Infinity'),('import_price',-1),('import_price','1.001'),('batch_number',''),
    ('remaining_quantity',100),('quantity','NaN'),('expiry_date','2000-01-01')])
def test_invalid_receipts_cannot_add_stock(case, field, value):
    db, med, _, _, client, payload = case
    response = client.post('/api/medicine-batches/', json={**payload,field:value})
    assert response.status_code == 400, response.get_json()
    db.expire_all()
    assert med.stock_quantity == 0
    assert db.query(MedicineBatch).filter_by(medicine_id=med.id).count() == 0


def test_receipt_metadata_immutable_and_catalog_identity_requires_dav(case):
    db, med, _, _, client, payload = case
    receipt = client.post('/api/medicine-batches/', json=payload).get_json()
    for field, value in [('quantity',1),('remaining_quantity',1),('import_price',2),('expiry_date','2029-01-01'),
                          ('import_date','2020-01-01'),('batch_number','OTHER'),('medicine_id',1),('supplier_id',None),('invoice_number','NEW')]:
        response = client.put(f"/api/medicine-batches/{receipt['id']}",json={field:value})
        assert response.status_code == 409, (field,response.get_json())
    assert client.delete(f"/api/medicine-batches/{receipt['id']}").status_code == 409
    assert client.post('/api/medicine-transactions/',json={'batch_id':receipt['id'],'quantity':100}).status_code == 409
    assert client.put(f'/api/medicines/{med.id}',json={'name':med.name+' changed'}).status_code == 409
    assert client.put(f'/api/medicines/{med.id}',json={'unit_price':2500}).status_code == 409
    db.expire_all()
    assert med.stock_quantity == 100 and db.get(MedicineBatch,receipt['id']).import_price == 1000


def test_import_order_invalid_last_line_rolls_back_and_zero_price_is_explicit(case):
    db, med, _, _, client, payload = case
    order = dict(import_date=payload['import_date'], items=[payload,{**payload,'import_price':None}])
    assert client.post('/api/medicine-batches/import-order', json=order).status_code == 400
    assert db.query(MedicineBatch).filter_by(medicine_id=med.id).count() == 0
    order['items'][1]['import_price'] = 0
    response = client.post('/api/medicine-batches/import-order', json=order)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()['total_value'] == 100000


def test_cost_missing_and_mismatch_are_explicit(case):
    db, med, actor, _, client, payload = case
    receipt = client.post('/api/medicine-batches/',json=payload).get_json()
    db.expire_all()
    batch = db.get(MedicineBatch,receipt['id'])
    batch.import_price = None  # Simulate legacy missing data in rolled-back test only.
    med.stock_quantity += 7
    db.flush()
    summary = client.get(f'/api/medicines/{med.id}/batches').get_json()
    assert summary['stock_difference'] == 7
    assert summary['missing_cost_quantity'] == 100 and summary['stock_value'] is None
