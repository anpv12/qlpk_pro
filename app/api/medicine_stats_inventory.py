"""app.api.medicine: phần 4 — tách từ medicine.py (import ở cuối medicine.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.utils.search_normalization import normalized_contains
from sqlalchemy import or_
from app.api.medicine import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    latest_batch_of,
    medicine_router,
)
from app.utils.api_error_contract import api_error_boundary


INVENTORY_TYPE_LABELS = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}


def _inventory_status(stock_qty, threshold):
    if threshold and stock_qty <= threshold:
        return 'Cần nhập' if stock_qty == 0 else 'Sắp hết'
    return 'Đủ hàng'


def _inventory_medicine_row(med, dispensed_map):
    # SL bán = from prescription_items (real dispensing data)
    stock_qty = float(med.stock_quantity) if med.stock_quantity else 0
    latest_batch = latest_batch_of(med.batches)
    import_price = (float(latest_batch.import_price)
                    if latest_batch and latest_batch.import_price is not None else None)
    return {
        'id': med.id,
        'internal_code': med.internal_code or '-',
        'name': med.name,
        'medicine_type': INVENTORY_TYPE_LABELS.get(med.prescription_type, 'Cơ bản'),
        'unit': med.unit or 'viên',
        'import_price': import_price,
        'unit_price': float(med.unit_price) if med.unit_price else 0,
        'export_quantity': dispensed_map.get(med.id, 0),
        'stock_quantity': stock_qty,
        'batch_number': latest_batch.batch_number if latest_batch else '-',
        'expiry_date': latest_batch.expiry_date.strftime('%d/%m/%Y') if latest_batch and latest_batch.expiry_date else '-',
        'status': _inventory_status(stock_qty, med.low_stock_threshold)
    }


def _query_inventory_medicines(db, medicine_type, search):
    from sqlalchemy.orm import joinedload
    query = db.query(Medicine).filter(Medicine.is_active == True)
    if medicine_type:
        query = query.filter(Medicine.prescription_type == medicine_type)
    if search:
        query = query.filter(
            or_(
                normalized_contains(Medicine.name, search),
                normalized_contains(Medicine.internal_code, search),
            )
        )
    return query.options(joinedload(Medicine.batches)).order_by(Medicine.name).all()


@medicine_router.route('/medicine/statistics/inventory', methods=['GET'])
@require_auth
@api_error_boundary(success=False, detail='{error}')
def get_statistics_inventory(user):
    """
    Lấy danh sách thuốc với thông tin tồn kho
    Query params: search, medicine_type
    """
    from app.api.medicine_stats_export import _parse_export_dates, _query_dispensed_map

    db = next(get_db())
    try:
        search = request.args.get('search', '').strip().lower()
        medicine_type = request.args.get('medicine_type')
        from_date_obj, to_date_obj = _parse_export_dates(request.args.get('from_date'), request.args.get('to_date'))
        dispensed_map = _query_dispensed_map(db, from_date_obj, to_date_obj, request.args.get('doctor_id'))
        data = [_inventory_medicine_row(med, dispensed_map) for med in _query_inventory_medicines(db, medicine_type, search)]
        total_export = 0
        total_stock = 0
        for row in data:
            total_export += row['export_quantity']
            total_stock += row['stock_quantity']

        return jsonify({
            'success': True,
            'summary': {
                'total_export': total_export,
                'total_stock': total_stock
            },
            'medicines': data
        }), 200

    finally:
        db.close()


def _query_history_items_with_search(db, filters):
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    items_query = db.query(PrescriptionItem).join(
        Prescription, PrescriptionItem.prescription_id == Prescription.id
    ).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).join(
        UserModel, Appointment.doctor_id == UserModel.id
    ).join(
        Patient, Appointment.patient_id == Patient.id
    )
    if filters['from_date_obj']:
        items_query = items_query.filter(Appointment.appointment_date >= filters['from_date_obj'])
    if filters['to_date_obj']:
        items_query = items_query.filter(Appointment.appointment_date <= filters['to_date_obj'])
    if filters['doctor_id']:
        items_query = items_query.filter(Appointment.doctor_id == int(filters['doctor_id']))
    search = filters['search']
    if search:
        items_query = items_query.filter(
            or_(
                normalized_contains(PrescriptionItem.medicine_name, search),
                normalized_contains(Patient.full_name, search),
                normalized_contains(UserModel.full_name, search),
            )
        )
    if filters['medicine_type']:
        med_ids = db.query(Medicine.id).filter(Medicine.prescription_type == filters['medicine_type']).subquery()
        items_query = items_query.filter(PrescriptionItem.medicine_id.in_(med_ids))
    return items_query.order_by(
        PrescriptionItem.medicine_name,
        UserModel.full_name,
        Appointment.appointment_date.desc()
    ).all()


def _history_medicine_info(med, item):
    if med:
        return {
            'medicine_type': INVENTORY_TYPE_LABELS.get(med.prescription_type, 'Cơ bản'),
            'generic_name': med.generic_name or '',
            'current_stock': float(med.stock_quantity) if med.stock_quantity else 0,
            'unit': med.unit or 'viên',
            'unit_price': float(med.unit_price) if med.unit_price else 0
        }
    return {
        'medicine_type': 'Cơ bản',
        'generic_name': '',
        'current_stock': 0,
        'unit': item.unit or 'viên',
        'unit_price': float(item.unit_price) if item.unit_price else 0
    }



def _add_history_totals(entry, qty, amount):
    entry['total_prescriptions'] += 1
    entry['total_quantity'] += qty
    entry['total_amount'] += amount


def _add_history_item(db, medicines_map, medicine_cache, item):
    prescription = item.prescription
    appointment = prescription.appointment
    doctor = appointment.doctor
    patient = appointment.patient
    med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
    med_key = item.medicine_id if item.medicine_id else f"external:{item.id}"
    doc_id = doctor.id if doctor else 0
    if med_key not in medicine_cache:
        medicine_cache[med_key] = _history_medicine_info(med, item)
    med_info = medicine_cache[med_key]
    qty = float(item.quantity) if item.quantity else 0
    price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
    amount = qty * price
    if med_key not in medicines_map:
        medicines_map[med_key] = {
            'medicine_id': item.medicine_id,
            'medicine_name': med.name if med else item.medicine_name,
            'generic_name': med_info['generic_name'],
            'medicine_type': med_info['medicine_type'],
            'current_stock': med_info['current_stock'],
            'unit': med_info['unit'],
            'total_prescriptions': 0,
            'total_quantity': 0,
            'total_amount': 0,
            'doctors': {}
        }
    med_entry = medicines_map[med_key]
    _add_history_totals(med_entry, qty, amount)
    if doc_id not in med_entry['doctors']:
        med_entry['doctors'][doc_id] = {
            'doctor_id': doc_id,
            'doctor_name': doctor.full_name if doctor else 'Chưa xác định',
            'total_prescriptions': 0,
            'total_quantity': 0,
            'total_amount': 0,
            'items': []
        }
    doc_entry = med_entry['doctors'][doc_id]
    _add_history_totals(doc_entry, qty, amount)
    doc_entry['items'].append({
        'date': appointment.appointment_date.strftime('%d/%m/%Y') if appointment.appointment_date else '',
        'patient_name': patient.full_name if patient else 'N/A',
        'prescription_code': prescription.prescription_code or '',
        'quantity': qty,
        'source': 'Bên ngoài' if item.is_external else 'Phòng khám',
        'unit_price': price,
        'amount': amount
    })


@medicine_router.route('/medicine/statistics/prescription-history', methods=['GET'])
@require_auth
@api_error_boundary(success=False, detail='{error}')
def get_statistics_prescription_history(user):
    """
    Lịch sử kê thuốc: group by Medicine → Doctor → chi tiết từng đơn
    Query params: from_date, to_date, doctor_id, medicine_type, search
    """
    from app.api.medicine_stats_export import _parse_export_dates

    db = next(get_db())
    try:
        from_date_obj, to_date_obj = _parse_export_dates(request.args.get('from_date'), request.args.get('to_date'))
        filters = {
            'from_date_obj': from_date_obj,
            'to_date_obj': to_date_obj,
            'doctor_id': request.args.get('doctor_id'),
            'medicine_type': request.args.get('medicine_type'),
            'search': request.args.get('search', '').strip().lower(),
        }
        medicines_map = {}
        medicine_cache = {}
        for item in _query_history_items_with_search(db, filters):
            _add_history_item(db, medicines_map, medicine_cache, item)

        medicines_list = []
        for med_data in medicines_map.values():
            med_data['doctors'] = sorted(
                med_data['doctors'].values(),
                key=lambda d: d['total_quantity'],
                reverse=True
            )
            medicines_list.append(med_data)
        medicines_list.sort(key=lambda m: m['total_quantity'], reverse=True)

        return jsonify({
            'success': True,
            'medicines': medicines_list
        }), 200

    finally:
        db.close()


@medicine_router.route('/medicine/statistics/doctors', methods=['GET'])
@require_auth
@api_error_boundary(success=False, detail='{error}')
def get_statistics_doctors(user):
    """Lấy danh sách bác sĩ cho dropdown filter"""
    from app.models.user import User as UserModel, UserRole

    db = next(get_db())
    try:
        doctors = db.query(UserModel).filter(
            UserModel.role.in_([UserRole.DOCTOR, UserRole.PSYCHOLOGIST]),
            UserModel.is_active == True
        ).order_by(UserModel.full_name).all()

        return jsonify({
            'success': True,
            'doctors': [{'id': d.id, 'name': d.full_name} for d in doctors]
        }), 200

    finally:
        db.close()
