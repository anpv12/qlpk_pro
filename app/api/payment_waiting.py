from flask import Blueprint, jsonify, request, render_template, abort, url_for
from app.api.auth import require_auth
from app.realtime.events import emit_payment_changed
from sqlalchemy.orm import joinedload
from sqlalchemy import func, or_
from app.core.database import get_db
from app.models.examination import Examination, ExaminationStatus
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.appointment_service import AppointmentService
from app.utils.upload_storage import upload_dir
from app.utils.search_normalization import normalize_search_text, normalized_contains
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import logging

payment_waiting_bp = Blueprint('payment_waiting', __name__)

CLINIC_INFO = {
    "name": "PHÒNG KHÁM SƠN TÂM",
    "address": "702/121 Điện Biên Phủ, P.Vườn Lài, TP.HCM",
    "tax_code": "03188937299",
    "phone": "0938549609",
    "email": "sontamclinic@gmail.com",
    "website": "www.qlpk.com.vn",
    "bank_account": "0251002783029 – Vietcombank CN Bình Tây"
}
INVOICE_SERIAL = "1C25TNK"

VIET_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]

def format_currency(value: Decimal | None) -> str:
    amount = value or Decimal(0)
    return f"{amount:,.0f}".replace(",", ".")

def read_three_digits(number: int, show_zero_hundreds: bool) -> str:
    hundreds = number // 100
    tens = (number % 100) // 10
    ones = number % 10
    words = []

    if hundreds > 0 or show_zero_hundreds:
        words.append(f"{VIET_DIGITS[hundreds]} trăm" if hundreds > 0 else "không trăm")

    if tens > 1:
        words.append(f"{VIET_DIGITS[tens]} mươi")
        if ones == 1:
            words.append("mốt")
        elif ones == 4:
            words.append("tư")
        elif ones == 5:
            words.append("lăm")
        elif ones != 0:
            words.append(VIET_DIGITS[ones])
    elif tens == 1:
        words.append("mười")
        if ones == 5:
            words.append("lăm")
        elif ones != 0:
            words.append(VIET_DIGITS[ones])
    else:
        if ones != 0:
            if hundreds > 0 or show_zero_hundreds:
                words.append("lẻ")
            if ones == 5 and (hundreds > 0 or show_zero_hundreds):
                words.append("lăm")
            else:
                words.append(VIET_DIGITS[ones])

    return " ".join(words).strip()

