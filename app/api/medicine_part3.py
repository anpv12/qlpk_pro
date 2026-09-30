"""app.api.medicine: phần 3 — tách từ medicine.py (import ở cuối medicine.py để đăng ký route/giữ tên cũ)."""

import re

from flask import request, jsonify
from app.core.database import get_db
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.utils.search_normalization import normalized_contains
from datetime import datetime
from sqlalchemy import func, or_
from app.api.medicine import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    logger,
    medicine_router,
)

STATISTICS_TYPE_LABELS = {'BASIC': 'Cơ bản', 'H': 'H', 'N': 'N', 'TOXIC': 'Độc'}


def _statistics_date_bounds(from_date, to_date):
    """Parse the optional date filters; an invalid value is logged and ignored."""
    from_date_obj = None
    to_date_obj = None
    if from_date:
        try:
            from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    if to_date:
        try:
            to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    return from_date_obj, to_date_obj


def _filter_confirmed_exams(query, filters):
    from app.models.appointment import Appointment
    from app.models.examination import Examination
    if filters['from_date_obj']:
        query = query.filter(Appointment.appointment_date >= filters['from_date_obj'])
    if filters['to_date_obj']:
        query = query.filter(Appointment.appointment_date <= filters['to_date_obj'])
    if filters['doctor_id']:
        query = query.filter(Examination.doctor_id == int(filters['doctor_id']))
    return query


def _query_statistics_prescriptions(db, filters):
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from sqlalchemy.orm import joinedload
    prescriptions_query = db.query(Prescription).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).join(
        UserModel, Appointment.doctor_id == UserModel.id
    ).join(
        Patient, Appointment.patient_id == Patient.id
    ).options(
        joinedload(Prescription.items),
        joinedload(Prescription.appointment).joinedload(Appointment.doctor),
        joinedload(Prescription.appointment).joinedload(Appointment.patient),
        joinedload(Prescription.appointment).joinedload(Appointment.appointment_services)
    )
    if filters['from_date_obj']:
        prescriptions_query = prescriptions_query.filter(Appointment.appointment_date >= filters['from_date_obj'])
    if filters['to_date_obj']:
        prescriptions_query = prescriptions_query.filter(Appointment.appointment_date <= filters['to_date_obj'])
    if filters['doctor_id']:
        prescriptions_query = prescriptions_query.filter(Appointment.doctor_id == int(filters['doctor_id']))
    search = filters['search']
    # Filter by search (patient name, doctor name, medicine name — accent-insensitive)
    if search:
        prescriptions_query = prescriptions_query.filter(
            or_(
                normalized_contains(Patient.full_name, search),
                normalized_contains(UserModel.full_name, search),
                Prescription.items.any(normalized_contains(PrescriptionItem.medicine_name, search)),
            )
        )
    return prescriptions_query.order_by(
        UserModel.full_name,
        Appointment.appointment_date.desc()
    ).all()


def _empty_doctor_stats(doctor_id, doctor_name, with_exam_count=True):
    data = {'doctor_id': doctor_id, 'doctor_name': doctor_name}
    if with_exam_count:
        data['examination_count'] = 0
    data.update({
        'prescription_count': 0,
        'medicine_count': 0,
        'total_medicine_items': 0,
    })
    if with_exam_count:
        data['total_dispensed_qty'] = 0
    data.update({
        'service_count': 0,
        'medicine_amount': 0,
        'service_amount': 0,
        'prescriptions': [],
        '_prescription_types': set()
    })
    return data


def _load_staff_stats(db):
    """Pre-load all active doctors and psychologists so empty rows still show."""
    from app.models.user import User as UserModel
    all_staff = db.query(UserModel).filter(
        UserModel.role.in_(['DOCTOR', 'PSYCHOLOGIST']),
        UserModel.is_active == True
    ).all()
    return {staff.id: _empty_doctor_stats(staff.id, staff.full_name) for staff in all_staff}


