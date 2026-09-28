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


def medicine_report(case, **filters):
    return build_ledger_report(case[0], {'view': 'medicines', 'medicine_id': case[2].id, **filters})


def test_medicine_totals_count_operations_not_receipts_or_retries(case):
    save(case, 120)
    save(case, 120)
    report = medicine_report(case, per_page=1)
    row = report['medicines'][0]
    assert row['dispensing_count'] == row['visit_count'] == 1
    assert row['exported_quantity'] == row['net_quantity'] == 120
    assert row['returned_quantity'] == row['untracked_export_rows'] == 0
    assert row['recorded_revenue'] == 240000
    assert row['recorded_cost'] == 124000
    assert row['gross_margin_complete_rows'] == 116000
    assert report['basis'] == 'movement_created_at'
    assert report['is_cash_collected'] is False


def test_medicine_totals_increase_return_reprice_and_full_return(case):
    save(case, 120)
    save(case, 130, 3000)
    save(case, 90, 4000)
    row = medicine_report(case)['medicines'][0]
    assert row['dispensing_count'] == 2
    assert row['visit_count'] == 1
    assert (row['exported_quantity'], row['returned_quantity'], row['net_quantity']) == (130, 40, 90)
    assert (row['recorded_revenue'], row['recorded_cost'], row['gross_margin_complete_rows']) == (360000, 90000, 270000)
    save(case, 0)
    row = medicine_report(case)['medicines'][0]
    assert row['dispensing_count'] == 2
    assert row['net_quantity'] == row['recorded_revenue'] == row['recorded_cost'] == row['gross_margin_complete_rows'] == 0


def test_monthly_totals_preserve_catalog_prices_and_adjustment_month(case):
    db, visits, medicine, _, _ = case
    save(case, 10, 4000)
    original = db.query(MedicineTransaction).filter_by(medicine_id=medicine.id).one()
    original.created_at = datetime(2026, 8, 31, 23, 59, 59)
    medicine.unit_price = 5000
    save(case, 10, 5000, visit=1)
    second = db.query(MedicineTransaction).filter_by(appointment_id=visits[1].id).one()
    second.created_at = datetime(2026, 9, 1)
    db.flush()
    row = medicine_report(case)['medicines'][0]
    assert row['dispensing_count'] == row['visit_count'] == 2
    assert row['recorded_revenue'] == 90000
    save(case, 10, 4500)
    adjustment = db.query(MedicineTransaction).filter_by(medicine_id=medicine.id, type='price_adjustment').one()
    adjustment.created_at = datetime(2026, 9, 30, 23, 59, 59, 999999)
    db.flush()
    august = medicine_report(case, from_date='2026-08-01', to_date='2026-08-31')['medicines'][0]
    september = medicine_report(case, from_date='2026-09-01', to_date='2026-09-30')['medicines'][0]
    assert august['recorded_revenue'] == 40000
    assert september['recorded_revenue'] == 55000
    assert september['dispensing_count'] == 1
    assert september['net_quantity'] == 10


def test_return_only_month_has_zero_dispensing_and_negative_net(case):
    db, _, medicine, _, _ = case
    save(case, 10)
    db.query(MedicineTransaction).filter_by(medicine_id=medicine.id).one().created_at = datetime(2026, 8, 31)
    save(case, 0)
    db.query(MedicineTransaction).filter_by(medicine_id=medicine.id, type='return').one().created_at = datetime(2026, 9, 1)
    db.flush()
    row = medicine_report(case, from_date='2026-09-01', to_date='2026-09-30')['medicines'][0]
    assert row['dispensing_count'] == row['exported_quantity'] == 0
    assert row['returned_quantity'] == 10 and row['net_quantity'] == -10
    assert row['recorded_revenue'] == -20000 and row['recorded_cost'] == -10000