def number_to_vietnamese_words(number: Decimal | float | int) -> str:
    integer_value = int(Decimal(number).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    if integer_value == 0:
        return "Không đồng"

    suffixes = ["", " nghìn", " triệu", " tỷ", " nghìn tỷ", " triệu tỷ", "tỷ tỷ"]
    parts = []
    group_index = 0
    show_zero = False
    while integer_value > 0 and group_index < len(suffixes):
        block = integer_value % 1000
        if block != 0:
            block_words = read_three_digits(block, show_zero)
            parts.append(f"{block_words}{suffixes[group_index]}".strip())
        integer_value //= 1000
        group_index += 1
        show_zero = True

    result = " ".join(reversed(parts))
    return result[:1].upper() + result[1:] + " đồng"

@payment_waiting_bp.route('/api/payment-waiting', methods=['GET'])
@require_auth
def get_payment_waiting_list(user):
    """Lấy danh sách các lượt khám chờ thanh toán"""
    db = next(get_db())
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        status_filter = request.args.get('status', None)
        
        search_query = request.args.get('search', '').strip()
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        
        # Xây dựng query cơ bản
        query = db.query(Examination).join(Appointment).join(Patient)
        
        # Filter theo status nếu có
        if status_filter:
            if status_filter == 'waiting_transfer':
                query = query.filter(Examination.status == ExaminationStatus.WAITING_TRANSFER)
            elif status_filter == 'doctor_exam':
                query = query.filter(Examination.status.in_([ExaminationStatus.DOCTOR_EXAM, ExaminationStatus.PSYCHOLOGIST_EXAM]))
            # Fix filter theo payment_status
            elif status_filter == 'UNPAID':
                query = query.filter(Examination.status == ExaminationStatus.WAITING_PAYMENT)
            elif status_filter == 'PAID':
                query = query.filter(Examination.status == ExaminationStatus.COMPLETED)
        else:
            # Mặc định: lấy cả WAITING_PAYMENT và COMPLETED để frontend lọc
            query = query.filter(Examination.status.in_([ExaminationStatus.WAITING_PAYMENT, ExaminationStatus.COMPLETED]))

        # Filter theo search query (Tên bệnh nhân, SĐT, hoặc chẩn đoán ICD)
        if search_query:
            from app.models.icd import ICD

            matching_icd_ids = [
                row[0]
                for row in db.query(ICD.id).filter(
                    ICD.is_deleted == False,
                    or_(
                        normalized_contains(ICD.icd_code, search_query),
                        normalized_contains(ICD.disease_name, search_query),
                    )
                ).all()
            ]
            diagnosis_filters = [Examination.diagnosis.contains([icd_id]) for icd_id in matching_icd_ids]
            normalized_query = normalize_search_text(search_query)
            if normalized_query.isdigit():
                diagnosis_filters.append(Examination.diagnosis.contains([int(normalized_query)]))

            query = query.filter(or_(
                normalized_contains(Patient.full_name, search_query),
                normalized_contains(Patient.phone, search_query),
                *diagnosis_filters
            )
            )
            
        # Filter theo ngày
        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
                query = query.filter(func.date(Examination.created_at) >= start_date.date())
            except ValueError:
                pass
                
        if end_date_str:
            try:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
                query = query.filter(func.date(Examination.created_at) <= end_date.date())
            except ValueError:
                pass
        
        # Sắp xếp theo thời gian cập nhật mới nhất lên đầu (nếu updated_at NULL thì dùng created_at)
        query = query.order_by(
            func.coalesce(Examination.updated_at, Examination.created_at).desc()
        )
        
        # Tính tổng số bản ghi
        total = query.count()
        
        # Phân trang
        offset = (page - 1) * per_page
        examinations = query.offset(offset).limit(per_page).all()
        
        # Chuyển đổi thành dữ liệu JSON
        data = []
        for exam in examinations:
            # Lấy thông tin bệnh nhân
            patient = exam.appointment.patient
            
            from app.utils.examination_utils import build_icd_display_contract
            diagnosis_contract = build_icd_display_contract(db, exam.diagnosis)
            diagnosis = diagnosis_contract['text']
            
            # Tính tổng tiền (có thể lấy từ service details)
            total_amount = 0  # TODO: Tính toán từ service details
            
            # Map examination status to frontend status
            status_mapping = {
                'WAITING_TRANSFER': 'waiting_transfer',
                'DOCTOR_EXAM': 'doctor_exam',
                'PSYCHOLOGIST_EXAM': 'doctor_exam',
                'WAITING_PAYMENT': 'waiting_payment',
                'COMPLETED': 'examined'
            }
            
            payment_data = {
                'id': exam.id,
                'patient_name': f"{patient.full_name}",
                'phone_number': patient.phone if patient else None,
                'examination_date': exam.created_at.isoformat() if exam.created_at else None,
                'doctor_name': exam.appointment.doctor.full_name if exam.appointment.doctor else 'N/A',
                'service_count': '1',  # TODO: Tính toán từ service details
                'diagnosis': diagnosis,
                'diagnosis_ids': diagnosis_contract['ids'],
                'total_amount': total_amount,
                'status': status_mapping.get(exam.status.value, 'pending'),
                'payment_status': exam.payment_status,
                'created_at': exam.created_at.isoformat() if exam.created_at else None,
                'updated_at': exam.updated_at.isoformat() if exam.updated_at else None
            }
            data.append(payment_data)
        
        return jsonify({
            'data': data,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        }), 200
        
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi lấy danh sách chờ thanh toán: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy danh sách chờ thanh toán'}), 500
    finally:
        db.close()

@payment_waiting_bp.route('/api/payment-waiting/<int:payment_id>', methods=['GET'])
@require_auth
def get_payment_detail(user, payment_id):
    """Lấy chi tiết một lượt khám chờ thanh toán"""
    db = next(get_db())
    try:
        examination = db.query(Examination).filter(
            Examination.id == payment_id,
            Examination.status.in_([ExaminationStatus.WAITING_PAYMENT, ExaminationStatus.COMPLETED])
        ).first()
        
        if not examination:
            return jsonify({'detail': 'Không tìm thấy lượt khám'}), 404
        
        # Lấy thông tin bệnh nhân
        patient = examination.appointment.patient
        
        from app.utils.examination_utils import build_icd_display_contract
        diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
        benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)
        diagnosis = diagnosis_contract['text']
        
        # Sử dụng to_dict() method để lấy đầy đủ thông tin
        examination_data = examination.to_dict()
        examination_data.update({
            'diagnosis': diagnosis,
            'diagnosis_ids': diagnosis_contract['ids'],
            'benh_kem_theo': benh_kem_theo_contract['text'],
            'benh_kem_theo_ids': benh_kem_theo_contract['ids'],
        })
        
        # Thêm thông tin patient và doctor
        examination_data['patient'] = {
            'id': patient.id,
            'full_name': patient.full_name,
            'phone_number': patient.phone,
            'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
            'gender': patient.gender
        }
        
        examination_data['doctor'] = {
            'id': examination.doctor.id,
            'full_name': examination.doctor.full_name
        }
        
        return jsonify({'data': examination_data}), 200
        
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi lấy chi tiết chờ thanh toán: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy chi tiết chờ thanh toán'}), 500
    finally:
        db.close()