def _apply_exam_aggregates(db, doctors_data, filters):
    """Examination count, service count and service amount per doctor (confirmed visits only)."""
    from app.models.appointment import Appointment
    from app.models.examination import Examination
    from app.models.service import Service

    exam_query = db.query(Examination.doctor_id, func.count(Examination.id)).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).filter(Examination.is_active == True, Appointment.status == 'CONFIRMED')
    for doc_id, count in _filter_confirmed_exams(exam_query, filters).group_by(Examination.doctor_id).all():
        if doc_id in doctors_data:
            doctors_data[doc_id]['examination_count'] = count

    # Nguồn đúng duy nhất cho dịch vụ: appointments.service_id
    svc_query = db.query(Examination.doctor_id, func.count(Appointment.service_id)).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).filter(Examination.is_active == True, Appointment.status == 'CONFIRMED', Appointment.service_id.isnot(None))
    for doc_id, count in _filter_confirmed_exams(svc_query, filters).group_by(Examination.doctor_id).all():
        if doc_id in doctors_data:
            doctors_data[doc_id]['service_count'] = count

    # Tiền dịch vụ: appointments.service_id → services.default_price
    svc_amount_query = db.query(Examination.doctor_id, func.sum(Service.default_price)).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).join(
        Service, Appointment.service_id == Service.id
    ).filter(Examination.is_active == True, Appointment.status == 'CONFIRMED', Appointment.service_id.isnot(None))
    for doc_id, amount in _filter_confirmed_exams(svc_amount_query, filters).group_by(Examination.doctor_id).all():
        if doc_id in doctors_data:
            doctors_data[doc_id]['service_amount'] = int(float(amount)) if amount else 0


def _examination_row(db, exam):
    from app.models.service import Service
    appt = exam.appointment
    patient = appt.patient if appt else None
    service_name = ''
    service_amount = 0
    if appt and appt.service_id:
        svc = db.query(Service.name).filter(Service.id == appt.service_id).scalar()
        service_name = svc or ''
        svc_price = db.query(Service.default_price).filter(Service.id == appt.service_id).scalar()
        service_amount = int(float(svc_price)) if svc_price else 0
    return {
        'examination_id': exam.id,
        'appointment_id': appt.id if appt else None,
        'patient_name': patient.full_name if patient else 'N/A',
        'appointment_date': appt.appointment_date.strftime('%d/%m/%Y') if appt and appt.appointment_date else '',
        'appointment_time': appt.appointment_date.strftime('%H:%M') if appt and appt.appointment_date else '',
        'services': service_name,
        'service_amount': service_amount,
        'exam_status': exam.status.value if exam.status else ''
    }


def _attach_examination_lists(db, doctors_data, filters):
    """Full confirmed examination list per doctor (shown when a doctor row is expanded)."""
    from app.models.appointment import Appointment
    from app.models.examination import Examination
    from app.models.patient import Patient
    all_exams_query = db.query(Examination).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).join(
        Patient, Appointment.patient_id == Patient.id
    ).filter(Examination.is_active == True, Appointment.status == 'CONFIRMED')
    all_exams = _filter_confirmed_exams(all_exams_query, filters).order_by(Appointment.appointment_date.desc()).all()
    for exam in all_exams:
        if exam.doctor_id not in doctors_data:
            continue
        doctors_data[exam.doctor_id].setdefault('examinations', []).append(_examination_row(db, exam))
    for doc_data in doctors_data.values():
        if 'examinations' not in doc_data:
            doc_data['examinations'] = []


def _treatment_days(items):
    treatment_days = 0
    for item in items:
        if item.usage:
            days_match = re.search(r'(\d+)\s*(ngày|day)', item.usage.lower())
            if days_match:
                treatment_days = max(treatment_days, int(days_match.group(1)))
    return treatment_days


def _medicine_item_rows(db, items, medicine_type):
    medicine_items = []
    for idx, item in enumerate(items, 1):
        if medicine_type:
            med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
            if not med or med.prescription_type != medicine_type:
                continue
        med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
        med_type = STATISTICS_TYPE_LABELS.get(med.prescription_type, 'Cơ bản') if med else 'Cơ bản'
        quantity = float(item.quantity) if item.quantity else 0
        unit_price = float(item.unit_price) if item.unit_price else 0
        medicine_items.append({
            'stt': idx,
            'name': item.medicine_name,
            'purchase_location': 'Bên ngoài' if item.is_external else 'Trong phòng khám',
            'medicine_type': med_type,
            'quantity': quantity,
            'unit': item.unit or 'viên',
            'unit_price': 0 if item.is_external else unit_price,
            'total_price': 0 if item.is_external else (quantity * unit_price)
        })
    return medicine_items