def test_missing_cost_later_supplied_never_backfills_snapshot(case):
    db, _, _, batches, _ = case
    batches[0].import_price = None
    db.flush()
    save(case, 10)
    batches[0].import_price = 1234
    db.flush()
    row = medicine_report(case)['medicines'][0]
    assert row['recorded_revenue'] == 20000
    assert row['recorded_cost'] is None
    assert row['gross_margin_complete_rows'] is None
    assert row['incomplete_rows'] == 1


def test_zero_price_and_cost_are_known_not_missing(case):
    case[3][0].import_price = 0
    case[0].flush()
    save(case, 10, 0)
    row = medicine_report(case)['medicines'][0]
    assert row['recorded_revenue'] == row['recorded_cost'] == row['gross_margin_complete_rows'] == 0
    assert row['incomplete_rows'] == 0


def test_old_export_without_operation_is_not_invented_as_one_dispensing(case):
    db, _, medicine, _, _ = case
    save(case, 10)
    movement = db.query(MedicineTransaction).filter_by(medicine_id=medicine.id).one()
    movement.operation_id = movement.appointment_id = movement.sale_amount_delta = None
    db.flush()
    row = medicine_report(case)['medicines'][0]
    assert row['dispensing_count'] == row['visit_count'] == 0
    assert row['untracked_export_rows'] == row['incomplete_rows'] == 1
    assert row['exported_quantity'] == 10
    assert row['recorded_revenue'] is None


def test_duplicate_medicine_rows_same_price_are_one_dispensing(case):
    medicine = case[2]
    save(case, 10, extra=dict(medicine_id=medicine.id, name=medicine.name, quantity=5,
                            unit_price=2000, unit='viên', is_external=False))
    row = medicine_report(case)['medicines'][0]
    assert row['dispensing_count'] == 1 and row['net_quantity'] == 15


def test_external_medicine_does_not_enter_stock_report(case):
    save(case, 0, extra=dict(name='Thuốc mua ngoài QA', quantity=10,
                            unit_price=2000, unit='viên', is_external=True))
    assert medicine_report(case)['medicines'] == []
    assert case[2].stock_quantity == 200


def test_fefo_skips_expired_and_uses_earliest_valid_expiry(case):
    db, _, _, batches, _ = case
    batches[0].expiry_date = date.today() - timedelta(days=1)
    batches[1].expiry_date = date.today()
    db.flush()
    save(case, 10)
    assert ledger(case)[0]['batch_id'] == batches[1].id
    assert batches[0].remaining_quantity == 100


def test_medicine_group_filters_and_page_totals(case):
    save(case, 120)
    for batch in case[3]:
        row = medicine_report(case, batch_id=batch.id)['medicines'][0]
        assert row['dispensing_count'] == 1
        assert row['exported_quantity'] == (100 if batch == case[3][0] else 20)
    assert medicine_report(case, search='no-match-' + uuid4().hex)['total'] == 0
    assert medicine_report(case, doctor_id=case[4])['total'] == 1
    assert medicine_report(case, medicine_type='H')['total'] == 0
    report = medicine_report(case, page=2, per_page=1)
    assert report['total'] == report['total_pages'] == 1
    assert report['medicines'] == []
    with pytest.raises(ValueError):
        medicine_report(case, from_date='2026-09-30', to_date='2026-09-01')


def test_two_medicines_same_operation_paginate_by_identity(case):
    db, visits, medicine, batches, actor = case
    other = Medicine(name=medicine.name, unit='ống', unit_price=9000, stock_quantity=0)
    db.add(other)
    db.flush()
    save(case, 10)
    origin = db.query(MedicineTransaction).filter_by(medicine_id=medicine.id).one()
    db.add(MedicineTransaction(medicine_id=other.id, appointment_id=visits[0].id,
        operation_id=origin.operation_id, type='export', quantity=-3,
        price=None, sale_unit_price=9000, sale_amount_delta=27000, created_by=actor))
    db.flush()
    filters = {'view': 'medicines', 'search': medicine.name, 'per_page': 1}
    first = build_ledger_report(db, filters)
    second = build_ledger_report(db, {**filters, 'page': 2})
    assert first['total'] == second['total'] == 2
    assert first['medicines'][0]['medicine_id'] != second['medicines'][0]['medicine_id']
    assert first['medicines'][0]['dispensing_count'] == second['medicines'][0]['dispensing_count'] == 1
    assert first['medicines'][0]['net_quantity'] == 10
    assert second['medicines'][0]['net_quantity'] == 3