@payment_waiting_bp.route('/api/payment-waiting/<int:payment_id>/confirm', methods=['PUT'])
@require_auth
def confirm_payment(user, payment_id):
    """Xác nhận thanh toán cho một lượt khám"""
    db = next(get_db())
    try:
        examination = db.query(Examination).filter(
            Examination.id == payment_id,
            Examination.status == ExaminationStatus.WAITING_PAYMENT
        ).first()
        
        if not examination:
            return jsonify({'detail': 'Không tìm thấy lượt khám'}), 404
        
        # Lấy thông tin thanh toán từ request
        data = request.get_json() or {}
        advance_payment = data.get('advance_payment', 0)
        amount_paid = data.get('amount_paid', 0)
        actual_price = data.get('actual_price', 0)  # Tổng tiền sau thuế
        
        # Cập nhật thông tin thanh toán
        examination.advance_payment = advance_payment
        examination.amount_paid = amount_paid
        examination.actual_price = actual_price
        examination.status = ExaminationStatus.COMPLETED
        examination.payment_status = 'PAID'
        examination.updated_at = datetime.now()
        
        db.commit()
        db.refresh(examination)
        emit_payment_changed('confirmed', examination=examination)
        
        return jsonify({
            'message': 'Xác nhận thanh toán thành công',
            'examination_id': examination.id,
            'new_status': examination.status.value,
            'advance_payment': float(examination.advance_payment),
            'amount_paid': float(examination.amount_paid),
            'actual_price': float(examination.actual_price) if examination.actual_price else 0
        }), 200
        
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi xác nhận thanh toán: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi xác nhận thanh toán'}), 500
    finally:
        db.close()