def _prescription_row(db, pres, medicine_type):
    appt = pres.appointment
    patient = appt.patient
    services = ', '.join([s.service.name for s in appt.appointment_services if s.service]) if appt.appointment_services else ''
    treatment_days = _treatment_days(pres.items)
    medicine_items = _medicine_item_rows(db, pres.items, medicine_type)
    pres_types = {med_item['medicine_type'] for med_item in medicine_items}
    re_exam = pres.re_examination_date.strftime('%d/%m/%Y') if pres.re_examination_date else None
    return {
        'id': pres.id,
        'appointment_id': appt.id,
        'patient_name': patient.full_name if patient else 'N/A',
        'appointment_date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
        'appointment_time': appt.appointment_date.strftime('%H:%M') if appt.appointment_date else '',
        'services': services,
        'medicine_count': len(pres_types),
        'total_medicine_items': len(medicine_items),
        'total_dispensed_qty': sum(m['quantity'] for m in medicine_items),
        'prescription_types': list(pres_types),
        'treatment_days': treatment_days if treatment_days > 0 else None,
        # Tổng tiền tính lại từ dòng thuốc (thuốc mua ngoài = 0)
        'total_amount': sum(item['total_price'] for item in medicine_items),
        're_examination_date': re_exam,
        'recheck_date': re_exam,
        'medicines': medicine_items
    }, pres_types


def _accumulate_prescriptions(db, prescriptions, doctors_data, medicine_type):
    grand_total = {'examination_count': 0, 'prescription_count': 0, 'medicine_count': 0, 'medicine_amount': 0, 'service_amount': 0, 'total_medicine_items': 0, 'service_count': 0, 'total_dispensed_qty': 0}
    grand_total_types = set()
    for pres in prescriptions:
        doctor = pres.appointment.doctor
        doctor_id_key = doctor.id if doctor else 0
        if doctor_id_key not in doctors_data:
            doctors_data[doctor_id_key] = _empty_doctor_stats(
                doctor_id_key, doctor.full_name if doctor else 'Chưa xác định', with_exam_count=False)
        prescription_data, pres_types = _prescription_row(db, pres, medicine_type)
        item_count = len(prescription_data['medicines'])
        dispensed_qty = prescription_data['total_dispensed_qty']
        total_amount = prescription_data['total_amount']
        doc_stats = doctors_data[doctor_id_key]
        doc_stats['prescriptions'].append(prescription_data)
        doc_stats['prescription_count'] += 1
        doc_stats['_prescription_types'].update(pres_types)
        doc_stats['total_medicine_items'] += item_count
        doc_stats['total_dispensed_qty'] += dispensed_qty
        doc_stats['medicine_amount'] += total_amount
        grand_total_types.update(pres_types)
        grand_total['prescription_count'] += 1
        grand_total['total_medicine_items'] += item_count
        grand_total['medicine_amount'] += total_amount
        grand_total['total_dispensed_qty'] += dispensed_qty
    grand_total['medicine_count'] = len(grand_total_types)
    return grand_total


def _finalize_doctor_stats(doctors_data, grand_total):
    grand_total['examination_count'] = sum(d['examination_count'] for d in doctors_data.values())
    grand_total['service_count'] = sum(d['service_count'] for d in doctors_data.values())
    grand_total['service_amount'] = sum(d['service_amount'] for d in doctors_data.values())
    for doc_data in doctors_data.values():
        doc_data['medicine_count'] = len(doc_data['_prescription_types'])
        doc_data['prescription_types'] = list(doc_data['_prescription_types'])
        del doc_data['_prescription_types']


@medicine_router.route('/medicine/statistics/prescriptions', methods=['GET'])
@require_auth
def get_statistics_prescriptions(user):
    """
    Lấy danh sách đơn thuốc grouped by doctor
    Query params: from_date, to_date, doctor_id, medicine_type, search
    """
    db = next(get_db())
    try:
        from_date_obj, to_date_obj = _statistics_date_bounds(request.args.get('from_date'), request.args.get('to_date'))
        filters = {
            'from_date_obj': from_date_obj,
            'to_date_obj': to_date_obj,
            'doctor_id': request.args.get('doctor_id'),
            'medicine_type': request.args.get('medicine_type'),
            'search': request.args.get('search', '').strip().lower(),
        }
        prescriptions = _query_statistics_prescriptions(db, filters)
        doctors_data = _load_staff_stats(db)
        _apply_exam_aggregates(db, doctors_data, filters)
        _attach_examination_lists(db, doctors_data, filters)
        grand_total = _accumulate_prescriptions(db, prescriptions, doctors_data, filters['medicine_type'])
        _finalize_doctor_stats(doctors_data, grand_total)

        return jsonify({
            'success': True,
            'grand_total': grand_total,
            'doctors': sorted(doctors_data.values(), key=lambda x: x['examination_count'], reverse=True)
        }), 200

    except Exception as e:
        logger.error(f"Error getting statistics prescriptions: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()
