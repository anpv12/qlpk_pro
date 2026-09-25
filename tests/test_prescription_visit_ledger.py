import os
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

import app.models
from app.core.database import engine
from app.models.appointment import Appointment
from app.models.examination import Examination
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.modules.prescriptions.services.save_service import _persist_prescription_transaction
from app.modules.prescriptions.services.stock_service import PrescriptionStockValidationError
from app.modules.prescriptions.services.ledger_service import visit_ledger_payload
from app.modules.prescriptions.services.ledger_report import build_ledger_report
from app.modules.prescriptions.services.read_service import build_patient_prescription_history_payload

pytestmark = pytest.mark.skipif(os.getenv('QLPK_RUN_DB_TESTS') != '1', reason='Opt-in rollback tests')


@pytest.fixture
def case():
    assert engine.url.database == 'qlpk_db'
    with engine.connect() as connection:
        outer = connection.begin()
        db = Session(bind=connection, autoflush=False, expire_on_commit=False)
        try:
            existing = db.query(Appointment).first()
            visits = [Appointment(appointment_code='QA-ledger-' + uuid4().hex,
                patient_id=existing.patient_id, doctor_id=existing.doctor_id,
                appointment_date=datetime(2026, 9, day)) for day in (5, 20)]
            medicine = Medicine(name='QA-ledger-' + uuid4().hex, unit='viên',
                unit_price=2000, stock_quantity=200, prescription_type='BASIC')
            db.add_all(visits + [medicine])
            db.flush()
            batches = [MedicineBatch(medicine_id=medicine.id, batch_number='LOT-SAME',
                import_date=date.today(), expiry_date=date.today() + timedelta(days=365),
                quantity=100, remaining_quantity=100, import_price=price) for price in (1000, 1200)]
            db.add_all(batches)
            db.flush()
            yield db, visits, medicine, batches, existing.doctor_id
        finally:
            db.close()
            if outer.is_active:
                outer.rollback()


def save(case, quantity, price=2000, visit=0, extra=None):
    db, visits, medicine, _, actor = case
    medicines = [dict(medicine_id=medicine.id, name=medicine.name, quantity=quantity,
        unit_price=price, unit='viên', is_external=False)] if quantity else []
    if extra:
        medicines.append(extra)
    result = _persist_prescription_transaction(db, appointment_id=visits[visit].id,
        user_id=actor, medicines=medicines, usage_instructions='', re_examination_date=None)
    db.flush()
    return result


def ledger(case, visit=0):
    return visit_ledger_payload(case[0], case[1][visit].id)


def test_two_visits_receipts_price_snapshots_and_date_report(case):
    db, visits, medicine, batches, _ = case
    save(case, 100, 2000)
    for row in db.query(MedicineTransaction).filter_by(appointment_id=visits[0].id):
        row.created_at = datetime(2026, 9, 5, 10)
    medicine.unit_price = 9999
    save(case, 10, 2500, visit=1)
    assert [(row['batch_id'], row['price'], row['sale_unit_price']) for row in ledger(case)] == [(batches[0].id, 1000, 2000)]
    assert [(row['batch_id'], row['price'], row['sale_unit_price']) for row in ledger(case, 1)] == [(batches[1].id, 1200, 2500)]
    report = build_ledger_report(db, {'medicine_id': medicine.id, 'from_date': '2026-09-05', 'to_date': '2026-09-05'})
    assert report['summary']['recorded_revenue'] == 200000
    assert report['summary']['recorded_cost'] == 100000
    assert report['summary']['incomplete_rows'] == 0
    assert report['transactions'][0]['appointment_id'] == visits[0].id


