"""app.api.medicine: phần 3 — tách từ medicine.py (import ở cuối medicine.py để đăng ký route/giữ tên cũ)."""

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


@medicine_router.route('/medicine/statistics/prescriptions', methods=['GET'])
@require_auth
def get_statistics_prescriptions(user):
    """
    Lấy danh sách đơn thuốc grouped by doctor
    Query params: from_date, to_date, doctor_id, medicine_type, search
    """
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from app.models.service import Service
    from sqlalchemy.orm import joinedload

    db = next(get_db())
    try:
        # Parse params
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')
        search = request.args.get('search', '').strip().lower()

        # Query prescriptions with joins
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

        # Filter by date
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
                prescriptions_query = prescriptions_query.filter(
                    Appointment.appointment_date >= from_date_obj
                )
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)

        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d')
                to_date_obj = to_date_obj.replace(hour=23, minute=59, second=59)
                prescriptions_query = prescriptions_query.filter(
                    Appointment.appointment_date <= to_date_obj
                )
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)

        # Filter by doctor
        if doctor_id:
            prescriptions_query = prescriptions_query.filter(
                Appointment.doctor_id == int(doctor_id)
            )

        # Filter by search (patient name, doctor name, medicine name — accent-insensitive)
        if search:
            prescriptions_query = prescriptions_query.filter(
                or_(
                    normalized_contains(Patient.full_name, search),
                    normalized_contains(UserModel.full_name, search),
                    Prescription.items.any(normalized_contains(PrescriptionItem.medicine_name, search)),
                )
            )

        prescriptions = prescriptions_query.order_by(
            UserModel.full_name,
            Appointment.appointment_date.desc()
        ).all()

        # Group by doctor - pre-load all doctors and psychologists
        doctors_data = {}
        all_staff = db.query(UserModel).filter(
            UserModel.role.in_(['DOCTOR', 'PSYCHOLOGIST']),
            UserModel.is_active == True
        ).all()
        for staff in all_staff:
            doctors_data[staff.id] = {
                'doctor_id': staff.id,
                'doctor_name': staff.full_name,
                'examination_count': 0,
                'prescription_count': 0,
                'medicine_count': 0,
                'total_medicine_items': 0,
                'total_dispensed_qty': 0,
                'service_count': 0,
                'medicine_amount': 0,
                'service_amount': 0,
                'prescriptions': [],
                '_prescription_types': set()
            }

        # === Query examination_count per doctor (lượt khám thật, không phụ thuộc prescription) ===
        from app.models.examination import Examination


        exam_query = db.query(
            Examination.doctor_id,
            func.count(Examination.id)
        ).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED'
        )

        # Apply same date filters
        if from_date:
            try:
                from_date_obj_exam = datetime.strptime(from_date, '%Y-%m-%d')
                exam_query = exam_query.filter(Appointment.appointment_date >= from_date_obj_exam)
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if to_date:
            try:
                to_date_obj_exam = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                exam_query = exam_query.filter(Appointment.appointment_date <= to_date_obj_exam)
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if doctor_id:
            exam_query = exam_query.filter(Examination.doctor_id == int(doctor_id))

        exam_counts = exam_query.group_by(Examination.doctor_id).all()
        for doc_id, count in exam_counts:
            if doc_id in doctors_data:
                doctors_data[doc_id]['examination_count'] = count

        # === Query service_count per doctor (từ appointments.service_id — nguồn đúng duy nhất) ===
        svc_query = db.query(
            Examination.doctor_id,
            func.count(Appointment.service_id)
        ).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED',
            Appointment.service_id.isnot(None)
        )

        if from_date:
            try:
                svc_query = svc_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if to_date:
            try:
                svc_query = svc_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if doctor_id:
            svc_query = svc_query.filter(Examination.doctor_id == int(doctor_id))

        svc_counts = svc_query.group_by(Examination.doctor_id).all()
        for doc_id, count in svc_counts:
            if doc_id in doctors_data:
                doctors_data[doc_id]['service_count'] = count

        # === Query service_amount per doctor (nguồn: appointments.service_id → services.default_price) ===
        svc_amount_query = db.query(
            Examination.doctor_id,
            func.sum(Service.default_price)
        ).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).join(
            Service, Appointment.service_id == Service.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED',
            Appointment.service_id.isnot(None)
        )

        if from_date:
            try:
                svc_amount_query = svc_amount_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if to_date:
            try:
                svc_amount_query = svc_amount_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if doctor_id:
            svc_amount_query = svc_amount_query.filter(Examination.doctor_id == int(doctor_id))

        svc_amounts = svc_amount_query.group_by(Examination.doctor_id).all()
        for doc_id, amount in svc_amounts:
            if doc_id in doctors_data:
                doctors_data[doc_id]['service_amount'] = int(float(amount)) if amount else 0

        # === Query full examination list per doctor (để hiển thị khi expand) ===
        from app.models.patient import Patient

        all_exams_query = db.query(Examination).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED'
        )

        if from_date:
            try:
                all_exams_query = all_exams_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if to_date:
            try:
                all_exams_query = all_exams_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if doctor_id:
            all_exams_query = all_exams_query.filter(Examination.doctor_id == int(doctor_id))

        all_exams = all_exams_query.order_by(Appointment.appointment_date.desc()).all()

        # Build examination list per doctor
        for exam in all_exams:
            doc_id = exam.doctor_id
            if doc_id not in doctors_data:
                continue
            appt = exam.appointment
            patient = appt.patient if appt else None

            # Lấy tên dịch vụ từ appointments.service_id → services.name (nguồn đúng duy nhất)
            service_name = ''
            service_amount = 0
            if appt and appt.service_id:
                svc = db.query(Service.name).filter(Service.id == appt.service_id).scalar()
                service_name = svc or ''
                # Lấy tiền dịch vụ từ services.default_price (nguồn đúng duy nhất)
                svc_price = db.query(Service.default_price).filter(Service.id == appt.service_id).scalar()
                service_amount = int(float(svc_price)) if svc_price else 0

            if 'examinations' not in doctors_data[doc_id]:
                doctors_data[doc_id]['examinations'] = []

            doctors_data[doc_id]['examinations'].append({
                'examination_id': exam.id,
                'appointment_id': appt.id if appt else None,
                'patient_name': patient.full_name if patient else 'N/A',
                'appointment_date': appt.appointment_date.strftime('%d/%m/%Y') if appt and appt.appointment_date else '',
                'appointment_time': appt.appointment_date.strftime('%H:%M') if appt and appt.appointment_date else '',
                'services': service_name,
                'service_amount': service_amount,
                'exam_status': exam.status.value if exam.status else ''
            })

        # Đảm bảo tất cả doctor đều có 'examinations' key
        for doc_data in doctors_data.values():
            if 'examinations' not in doc_data:
                doc_data['examinations'] = []

        grand_total = {'examination_count': 0, 'prescription_count': 0, 'medicine_count': 0, 'medicine_amount': 0, 'service_amount': 0, 'total_medicine_items': 0, 'service_count': 0, 'total_dispensed_qty': 0}
        grand_total_types = set()  # Track distinct prescription types

        for pres in prescriptions:
            appt = pres.appointment
            doctor = appt.doctor
            patient = appt.patient

            doctor_id_key = doctor.id if doctor else 0
            doctor_name = doctor.full_name if doctor else 'Chưa xác định'

            if doctor_id_key not in doctors_data:
                doctors_data[doctor_id_key] = {
                    'doctor_id': doctor_id_key,
                    'doctor_name': doctor_name,
                    'prescription_count': 0,
                    'medicine_count': 0,
                    'total_medicine_items': 0,
                    'service_count': 0,
                    'medicine_amount': 0,
                    'service_amount': 0,
                    'prescriptions': [],
                    '_prescription_types': set()
                }

            total_amount = float(pres.total_amount) if pres.total_amount else 0

            # Get services
            services = ', '.join([s.service.name for s in appt.appointment_services if s.service]) if appt.appointment_services else ''

            # Calculate treatment days (from prescription items usage)
            treatment_days = 0
            for item in pres.items:
                if item.usage:
                    # Try to extract days from usage text
                    usage_lower = item.usage.lower()
                    import re
                    days_match = re.search(r'(\d+)\s*(ngày|day)', usage_lower)
                    if days_match:
                        treatment_days = max(treatment_days, int(days_match.group(1)))

            # Medicine items detail
            medicine_items = []
            for idx, item in enumerate(pres.items, 1):
                # Check medicine type if filter applied
                if medicine_type:
                    med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                    if not med or med.prescription_type != medicine_type:
                        continue

                # Determine purchase location
                purchase_location = 'Bên ngoài' if item.is_external else 'Trong phòng khám'

                # Get medicine type label
                med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                med_type = 'Cơ bản'
                if med:
                    type_map = {'BASIC': 'Cơ bản', 'H': 'H', 'N': 'N', 'TOXIC': 'Độc'}
                    med_type = type_map.get(med.prescription_type, 'Cơ bản')

                medicine_items.append({
                    'stt': idx,
                    'name': item.medicine_name,
                    'purchase_location': purchase_location,
                    'medicine_type': med_type,
                    'quantity': float(item.quantity) if item.quantity else 0,
                    'unit': item.unit or 'viên',
                    'unit_price': 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0),
                    'total_price': 0 if item.is_external else ((float(item.quantity) if item.quantity else 0) * (float(item.unit_price) if item.unit_price else 0))
                })

            # Collect distinct prescription types for this prescription
            pres_types = set()
            for med_item in medicine_items:
                pres_types.add(med_item['medicine_type'])

            # Recalculate total_amount from medicine items (external = 0)
            total_amount = sum(item['total_price'] for item in medicine_items)

            prescription_data = {
                'id': pres.id,
                'appointment_id': appt.id,
                'patient_name': patient.full_name if patient else 'N/A',
                'appointment_date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'appointment_time': appt.appointment_date.strftime('%H:%M') if appt.appointment_date else '',
                'services': services,
                'medicine_count': len(pres_types),  # Distinct prescription types
                'total_medicine_items': len(medicine_items),  # Total medicine items
                'total_dispensed_qty': sum(m['quantity'] for m in medicine_items),  # Total pills
                'prescription_types': list(pres_types),  # List of type labels
                'treatment_days': treatment_days if treatment_days > 0 else None,
                'total_amount': total_amount,
                're_examination_date': pres.re_examination_date.strftime('%d/%m/%Y') if pres.re_examination_date else None,
                'recheck_date': pres.re_examination_date.strftime('%d/%m/%Y') if pres.re_examination_date else None,
                'medicines': medicine_items
            }

            doctors_data[doctor_id_key]['prescriptions'].append(prescription_data)
            doctors_data[doctor_id_key]['prescription_count'] += 1
            doctors_data[doctor_id_key]['_prescription_types'].update(pres_types)
            dispensed_qty = sum(m['quantity'] for m in medicine_items)
            doctors_data[doctor_id_key]['total_medicine_items'] += len(medicine_items)
            doctors_data[doctor_id_key]['total_dispensed_qty'] += dispensed_qty
            doctors_data[doctor_id_key]['medicine_amount'] += total_amount

            grand_total_types.update(pres_types)
            grand_total['prescription_count'] += 1
            grand_total['total_medicine_items'] += len(medicine_items)
            grand_total['medicine_amount'] += total_amount
            grand_total['total_dispensed_qty'] += dispensed_qty

        grand_total['medicine_count'] = len(grand_total_types)
        # Tính grand_total examination_count và service_count từ doctors_data
        grand_total['examination_count'] = sum(d['examination_count'] for d in doctors_data.values())
        grand_total['service_count'] = sum(d['service_count'] for d in doctors_data.values())
        grand_total['service_amount'] = sum(d['service_amount'] for d in doctors_data.values())

        for doc_data in doctors_data.values():
            doc_data['medicine_count'] = len(doc_data['_prescription_types'])
            doc_data['prescription_types'] = list(doc_data['_prescription_types'])
            del doc_data['_prescription_types']

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