@payment_waiting_bp.route('/api/payment-waiting/export', methods=['POST'])
@require_auth
def export_payment_data(user):
    """Xuất dữ liệu thanh toán ra file Excel"""
    db = next(get_db())
    try:
        data = request.get_json()
        payment_ids = data.get('payment_ids', [])
        
        if not payment_ids:
            return jsonify({'detail': 'Không có ID nào được chọn'}), 400
        
        # Convert to int
        payment_ids = [int(pid) for pid in payment_ids]
        
        # Lấy dữ liệu các lượt khám được chọn
        examinations = db.query(Examination).filter(
            Examination.id.in_(payment_ids)
        ).join(Appointment).join(Patient).all()
        
        if not examinations:
            return jsonify({'detail': 'Không tìm thấy dữ liệu'}), 404
        
        # Tạo file Excel
        import openpyxl
        from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Danh sách hóa đơn"
        
        # Header style
        header_font = Font(name='Arial', bold=True, size=11, color='FFFFFF')
        header_fill = PatternFill(start_color='0F766E', end_color='0F766E', fill_type='solid')
        header_alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        # Headers
        headers = ['STT', 'Bệnh nhân', 'Số điện thoại', 'Ngày giờ', 'Bác sĩ khám', 'Trạng thái']
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border
        
        # Data rows
        data_font = Font(name='Arial', size=10)
        for idx, exam in enumerate(examinations, 1):
            patient = exam.appointment.patient
            doctor_name = exam.appointment.doctor.full_name if exam.appointment.doctor else 'N/A'
            status = 'Đã thanh toán' if exam.payment_status == 'PAID' else 'Chờ thanh toán'
            exam_date = exam.created_at.strftime('%H:%M:%S %d/%m/%Y') if exam.created_at else 'N/A'
            
            row_data = [
                idx,
                patient.full_name if patient else 'N/A',
                patient.phone if patient else 'N/A',
                exam_date,
                doctor_name,
                status
            ]
            
            for col, value in enumerate(row_data, 1):
                cell = ws.cell(row=idx + 1, column=col, value=value)
                cell.font = data_font
                cell.border = thin_border
                if col == 1:
                    cell.alignment = Alignment(horizontal='center')
        
        # Auto-fit column widths
        col_widths = [6, 25, 15, 22, 30, 16]
        for i, width in enumerate(col_widths, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = width
        
        # Save file
        downloads_dir = upload_dir('downloads')
        filename = f"payment_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        filepath = downloads_dir / filename
        wb.save(filepath)
        
        download_url = f"/downloads/{filename}"
        
        return jsonify({
            'message': 'Xuất dữ liệu thành công',
            'download_url': download_url,
            'exported_count': len(examinations)
        }), 200
        
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi xuất dữ liệu thanh toán: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi xuất dữ liệu'}), 500
    finally:
        db.close()



@payment_waiting_bp.route('/api/payment-waiting/print', methods=['POST'])
@require_auth
def print_invoices(user):
    """In hóa đơn"""
    db = next(get_db())
    try:
        data = request.get_json()
        payment_ids = data.get('payment_ids', [])
        
        if not payment_ids:
            return jsonify({'detail': 'Không có ID nào được chọn'}), 400
        
        # Lấy các lượt khám được chọn
        examinations = db.query(Examination).filter(
            Examination.id.in_(payment_ids),
            Examination.status == ExaminationStatus.WAITING_PAYMENT
        ).join(Appointment).join(Patient).all()
        
        # TODO: Tạo file PDF và trả về print URL
        # Hiện tại chỉ trả về thông báo thành công
        print_url = f"/print/invoices_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return jsonify({
            'message': 'Tạo file in thành công',
            'print_url': print_url,
            'print_count': len(examinations)
        }), 200
        
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi in hóa đơn: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi in hóa đơn'}), 500
    finally:
        db.close()