def test_idempotent_reprice_refund_and_full_return(case):
    db, visits, medicine, batches, _ = case
    save(case, 120)
    original = ledger(case)
    assert len(original) == 2
    assert [(row['balance_after'], row['stock_balance_after']) for row in original] == [(0, 100), (80, 80)]
    assert len({row['operation_id'] for row in original}) == 1
    save(case, 120)
    assert ledger(case) == original
    save(case, 120, 2500)
    repriced = ledger(case)
    assert sum(row['sale_amount_delta'] for row in repriced) == 300000
    assert [row['quantity'] for row in repriced if row['type'] == 'price_adjustment'] == [0, 0]
    assert [(row['balance_after'], row['stock_balance_after']) for row in repriced if row['type'] == 'price_adjustment'] == [(80, 80), (0, 80)]
    save(case, 120, 2500)
    assert ledger(case) == repriced
    save(case, 90, 2500)
    refunds = [row for row in ledger(case) if row['type'] == 'return']
    assert [(row['batch_id'], row['quantity'], row['price'], row['sale_unit_price']) for row in refunds] == [
        (batches[1].id, 20, 1200, 2500), (batches[0].id, 10, 1000, 2500)]
    assert all(row['original_transaction_id'] for row in refunds)
    assert [(row['balance_after'], row['stock_balance_after']) for row in refunds] == [(100, 100), (10, 110)]
    save(case, 0)
    rows = ledger(case)
    assert rows[:2] == original
    assert rows[-1]['stock_balance_after'] == 200
    assert sum(row['sale_amount_delta'] for row in rows) == 0
    assert sum(row['cost_amount_delta'] for row in rows) == 0
    assert medicine.stock_quantity == 200
    assert [batch.remaining_quantity for batch in batches] == [100, 100]
    before = len(rows)
    save(case, 0)
    assert len(ledger(case)) == before
    history = build_patient_prescription_history_payload(db, visits[0].patient_id)
    visit = next(item for item in history['history'] if item['appointment_id'] == visits[0].id)
    assert not visit['prescriptions'] and len(visit['medicine_transactions']) == before
    db.add(Examination(examination_code='QA-' + uuid4().hex, appointment_id=visits[0].id,
        patient_id=visits[0].patient_id, doctor_id=visits[0].doctor_id,
        examination_date=visits[0].appointment_date, is_active=True))
    db.flush()
    history = build_patient_prescription_history_payload(db, visits[0].patient_id)
    visit = next(item for item in history['history'] if item['appointment_id'] == visits[0].id)
    assert not visit['prescriptions'] and len(visit['medicine_transactions']) == before


def test_increase_and_price_change_same_save(case):
    save(case, 10, 2000)
    save(case, 20, 3000)
    rows = ledger(case)
    assert sum(row['sale_amount_delta'] for row in rows) == 60000
    assert len(rows) == 3
    save(case, 5, 4000)
    assert sum(row['sale_amount_delta'] for row in ledger(case)) == 20000


def test_split_return_snapshots_follow_each_origin_and_read_payload(case):
    from app.modules.prescriptions.services.stock_service import build_prescription_batch_allocation_states
    save(case, 10)
    save(case, 20)
    original = ledger(case)
    save(case, 5)
    rows = ledger(case)
    assert rows[:2] == original
    assert [(row['quantity'], row['balance_after'], row['stock_balance_after']) for row in rows[2:]] == [
        (10, 90, 190), (5, 95, 195)]
    states = build_prescription_batch_allocation_states(case[0], case[1][0].id, {case[2].id: 5})
    assert states[case[2].id]['stock_movements'] == rows
    save(case, 10, visit=1)
    assert ledger(case) == rows


def test_repricing_snapshots_current_locked_stock_not_original_export(case):
    save(case, 10)
    original = ledger(case)
    save(case, 20, visit=1)
    result = save(case, 10, 3000)
    rows = ledger(case)
    assert rows[0] == original[0]
    assert rows[-1]['type'] == 'price_adjustment'
    assert (rows[-1]['balance_after'], rows[-1]['stock_balance_after']) == (70, 170)
    assert case[2].stock_quantity == 170
    assert result['stock_allocation_states'][0]['stock_movements'] == rows


@pytest.mark.parametrize('price', [-1, 'NaN', 'Infinity', '1.001', None, 'oops'])
def test_invalid_price_is_atomic(case, price):
    with pytest.raises(PrescriptionStockValidationError):
        save(case, 10, price)
    assert not ledger(case)
    assert case[2].stock_quantity == 200


def test_duplicate_prices_rejected_and_shortage_rolls_back(case):
    db, _, medicine, _, _ = case
    with pytest.raises(PrescriptionStockValidationError):
        save(case, 10, 2000, extra=dict(medicine_id=medicine.id, name=medicine.name,
            quantity=5, unit_price=3000))
    save(case, 10)
    original = ledger(case)
    with pytest.raises(PrescriptionStockValidationError):
        with db.begin_nested():
            save(case, 999)
    assert ledger(case) == original
    assert medicine.stock_quantity == 190


def test_legacy_rows_remain_unknown(case):
    db, visits, medicine, batches, actor = case
    save(case, 10)
    movement = db.query(MedicineTransaction).filter_by(appointment_id=visits[0].id).one()
    movement.appointment_id = movement.operation_id = movement.sale_unit_price = movement.sale_amount_delta = None
    movement.stock_balance_after = None
    db.flush()
    save(case, 5, 3000)
    rows = ledger(case)
    assert len(rows) == 2
    assert rows[0]['stock_balance_after'] is None
    assert rows[1]['stock_balance_after'] == 195
    assert all(row['sale_amount_delta'] is None for row in rows)
    assert rows[0]['unit_cost_snapshot'] is None and rows[0]['cost_amount_delta'] is None
    assert not any(row['financial_trace_complete'] for row in rows)
    report = build_ledger_report(db, {'medicine_id': medicine.id})
    assert report['summary']['incomplete_rows'] == 2
    assert report['summary']['recorded_revenue'] is None
    assert batches[0].remaining_quantity == 95


