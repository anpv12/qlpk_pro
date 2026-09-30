"""Medication revenue uses movement time and saved prices, never catalog prices."""
from datetime import datetime, time
from sqlalchemy import func, or_, and_, case
from sqlalchemy.orm import joinedload

from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.utils.search_normalization import normalized_contains


def _ledger_medicine_view(complete, cost, page, per_page, query):
    exported = and_(MedicineTransaction.type == 'export', MedicineTransaction.quantity < 0)
    returned = and_(MedicineTransaction.type.in_(('return', 'import')), MedicineTransaction.quantity > 0)
    grouped = query.with_entities(
        Medicine.id.label('medicine_id'), Medicine.name.label('medicine_name'), Medicine.unit,
        func.count(func.distinct(case((exported, MedicineTransaction.operation_id)))).label('dispensing_count'),
        func.sum(case((and_(exported, MedicineTransaction.operation_id.is_(None)), 1), else_=0)).label('untracked_export_rows'),
        func.count(func.distinct(MedicineTransaction.appointment_id)).label('visit_count'),
        func.sum(case((exported, -MedicineTransaction.quantity), else_=0)).label('exported_quantity'),
        func.sum(case((returned, MedicineTransaction.quantity), else_=0)).label('returned_quantity'),
        func.sum(-MedicineTransaction.quantity).label('net_quantity'),
        func.sum(MedicineTransaction.sale_amount_delta).label('recorded_revenue'),
        func.sum(cost).label('recorded_cost'),
        func.sum(case((complete, MedicineTransaction.sale_amount_delta - cost), else_=None)).label('gross_margin_complete_rows'),
        func.sum(case((complete, 0), else_=1)).label('incomplete_rows'),
    ).group_by(Medicine.id, Medicine.name, Medicine.unit)
    total = grouped.count()
    rows = grouped.order_by(Medicine.name, Medicine.id).offset((page - 1) * per_page).limit(per_page).all()
    medicines = []
    for row in rows:
        item = dict(row._mapping)
        for key in ('exported_quantity', 'returned_quantity', 'net_quantity', 'recorded_revenue',
                    'recorded_cost', 'gross_margin_complete_rows'):
            item[key] = float(item[key]) if item[key] is not None else None
        medicines.append(item)
    return dict(success=True, medicines=medicines, total=total, page=page, per_page=per_page,
        total_pages=(total + per_page - 1) // per_page, basis='movement_created_at', is_cash_collected=False)


def _filtered_ledger_query(db, filters):
    query = db.query(MedicineTransaction).join(
        Medicine, Medicine.id == MedicineTransaction.medicine_id
    ).outerjoin(MedicineBatch, MedicineBatch.id == MedicineTransaction.batch_id).outerjoin(
        Appointment, Appointment.id == MedicineTransaction.appointment_id
    ).outerjoin(Patient, Patient.id == Appointment.patient_id).filter(or_(
        MedicineTransaction.appointment_id.isnot(None),
        MedicineTransaction.note.like('Xuất theo đơn thuốc - Lịch hẹn ID: %'),
        MedicineTransaction.note.like('Hoàn lại tồn kho - Lịch hẹn ID: %'),
    ))
    for key, boundary in (('from_date', time.min), ('to_date', time.max)):
        if filters.get(key):
            value = datetime.combine(datetime.strptime(filters[key], '%Y-%m-%d').date(), boundary)
            query = query.filter(MedicineTransaction.created_at >= value if key == 'from_date'
                                 else MedicineTransaction.created_at <= value)
    for key, column in (('doctor_id', Appointment.doctor_id), ('appointment_id', MedicineTransaction.appointment_id),
                        ('medicine_id', MedicineTransaction.medicine_id), ('batch_id', MedicineTransaction.batch_id)):
        if filters.get(key):
            query = query.filter(column == int(filters[key]))
    if filters.get('from_date') and filters.get('to_date') and filters['from_date'] > filters['to_date']:
        raise ValueError('Ngày bắt đầu phải trước ngày kết thúc')
    if filters.get('medicine_type'):
        query = query.filter(Medicine.prescription_type == filters['medicine_type'])
    if filters.get('patient_search', '').strip():
        query = query.filter(normalized_contains(Patient.full_name, filters['patient_search'].strip()))
    if filters.get('movement_type'):
        movement_type = filters['movement_type']
        if movement_type not in ('export', 'return', 'price_adjustment'):
            raise ValueError('Loại giao dịch không hợp lệ')
        if movement_type == 'return':
            query = query.filter(or_(MedicineTransaction.type == 'return', and_(
                MedicineTransaction.type == 'import',
                MedicineTransaction.note.like('Hoàn lại tồn kho - Lịch hẹn ID: %'))))
        else:
            query = query.filter(MedicineTransaction.type == movement_type)
    if filters.get('search'):
        query = query.filter(or_(normalized_contains(Medicine.name, filters['search']),
            normalized_contains(Patient.full_name, filters['search']),
            normalized_contains(MedicineBatch.batch_number, filters['search'])))
    return query


def build_ledger_report(db, filters):
    query = _filtered_ledger_query(db, filters)
    complete = and_(MedicineTransaction.appointment_id.isnot(None),
        MedicineTransaction.batch_id.isnot(None), MedicineTransaction.price.isnot(None),
        MedicineTransaction.sale_amount_delta.isnot(None))
    cost = case((MedicineTransaction.appointment_id.isnot(None),
                 -MedicineTransaction.quantity * MedicineTransaction.price), else_=None)
    page = max(1, int(filters.get('page') or 1))
    per_page = min(100, max(1, int(filters.get('per_page') or 50)))
    if filters.get('view') == 'medicines':
        return _ledger_medicine_view(complete, cost, page, per_page, query)
    total, incomplete, revenue, cost_total, margin = query.with_entities(
        func.count(MedicineTransaction.id),
        func.sum(case((complete, 0), else_=1)),
        func.sum(MedicineTransaction.sale_amount_delta), func.sum(cost),
        func.sum(case((complete, MedicineTransaction.sale_amount_delta - cost), else_=None)),
    ).one()
    rows = query.options(joinedload(MedicineTransaction.batch), joinedload(MedicineTransaction.medicine),
        joinedload(MedicineTransaction.creator)).add_entity(Appointment).add_entity(Patient).order_by(
        MedicineTransaction.created_at.desc(), MedicineTransaction.id.desc()
    ).offset((page - 1) * per_page).limit(per_page).all()
    transactions = []
    for movement, appointment, patient in rows:
        transactions.append({**movement.to_dict(),
            'patient_name': patient.full_name if patient else None,
            'patient_id': patient.id if patient else None,
            'stock_balance_inconsistent': movement.balance_after is not None
                and movement.stock_balance_after is not None
                and movement.balance_after > movement.stock_balance_after,
            'appointment_date': appointment.appointment_date.isoformat() if appointment else None})
    return dict(success=True, transactions=transactions, total=total, page=page, per_page=per_page,
        total_pages=(total + per_page - 1) // per_page,
        summary=dict(incomplete_rows=int(incomplete or 0),
            recorded_revenue=float(revenue) if revenue is not None else None,
            recorded_cost=float(cost_total) if cost_total is not None else None,
            gross_margin_complete_rows=float(margin) if margin is not None else None,
            basis='movement_created_at', is_cash_collected=False,
            warning='Dữ liệu cũ không được suy giá/lượt khám. Lọc bệnh nhân/bác sĩ/lượt khám không bao gồm dòng chưa có liên kết. Tên/đơn vị/loại thuốc là thông tin danh mục hiện tại.'))
