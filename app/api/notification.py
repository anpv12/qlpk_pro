from flask import Blueprint, request, jsonify
from app.api.auth import require_auth
from app.core.database import get_db
from app.services.notification_service import NotificationService
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

router = Blueprint('notifications', __name__, url_prefix='/notifications')
api_router = Blueprint('notifications_api', __name__, url_prefix='/api/notifications')
notification_service = NotificationService()


@api_router.route('', methods=['GET'])
@api_router.route('/', methods=['GET'])
@require_auth
def list_notifications(user):
    db = next(get_db())
    try:
        limit = request.args.get('limit', 20)
        unread_only = str(request.args.get('unread_only', '')).lower() in ('1', 'true', 'yes')
        items = notification_service.list_user_notifications(db, user, limit=limit, unread_only=unread_only)
        unread_count = notification_service.count_unread_for_user(db, user)
        return jsonify({'notifications': items, 'unread_count': unread_count}), 200
    finally:
        db.close()


@api_router.route('/unread-count', methods=['GET'])
@require_auth
def unread_count(user):
    db = next(get_db())
    try:
        return jsonify({'unread_count': notification_service.count_unread_for_user(db, user)}), 200
    finally:
        db.close()


@api_router.route('/<int:notification_id>/read', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi server')
def mark_notification_read(user, notification_id):
    db = next(get_db())
    try:
        notification = notification_service.mark_notification_read(db, user, notification_id)
        if not notification:
            return jsonify({'detail': 'Không tìm thấy thông báo'}), 404
        db.commit()
        unread_count = notification_service.count_unread_for_user(db, user)
        notification_service.emit_realtime_payloads([{
            'action': 'read',
            'notification_id': notification.id,
            'user_id': user.id,
            'unread_count': unread_count,
            'notification': notification_service.serialize_notification(notification),
        }])
        return jsonify({
            'notification': notification_service.serialize_notification(notification),
            'unread_count': unread_count,
        }), 200
    finally:
        db.close()


@api_router.route('/read-all', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi server')
def mark_all_notifications_read(user):
    db = next(get_db())
    try:
        updated_count = notification_service.mark_all_read(db, user)
        db.commit()
        notification_service.emit_realtime_payloads([{
            'action': 'read_all',
            'notification_id': None,
            'user_id': user.id,
            'unread_count': 0,
            'notification': None,
        }])
        return jsonify({'updated_count': updated_count, 'unread_count': 0}), 200
    finally:
        db.close()



@router.route('/create-reminder/<int:appointment_id>', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi server')
def create_appointment_reminder(user, appointment_id):
    """Tạo thông báo nhắc lịch cho lịch hẹn"""
    data = request.get_json() or {}
    reminder_hours = data.get('reminder_hours', 24)
    notification_type = data.get('notification_type', 'both')  # email, sms, both
        
    success, message = notification_service.create_appointment_reminder(
        appointment_id, reminder_hours, notification_type
    )
        
    if success:
        return jsonify({'message': message}), 201
    else:
        return jsonify({'detail': message}), 400
            



 
