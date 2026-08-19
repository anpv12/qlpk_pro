from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, jsonify
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import require_auth
from app.core.database import get_db
from app.models.service import Service, ServicePrice
from app.models.service_category import ServiceCategory
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
from app.schemas.service_schemas import (
    ServiceCreate,
    ServiceUpdate,
    ServicePriceCreate,
    ServicePriceUpdate,
    AppointmentServiceSyncRequest,
    AppointmentServiceItem,
)
from app.realtime.events import emit_catalog_changed, emit_examination_changed

import logging

logger = logging.getLogger(__name__)

router = Blueprint('services', __name__, url_prefix='/services')


def _to_decimal(value, default: Decimal = Decimal('0')) -> Decimal:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


def _serialize_appointment_service(record: AppointmentService):
    unit_price = record.unit_price if record.unit_price is not None else record.price
    unit_price = _to_decimal(unit_price)
    quantity = record.quantity or 0
    total_amount = record.total_amount
    if total_amount is None:
        total_amount = unit_price * quantity
    else:
        total_amount = _to_decimal(total_amount)

    return {
        'id': record.id,
        'appointment_id': record.appointment_id,
        'service_id': record.service_id,
        'service_name': record.service_name or (record.service.name if record.service else None),
        'unit_price': float(unit_price),
        'price': float(unit_price),
        'quantity': quantity,
        'total': float(total_amount),
        'note': record.description or '',
        'discount_percent': float(record.discount_percent) if record.discount_percent is not None else 0.0,
        'tax_percent': float(record.tax_percent) if record.tax_percent is not None else 0.0,
        'duration_minutes': record.duration_minutes if record.duration_minutes is not None else (
            record.service.duration_minutes if record.service and getattr(record.service, 'duration_minutes', None) is not None else None
        ),
        'created_at': record.created_at.isoformat() if record.created_at else None
    }


def _ensure_appointment(db: Session, appointment_id: int) -> Appointment:
    appointment = (
        db.query(Appointment)
        .filter(Appointment.id == appointment_id)
        .first()
    )
    return appointment

def _emit_appointment_services_changed(db: Session, appointment_id: int, action: str, extra: dict | None = None) -> None:
    examination = None
    appointment = _ensure_appointment(db, appointment_id)
    if appointment:
        examinations = list(getattr(appointment, 'examinations', []) or [])
        examination = examinations[0] if examinations else None
    emit_examination_changed(action, examination=examination, appointment_id=appointment_id, extra={
        'entity': 'appointment_service',
        **(extra or {}),
    })