def test_fefo_earliest_expiry_precedes_receipt_id(case):
    db, _, _, batches, _ = case
    batches[1].expiry_date = date.today() + timedelta(days=2)
    db.flush()
    save(case, 120)
    assert [(row['batch_id'], row['quantity']) for row in ledger(case)] == [
        (batches[1].id, -100), (batches[0].id, -20)]


def test_adjustment_only_period_has_no_new_dispensing(case):
    db, _, medicine, _, _ = case
    save(case, 10, 4000)
    db.query(MedicineTransaction).filter_by(medicine_id=medicine.id).one().created_at = datetime(2026, 8, 31)
    save(case, 10, 3000)
    db.query(MedicineTransaction).filter_by(medicine_id=medicine.id, type='price_adjustment').one().created_at = datetime(2026, 9, 1)
    db.flush()
    row = medicine_report(case, from_date='2026-09-01', to_date='2026-09-30')['medicines'][0]
    assert row['dispensing_count'] == row['net_quantity'] == row['recorded_cost'] == 0
    assert row['recorded_revenue'] == row['gross_margin_complete_rows'] == -10000


def test_shortage_on_second_medicine_rolls_back_first_medicine_and_report(case):
    db, _, medicine, batches, _ = case
    other = Medicine(name='QA-shortage-' + uuid4().hex, unit='viên', unit_price=2000,
                     stock_quantity=0, prescription_type='BASIC')
    db.add(other)
    db.flush()
    save(case, 10)
    before = ledger(case)
    with pytest.raises(PrescriptionStockValidationError):
        with db.begin_nested():
            save(case, 20, extra=dict(medicine_id=other.id, name=other.name,
                quantity=1, unit_price=2000, is_external=False))
    assert ledger(case) == before
    assert medicine.stock_quantity == 190 and batches[0].remaining_quantity == 90
    assert medicine_report(case)['medicines'][0]['dispensing_count'] == 1


def test_fractional_request_uses_saved_whole_quantity_in_report(case):
    save(case, '7.5', 4000)
    row = medicine_report(case)['medicines'][0]
    assert row['net_quantity'] == 8 and row['recorded_revenue'] == 32000


def test_medicine_lock_blocks_competing_stock_writer():
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError
    from app.modules.prescriptions.services.stock_service import _lock_inventory
    with engine.connect() as first, engine.connect() as second:
        first_transaction = first.begin()
        second_transaction = second.begin()
        first_session = Session(bind=first)
        try:
            medicine_id = first_session.query(Medicine.id).order_by(Medicine.id).first()[0]
            _lock_inventory(first_session, medicine_id)
            with pytest.raises(OperationalError) as error:
                second.execute(text('SELECT id FROM medicines WHERE id=:id FOR UPDATE NOWAIT'), {'id': medicine_id})
            assert error.value.orig.pgcode == '55P03'
        finally:
            first_session.close()
            if first_transaction.is_active:
                first_transaction.rollback()
            if second_transaction.is_active:
                second_transaction.rollback()


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
    response = client.get('/api/medicine/statistics/ledger', headers=headers,
        query_string={'view': 'medicines', 'medicine_id': medicine.id})
    assert response.status_code == 200
    assert response.json['medicines'][0]['dispensing_count'] == 1
    assert client.get('/api/medicine/statistics/ledger?view=medicines&from_date=2026-09-30&to_date=2026-09-01', headers=headers).status_code == 400


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
