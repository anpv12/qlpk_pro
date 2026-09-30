from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, jsonify
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

# Route/hàm còn lại nằm ở service_prices.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.service_prices import (  # noqa: E402,F401
    update_service_price,
    delete_service_price,
    get_appointment_services,
    add_appointment_service,
    remove_appointment_service,
    clear_appointment_services,
    update_appointment_service,
    sync_appointment_services,
)

# Route/hàm còn lại nằm ở service_import.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.service_import import (  # noqa: E402,F401
    import_services,
)
