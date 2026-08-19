#!/usr/bin/env python3
"""Destructive-but-self-cleaning QA for atomic prescription stock saves.

The script creates isolated appointments and medicines linked to an existing
local patient/doctor, runs real PostgreSQL sessions (including concurrent
ones), verifies invariants, and removes every QA row in ``finally``.

Run explicitly from the repository root:

    python3 scripts/qa_prescription_stock_concurrency.py --run
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
import sys
from threading import Barrier
from uuid import uuid4

from sqlalchemy import func


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import SessionLocal  # noqa: E402
import app.models  # noqa: E402,F401 - register relationships before QA
from app.models.appointment import (  # noqa: E402
    Appointment,
    AppointmentCategory,
    AppointmentStatus,
)
from app.models.medicine import Medicine  # noqa: E402
from app.models.medicine_batch import MedicineBatch  # noqa: E402
from app.models.medicine_transaction import MedicineTransaction  # noqa: E402
from app.models.prescription import Prescription, PrescriptionItem  # noqa: E402
from app.modules.prescriptions.services.save_service import (  # noqa: E402
    PrescriptionStockValidationError,
    normalize_prescription_medicines,
    save_prescription_transaction,
)
from app.modules.prescriptions.services.stock_service import (  # noqa: E402
    prescription_stock_movement_notes,
)
from app.modules.prescriptions.services.read_service import (  # noqa: E402
    build_appointment_prescription_payload,
)


def _assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected={expected!r}, actual={actual!r}")


def _quantity(value):
    return Decimal(str(value or 0))


def _medicine_row(medicine, quantity):
    return {
        "medicine_id": medicine["id"],
        "name": medicine["name"],
        "quantity": quantity,
        "unit": medicine["unit"],
        "unit_price": 1,
        "is_external": False,
        "usage": "{}",
    }


def _save(appointment_id, user_id, medicine_rows):
    session = SessionLocal()
    try:
        return save_prescription_transaction(
            session,
            appointment_id=appointment_id,
            user_id=user_id,
            medicines=normalize_prescription_medicines(medicine_rows),
            usage_instructions="QA atomic stock",
            re_examination_date=None,
        )
    finally:
        session.close()


def _appointment_item_total(session, appointment_id):
    value = (
        session.query(func.coalesce(func.sum(PrescriptionItem.quantity), 0))
        .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
        .filter(
            Prescription.appointment_id == appointment_id,
            PrescriptionItem.is_external.is_(False),
        )
        .scalar()
    )
    return _quantity(value)


def _appointment_audit_total(session, appointment_id):
    value = session.query(
        func.coalesce(func.sum(MedicineTransaction.quantity), 0)
    ).filter(
        MedicineTransaction.note.in_(
            prescription_stock_movement_notes(appointment_id)
        )
    ).scalar()
    return _quantity(value)


def _stock(session, medicine_id):
    return _quantity(
        session.query(Medicine.stock_quantity)
        .filter(Medicine.id == medicine_id)
        .scalar()
    )


def _batch_stock(session, medicine_id):
    value = session.query(
        func.coalesce(func.sum(MedicineBatch.remaining_quantity), 0)
    ).filter(MedicineBatch.medicine_id == medicine_id).scalar()
    return _quantity(value)


def _appointment_batch_allocation(session, appointment_id, medicine_id):
    value = session.query(
        func.coalesce(func.sum(MedicineTransaction.quantity), 0)
    ).filter(
        MedicineTransaction.medicine_id == medicine_id,
        MedicineTransaction.batch_id.isnot(None),
        MedicineTransaction.note.in_(
            prescription_stock_movement_notes(appointment_id)
        ),
    ).scalar()
    return -_quantity(value)


def _seed(marker):
    session = SessionLocal()
    try:
        base = session.query(Appointment).order_by(Appointment.id).first()
        if not base:
            raise RuntimeError("Cần ít nhất một appointment local để gắn dữ liệu QA tạm")

        medicine_specs = [
            ("SEQUENTIAL", 30, (5, 25)),
            ("SAME_APPOINTMENT", 30, (6, 24)),
            ("SHARED_STOCK", 10, (4, 6)),
            ("ATOMIC_A", 10, (4, 6)),
            ("ATOMIC_B", 2, (1, 1)),
            ("EXPIRED", 10, (6, 4)),
            ("LEGACY", 7, (5, 7)),
            ("MULTI_LOT", 600, (100, 500)),
            ("DRIFT", 1, (10,)),
        ]
        medicines = []
        for suffix, stock, batch_quantities in medicine_specs:
            medicine = Medicine(
                name=f"QA {marker} {suffix}",
                internal_code=f"QA-{marker}-{suffix}",
                unit_price=1,
                unit="viên",
                stock_quantity=stock,
                category_type="DRUG",
                prescription_type="BASIC",
                is_active=True,
            )
            session.add(medicine)
            session.flush()
            for batch_index, batch_quantity in enumerate(batch_quantities, start=1):
                is_expired = suffix == "EXPIRED" and batch_index == 1
                session.add(MedicineBatch(
                    medicine_id=medicine.id,
                    batch_number=f"QB-{marker}-{suffix[:8]}-{batch_index}",
                    import_date=date.today() - timedelta(days=60 - batch_index),
                    expiry_date=(
                        date.today() - timedelta(days=1)
                        if is_expired
                        else date.today() + timedelta(days=30 * batch_index)
                    ),
                    quantity=batch_quantity,
                    remaining_quantity=batch_quantity,
                    import_price=1,
                    created_by=base.doctor_id,
                ))
            medicines.append(medicine)

        appointment_keys = (
            "SEQ",
            "SAME",
            "SHARED_A",
            "SHARED_B",
            "ROLLBACK",
            "EXPIRED",
            "LEGACY",
            "MULTI",
            "DRIFT",
        )
        appointments = {}
        prescriptions = {}
        for index, key in enumerate(appointment_keys, start=1):
            appointment = Appointment(
                appointment_code=f"QA-{marker}-{key}",
                patient_id=base.patient_id,
                doctor_id=base.doctor_id,
                appointment_date=datetime.now(),
                status=AppointmentStatus.SCHEDULED,
                appointment_category=AppointmentCategory.NEW,
                is_deleted=False,
                notes=f"Disposable prescription stock QA {marker}",
            )
            session.add(appointment)
            session.flush()
            prescription = Prescription(
                appointment_id=appointment.id,
                prescription_code=f"Q{marker}{index:02d}-C",
                prescription_type="BASIC",
                total_amount=0,
                usage_instructions="QA",
            )
            session.add(prescription)
            prescriptions[key] = prescription
            appointments[key] = appointment.id

        session.flush()
        session.add(PrescriptionItem(
            prescription_id=prescriptions["LEGACY"].id,
            medicine_id=medicines[6].id,
            medicine_name=medicines[6].name,
            unit_price=1,
            quantity=5,
            unit=medicines[6].unit,
            usage="{}",
            is_external=False,
        ))
        session.add(MedicineTransaction(
            medicine_id=medicines[6].id,
            batch_id=None,
            type="export",
            quantity=-5,
            price=0,
            note=prescription_stock_movement_notes(appointments["LEGACY"])[0],
            created_by=base.doctor_id,
            created_at=datetime.now(),
        ))

        session.commit()
        return {
            "user_id": base.doctor_id,
            "appointments": appointments,
            "medicines": {
                "sequential": {
                    "id": medicines[0].id,
                    "name": medicines[0].name,
                    "unit": medicines[0].unit,
                },
                "same": {
                    "id": medicines[1].id,
                    "name": medicines[1].name,
                    "unit": medicines[1].unit,
                },
                "shared": {
                    "id": medicines[2].id,
                    "name": medicines[2].name,
                    "unit": medicines[2].unit,
                },
                "atomic_ok": {
                    "id": medicines[3].id,
                    "name": medicines[3].name,
                    "unit": medicines[3].unit,
                },
                "atomic_fail": {
                    "id": medicines[4].id,
                    "name": medicines[4].name,
                    "unit": medicines[4].unit,
                },
                "expired": {
                    "id": medicines[5].id,
                    "name": medicines[5].name,
                    "unit": medicines[5].unit,
                },
                "legacy": {
                    "id": medicines[6].id,
                    "name": medicines[6].name,
                    "unit": medicines[6].unit,
                },
                "multi_lot": {
                    "id": medicines[7].id,
                    "name": medicines[7].name,
                    "unit": medicines[7].unit,
                },
                "drift": {
                    "id": medicines[8].id,
                    "name": medicines[8].name,
                    "unit": medicines[8].unit,
                },
            },
        }
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _cleanup(marker):
    session = SessionLocal()
    try:
        appointment_ids = [
            row[0]
            for row in session.query(Appointment.id)
            .filter(Appointment.appointment_code.like(f"QA-{marker}-%"))
            .all()
        ]
        medicine_ids = [
            row[0]
            for row in session.query(Medicine.id)
            .filter(Medicine.internal_code.like(f"QA-{marker}-%"))
            .all()
        ]
        prescription_ids = [
            row[0]
            for row in session.query(Prescription.id)
            .filter(Prescription.appointment_id.in_(appointment_ids or [-1]))
            .all()
        ]

        session.query(MedicineTransaction).filter(
            MedicineTransaction.medicine_id.in_(medicine_ids or [-1])
        ).delete(synchronize_session=False)
        session.query(MedicineBatch).filter(
            MedicineBatch.medicine_id.in_(medicine_ids or [-1])
        ).delete(synchronize_session=False)
        session.query(PrescriptionItem).filter(
            PrescriptionItem.prescription_id.in_(prescription_ids or [-1])
        ).delete(synchronize_session=False)
        session.query(Prescription).filter(
            Prescription.id.in_(prescription_ids or [-1])
        ).delete(synchronize_session=False)
        session.query(Appointment).filter(
            Appointment.id.in_(appointment_ids or [-1])
        ).delete(synchronize_session=False)
        session.query(Medicine).filter(
            Medicine.id.in_(medicine_ids or [-1])
        ).delete(synchronize_session=False)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _run_sequential_case(context):
    appointment_id = context["appointments"]["SEQ"]
    medicine = context["medicines"]["sequential"]
    user_id = context["user_id"]
    results = [
        _save(appointment_id, user_id, [_medicine_row(medicine, quantity)])
        for quantity in (5, 5, 7, 3)
    ]

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine["id"]), Decimal("27.00"), "sequential stock")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("27.000"), "sequential batch stock")
        _assert_equal(_appointment_item_total(session, appointment_id), Decimal("3.000"), "sequential item")
        _assert_equal(_appointment_audit_total(session, appointment_id), Decimal("-3.00"), "sequential audit")
        _assert_equal(
            _appointment_batch_allocation(session, appointment_id, medicine["id"]),
            Decimal("3.00"),
            "sequential current batch allocation",
        )
        count = session.query(func.count(MedicineTransaction.id)).filter(
            MedicineTransaction.note.in_(
                prescription_stock_movement_notes(appointment_id)
            )
        ).scalar()
        _assert_equal(count, 4, "identical save must not append a zero-delta movement")
        final_state = results[-1]["stock_allocation_states"][0]
        _assert_equal(final_state["batch_allocation_status"], "allocated", "allocation status")
        _assert_equal(final_state["batch_count"], 1, "reverse-FEFO refund preserves earliest lot")
    finally:
        session.close()
    print("[OK] sequential_delta: 0->5, repeat 5, 5->7, 7->3")


def _run_same_appointment_case(context):
    appointment_id = context["appointments"]["SAME"]
    medicine = context["medicines"]["same"]
    barrier = Barrier(2)

    def worker(quantity):
        barrier.wait()
        _save(
            appointment_id,
            context["user_id"],
            [_medicine_row(medicine, quantity)],
        )
        return quantity

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(worker, (5, 7)))
    _assert_equal(sorted(results), [5, 7], "same appointment requests")

    session = SessionLocal()
    try:
        final_quantity = _appointment_item_total(session, appointment_id)
        if final_quantity not in {Decimal("5.000"), Decimal("7.000")}:
            raise AssertionError(f"unexpected final serialized quantity: {final_quantity}")
        _assert_equal(
            _stock(session, medicine["id"]),
            Decimal("30.00") - final_quantity,
            "same appointment stock follows final item state",
        )
        _assert_equal(
            _batch_stock(session, medicine["id"]),
            Decimal("30.000") - final_quantity,
            "same appointment batch stock follows final item state",
        )
        _assert_equal(
            _appointment_audit_total(session, appointment_id),
            -final_quantity,
            "same appointment audit net follows final item state",
        )
    finally:
        session.close()
    print("[OK] concurrent_same_appointment: serialized by appointment row")


def _run_shared_stock_case(context):
    appointments = (
        context["appointments"]["SHARED_A"],
        context["appointments"]["SHARED_B"],
    )
    medicine = context["medicines"]["shared"]
    barrier = Barrier(2)

    def worker(appointment_id):
        barrier.wait()
        try:
            _save(
                appointment_id,
                context["user_id"],
                [_medicine_row(medicine, 7)],
            )
            return "saved"
        except PrescriptionStockValidationError:
            return "insufficient"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(worker, appointments))
    _assert_equal(sorted(outcomes), ["insufficient", "saved"], "shared stock outcomes")

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine["id"]), Decimal("3.00"), "shared stock")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("3.000"), "shared batch stock")
        saved_total = sum(
            (_appointment_item_total(session, appointment_id) for appointment_id in appointments),
            Decimal("0"),
        )
        _assert_equal(saved_total, Decimal("7.000"), "only one appointment dispensed")
        audit_total = sum(
            (_appointment_audit_total(session, appointment_id) for appointment_id in appointments),
            Decimal("0"),
        )
        _assert_equal(audit_total, Decimal("-7.00"), "shared stock audit")
    finally:
        session.close()
    print("[OK] concurrent_different_appointments: no oversell/lost update")


def _run_atomic_rollback_case(context):
    appointment_id = context["appointments"]["ROLLBACK"]
    medicine_ok = context["medicines"]["atomic_ok"]
    medicine_fail = context["medicines"]["atomic_fail"]
    try:
        _save(
            appointment_id,
            context["user_id"],
            [
                _medicine_row(medicine_ok, 3),
                _medicine_row(medicine_fail, 3),
            ],
        )
        raise AssertionError("multi-medicine save should fail on insufficient stock")
    except PrescriptionStockValidationError:
        pass

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine_ok["id"]), Decimal("10.00"), "rollback first stock")
        _assert_equal(_stock(session, medicine_fail["id"]), Decimal("2.00"), "rollback failing stock")
        _assert_equal(_batch_stock(session, medicine_ok["id"]), Decimal("10.000"), "rollback first batches")
        _assert_equal(_batch_stock(session, medicine_fail["id"]), Decimal("2.000"), "rollback failing batches")
        _assert_equal(_appointment_item_total(session, appointment_id), Decimal("0"), "rollback items")
        _assert_equal(_appointment_audit_total(session, appointment_id), Decimal("0"), "rollback audit")
    finally:
        session.close()
    print("[OK] multi_medicine_rollback: all-or-nothing")


def _run_expired_batch_case(context):
    appointment_id = context["appointments"]["EXPIRED"]
    medicine = context["medicines"]["expired"]
    try:
        _save(appointment_id, context["user_id"], [_medicine_row(medicine, 5)])
        raise AssertionError("expired stock must not be dispensed")
    except PrescriptionStockValidationError as error:
        message = "\n".join(error.errors)
        if "tồn khả dụng 4" not in message or "thiếu 1" not in message:
            raise AssertionError(f"shortage message is not explicit: {message}")

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine["id"]), Decimal("10.00"), "expired aggregate rollback")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("10.000"), "expired batches rollback")
        _assert_equal(_appointment_item_total(session, appointment_id), Decimal("0"), "expired item rollback")
    finally:
        session.close()
    print("[OK] expired_batch_shortage: expired lot excluded with explicit shortage")


def _run_legacy_and_mixed_refund_case(context):
    appointment_id = context["appointments"]["LEGACY"]
    medicine = context["medicines"]["legacy"]
    unchanged = _save(
        appointment_id,
        context["user_id"],
        [_medicine_row(medicine, 5)],
    )
    state = unchanged["stock_allocation_states"][0]
    _assert_equal(state["batch_allocation_status"], "legacy_untracked", "legacy read status")

    legacy_refund = _save(
        appointment_id,
        context["user_id"],
        [_medicine_row(medicine, 3)],
    )
    legacy_update = legacy_refund["stock_updates"][0]
    _assert_equal(Decimal(str(legacy_update["quantity_refunded"])), Decimal("2.0"), "legacy refund payload")
    _assert_equal(legacy_update["batch_movements"], [], "legacy refund must not guess a batch")

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine["id"]), Decimal("9.00"), "legacy aggregate refund")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("12.000"), "legacy batches unchanged")
        _assert_equal(_appointment_item_total(session, appointment_id), Decimal("3.000"), "legacy item reduced")
        _assert_equal(_appointment_audit_total(session, appointment_id), Decimal("-3.00"), "legacy audit net")
        _assert_equal(
            _appointment_batch_allocation(session, appointment_id, medicine["id"]),
            Decimal("0"),
            "legacy refund has no batch allocation",
        )
    finally:
        session.close()

    _save(appointment_id, context["user_id"], [_medicine_row(medicine, 3)])
    mixed_issue = _save(
        appointment_id,
        context["user_id"],
        [_medicine_row(medicine, 8)],
    )
    mixed_state = mixed_issue["stock_allocation_states"][0]
    _assert_equal(mixed_state["batch_allocation_status"], "partially_tracked", "mixed allocation status")
    _assert_equal(Decimal(str(mixed_state["allocated_quantity"])), Decimal("5.0"), "mixed tracked quantity")

    _save(appointment_id, context["user_id"], [_medicine_row(medicine, 6)])
    _save(appointment_id, context["user_id"], [])

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine["id"]), Decimal("12.00"), "mixed final aggregate")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("12.000"), "mixed final batches")
        _assert_equal(_appointment_item_total(session, appointment_id), Decimal("0"), "mixed final item")
        _assert_equal(_appointment_audit_total(session, appointment_id), Decimal("0.00"), "mixed final audit")
        _assert_equal(
            _appointment_batch_allocation(session, appointment_id, medicine["id"]),
            Decimal("0.00"),
            "mixed final batch allocation",
        )
        transaction_count = session.query(func.count(MedicineTransaction.id)).filter(
            MedicineTransaction.note.in_(prescription_stock_movement_notes(appointment_id))
        ).scalar()
        _assert_equal(transaction_count, 6, "repeat save must not add legacy or batch movement")
    finally:
        session.close()
    print("[OK] legacy_and_mixed_refund: aggregate-only legacy + exact tracked-lot refund")


def _run_multi_lot_fefo_case(context):
    appointment_id = context["appointments"]["MULTI"]
    medicine = context["medicines"]["multi_lot"]
    result = _save(
        appointment_id,
        context["user_id"],
        [_medicine_row(medicine, 400)],
    )

    session = SessionLocal()
    try:
        batches = (
            session.query(MedicineBatch)
            .filter(MedicineBatch.medicine_id == medicine["id"])
            .order_by(MedicineBatch.expiry_date.asc(), MedicineBatch.id.asc())
            .all()
        )
        _assert_equal(
            [_quantity(batch.remaining_quantity) for batch in batches],
            [Decimal("0.000"), Decimal("200.000")],
            "FEFO 100 + 300 allocation",
        )
        _assert_equal(_stock(session, medicine["id"]), Decimal("200.00"), "multi-lot aggregate")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("200.000"), "multi-lot batches")
        read_payload = build_appointment_prescription_payload(session, appointment_id)
        read_allocation = read_payload["medicines"][0]["batch_allocation"]
        _assert_equal(read_allocation["batch_count"], 2, "read payload batch count")
        _assert_equal(read_allocation["batch_allocation_complete"], True, "read payload allocation complete")
    finally:
        session.close()

    state = result["stock_allocation_states"][0]
    _assert_equal(state["batch_count"], 2, "multi-lot allocation count")
    _assert_equal(
        [Decimal(str(item["quantity"])) for item in state["batch_allocations"]],
        [Decimal("100.0"), Decimal("300.0")],
        "multi-lot allocation details",
    )
    print("[OK] multi_lot_fefo: lot 100 + lot 500 dispenses 400 as 100 + 300")


def _run_inventory_drift_transition_case(context):
    appointment_id = context["appointments"]["DRIFT"]
    medicine = context["medicines"]["drift"]
    result = _save(appointment_id, context["user_id"], [_medicine_row(medicine, 1)])
    state = result["stock_allocation_states"][0]
    _assert_equal(state["inventory_consistent"], False, "drift remains visible in read state")

    try:
        _save(appointment_id, context["user_id"], [_medicine_row(medicine, 2)])
        raise AssertionError("aggregate stock must still cap dispensing")
    except PrescriptionStockValidationError as error:
        message = "\n".join(error.errors)
        if "tồn khả dụng 0" not in message or "thiếu 1" not in message:
            raise AssertionError(f"aggregate shortage message is not explicit: {error.errors}")

    session = SessionLocal()
    try:
        _assert_equal(_stock(session, medicine["id"]), Decimal("0.00"), "drift aggregate after allowed issue")
        _assert_equal(_batch_stock(session, medicine["id"]), Decimal("9.000"), "drift batch after allowed issue")
        _assert_equal(_appointment_item_total(session, appointment_id), Decimal("1.000"), "drift item after rollback")
        _assert_equal(_appointment_audit_total(session, appointment_id), Decimal("-1.00"), "drift audit after rollback")
    finally:
        session.close()
    print("[OK] inventory_drift_transition: mismatch allowed, aggregate still caps dispensing")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--run",
        action="store_true",
        help="create disposable rows, run concurrency QA, then delete them",
    )
    args = parser.parse_args()
    if not args.run:
        parser.error("refusing DB writes without explicit --run")

    marker = uuid4().hex[:8].upper()
    try:
        context = _seed(marker)
        _run_sequential_case(context)
        _run_same_appointment_case(context)
        _run_shared_stock_case(context)
        _run_atomic_rollback_case(context)
        _run_expired_batch_case(context)
        _run_legacy_and_mixed_refund_case(context)
        _run_multi_lot_fefo_case(context)
        _run_inventory_drift_transition_case(context)
        print("[OK] prescription_stock_concurrency")
    finally:
        _cleanup(marker)
        print(f"[CLEANUP] removed disposable QA marker {marker}")


if __name__ == "__main__":
    main()