@router.route('/', methods=['GET'])
@require_auth
def list_services(current_user):
    db = next(get_db())
    try:
        category_id = request.args.get('category_id')
        pagination_requested = 'page' in request.args or 'per_page' in request.args
        query = db.query(Service).filter(Service.is_active == True)
        
        if category_id:
            query = query.filter(Service.category_id == int(category_id))
        
        # Order by updated_at DESC (mới update ở trên), các service chưa update (updated_at = None) sẽ ở sau và sắp xếp theo created_at DESC
        query = query.order_by(
            Service.updated_at.desc().nulls_last(),
            Service.created_at.desc()
        )

        if pagination_requested:
            page = max(request.args.get('page', 1, type=int) or 1, 1)
            per_page = min(max(request.args.get('per_page', 12, type=int) or 12, 1), 100)
            total = query.count()
            pages = max(1, (total + per_page - 1) // per_page)
            page = min(page, pages)
            services = query.offset((page - 1) * per_page).limit(per_page).all()
        else:
            # Existing catalog consumers still receive the original array response.
            services = query.all()
        result = []
        for service in services:
            service_data = {
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'default_price': float(service.default_price),
                'duration_minutes': service.duration_minutes,
                'category_id': service.category_id,
                'category_name': service.category.name if service.category else None,
                'is_active': service.is_active,
                'created_at': service.created_at.isoformat() if service.created_at else None,
                'updated_at': service.updated_at.isoformat() if service.updated_at else None
            }
            result.append(service_data)
        if pagination_requested:
            return jsonify({
                'services': result,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'pages': pages,
                }
            }), 200
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in list_services: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:service_id>', methods=['GET'])
@require_auth
def get_service(current_user, service_id):
    db = next(get_db())
    try:
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404
        
        # Get service prices
        prices = db.query(ServicePrice).filter(ServicePrice.service_id == service_id).all()
        prices_data = []
        for price in prices:
            prices_data.append({
                'id': price.id,
                'target_type': price.target_type,
                'target_name': price.target_name,
                'price': float(price.price),
                'created_at': price.created_at.isoformat() if price.created_at else None
            })
        
        result = {
            'id': service.id,
            'name': service.name,
            'description': service.description,
            'default_price': float(service.default_price),
            'duration_minutes': service.duration_minutes,
            'category_id': service.category_id,
            'category_name': service.category.name if service.category else None,
            'is_active': service.is_active,
            'prices': prices_data,
            'created_at': service.created_at.isoformat() if service.created_at else None,
            'updated_at': service.updated_at.isoformat() if service.updated_at else None
        }
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in get_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/', methods=['POST'])
@require_auth
def create_service(current_user):
    db = next(get_db())
    try:
        data = request.get_json()
        service_data = ServiceCreate(**data)
        
        # Check if category exists
        category = db.query(ServiceCategory).filter(ServiceCategory.id == service_data.category_id).first()
        if not category:
            return jsonify({'detail': 'Service category not found'}), 400
        
        # Check if service name already exists in the same category
        existing_service = db.query(Service).filter(
            Service.name == service_data.name,
            Service.category_id == service_data.category_id
        ).first()
        if existing_service:
            return jsonify({'detail': 'Service with this name already exists in this category'}), 400
        
        new_service = Service(
            name=service_data.name,
            description=service_data.description,
            default_price=service_data.default_price,
            duration_minutes=service_data.duration_minutes,
            category_id=service_data.category_id,
            is_active=service_data.is_active
        )
        
        db.add(new_service)
        db.commit()
        db.refresh(new_service)
        emit_catalog_changed('service_created', entity='service', entity_id=new_service.id)
        
        result = {
            'id': new_service.id,
            'name': new_service.name,
            'description': new_service.description,
            'default_price': float(new_service.default_price),
            'duration_minutes': new_service.duration_minutes,
            'category_id': new_service.category_id,
            'category_name': new_service.category.name if new_service.category else None,
            'is_active': new_service.is_active,
            'created_at': new_service.created_at.isoformat() if new_service.created_at else None,
            'updated_at': new_service.updated_at.isoformat() if new_service.updated_at else None
        }
        return jsonify(result), 201
    except Exception as e:
        db.rollback()
        logger.error(f"Error in create_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:service_id>', methods=['PUT'])
@require_auth
def update_service(current_user, service_id):
    db = next(get_db())
    try:
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404
        
        data = request.get_json()
        update_data = ServiceUpdate(**data)
        
        # Check if category exists (if being updated)
        if update_data.category_id:
            category = db.query(ServiceCategory).filter(ServiceCategory.id == update_data.category_id).first()
            if not category:
                return jsonify({'detail': 'Service category not found'}), 400
        
        # Check if new name conflicts with existing service in the same category
        if update_data.name:
            category_id = update_data.category_id or service.category_id
            existing_service = db.query(Service).filter(
                Service.name == update_data.name,
                Service.category_id == category_id,
                Service.id != service_id
            ).first()
            if existing_service:
                return jsonify({'detail': 'Service with this name already exists in this category'}), 400
        
        # Update fields
        if update_data.name is not None:
            service.name = update_data.name
        if update_data.description is not None:
            service.description = update_data.description
        if update_data.default_price is not None:
            service.default_price = update_data.default_price
        if update_data.duration_minutes is not None:
            service.duration_minutes = update_data.duration_minutes
        if update_data.category_id is not None:
            service.category_id = update_data.category_id
        if update_data.is_active is not None:
            service.is_active = update_data.is_active
        
        db.commit()
        db.refresh(service)
        emit_catalog_changed('service_updated', entity='service', entity_id=service.id)
        
        result = {
            'id': service.id,
            'name': service.name,
            'description': service.description,
            'default_price': float(service.default_price),
            'duration_minutes': service.duration_minutes,
            'category_id': service.category_id,
            'category_name': service.category.name if service.category else None,
            'is_active': service.is_active,
            'created_at': service.created_at.isoformat() if service.created_at else None,
            'updated_at': service.updated_at.isoformat() if service.updated_at else None
        }
        return jsonify(result), 200
    except Exception as e:
        db.rollback()
        logger.error(f"Error in update_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:service_id>', methods=['DELETE'])
@require_auth
def delete_service(current_user, service_id):
    db = next(get_db())
    try:
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404
        
        # Check if service has associated appointments
        if service.appointments:
            return jsonify({'detail': 'Không thể xóa dịch vụ đã được sử dụng trong lịch hẹn'}), 400
        
        db.delete(service)
        db.commit()
        emit_catalog_changed('service_deleted', entity='service', entity_id=service_id)
        
        return jsonify({'detail': 'Service deleted successfully'}), 200
    except Exception as e:
        db.rollback()
        logger.error(f"Error in delete_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


# Service Prices API
@router.route('/<int:service_id>/prices', methods=['GET'])
@require_auth
def get_service_prices(current_user, service_id):
    db = next(get_db())
    try:
        # Check if service exists
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404
        
        prices = db.query(ServicePrice).filter(ServicePrice.service_id == service_id).all()
        result = []
        for price in prices:
            price_data = {
                'id': price.id,
                'service_id': price.service_id,
                'target_type': price.target_type,
                'target_name': price.target_name,
                'price': float(price.price),
                'created_at': price.created_at.isoformat() if price.created_at else None
            }
            result.append(price_data)
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in get_service_prices: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:service_id>/prices', methods=['POST'])
@require_auth
def create_service_price(current_user, service_id):
    db = next(get_db())
    try:
        # Check if service exists
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            return jsonify({'detail': 'Service not found'}), 404
        
        data = request.get_json()
        price_data = ServicePriceCreate(**data)
        
        # Check if price for this target_type already exists
        existing_price = db.query(ServicePrice).filter(
            ServicePrice.service_id == service_id,
            ServicePrice.target_type == price_data.target_type
        ).first()
        if existing_price:
            return jsonify({'detail': f'Price for target type "{price_data.target_type}" already exists'}), 400
        
        new_price = ServicePrice(
            service_id=service_id,
            target_type=price_data.target_type,
            target_name=price_data.target_name,
            price=price_data.price
        )
        
        db.add(new_price)
        db.commit()
        db.refresh(new_price)
        emit_catalog_changed('service_price_created', entity='service_price', entity_id=new_price.id, extra={'service_id': service_id})
        
        result = {
            'id': new_price.id,
            'service_id': new_price.service_id,
            'target_type': new_price.target_type,
            'target_name': new_price.target_name,
            'price': float(new_price.price),
            'created_at': new_price.created_at.isoformat() if new_price.created_at else None
        }
        return jsonify(result), 201
    except Exception as e:
        db.rollback()
        logger.error(f"Error in create_service_price: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:service_id>/prices/<int:price_id>', methods=['PUT'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in update_service_price: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:service_id>/prices/<int:price_id>', methods=['DELETE'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in delete_service_price: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close() 


# Appointment Services Endpoints
@router.route('/appointment/<int:appointment_id>', methods=['GET'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in get_appointment_services: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/add', methods=['POST'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in add_appointment_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/remove/<int:service_id>', methods=['DELETE'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in remove_appointment_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/clear', methods=['DELETE'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in clear_appointment_services: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/update', methods=['PUT'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in update_appointment_service: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>/sync', methods=['PUT'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error in sync_appointment_services: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/import', methods=['POST'])
@require_auth
def import_services(current_user):
    db = next(get_db())
    try:
        if 'file' not in request.files:
            return jsonify({'detail': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'detail': 'No file selected'}), 400
        
        if not file.filename.endswith(('.xlsx', '.xls')):
            return jsonify({'detail': 'File must be Excel format (.xlsx or .xls)'}), 400
        
        # Read Excel file
        import pandas as pd
        from io import BytesIO
        
        try:
            df = pd.read_excel(file, header=0)
        except Exception as e:
            return jsonify({'detail': f'Error reading Excel file: {str(e)}'}), 400
        
        # Validate columns
        required_columns = ['Tên dịch vụ', 'Danh mục', 'Đơn giá (VNĐ)', 'Thời gian (phút)', 'Mô tả', 'Trạng thái']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'detail': f'File must contain columns: {", ".join(required_columns)}'}), 400
        
        # Process data
        success_count = 0
        error_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                name = str(row['Tên dịch vụ']).strip()
                category_name = str(row['Danh mục']).strip()
                price_str = str(row['Đơn giá (VNĐ)']).strip()
                duration_str = str(row['Thời gian (phút)']).strip()
                description = str(row['Mô tả']).strip() if pd.notna(row['Mô tả']) else None
                status = str(row['Trạng thái']).strip()
                
                # Validate required fields
                if not name:
                    errors.append(f'Row {index + 2}: Tên dịch vụ không được để trống')
                    error_count += 1
                    continue
                
                if not category_name:
                    errors.append(f'Row {index + 2}: Danh mục không được để trống')
                    error_count += 1
                    continue
                
                # Find category by name
                category = db.query(ServiceCategory).filter(ServiceCategory.name == category_name).first()
                if not category:
                    errors.append(f'Row {index + 2}: Danh mục "{category_name}" không tồn tại')
                    error_count += 1
                    continue
                
                # Validate price
                try:
                    price = float(price_str.replace(',', ''))
                    if price < 0:
                        errors.append(f'Row {index + 2}: Đơn giá không được âm')
                        error_count += 1
                        continue
                except ValueError:
                    errors.append(f'Row {index + 2}: Đơn giá không hợp lệ')
                    error_count += 1
                    continue
                
                # Validate duration
                try:
                    duration = int(duration_str) if duration_str else 60
                    if duration <= 0:
                        duration = 60
                except ValueError:
                    duration = 60
                
                # Convert status to boolean
                is_active = status.lower() in ['kích hoạt', 'active', 'true', '1', 'yes']
                
                # Check if service already exists
                existing_service = db.query(Service).filter(Service.name == name).first()
                if existing_service:
                    errors.append(f'Row {index + 2}: Dịch vụ "{name}" đã tồn tại')
                    error_count += 1
                    continue
                
                # Create new service
                new_service = Service(
                    name=name,
                    category_id=category.id,
                    default_price=price,
                    duration_minutes=duration,
                    description=description,
                    is_active=is_active
                )
                
                db.add(new_service)
                success_count += 1
                
            except Exception as e:
                errors.append(f'Row {index + 2}: {str(e)}')
                error_count += 1
        
        # Commit if any successful imports
        if success_count > 0:
            db.commit()
            emit_catalog_changed('services_imported', entity='service', extra={'success_count': success_count})
        
        result = {
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors
        }
        
        if error_count > 0:
            return jsonify({
                'detail': f'Import completed with {error_count} errors',
                'result': result
            }), 207  # Multi-Status
        else:
            return jsonify({
                'detail': f'Successfully imported {success_count} services',
                'result': result
            }), 200
            
    except Exception as e:
        db.rollback()
        logger.error(f"Error in import_services: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()
