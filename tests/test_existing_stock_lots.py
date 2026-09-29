"""Opt-in PostgreSQL checks; all stock, lot and movement writes roll back."""
import os
from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from app.core.database import engine
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.models.user import User
from app.models.appointment import Appointment
from app.modules.medicines.services.inventory_service import (
    InventoryValidationError, register_existing_stock_batches,
)
from app.modules.prescriptions.services.stock_service import (
    PrescriptionStockValidationError, apply_prescription_batch_stock_deltas,
)

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='Opt-in rollback tests')


@pytest.fixture
def case():
    with engine.connect() as conn:
        tx = conn.begin()
        db = Session(bind=conn, expire_on_commit=False)
        try:
            actor = db.query(User.id).first()
            appointment = db.query(Appointment.id).first()
            if not actor or not appointment:
                pytest.skip('Needs local actor and appointment')
            medicine = Medicine(name='QA missing lots '+uuid4().hex, unit='viên', unit_price=10000, stock_quantity=1460)
            db.add(medicine)
            db.flush()
            payload = dict(medicine_id=medicine.id, expected_stock='1460', source_document='QA verified opening count',
                           batches=[dict(batch_number='QA-'+uuid4().hex, import_date=date.today().isoformat(),
                                         expiry_date=(date.today()+timedelta(days=365)).isoformat(), quantity='1460')])
            yield db, medicine, payload, actor[0], appointment[0]
        finally:
            db.close()
            if tx.is_active:
                tx.rollback()


def dispense(db, medicine, actor, appointment):
    return apply_prescription_batch_stock_deltas(db, user_id=actor, appointment_id=appointment,
        new_totals_by_medicine={medicine.id: {'medicine_name': medicine.name, 'total_in_clinic_qty': 6}},
        old_totals_by_medicine={}, medicine_catalog={medicine.id: {'name': medicine.name, 'unit': medicine.unit}})


def test_missing_lot_then_verified_allocation_can_dispense_six_without_double_stock(case):
    db, medicine, payload, actor, appointment = case
    with pytest.raises(PrescriptionStockValidationError) as exc:
        dispense(db, medicine, actor, appointment)
    assert exc.value.code == 'inventory.batch_missing'
    assert '6 viên' in str(exc.value)
    assert medicine.stock_quantity == 1460
    batches = register_existing_stock_batches(db, **payload, created_by=actor)
    db.flush()
    assert medicine.stock_quantity == 1460
    assert batches[0].remaining_quantity == 1460
    opening = db.query(MedicineTransaction).filter_by(medicine_id=medicine.id).one()
    assert opening.quantity == 0 and opening.batch_id == batches[0].id
    assert opening.stock_balance_after == 1460
    dispense(db, medicine, actor, appointment)
    db.flush()
    assert medicine.stock_quantity == batches[0].remaining_quantity == 1454


@pytest.mark.parametrize('field,value', [('expected_stock', '1459'), ('source_document', ''), ('batches', [])])
def test_missing_evidence_or_stale_stock_cannot_allocate(case, field, value):
    db, medicine, payload, actor, _ = case
    payload[field] = value
    with pytest.raises(InventoryValidationError):
        register_existing_stock_batches(db, **payload, created_by=actor)
    assert db.query(MedicineBatch).filter_by(medicine_id=medicine.id).count() == 0
    assert medicine.stock_quantity == 1460


@pytest.mark.parametrize('field,value', [('batch_number', ''), ('expiry_date', ''), ('quantity', '6'), ('quantity', '1461')])
def test_lot_identity_dates_and_entire_existing_balance_must_be_verified(case, field, value):
    db, medicine, payload, actor, _ = case
    payload['batches'][0][field] = value
    with pytest.raises(InventoryValidationError):
        register_existing_stock_batches(db, **payload, created_by=actor)
    assert db.query(MedicineBatch).filter_by(medicine_id=medicine.id).count() == 0


def test_repeating_allocation_does_not_import_twice(case):
    db, medicine, payload, actor, _ = case
    register_existing_stock_batches(db, **payload, created_by=actor)
    with pytest.raises(InventoryValidationError):
        register_existing_stock_batches(db, **payload, created_by=actor)
    assert medicine.stock_quantity == 1460
    assert db.query(MedicineBatch).filter_by(medicine_id=medicine.id).count() == 1


def test_verified_expired_lot_stays_blocked(case):
    db, medicine, payload, actor, appointment = case
    payload['batches'][0].update(import_date=(date.today()-timedelta(days=10)).isoformat(),
                                 expiry_date=(date.today()-timedelta(days=1)).isoformat())
    register_existing_stock_batches(db, **payload, created_by=actor)
    with pytest.raises(PrescriptionStockValidationError) as exc:
        dispense(db, medicine, actor, appointment)
    assert exc.value.code == 'inventory.batch_expired'
    assert medicine.stock_quantity == 1460


def test_multiple_verified_lots_preserve_sum(case):
    db, medicine, payload, actor, appointment = case
    first = payload['batches'][0]
    payload['batches'] = [{**first, 'quantity': '2'},
                          {**first, 'batch_number': 'QA-'+uuid4().hex, 'quantity': '1458'}]
    lots = register_existing_stock_batches(db, **payload, created_by=actor)
    dispense(db, medicine, actor, appointment)
    assert medicine.stock_quantity == sum(lot.remaining_quantity for lot in lots) == 1454


@pytest.mark.parametrize('code', ['inventory.batch_missing', 'inventory.batch_expired'])
def test_save_api_preserves_specific_lot_error(case, monkeypatch, code):
    from flask import Flask
    from types import SimpleNamespace
    import app.api.auth as auth
    import app.modules.prescriptions.api.internal as api
    db, medicine, _, actor, appointment = case
    def scoped_db():
        child = Session(bind=db.connection(), join_transaction_mode='create_savepoint')
        try:
            yield child
        finally:
            child.close()
    monkeypatch.setattr(api, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor, role='admin', is_active=True))
    detail = f'{medicine.name}: cần kiểm tra thông tin lô.'
    def fail(*args, **kwargs):
        raise PrescriptionStockValidationError([detail], code=code)
    monkeypatch.setattr(api, 'save_prescription_transaction', fail)
    app = Flask(__name__)
    app.register_blueprint(api.router, url_prefix='/api/prescription')
    client = app.test_client()
    response = client.post('/api/prescription/save', headers={'Authorization': 'Bearer QA'},
                           json={'appointment_id': appointment, 'medicines': []})
    assert response.status_code == 400
    assert response.get_json() == {'code': code, 'detail': detail, 'errors': [detail], 'shortage': None}
    assert medicine.stock_quantity == 1460
