"""app.api.medicine: phần 4 — tách từ medicine.py (import ở cuối medicine.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.utils.search_normalization import normalized_contains
from datetime import datetime
from sqlalchemy import func, or_
from app.api.medicine import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    latest_batch_of,
    logger,
    medicine_router,
)


@medicine_router.route('/medicine/statistics/inventory', methods=['GET'])
@require_auth
def get_statistics_inventory(user):
    """
    Lấy danh sách thuốc với thông tin tồn kho
    Query params: search, medicine_type
    """
    from sqlalchemy.orm import joinedload
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment

    db = next(get_db())
    try:
        # Parse params
        search = request.args.get('search', '').strip().lower()
        medicine_type = request.args.get('medicine_type')
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')

        # Parse date filters
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

        # Pre-calculate dispensed quantities from prescription_items by medicine_id (SL bán)
        dispensed_query = db.query(
            PrescriptionItem.medicine_id,
            func.sum(PrescriptionItem.quantity)
        ).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).filter(
            PrescriptionItem.medicine_id.isnot(None),
            PrescriptionItem.is_external == False
        )

        if from_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            dispensed_query = dispensed_query.filter(Appointment.doctor_id == int(doctor_id))

        dispensed_query = dispensed_query.group_by(PrescriptionItem.medicine_id)
        dispensed_map = {row[0]: float(row[1]) if row[1] else 0 for row in dispensed_query.all()}

        # Query medicines
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

        medicines = query.options(joinedload(Medicine.batches)).order_by(Medicine.name).all()

        # Build response
        data = []

        total_export = 0
        total_stock = 0

        for med in medicines:

            # SL bán = from prescription_items (real dispensing data)
            stock_qty = float(med.stock_quantity) if med.stock_quantity else 0
            export_qty = dispensed_map.get(med.id, 0)

            # Get latest batch info
            latest_batch = latest_batch_of(med.batches)

            # Determine status
            status = 'Đủ hàng'
            if med.low_stock_threshold and stock_qty <= med.low_stock_threshold:
                if stock_qty == 0:
                    status = 'Cần nhập'
                else:
                    status = 'Sắp hết'

            # Type label
            type_map = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}

            # Get import price from latest batch or medicine
            import_price = (float(latest_batch.import_price)
                            if latest_batch and latest_batch.import_price is not None else None)

            data.append({
                'id': med.id,
                'internal_code': med.internal_code or '-',
                'name': med.name,
                'medicine_type': type_map.get(med.prescription_type, 'Cơ bản'),
                'unit': med.unit or 'viên',
                'import_price': import_price,
                'unit_price': float(med.unit_price) if med.unit_price else 0,

                'export_quantity': export_qty,
                'stock_quantity': stock_qty,
                'batch_number': latest_batch.batch_number if latest_batch else '-',
                'expiry_date': latest_batch.expiry_date.strftime('%d/%m/%Y') if latest_batch and latest_batch.expiry_date else '-',
                'status': status
            })


            total_export += export_qty
            total_stock += stock_qty

        return jsonify({
            'success': True,
            'summary': {

                'total_export': total_export,
                'total_stock': total_stock
            },
            'medicines': data
        }), 200

    except Exception as e:
        logger.error(f"Error getting statistics inventory: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_router.route('/medicine/statistics/prescription-history', methods=['GET'])
@require_auth
def get_statistics_prescription_history(user):
    """
    Lịch sử kê thuốc: group by Medicine → Doctor → chi tiết từng đơn
    Query params: from_date, to_date, doctor_id, medicine_type, search
    """
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient

    db = next(get_db())
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')
        search = request.args.get('search', '').strip().lower()

        # Query prescription items with all joins
        items_query = db.query(PrescriptionItem).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        )

        # Date filters
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
                items_query = items_query.filter(Appointment.appointment_date >= from_date_obj)
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                items_query = items_query.filter(Appointment.appointment_date <= to_date_obj)
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)

        # Doctor filter
        if doctor_id:
            items_query = items_query.filter(Appointment.doctor_id == int(doctor_id))

        # Search filter (accent-insensitive)
        if search:
            items_query = items_query.filter(
                or_(
                    normalized_contains(PrescriptionItem.medicine_name, search),
                    normalized_contains(Patient.full_name, search),
                    normalized_contains(UserModel.full_name, search),
                )
            )

        # Medicine type filter
        if medicine_type:
            med_ids = db.query(Medicine.id).filter(Medicine.prescription_type == medicine_type).subquery()
            items_query = items_query.filter(PrescriptionItem.medicine_id.in_(med_ids))

        # Execute query
        all_items = items_query.order_by(
            PrescriptionItem.medicine_name,
            UserModel.full_name,
            Appointment.appointment_date.desc()
        ).all()

        # Build medicine → doctor → items hierarchy
        medicines_map = {}
        # Cache medicine info
        medicine_cache = {}

        for item in all_items:
            prescription = item.prescription
            appointment = prescription.appointment
            doctor = appointment.doctor
            patient = appointment.patient

            med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
            med_name = med.name if med else item.medicine_name
            med_key = item.medicine_id if item.medicine_id else f"external:{item.id}"
            doc_id = doctor.id if doctor else 0
            doc_name = doctor.full_name if doctor else 'Chưa xác định'

            # Get medicine type from cache or DB
            if med_key not in medicine_cache:
                if med:
                    type_map = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}
                    medicine_cache[med_key] = {
                        'medicine_type': type_map.get(med.prescription_type, 'Cơ bản'),
                        'generic_name': med.generic_name or '',
                        'current_stock': float(med.stock_quantity) if med.stock_quantity else 0,
                        'unit': med.unit or 'viên',
                        'unit_price': float(med.unit_price) if med.unit_price else 0
                    }
                else:
                    medicine_cache[med_key] = {
                        'medicine_type': 'Cơ bản',
                        'generic_name': '',
                        'current_stock': 0,
                        'unit': item.unit or 'viên',
                        'unit_price': float(item.unit_price) if item.unit_price else 0
                    }

            med_info = medicine_cache[med_key]
            qty = float(item.quantity) if item.quantity else 0
            price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
            amount = qty * price
            source = 'Bên ngoài' if item.is_external else 'Phòng khám'

            # Init medicine entry
            if med_key not in medicines_map:
                medicines_map[med_key] = {
                    'medicine_id': item.medicine_id,
                    'medicine_name': med_name,
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
            med_entry['total_prescriptions'] += 1
            med_entry['total_quantity'] += qty
            med_entry['total_amount'] += amount

            # Init doctor entry under medicine
            if doc_id not in med_entry['doctors']:
                med_entry['doctors'][doc_id] = {
                    'doctor_id': doc_id,
                    'doctor_name': doc_name,
                    'total_prescriptions': 0,
                    'total_quantity': 0,
                    'total_amount': 0,
                    'items': []
                }

            doc_entry = med_entry['doctors'][doc_id]
            doc_entry['total_prescriptions'] += 1
            doc_entry['total_quantity'] += qty
            doc_entry['total_amount'] += amount

            doc_entry['items'].append({
                'date': appointment.appointment_date.strftime('%d/%m/%Y') if appointment.appointment_date else '',
                'patient_name': patient.full_name if patient else 'N/A',
                'prescription_code': prescription.prescription_code or '',
                'quantity': qty,
                'source': source,
                'unit_price': price,
                'amount': amount
            })

        # Convert to list format
        medicines_list = []
        for med_data in medicines_map.values():
            med_data['doctors'] = sorted(
                med_data['doctors'].values(),
                key=lambda d: d['total_quantity'],
                reverse=True
            )
            medicines_list.append(med_data)

        # Sort by total_quantity descending
        medicines_list.sort(key=lambda m: m['total_quantity'], reverse=True)

        return jsonify({
            'success': True,
            'medicines': medicines_list
        }), 200

    except Exception as e:
        logger.error(f"Error getting prescription history: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_router.route('/medicine/statistics/doctors', methods=['GET'])
@require_auth
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

    except Exception as e:
        logger.error(f"Error getting doctors list: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()
