"""app.api.service: phần 2 — tách từ service.py (import ở cuối service.py để đăng ký route/giữ tên cũ)."""

from decimal import Decimal
from flask import request, jsonify
from app.api.auth import require_auth
from app.core.database import get_db
from app.models.service import Service, ServicePrice
from app.models.appointment import Appointment
from app.models.appointment_service import AppointmentService
from app.modules.appointments.services.appointment_service_selection import (
    AppointmentServiceLockedError,
    AppointmentServiceValidationError,
    apply_appointment_service_selection,
    can_override_appointment_service_finance,
    ensure_appointment_service_mutable,
    is_appointment_service_locked,
    resolve_catalog_service,
)
from app.schemas.service_schemas import ServicePriceUpdate, AppointmentServiceSyncRequest, AppointmentServiceItem
from app.realtime.events import emit_catalog_changed
from app.api.service import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    _emit_appointment_services_changed,
    _ensure_appointment,
    _serialize_appointment_service,
    _to_decimal,
    logger,
    router,
)
from app.utils.api_error_contract import api_error_boundary


@router.route('/<int:service_id>/prices/<int:price_id>', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def update_service_price(current_user, service_id, price_id):
    db = next(get_db())
    try:
        # Check if service exists
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404

        # Check if price exists
        price = db.query(ServicePrice).filter(
            ServicePrice.id == price_id,
            ServicePrice.service_id == service_id
        ).first()
        if not price:
            return jsonify({'detail': 'Service price not found'}), 404

        data = request.get_json()
        update_data = ServicePriceUpdate(**data)

        # Check if new target_type conflicts with existing price
        if update_data.target_type and update_data.target_type != price.target_type:
            existing_price = db.query(ServicePrice).filter(
                ServicePrice.service_id == service_id,
                ServicePrice.target_type == update_data.target_type,
                ServicePrice.id != price_id
            ).first()
            if existing_price:
                return jsonify({'detail': f'Price for target type "{update_data.target_type}" already exists'}), 400

        # Update fields
        if update_data.target_type is not None:
            price.target_type = update_data.target_type
        if update_data.target_name is not None:
            price.target_name = update_data.target_name
        if update_data.price is not None:
            price.price = update_data.price

        db.commit()
        db.refresh(price)
        emit_catalog_changed('service_price_updated', entity='service_price', entity_id=price.id, extra={'service_id': service_id})

        result = {
            'id': price.id,
            'service_id': price.service_id,
            'target_type': price.target_type,
            'target_name': price.target_name,
            'price': float(price.price),
            'created_at': price.created_at.isoformat() if price.created_at else None
        }
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/<int:service_id>/prices/<int:price_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def delete_service_price(current_user, service_id, price_id):
    db = next(get_db())
    try:
        # Check if service exists
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404

        # Check if price exists
        price = db.query(ServicePrice).filter(
            ServicePrice.id == price_id,
            ServicePrice.service_id == service_id
        ).first()
        if not price:
            return jsonify({'detail': 'Service price not found'}), 404

        db.delete(price)
        db.commit()
        emit_catalog_changed('service_price_deleted', entity='service_price', entity_id=price_id, extra={'service_id': service_id})

        return jsonify({'detail': 'Service price deleted successfully'}), 200
    finally:
        db.close()


# Appointment Services Endpoints
@router.route('/appointment/<int:appointment_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def get_appointment_services(current_user, appointment_id):
    """Lấy danh sách dịch vụ của một appointment"""
    db = next(get_db())
    try:
        # Lấy danh sách appointment_services hiện có
        appointment_services = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        ).all()

        # Nếu chưa có dịch vụ nào, kiểm tra appointment.service_id để tự động tạo
        if not appointment_services:
            appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
            if appointment and appointment.service_id:
                # Kiểm tra xem đã có record chưa (tránh duplicate)
                existing = db.query(AppointmentService).filter(
                    AppointmentService.appointment_id == appointment_id,
                    AppointmentService.service_id == appointment.service_id
                ).first()

                if not existing:
                    # Lấy thông tin service
                    service = db.query(Service).filter(Service.id == appointment.service_id).first()
                    if service and service.is_active and not is_appointment_service_locked(db, appointment_id):
                        # Legacy read hydration still creates the initial row through the canonical writer.
                        appointment_service = AppointmentService(appointment_id=appointment_id)
                        apply_appointment_service_selection(
                            appointment_service,
                            {'quantity': 1, 'note': ''},
                            service,
                        )
                        db.add(appointment_service)
                        db.commit()
                        db.refresh(appointment_service)
                        _emit_appointment_services_changed(db, appointment_id, 'appointment_service_auto_created', extra={'service_id': appointment.service_id})
                        logger.info(f"Auto-created appointment_service from appointment.service_id for appointment {appointment_id}")

                        appointment_services = db.query(AppointmentService).filter(
                            AppointmentService.appointment_id == appointment_id
                        ).all()

        result = []
        total_amount = Decimal('0')

        for app_service in appointment_services:
            serialized = _serialize_appointment_service(app_service)
            result.append(serialized)
            total_amount += _to_decimal(serialized['total'])

        return jsonify({
            'services': result,
            'total_amount': float(total_amount),
            'count': len(result)
        }), 200
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/add', methods=['POST'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def add_appointment_service(current_user, appointment_id):
    """Thêm dịch vụ vào appointment"""
    db = next(get_db())
    try:
        data = request.get_json() or {}
        ensure_appointment_service_mutable(db, appointment_id)
        service = resolve_catalog_service(db, data.get('service_id'))

        # Check if appointment service already exists
        existing_service = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id,
            AppointmentService.service_id == service.id
        ).first()

        if existing_service:
            return jsonify({'detail': 'Service already exists in appointment'}), 400

        appointment_service = AppointmentService(appointment_id=appointment_id)
        apply_appointment_service_selection(appointment_service, data, service)

        db.add(appointment_service)
        db.commit()
        db.refresh(appointment_service)
        _emit_appointment_services_changed(db, appointment_id, 'appointment_service_added', extra={'service_id': service.id})

        return jsonify(_serialize_appointment_service(appointment_service)), 201
    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    except AppointmentServiceValidationError as e:
        return jsonify({'detail': str(e)}), 400
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/remove/<int:service_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def remove_appointment_service(current_user, appointment_id, service_id):
    """Xóa dịch vụ khỏi appointment"""
    db = next(get_db())
    try:
        ensure_appointment_service_mutable(db, appointment_id)
        # Find the appointment service
        appointment_service = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id,
            AppointmentService.service_id == service_id
        ).first()

        if not appointment_service:
            return jsonify({'detail': 'Appointment service not found'}), 404

        db.delete(appointment_service)
        db.commit()
        _emit_appointment_services_changed(db, appointment_id, 'appointment_service_removed', extra={'service_id': service_id})

        return jsonify({'detail': 'Service removed from appointment successfully'}), 200
    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/clear', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def clear_appointment_services(current_user, appointment_id):
    """Xóa tất cả dịch vụ của appointment"""
    db = next(get_db())
    try:
        ensure_appointment_service_mutable(db, appointment_id)
        # Delete all services for this appointment
        deleted_count = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        ).delete()

        db.commit()
        _emit_appointment_services_changed(db, appointment_id, 'appointment_services_cleared', extra={'deleted_count': deleted_count})

        return jsonify({'detail': f'Cleared {deleted_count} services from appointment'}), 200
    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/update', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def update_appointment_service(current_user, appointment_id):
    """Cập nhật thông tin dịch vụ của appointment"""
    db = next(get_db())
    try:
        data = request.get_json()
        if not data:
            return jsonify({'detail': 'Request body is required'}), 400

        try:
            item = AppointmentServiceItem(**data)
        except Exception as exc:
            return jsonify({'detail': f'Invalid payload: {exc}'}), 400

        if not item.service_id and not item.id:
            return jsonify({'detail': 'service_id or id is required'}), 400

        ensure_appointment_service_mutable(db, appointment_id)

        query = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        )
        if item.id:
            query = query.filter(AppointmentService.id == item.id)
        if item.service_id:
            query = query.filter(AppointmentService.service_id == item.service_id)

        appointment_service = query.first()

        if not appointment_service:
            return jsonify({'detail': 'Appointment service not found'}), 404

        target_service_id = item.service_id or appointment_service.service_id
        service = resolve_catalog_service(
            db,
            target_service_id,
            allow_inactive=appointment_service.service_id == target_service_id,
        )
        allow_financial_override = can_override_appointment_service_finance(current_user)
        if not allow_financial_override and any(
            getattr(item, field, None) is not None
            for field in ('unit_price', 'price', 'amount', 'discount_percent', 'tax_percent')
        ):
            return jsonify({'detail': 'Chỉ nhân sự tài chính mới được thay đổi giá, chiết khấu hoặc thuế.'}), 403

        apply_appointment_service_selection(
            appointment_service,
            item,
            service,
            allow_financial_override=allow_financial_override,
        )

        db.commit()
        db.refresh(appointment_service)
        _emit_appointment_services_changed(db, appointment_id, 'appointment_service_updated', extra={'service_id': appointment_service.service_id, 'appointment_service_id': appointment_service.id})

        return jsonify(_serialize_appointment_service(appointment_service)), 200
    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    except AppointmentServiceValidationError as e:
        return jsonify({'detail': str(e)}), 400
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/sync', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def sync_appointment_services(current_user, appointment_id):
    """Đồng bộ danh sách dịch vụ cho một appointment (thay thế toàn bộ)."""
    db = next(get_db())
    try:
        payload = request.get_json() or {}
        try:
            sync_request = AppointmentServiceSyncRequest(**payload)
        except Exception as exc:
            return jsonify({'detail': f'Invalid payload: {exc}'}), 400

        appointment = _ensure_appointment(db, appointment_id)
        if not appointment:
            return jsonify({'detail': 'Appointment not found'}), 404
        ensure_appointment_service_mutable(db, appointment_id)

        existing_records = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        ).all()
        existing_by_id = {record.id: record for record in existing_records}

        keep_ids = []
        for item in sync_request.services:
            if item.id:
                record = existing_by_id.get(item.id)
                if not record:
                    raise AppointmentServiceValidationError(
                        "Dòng dịch vụ không thuộc lịch hẹn hiện tại."
                    )
                if item.service_id and item.service_id != record.service_id:
                    raise AppointmentServiceValidationError(
                        "Không thể đổi dịch vụ trên dòng đã có. Hãy xóa rồi thêm dịch vụ mới."
                    )
                service = resolve_catalog_service(
                    db,
                    record.service_id,
                    allow_inactive=True,
                )
                apply_appointment_service_selection(record, item, service)
            else:
                service = resolve_catalog_service(db, item.service_id)
                record = AppointmentService(appointment_id=appointment_id)
                apply_appointment_service_selection(record, item, service)
                db.add(record)
                db.flush()

            keep_ids.append(record.id)

        for record in existing_records:
            if record.id not in keep_ids:
                db.delete(record)

        db.commit()
        _emit_appointment_services_changed(db, appointment_id, 'appointment_services_synced', extra={'count': len(keep_ids)})

        refreshed = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == appointment_id
        ).all()

        response_items = [_serialize_appointment_service(rec) for rec in refreshed]
        total_amount = sum(_to_decimal(item['total']) for item in response_items)

        return jsonify({
            'services': response_items,
            'total_amount': float(total_amount),
            'count': len(response_items)
        }), 200
    except AppointmentServiceLockedError as e:
        return jsonify({'detail': str(e)}), 409
    except AppointmentServiceValidationError as e:
        return jsonify({'detail': str(e)}), 400
    finally:
        db.close()