def test_report_pagination_total_is_not_page_sum(case):
    save(case, 120)
    report = build_ledger_report(case[0], {'medicine_id': case[2].id, 'per_page': 1, 'page': 2})
    assert report['total'] == 2 and len(report['transactions']) == 1
    assert report['summary']['recorded_revenue'] == 240000
    assert report['summary']['gross_margin_complete_rows'] == 116000


def test_receipt_filter_separates_same_lot_and_preserves_visit_balances(case):
    save(case, 120)
    for batch, expected_quantity, expected_balance in [(case[3][0], -100, 0), (case[3][1], -20, 80)]:
        report = build_ledger_report(case[0], {'batch_id': batch.id})
        assert report['total'] == 1
        row = report['transactions'][0]
        assert row['batch_id'] == batch.id and row['quantity'] == expected_quantity
        assert row['balance_after'] == expected_balance
        assert row['appointment_id'] == case[1][0].id
        assert row['patient_id'] == case[1][0].patient_id
        assert row['stock_balance_after'] is not None
    assert build_ledger_report(case[0], {'batch_id': -1})['transactions'] == []


def test_report_http_auth_validation_and_filters(case, monkeypatch):
    from flask import Flask
    from types import SimpleNamespace
    import app.api.auth as auth
    import app.api.medicine as api
    db, visits, medicine, _, actor = case
    save(case, 10)
    connection = db.connection()
    def scoped_db():
        yield Session(bind=connection, join_transaction_mode='create_savepoint')
    monkeypatch.setattr(api, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor))
    app = Flask(__name__)
    app.register_blueprint(api.medicine_router, url_prefix='/api')
    client = app.test_client()
    assert client.get('/api/medicine/statistics/ledger').status_code == 401
    headers = {'Authorization': 'Bearer QA'}
    assert client.get('/api/medicine/statistics/ledger?from_date=bad', headers=headers).status_code == 400
    assert client.get('/api/medicine/statistics/ledger?batch_id=bad', headers=headers).status_code == 400
    assert client.get('/api/medicine/statistics/ledger?movement_type=bad', headers=headers).status_code == 400
    response = client.get('/api/medicine/statistics/ledger', headers=headers,
        query_string={'medicine_id': medicine.id, 'doctor_id': actor, 'appointment_id': visits[0].id})
    assert response.status_code == 200
    assert response.json['summary']['recorded_revenue'] == 20000
    assert response.json['transactions'][0]['patient_id'] == visits[0].patient_id


def test_receipt_patient_and_type_filters_before_pagination(case):
    from app.models.patient import Patient
    db, visits, _, batches, _ = case
    save(case, 10)
    save(case, 8)
    save(case, 8, 2500)
    patient = db.get(Patient, visits[0].patient_id)
    filters = {'batch_id': batches[0].id, 'patient_search': patient.full_name,
        'per_page': 1, 'page': 2}
    report = build_ledger_report(db, filters)
    assert report['total'] == 3 and len(report['transactions']) == 1
    for movement_type, expected_quantity in [('export', -10), ('return', 2), ('price_adjustment', 0)]:
        report = build_ledger_report(db, {**filters, 'page': 1, 'movement_type': movement_type})
        assert report['total'] == 1
        assert report['transactions'][0]['quantity'] == expected_quantity
        assert report['transactions'][0]['stock_balance_inconsistent'] is False
    assert build_ledger_report(db, {**filters, 'patient_search': uuid4().hex})['total'] == 0
    assert build_ledger_report(db, {**filters, 'batch_id': batches[1].id})['total'] == 0


def test_receipt_legacy_refund_and_missing_snapshots_remain_explicit(case):
    db, visits, medicine, batches, actor = case
    legacy = MedicineTransaction(medicine_id=medicine.id, batch_id=batches[0].id,
        type='import', quantity=1, created_by=actor,
        note=f'Hoàn lại tồn kho - Lịch hẹn ID: {visits[0].id}',
        balance_after=101, stock_balance_after=None)
    db.add(legacy)
    db.flush()
    filters = {'batch_id': batches[0].id, 'movement_type': 'return'}
    row = build_ledger_report(db, filters)['transactions'][0]
    assert row['quantity'] == 1 and row['patient_name'] is None
    assert row['stock_balance_after'] is None
    assert row['stock_balance_inconsistent'] is False
    assert build_ledger_report(db, {**filters, 'patient_search': 'a'})['total'] == 0
    legacy.stock_balance_after = 20
    db.flush()
    row = build_ledger_report(db, filters)['transactions'][0]
    assert row['stock_balance_inconsistent'] is True
    assert row['balance_after'] == 101 and row['stock_balance_after'] == 20