@payment_waiting_bp.route('/payment-waiting/invoice/<int:examination_id>', methods=['GET'])
@require_auth
def render_invoice(user, examination_id):
    """Render VAT invoice HTML for a specific examination"""
    db = next(get_db())
    try:
        examination = db.query(Examination).options(
            joinedload(Examination.appointment).joinedload(Appointment.patient),
            joinedload(Examination.appointment).joinedload(Appointment.doctor)
        ).filter(
            Examination.id == examination_id,
            Examination.is_active == True
        ).first()

        if not examination:
            abort(404, description='Không tìm thấy lượt khám')

        appointment = examination.appointment
        patient = appointment.patient if appointment and appointment.patient else examination.patient
        doctor_name = appointment.doctor.full_name if appointment and appointment.doctor else (examination.doctor.full_name if examination.doctor else '---')

        services = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment.id
        ).all() if appointment else []

        service_rows = []
        subtotal = Decimal('0')
        tax_total = Decimal('0')
        total_amount = Decimal('0')
        vat_rate = Decimal('0')

        for idx, service in enumerate(services, start=1):
            unit_price = Decimal(service.unit_price or service.price or 0)
            quantity = service.quantity or 1
            discount_percent = Decimal(service.discount_percent or 0)
            tax_percent = Decimal(service.tax_percent or 0)

            base_total = unit_price * quantity
            discount_amount = base_total * discount_percent / Decimal(100)
            subtotal_line = base_total - discount_amount
            tax_amount = subtotal_line * tax_percent / Decimal(100)
            line_total = Decimal(service.total_amount) if service.total_amount is not None else subtotal_line + tax_amount

            subtotal += subtotal_line
            tax_total += tax_amount
            total_amount += line_total
            if tax_percent and vat_rate == 0:
                vat_rate = tax_percent

            service_rows.append({
                'stt': idx,
                'name': service.service_name or (service.service.name if service.service else 'Dịch vụ'),
                'unit': 'Lần',  # AppointmentService không có attribute unit, dùng mặc định
                'quantity': quantity,
                'unit_price': format_currency(unit_price),
                'discount_percent': discount_percent.normalize().to_eng_string() if discount_percent else '0',
                'tax_percent': tax_percent.normalize().to_eng_string() if tax_percent else '0',
                'amount': format_currency(line_total)
            })

        clinic_logo = url_for('static', filename='assets/sontam.jpg')
        invoice_number = examination.examination_code or f"INV-{examination.id:05d}"
        issue_date = examination.created_at or datetime.now()

        patient_address_parts = [
            patient.address_detail or patient.address,
            patient.ward,
            patient.district,
            patient.province
        ] if patient else []

        clinic_info_context = {
            'name': CLINIC_INFO.get('name', '---'),
            'address': CLINIC_INFO.get('address', '---'),
            'tax_code': CLINIC_INFO.get('tax_code', '---'),
            'phone': CLINIC_INFO.get('phone', ''),
            'email': CLINIC_INFO.get('email', ''),
            'bank_account': CLINIC_INFO.get('bank_account', ''),
            'logo_url': clinic_logo,
            'watermark': CLINIC_INFO.get('watermark', ''),
            'medical_director': CLINIC_INFO.get('medical_director', '')
        }

        seller_info = {
            'name': clinic_info_context['name'],
            'tax_id': clinic_info_context['tax_code'],
            'address': clinic_info_context['address'],
            'bank_account': clinic_info_context['bank_account']
        }

        buyer_info = {
            'person_name': patient.full_name if patient else '---',
            'company_name': patient.company_name if patient and hasattr(patient, 'company_name') else '---',
            'tax_id': patient.tax_code if patient and hasattr(patient, 'tax_code') else '---',
            'address': ", ".join([part for part in patient_address_parts if part]) if patient else '---',
            'bank_account': patient.bank_account if patient and hasattr(patient, 'bank_account') else ''
        }

        invoice_meta = {
            'qr_code_url': None,
            'symbol': INVOICE_SERIAL,
            'number': invoice_number,
            'lookup_code': f"INV-{examination_id}",
            'payment_method': 'Tiền mặt/Chuyển khoản',
            'issuer': examination.updated_by if hasattr(examination, 'updated_by') and examination.updated_by else '---',
            'note': '',
            'signature_date': issue_date.strftime('%d-%m-%Y')
        }

        doctor_context = {
            'full_name': doctor_name
        }

        totals_context = {
            'subtotal': format_currency(subtotal),
            'tax': format_currency(tax_total),
            'total': format_currency(total_amount),
            'vat_rate': vat_rate.normalize().to_eng_string() if vat_rate else '0',
            'amount_in_words': number_to_vietnamese_words(total_amount)
        }

        return render_template(
            'print/vat_invoice.html',
            clinic_info=clinic_info_context,
            seller_info=seller_info,
            buyer_info=buyer_info,
            invoice_meta=invoice_meta,
            invoice_date=issue_date,
            doctor=doctor_context,
            services=service_rows,
            totals=totals_context
        )
    finally:
        db.close()

@payment_waiting_bp.route('/api/payment-waiting/stats', methods=['GET'])
@require_auth
def get_payment_stats(user):
    """Lấy thống kê examination theo trạng thái"""
    db = next(get_db())
    try:
        # Đếm số lượt khám theo trạng thái
        waiting_transfer = db.query(Examination).filter(
            Examination.status == ExaminationStatus.WAITING_TRANSFER
        ).count()
        
        # Đang khám = DOCTOR_EXAM + PSYCHOLOGIST_EXAM + CONCLUSION
        doctor_exam = db.query(Examination).filter(
            Examination.status.in_([ExaminationStatus.DOCTOR_EXAM, ExaminationStatus.PSYCHOLOGIST_EXAM, ExaminationStatus.CONCLUSION])
        ).count()
        
        # Đã khám = COMPLETED
        examined = db.query(Examination).filter(
            Examination.status == ExaminationStatus.COMPLETED
        ).count()
        
        # Chờ thanh toán = WAITING_PAYMENT
        waiting_payment = db.query(Examination).filter(
            Examination.status == ExaminationStatus.WAITING_PAYMENT
        ).count()
        
        stats = {
            'waiting_transfer': waiting_transfer,
            'doctor_exam': doctor_exam,
            'waiting_payment': waiting_payment,
            'examined': examined
        }
        
        return jsonify(stats), 200
        
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi lấy thống kê examination: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy thống kê'}), 500
    finally:
        db.close()
