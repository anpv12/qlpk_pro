from flask import Blueprint, jsonify, request
from app.core.database import get_db
from app.models.examination import Examination, ExaminationStatus
# ExaminationService import removed - using AppointmentService instead
from app.models.appointment_service import AppointmentService
from app.models.service import Service
from app.api.auth import require_auth
from app.modules.appointments.services.appointment_service_selection import (
    AppointmentServiceLockedError,
    AppointmentServiceValidationError,
    apply_appointment_service_selection,
    calculate_appointment_service_amounts,
    can_override_appointment_service_finance,
    ensure_appointment_service_mutable,
    resolve_catalog_service,
)
from app.modules.examinations.view_models.detail import build_examination_invoice_detail_response
from app.realtime.events import emit_examination_changed, emit_payment_changed
from datetime import datetime
import logging
import traceback

examination_detail_bp = Blueprint('examination_detail', __name__)


def _can_manage_financial_services(user) -> bool:
    return can_override_appointment_service_finance(user)

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>', methods=['GET'])
@require_auth
def get_examination_detail(user, examination_id):
    """Lấy thông tin chi tiết hóa đơn"""
    db = next(get_db())
    try:
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({'detail': 'Không tìm thấy ca khám'}), 404

        return jsonify(build_examination_invoice_detail_response(db, examination)), 200

    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi lấy thông tin chi tiết hóa đơn: {str(e)}")
        logging.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'detail': f'Có lỗi xảy ra khi lấy thông tin: {str(e)}'}), 500
    finally:
        db.close()

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>/services', methods=['GET'])
@require_auth
def get_examination_services(user, examination_id):
    """Lấy danh sách dịch vụ của ca khám"""
    db = next(get_db())
    try:
        # Lấy appointment_id từ examination_id
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({'detail': 'Không tìm thấy ca khám'}), 404
            
        appointment_id = examination.appointment_id
        
        # Chỉ lấy services từ appointment_services (đã mở rộng)
        appointment_services = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        ).all()

        services_data = []
        
        # Xử lý services từ appointment_services
        for service in appointment_services:
            # Sử dụng dữ liệu từ cột mới nếu có, fallback về dữ liệu gốc
            service_name = service.service_name or (db.query(Service.name).filter(Service.id == service.service_id).scalar() or 'N/A')
            unit_price = float(service.unit_price or service.price or 0)
            discount_percent = float(service.discount_percent or 0)
            # Mặc định VAT = 0 nếu không được thiết lập
            tax_percent = float(service.tax_percent or 0)
            total_amount = float(service.total_amount or (unit_price * service.quantity * (1 + tax_percent/100)))
            paid_before = service.paid_before or False
            is_package = service.is_package or False
            
            services_data.append({
                'id': service.id,
                'service_name': service_name,
                'unit_price': float(unit_price),
                'discount_percent': float(discount_percent),
                'tax_percent': float(tax_percent),
                'total_amount': float(total_amount),
                'paid_before': paid_before,
                'is_package': is_package
            })

        return jsonify(services_data), 200

    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi lấy danh sách dịch vụ: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi lấy danh sách dịch vụ: {str(e)}'}), 500
    finally:
        db.close()

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>/services', methods=['POST'])
@require_auth
def add_examination_service(user, examination_id):
    """Thêm dịch vụ cho ca khám"""
    db = next(get_db())
    try:
        if not _can_manage_financial_services(user):
            return jsonify({'detail': 'Chỉ nhân sự tài chính mới được thay đổi giá dịch vụ.'}), 403
        data = request.get_json() or {}
        
        # Lấy appointment_id từ examination_id
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({'detail': 'Không tìm thấy ca khám'}), 404
            
        appointment_id = examination.appointment_id
        ensure_appointment_service_mutable(db, appointment_id)
        catalog_service = resolve_catalog_service(db, data.get('service_id'))
        new_service = AppointmentService(appointment_id=appointment_id)
        apply_appointment_service_selection(
            new_service,
            data,
            catalog_service,
            allow_financial_override=True,
        )
        new_service.paid_before = bool(data.get('paid_before', False))
        new_service.is_package = bool(data.get('is_package', False))
        
        db.add(new_service)
        db.commit()
        emit_examination_changed('examination_service_added', examination=examination, extra={
            'entity': 'appointment_service',
            'appointment_service_id': new_service.id,
        })

        return jsonify({'message': 'Thêm dịch vụ thành công', 'id': new_service.id}), 201

    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    except AppointmentServiceValidationError as e:
        return jsonify({'detail': str(e)}), 400
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi thêm dịch vụ: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi thêm dịch vụ: {str(e)}'}), 500
    finally:
        db.close()

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>/services/<int:service_id>', methods=['DELETE'])
@require_auth
def delete_examination_service(user, examination_id, service_id):
    """Xóa dịch vụ khỏi ca khám"""
    db = next(get_db())
    try:
        if not _can_manage_financial_services(user):
            return jsonify({'detail': 'Chỉ nhân sự tài chính mới được thay đổi giá dịch vụ.'}), 403
        # Lấy examination để tìm appointment_id
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({'detail': 'Không tìm thấy ca khám'}), 404
            
        appointment_id = examination.appointment_id
        ensure_appointment_service_mutable(db, appointment_id)
        
        # Tìm dịch vụ trong appointment_services
        service = db.query(AppointmentService).filter(
            AppointmentService.id == service_id,
            AppointmentService.appointment_id == appointment_id
        ).first()
        
        if not service:
            return jsonify({'detail': 'Không tìm thấy dịch vụ'}), 404
        
        # Xóa dịch vụ
        deleted_service_id = service.id
        db.delete(service)
        db.commit()
        emit_examination_changed('examination_service_deleted', examination=examination, extra={
            'entity': 'appointment_service',
            'appointment_service_id': deleted_service_id,
        })
        
        return jsonify({'message': 'Xóa dịch vụ thành công'}), 200

    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi xóa dịch vụ: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi xóa dịch vụ: {str(e)}'}), 500
    finally:
        db.close()

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>/services/<int:service_id>', methods=['PUT'])
@require_auth
def update_examination_service(user, examination_id, service_id):
    """Cập nhật dịch vụ của ca khám"""
    db = next(get_db())
    try:
        if not _can_manage_financial_services(user):
            return jsonify({'detail': 'Chỉ nhân sự tài chính mới được thay đổi giá dịch vụ.'}), 403
        data = request.get_json() or {}
        
        # Lấy examination để tìm appointment_id
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({'detail': 'Không tìm thấy ca khám'}), 404
            
        appointment_id = examination.appointment_id
        ensure_appointment_service_mutable(db, appointment_id)
        
        # Tìm dịch vụ trong appointment_services
        service = db.query(AppointmentService).filter(
            AppointmentService.id == service_id,
            AppointmentService.appointment_id == appointment_id
        ).first()
        
        if not service:
            return jsonify({'detail': 'Không tìm thấy dịch vụ'}), 404
        
        catalog_service = resolve_catalog_service(
            db,
            service.service_id,
            allow_inactive=True,
        )
        apply_appointment_service_selection(
            service,
            data,
            catalog_service,
            allow_financial_override=True,
        )
        
        # Cập nhật updated_at
        service.updated_at = datetime.utcnow()

        db.commit()
        emit_examination_changed('examination_service_updated', examination=examination, extra={
            'entity': 'appointment_service',
            'appointment_service_id': service.id,
        })
        
        return jsonify({'message': 'Cập nhật dịch vụ thành công'}), 200

    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    except AppointmentServiceValidationError as e:
        return jsonify({'detail': str(e)}), 400
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi cập nhật dịch vụ: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi cập nhật dịch vụ: {str(e)}'}), 500
    finally:
        db.close()

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>/financial-summary', methods=['GET'])
@require_auth
def get_financial_summary(user, examination_id):
    """Lấy tóm tắt tài chính từ database"""
    db = next(get_db())
    try:
        # Lấy appointment_id từ examination_id
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({'detail': 'Không tìm thấy ca khám'}), 404
            
        appointment_id = examination.appointment_id
        
        # Lấy tất cả dịch vụ từ appointment_services
        services = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        ).all()
        
        subtotal_pre_tax = 0
        total_discount = 0
        total_vat = 0
        total_after_tax = 0
        
        for service in services:
            amounts = calculate_appointment_service_amounts(
                service.unit_price if service.unit_price is not None else service.price,
                service.quantity,
                service.discount_percent,
                service.tax_percent,
            )
            subtotal_pre_tax += float(amounts['subtotal'])
            total_discount += float(amounts['discount_amount'])
            total_vat += float(amounts['tax_amount'])
            total_after_tax += float(amounts['total_amount'])
        
        return jsonify({
            'subtotal_pre_tax': subtotal_pre_tax,
            'total_discount': total_discount,
            'vat_amount': total_vat,
            'total_after_tax': total_after_tax
        }), 200
        
    except Exception as e:
        logging.error(f"Lỗi lấy tóm tắt tài chính: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi lấy tóm tắt tài chính: {str(e)}'}), 500
    finally:
        db.close()

@examination_detail_bp.route('/api/examination-detail/<int:examination_id>/export', methods=['POST'])
@require_auth
def export_invoice(user, examination_id):
    """Xuất hóa đơn"""
    db = next(get_db())
    try:
        data = request.get_json()
        payment_method = data.get('payment_method', 'cash')
        
        # Cập nhật trạng thái ca khám thành đã thanh toán
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if examination:
            examination.status = ExaminationStatus.PAID
            db.commit()
            emit_payment_changed('invoice_exported', examination=examination)
            emit_examination_changed('invoice_exported', examination=examination)
        
        # Ở đây có thể thêm logic tạo file PDF hóa đơn
        # Hiện tại chỉ trả về thông báo thành công
        
        return jsonify({
            'message': 'Xuất hóa đơn thành công',
            'invoice_id': examination_id,
            'payment_method': payment_method
        }), 200

    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi xuất hóa đơn: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi xuất hóa đơn: {str(e)}'}), 500
    finally:
        db.close()
