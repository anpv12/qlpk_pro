"""stock_service helpers split out by topic (allocation); re-exported by app.modules.prescriptions.services.stock_service."""

from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from sqlalchemy import func
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.modules.prescriptions.services.ledger_service import visit_ledger_filter, visit_ledger_payload


ZERO_QUANTITY = Decimal("0")


INVENTORY_PRECISION = Decimal("0.01")


def as_quantity_decimal(value):
    try:
        parsed = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        return ZERO_QUANTITY
    return parsed if parsed.is_finite() else ZERO_QUANTITY


def _inventory_quantity(value):
    return as_quantity_decimal(value).quantize(INVENTORY_PRECISION, rounding=ROUND_HALF_UP)


def _batch_sort_key(batch):
    return (
        batch.expiry_date or date.max,
        batch.import_date or date.max,
        batch.id,
    )


def _load_net_batch_allocations(db, appointment_id, medicine_ids):
    """Return allocations derived only from appointment notes with a batch."""
    allocations = defaultdict(dict)
    invalid = defaultdict(list)
    if not medicine_ids:
        return allocations, invalid

    rows = (
        db.query(
            MedicineTransaction.medicine_id,
            MedicineTransaction.batch_id,
            func.sum(MedicineTransaction.quantity).label("net_quantity"),
        )
        .filter(
            MedicineTransaction.medicine_id.in_(sorted(medicine_ids)),
            MedicineTransaction.batch_id.isnot(None),
            visit_ledger_filter(appointment_id),
        )
        .group_by(MedicineTransaction.medicine_id, MedicineTransaction.batch_id)
        .all()
    )
    for medicine_id, batch_id, net_quantity in rows:
        allocated_quantity = -as_quantity_decimal(net_quantity)
        if allocated_quantity > ZERO_QUANTITY:
            allocations[int(medicine_id)][int(batch_id)] = allocated_quantity
        elif allocated_quantity < ZERO_QUANTITY:
            invalid[int(medicine_id)].append(int(batch_id))
    return allocations, invalid


def _allocation_status(prescribed_quantity, allocated_quantity, integrity_ok):
    if not integrity_ok or allocated_quantity > prescribed_quantity:
        return "inconsistent"
    if prescribed_quantity <= ZERO_QUANTITY:
        return "not_required"
    if allocated_quantity == prescribed_quantity:
        return "allocated"
    if allocated_quantity <= ZERO_QUANTITY:
        return "legacy_untracked"
    return "partially_tracked"


def _medicine_allocation_state(allocations, batches_by_medicine, invalid_allocations, medicine_id, medicines, movements_by_medicine, prescribed_totals, result, today):
    medicine = medicines.get(medicine_id)
    batches = batches_by_medicine.get(medicine_id, [])
    batch_map = {batch.id: batch for batch in batches}
    batch_allocations = []
    allocated_quantity = ZERO_QUANTITY
    integrity_ok = not invalid_allocations.get(medicine_id)
    for batch_id, quantity in sorted(
        allocations.get(medicine_id, {}).items(),
        key=lambda item: _batch_sort_key(batch_map[item[0]]) if item[0] in batch_map else (date.max, date.max, item[0]),
    ):
        batch = batch_map.get(batch_id)
        if not batch:
            integrity_ok = False
            continue
        allocated_quantity += quantity
        batch_allocations.append({
            "batch_id": batch.id,
            "batch_number": batch.batch_number,
            "import_date": batch.import_date.isoformat() if batch.import_date else None,
            "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
            "quantity": float(quantity),
            "remaining_quantity": float(as_quantity_decimal(batch.remaining_quantity)),
        })

    prescribed_quantity = prescribed_totals[medicine_id]
    batch_total = sum(
        (as_quantity_decimal(batch.remaining_quantity) for batch in batches),
        ZERO_QUANTITY,
    )
    available_total = sum(
        (
            as_quantity_decimal(batch.remaining_quantity)
            for batch in batches
            if batch.expiry_date and batch.expiry_date >= today
            and as_quantity_decimal(batch.remaining_quantity) > ZERO_QUANTITY
        ),
        ZERO_QUANTITY,
    )
    aggregate_stock = as_quantity_decimal(medicine.stock_quantity if medicine else 0)
    inventory_consistent = bool(medicine) and _inventory_quantity(aggregate_stock) == _inventory_quantity(batch_total)
    status = _allocation_status(prescribed_quantity, allocated_quantity, integrity_ok)
    result[medicine_id] = {
        "medicine_id": medicine_id,
        "medicine_name": medicine.name if medicine else None,
        "unit": medicine.unit if medicine else None,
        "prescribed_quantity": float(prescribed_quantity),
        "allocated_quantity": float(allocated_quantity),
        "batch_allocations": batch_allocations,
        "stock_movements": movements_by_medicine[medicine_id],
        "batch_count": len(batch_allocations),
        "batch_allocation_complete": status == "allocated",
        "batch_allocation_status": status,
        "allocation_integrity_ok": integrity_ok,
        "aggregate_stock": float(aggregate_stock),
        "batch_total_stock": float(batch_total),
        "available_batch_stock": float(available_total),
        "inventory_consistent": inventory_consistent,
    }


def build_prescription_batch_allocation_states(
    db,
    appointment_id,
    prescribed_totals_by_medicine,
):
    """Build display/read state for current prescription-to-batch allocations."""
    prescribed_totals = {
        int(medicine_id): as_quantity_decimal(quantity)
        for medicine_id, quantity in (prescribed_totals_by_medicine or {}).items()
        if medicine_id and as_quantity_decimal(quantity) > ZERO_QUANTITY
    }
    medicine_ids = sorted(prescribed_totals)
    if not medicine_ids:
        return {}

    medicines = {
        medicine.id: medicine
        for medicine in db.query(Medicine).filter(Medicine.id.in_(medicine_ids)).all()
    }
    batches_by_medicine = defaultdict(list)
    for batch in (
        db.query(MedicineBatch)
        .filter(MedicineBatch.medicine_id.in_(medicine_ids))
        .order_by(
            MedicineBatch.medicine_id.asc(),
            MedicineBatch.expiry_date.asc(),
            MedicineBatch.import_date.asc(),
            MedicineBatch.id.asc(),
        )
        .all()
    ):
        batches_by_medicine[batch.medicine_id].append(batch)

    allocations, invalid_allocations = _load_net_batch_allocations(
        db,
        appointment_id,
        medicine_ids,
    )
    movements_by_medicine = defaultdict(list)
    for movement in visit_ledger_payload(db, appointment_id):
        movements_by_medicine[movement['medicine_id']].append(movement)
    today = date.today()
    result = {}
    for medicine_id in medicine_ids:
        _medicine_allocation_state(allocations, batches_by_medicine, invalid_allocations, medicine_id, medicines, movements_by_medicine, prescribed_totals, result, today)
    return result
