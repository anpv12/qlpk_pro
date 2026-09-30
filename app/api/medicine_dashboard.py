"""app.api.medicine: phần 2 — tách từ medicine.py (import ở cuối medicine.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.utils.search_normalization import normalized_contains
from datetime import datetime
from sqlalchemy import func, or_
from app.api.medicine import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    logger,
    medicine_router,
)
from app.utils.api_error_contract import api_error_boundary


@medicine_router.route('/medicines/units', methods=['GET'])
@require_auth
@api_error_boundary(success=False, detail='Internal server error')
def get_medicine_units(user):
    """Lấy danh sách đơn vị tính từ database thuốc"""
    try:
        db = next(get_db())

        # Lấy tất cả đơn vị tính unique từ database thuốc
        units = db.query(Medicine.unit).filter(Medicine.unit.isnot(None), Medicine.unit != '').distinct().all()

        # Convert thành list và sort
        units_list = sorted([unit[0] for unit in units if unit[0]])

        # Trả về trực tiếp đơn vị tính (đã là tiếng Việt)
        # Giữ backward compatibility: nếu có dữ liệu cũ bằng tiếng Anh thì convert
        unit_mapping = {
            'tablet': 'viên',
            'tablets': 'viên',
            'bottle': 'chai',
            'bottles': 'chai',
            'pack': 'gói',
            'packet': 'gói',
            'tube': 'tuýp',
            'ampoule': 'ống',
            'drop': 'giọt',
            'syringe': 'bơm tiêm',
            'dose': 'liều',
            'bag': 'túi',
            'blister': 'vỉ',
            'kit': 'dụng cụ',
            'liter': 'lít',
            'litre': 'lít',
            'piece': 'miếng',
            'pen': 'bút tiêm'
        }
        result = []
        for unit in units_list:
            # Nếu đã là tiếng Việt, dùng trực tiếp
            if unit.lower() in ['viên', 'chai', 'gói', 'tuýp', 'ống', 'vỉ', 'hộp', 'lọ', 'giọt', 'viên nang', 'miếng dán', 'bơm tiêm', 'liều', 'túi', 'dụng cụ', 'lít', 'miếng', 'bút tiêm', 'ml', 'g', 'mg', 'mcg']:
                display_name = unit
            else:
                # Convert từ tiếng Anh sang tiếng Việt (backward compatibility)
                display_name = unit_mapping.get(unit.lower(), unit)
            result.append({'value': display_name, 'label': display_name})

        return jsonify({
            'success': True,
            'data': result
        }), 200

    finally:
        db.close()


@medicine_router.route('/medicines/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user):
    """Lấy dữ liệu dashboard tổng quan"""
    try:
        db: Session = next(get_db())

        from app.models.medicine_batch import MedicineBatch
        from datetime import date

        today = date.today()

        # Tổng số thuốc
        total_medicines = db.query(Medicine).count()

        # Tổng số lô
        total_batches = db.query(MedicineBatch).count()

        # Load tất cả batches với eager loading để tránh N+1 query
        all_batches = db.query(MedicineBatch).all()
        from collections import defaultdict
        batches_by_medicine = defaultdict(list)
        for batch in all_batches:
            batches_by_medicine[batch.medicine_id].append(batch)

        # Tính tổng giá trị tồn kho từ batches
        total_value = 0
        for batch in all_batches:
            if batch.remaining_quantity and batch.import_price:
                total_value += float(batch.remaining_quantity) * float(batch.import_price)

        # Tính cảnh báo từ batches đã load sẵn (tránh lazy loading)
        warning_count = 0

        # Cảnh báo lô sắp hết (không liên quan hạn dùng)
        for batch in all_batches:
            if batch.quantity and batch.remaining_quantity:
                if float(batch.remaining_quantity) <= float(batch.quantity) * 0.1:
                    warning_count += 1

        # Load medicines để tính cảnh báo tồn kho thấp và hết hạn
        medicines = db.query(Medicine).all()

        for medicine in medicines:
            # Cảnh báo tồn kho thấp
            if medicine.low_stock_threshold and medicine.stock_quantity:
                if float(medicine.stock_quantity) <= float(medicine.low_stock_threshold):
                    warning_count += 1

            # Cảnh báo sắp hết hạn: theo lô còn tồn gần hạn nhất và ngưỡng
            # riêng của từng thuốc (khớp `is_expiring_soon` trong to_dict()).
            # `medicine.expiry_date` là field legacy không writer nào ghi,
            # không dùng ở đây.
            if medicine.expiry_warning_days:
                active_batches = [b for b in batches_by_medicine.get(medicine.id, [])
                                   if b.expiry_date and (b.remaining_quantity or 0) > 0]
                try:
                    if active_batches:
                        nearest_expiry = min(b.expiry_date for b in active_batches)
                        days_to_expiry = (nearest_expiry - today).days
                        if days_to_expiry <= medicine.expiry_warning_days:
                            warning_count += 1
                except Exception:
                    logger.warning('Bỏ qua cảnh báo hạn dùng của thuốc %s vì dữ liệu lô không hợp lệ', medicine.id, exc_info=True)

        return jsonify({
            'total_medicines': total_medicines,
            'total_value': total_value,
            'total_batches': total_batches,
            'missing_import_price_count': len({batch.medicine_id for batch in all_batches if batch.import_price is None}),
            'warning_count': warning_count
        }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error getting dashboard data: {e}\n{error_trace}")
        return jsonify({
            'success': False,
            'detail': f'Lỗi khi lấy dữ liệu dashboard: {str(e)}',
            'trace': error_trace if settings.DEBUG else None
        }), 500
    finally:
        db.close()


def _summary_visit_totals(db, doctor_id, from_date, to_date):
    from app.models.appointment import Appointment
    # Count total examinations (lượt khám thật — cùng logic với tab prescriptions)
    from app.models.examination import Examination
    exam_count_query = db.query(func.count(Examination.id)).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).filter(
        Examination.is_active == True,
        Appointment.status == 'CONFIRMED'
    )
    if from_date:
        try:
            exam_count_query = exam_count_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    if to_date:
        try:
            exam_count_query = exam_count_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    if doctor_id:
        exam_count_query = exam_count_query.filter(Examination.doctor_id == int(doctor_id))
    total_examinations = exam_count_query.scalar() or 0

    # Calculate total service revenue (nguồn: appointments.service_id → services.default_price)
    from app.models.service import Service as SvcModel
    svc_rev_query = db.query(func.sum(SvcModel.default_price)).join(
        Appointment, Appointment.service_id == SvcModel.id
    ).filter(
        Appointment.status == 'CONFIRMED',
        Appointment.service_id.isnot(None)
    )
    if from_date:
        try:
            svc_rev_query = svc_rev_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    if to_date:
        try:
            svc_rev_query = svc_rev_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    if doctor_id:
        svc_rev_query = svc_rev_query.join(
            Examination, Examination.appointment_id == Appointment.id
        ).filter(Examination.doctor_id == int(doctor_id))
    total_service_revenue = int(float(svc_rev_query.scalar() or 0))
    return total_examinations, total_service_revenue


def _summary_item_totals(db, medicine_type, prescriptions):
    total_dispensed = 0
    total_medicine_items = 0
    total_revenue = 0

    for pres in prescriptions:
        for item in pres.items:
            # Filter by medicine type if specified
            if medicine_type:
                med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                if not med or med.prescription_type != medicine_type:
                    continue

            total_medicine_items += 1
            qty = float(item.quantity) if item.quantity else 0
            price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
            total_dispensed += qty
            total_revenue += qty * price
    return total_dispensed, total_medicine_items, total_revenue


def _summary_prescriptions(db, doctor_id, from_date, search, to_date):
    from app.models.appointment import Appointment
    from app.models.prescription import Prescription, PrescriptionItem
    from sqlalchemy.orm import joinedload
    # Base query for prescriptions
    prescriptions_query = db.query(Prescription).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).options(joinedload(Prescription.items))

    # Join Patient/UserModel nếu cần search
    if search:
        from app.models.user import User as UserModel
        from app.models.patient import Patient
        prescriptions_query = prescriptions_query.join(
            Patient, Appointment.patient_id == Patient.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
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

    # Filter by search (patient, doctor, medicine — accent-insensitive)
    if search:
        prescriptions_query = prescriptions_query.filter(
            or_(
                normalized_contains(Patient.full_name, search),
                normalized_contains(UserModel.full_name, search),
                Prescription.items.any(normalized_contains(PrescriptionItem.medicine_name, search)),
            )
        )

    prescriptions = prescriptions_query.all()
    return prescriptions


@medicine_router.route('/medicine/statistics/summary', methods=['GET'])
@require_auth
def get_statistics_summary(user):
    """
    Lấy thống kê tổng quan: Tổng đơn thuốc, Thuốc đã bốc, Tồn kho, Doanh thu
    Query params: from_date, to_date, doctor_id, medicine_type
    """

    db = next(get_db())
    try:
        # Parse params
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')  # BASIC, H, N
        search = request.args.get('search', '').strip().lower()

        prescriptions = _summary_prescriptions(db, doctor_id, from_date, search, to_date)

        # Calculate stats
        total_prescriptions = len(prescriptions)
        total_dispensed, total_medicine_items, total_revenue = _summary_item_totals(db, medicine_type, prescriptions)

        # Get remaining stock
        remaining_stock = db.query(func.sum(Medicine.stock_quantity)).filter(
            Medicine.is_active == True
        ).scalar() or 0

        # Get count of active medicine types
        medicine_count = db.query(Medicine).filter(
            Medicine.is_active == True
        ).count()

        total_examinations, total_service_revenue = _summary_visit_totals(db, doctor_id, from_date, to_date)

        return jsonify({
            'success': True,
            'total_prescriptions': total_prescriptions,
            'total_examinations': total_examinations,
            'total_dispensed': total_medicine_items,
            'total_dispensed_qty': total_dispensed,
            'medicine_count': medicine_count,
            'remaining_stock': int(float(remaining_stock)),
            'total_revenue': int(total_revenue),
            'total_service_revenue': total_service_revenue
        }), 200

    except Exception as e:
        logger.error(f"Error getting statistics summary: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()
