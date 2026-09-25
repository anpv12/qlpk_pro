"""Medicine is the current-price owner; history records server-timed intervals."""
from datetime import timedelta
from decimal import Decimal
from sqlalchemy import func, select
from app.models.medicine_price_history import MedicinePriceHistory
from app.models.user import User


def record_price(db, medicine, actor_id, old_price):
    previous = db.query(MedicinePriceHistory).filter_by(medicine_id=medicine.id, effective_to=None).first()
    now = db.scalar(select(func.clock_timestamp()))
    if previous:
        now = max(now, previous.effective_from + timedelta(microseconds=1))
        previous.effective_to = now
        db.flush()  # Close the previous interval before inserting the unique open interval.
    db.add(MedicinePriceHistory(medicine_id=medicine.id, old_price=old_price,
        new_price=medicine.unit_price, effective_from=now, changed_by=actor_id))
    db.flush()


def price_payload(db, medicine, before_id=None):
    latest_id = db.query(func.max(MedicinePriceHistory.id)).filter_by(medicine_id=medicine.id).scalar()
    query = db.query(MedicinePriceHistory, User.full_name).join(User, User.id == MedicinePriceHistory.changed_by).filter(
        MedicinePriceHistory.medicine_id == medicine.id)
    if before_id is not None:
        query = query.filter(MedicinePriceHistory.id < before_id)
    rows = query.order_by(MedicinePriceHistory.id.desc()).limit(21).all()
    history = [{'id': row.id, 'old_price': str(row.old_price) if row.old_price is not None else None,
        'new_price': str(row.new_price),
        'difference': str(row.new_price - row.old_price) if row.old_price is not None else None,
        'effective_from': row.effective_from.isoformat(),
        'effective_to': row.effective_to.isoformat() if row.effective_to else None,
        'changed_by': name} for row, name in rows[:20]]
    return {'medicine_id': medicine.id, 'current_price': format(medicine.unit_price, '.2f'),
            'revision': latest_id, 'history': history,
            'next_before_id': history[-1]['id'] if len(rows) > 20 else None}


def update_price(db, medicine, data, actor_id):
    from .catalog_service import CatalogValidationError, nonnegative_number
    if not isinstance(data, dict) or set(data) != {'new_price', 'expected_price', 'expected_revision'}:
        raise CatalogValidationError('Hãy mở lại Cập nhật giá và nhập giá mới.')
    if any(isinstance(data[key], bool) or data[key] in (None, '') for key in ('new_price', 'expected_price')):
        raise CatalogValidationError('Hãy nhập giá bán hợp lệ.')
    new = nonnegative_number(data['new_price'], 'unit_price')
    expected = nonnegative_number(data['expected_price'], 'unit_price')
    if new > Decimal('99999999.99'):
        raise CatalogValidationError('Giá bán vượt giới hạn cho phép.')
    revision = db.query(func.max(MedicinePriceHistory.id)).filter_by(medicine_id=medicine.id).scalar()
    supplied = data['expected_revision']
    if (supplied is not None and type(supplied) is not int) or revision != supplied or medicine.unit_price != expected:
        raise CatalogValidationError('Giá đã được thay đổi. Hãy mở lại để xem giá mới nhất.', 409)
    if new == medicine.unit_price:
        return False
    old = medicine.unit_price
    medicine.unit_price = new
    record_price(db, medicine, actor_id, old)
    return True
