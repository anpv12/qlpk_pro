"""Append-only financial evidence attached to the stock owner's atomic save."""
from decimal import Decimal

from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload

from app.models.medicine_transaction import MedicineTransaction


def visit_ledger_filter(appointment_id):
    from app.modules.prescriptions.services.stock_service import prescription_stock_movement_notes
    return or_(
        MedicineTransaction.appointment_id == appointment_id,
        and_(MedicineTransaction.appointment_id.is_(None),
             MedicineTransaction.note.in_(prescription_stock_movement_notes(appointment_id))),
    )


def open_exports(db, appointment_id, medicine_id, batch_id=None):
    db.flush()
    rows = db.query(MedicineTransaction).filter(
        MedicineTransaction.appointment_id == appointment_id,
        MedicineTransaction.medicine_id == medicine_id,
    ).order_by(MedicineTransaction.id).all()
    states = {}
    for row in rows:
        if row.type == 'export' and (batch_id is None or row.batch_id == batch_id):
            states[row.id] = {'origin': row, 'quantity': -row.quantity, 'price': row.sale_unit_price}
        elif row.original_transaction_id in states:
            state = states[row.original_transaction_id]
            if row.type == 'return':
                state['quantity'] -= row.quantity
            elif row.type == 'price_adjustment':
                state['price'] = row.sale_unit_price
    return [state for state in reversed(list(states.values())) if state['quantity'] > 0]


def append_dispensing_movement(db, *, medicine_id, appointment_id, batch_id,
                              quantity, is_export, user_id, unit_cost, balance_after,
                              operation_id, sale_unit_price, note, stock_balance_after):
    common = dict(medicine_id=medicine_id, appointment_id=appointment_id,
                  batch_id=batch_id, operation_id=operation_id, created_by=user_id, note=note)
    if is_export:
        db.add(MedicineTransaction(**common, type='export', quantity=-quantity,
            stock_balance_after=stock_balance_after,
            price=unit_cost, balance_after=balance_after, sale_unit_price=sale_unit_price,
            sale_amount_delta=quantity * sale_unit_price if sale_unit_price is not None else None))
        return
    remaining = quantity
    running_balance = Decimal(str(balance_after)) - quantity if balance_after is not None else None
    running_stock = Decimal(str(stock_balance_after)) - quantity
    for state in open_exports(db, appointment_id, medicine_id, batch_id) if batch_id is not None else []:
        returned = min(remaining, state['quantity'])
        if returned <= 0:
            break
        if running_balance is not None:
            running_balance += returned
        running_stock += returned
        db.add(MedicineTransaction(**common, type='return', quantity=returned,
            stock_balance_after=running_stock,
            price=state['origin'].price, balance_after=running_balance,
            original_transaction_id=state['origin'].id, sale_unit_price=state['price'],
            sale_amount_delta=-returned * state['price'] if state['price'] is not None else None))
        remaining -= returned
    if remaining > 0:
        db.add(MedicineTransaction(**common, type='return', quantity=remaining,
            stock_balance_after=stock_balance_after,
            price=unit_cost, balance_after=balance_after))


def reprice_open_exports(db, *, appointment_id, medicine_id, sale_unit_price, operation_id, user_id,
                         stock_balance_after, batch_balances):
    if sale_unit_price is None:
        return
    for state in open_exports(db, appointment_id, medicine_id):
        old_price = state['price']
        if old_price is None or old_price == sale_unit_price:
            continue
        origin = state['origin']
        db.add(MedicineTransaction(medicine_id=medicine_id, appointment_id=appointment_id,
            batch_id=origin.batch_id, operation_id=operation_id, created_by=user_id,
            original_transaction_id=origin.id, type='price_adjustment', quantity=0,
            price=origin.price, sale_unit_price=sale_unit_price,
            balance_after=batch_balances.get(origin.batch_id), stock_balance_after=stock_balance_after,
            sale_amount_delta=state['quantity'] * (sale_unit_price - old_price),
            note='Điều chỉnh giá bán khi lưu đơn; không thay đổi tồn kho'))


def visit_ledger_payload(db, appointment_id):
    rows = db.query(MedicineTransaction).options(
        joinedload(MedicineTransaction.batch), joinedload(MedicineTransaction.medicine),
        joinedload(MedicineTransaction.creator),
    ).filter(visit_ledger_filter(appointment_id)).order_by(
        MedicineTransaction.created_at, MedicineTransaction.id).all()
    return [row.to_dict() for row in rows]
