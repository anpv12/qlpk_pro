"""Delete guard checks real usage (prescriptions/inventory), never price history alone."""
import os
from uuid import uuid4
import pytest
from test_inventory_receipts import case, pytestmark
from app.models.medicine import Medicine
from app.models.medicine_price_history import MedicinePriceHistory
from app.models.prescription import Prescription, PrescriptionItem


def test_medicine_with_price_history_only_can_be_deleted(case):
    db, med, actor, _, client, _ = case
    medicine_id = med.id
    db.add(MedicinePriceHistory(medicine_id=med.id, old_price=None, new_price=2000,
                                 effective_from=db.query(Medicine).first().created_at, changed_by=actor))
    db.flush()
    response = client.delete(f'/api/medicines/{medicine_id}')
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert db.query(Medicine).filter_by(id=medicine_id).first() is None
    assert db.query(MedicinePriceHistory).filter_by(medicine_id=medicine_id).first() is None


def test_medicine_used_in_prescription_cannot_be_deleted(case):
    db, med, _, appointment, client, _ = case
    prescription = Prescription(appointment_id=appointment, prescription_code='QA-'+uuid4().hex[:14])
    db.add(prescription)
    db.flush()
    db.add(PrescriptionItem(prescription_id=prescription.id, medicine_id=med.id, medicine_name=med.name))
    db.flush()
    response = client.delete(f'/api/medicines/{med.id}')
    assert response.status_code == 409
    body = response.get_json()
    assert 'đơn thuốc' in body['error']
    assert body['user_message'] == body['error']
    db.expire_all()
    assert db.query(Medicine).filter_by(id=med.id).first() is not None


def test_medicine_with_inventory_transaction_cannot_be_deleted(case):
    db, med, actor, _, client, payload = case
    assert client.post('/api/medicine-batches/', json=payload).status_code == 201
    response = client.delete(f'/api/medicines/{med.id}')
    assert response.status_code == 409
    body = response.get_json()
    assert 'giao dịch' in body['error']
    assert body['user_message'] == body['error']
    db.expire_all()
    assert db.query(Medicine).filter_by(id=med.id).first() is not None
