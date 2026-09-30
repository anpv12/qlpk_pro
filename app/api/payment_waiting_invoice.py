"""app.api.payment_waiting: phần 2 — tách từ payment_waiting.py (import ở cuối payment_waiting.py để đăng ký route/giữ tên cũ)."""

from flask import jsonify, request, render_template, abort, url_for
from app.api.auth import require_auth
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.models.examination import Examination, ExaminationStatus
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.appointment_service import AppointmentService
from datetime import datetime
from decimal import Decimal
import logging
from app.api.payment_waiting import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    CLINIC_INFO,
    INVOICE_SERIAL,
    format_currency,
    number_to_vietnamese_words,
    payment_waiting_bp,
)


def _render_invoice_template(doctor_name, examination, examination_id, patient, service_rows, subtotal, tax_total, total_amount, vat_rate):
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


def _invoice_service_rows(services):
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
    return service_rows, subtotal, tax_total, total_amount, vat_rate


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

        service_rows, subtotal, tax_total, total_amount, vat_rate = _invoice_service_rows(services)

        return _render_invoice_template(doctor_name, examination, examination_id, patient, service_rows, subtotal, tax_total, total_amount, vat_rate)
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
