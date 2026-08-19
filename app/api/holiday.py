from flask import Blueprint, request, jsonify
from app.models.holiday import Holiday
from app.core.database import get_db
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)

holiday_router = Blueprint('holiday', __name__, url_prefix='/holidays')

@holiday_router.route('/', methods=['GET'])
@require_auth
def get_holidays(user):
    """Lấy danh sách tất cả ngày lễ"""
    try:
        db = next(get_db())
        holidays = db.query(Holiday).order_by(Holiday.date.asc()).all()
        
        result = []
        for holiday in holidays:
            result.append({
                'id': holiday.id,
                'name': holiday.name,
                'date': holiday.date.isoformat() if holiday.date else None,
                'description': holiday.description,
                'is_recurring': holiday.is_recurring,
                'created_at': holiday.created_at.isoformat() if holiday.created_at else None,
                'updated_at': holiday.updated_at.isoformat() if holiday.updated_at else None
            })
        
        return jsonify(result), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting holidays: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@holiday_router.route('/<int:holiday_id>', methods=['GET'])
@require_auth
def get_holiday(user, holiday_id):
    """Lấy thông tin một ngày lễ cụ thể"""
    try:
        db = next(get_db())
        holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
        
        if not holiday:
            return jsonify({'detail': 'Holiday not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        result = {
            'id': holiday.id,
            'name': holiday.name,
            'date': holiday.date.isoformat() if holiday.date else None,
            'description': holiday.description,
            'is_recurring': holiday.is_recurring,
            'created_at': holiday.created_at.isoformat() if holiday.created_at else None,
            'updated_at': holiday.updated_at.isoformat() if holiday.updated_at else None
        }
        
        return jsonify(result), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting holiday: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@holiday_router.route('/', methods=['POST'])
@require_auth
def create_holiday(user):
    """Tạo ngày lễ mới"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'detail': 'No data provided'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        name = data.get('name')
        date_str = data.get('date')
        description = data.get('description', '')
        is_recurring = data.get('is_recurring', False)
        
        if not name or not date_str:
            return jsonify({'detail': 'Name and date are required'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Parse date
        try:
            holiday_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'detail': 'Invalid date format. Use YYYY-MM-DD'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        db = next(get_db())
        
        # Check if holiday already exists for this date
        existing = db.query(Holiday).filter(Holiday.date == holiday_date).first()
        if existing:
            return jsonify({'detail': 'Holiday already exists for this date'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        holiday = Holiday(
            name=name,
            date=holiday_date,
            description=description,
            is_recurring=is_recurring
        )
        
        db.add(holiday)
        db.commit()
        db.refresh(holiday)
        emit_catalog_changed('holiday_created', entity='holiday', entity_id=holiday.id)
        
        result = {
            'id': holiday.id,
            'name': holiday.name,
            'date': holiday.date.isoformat(),
            'description': holiday.description,
            'is_recurring': holiday.is_recurring,
            'created_at': holiday.created_at.isoformat(),
            'updated_at': holiday.updated_at.isoformat()
        }
        
        return jsonify(result), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error creating holiday: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@holiday_router.route('/<int:holiday_id>', methods=['PUT'])
@require_auth
def update_holiday(user, holiday_id):
    """Cập nhật ngày lễ"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'detail': 'No data provided'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        db = next(get_db())
        holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
        
        if not holiday:
            return jsonify({'detail': 'Holiday not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Update fields
        if 'name' in data:
            holiday.name = data['name']
        if 'date' in data:
            try:
                holiday.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'detail': 'Invalid date format. Use YYYY-MM-DD'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        if 'description' in data:
            holiday.description = data['description']
        if 'is_recurring' in data:
            holiday.is_recurring = data['is_recurring']
        
        db.commit()
        db.refresh(holiday)
        emit_catalog_changed('holiday_updated', entity='holiday', entity_id=holiday.id)
        
        result = {
            'id': holiday.id,
            'name': holiday.name,
            'date': holiday.date.isoformat(),
            'description': holiday.description,
            'is_recurring': holiday.is_recurring,
            'created_at': holiday.created_at.isoformat(),
            'updated_at': holiday.updated_at.isoformat()
        }
        
        return jsonify(result), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error updating holiday: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@holiday_router.route('/<int:holiday_id>', methods=['DELETE'])
@require_auth
def delete_holiday(user, holiday_id):
    """Xóa ngày lễ"""
    try:
        db = next(get_db())
        holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
        
        if not holiday:
            return jsonify({'detail': 'Holiday not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        db.delete(holiday)
        db.commit()
        emit_catalog_changed('holiday_deleted', entity='holiday', entity_id=holiday_id)
        
        return jsonify({'detail': 'Holiday deleted successfully'}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error deleting holiday: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
