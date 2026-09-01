"""Mutation services for clinical indications."""

from datetime import datetime

from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.survey_template import SurveyTemplate
from app.models.user import User
from sqlalchemy.orm import joinedload


VALID_ORDER_STATUSES = frozenset({'draft', 'sent', 'processing', 'completed'})
VALID_LOCATION_TYPES = frozenset({'in', 'out', 'in_house', 'external'})
PERFORMER_ROLES = frozenset({'doctor', 'psychologist'})


class AppointmentNotFound(Exception):
    """Raised when an appointment does not exist."""


class ChiDinhNotFound(Exception):
    """Raised when a clinical indication does not exist."""

class InvalidBatchDelete(Exception):
    """Raised when batch delete ids are invalid."""


class InvalidChiDinhPayload(ValueError):
    """Raised when a clinical indication payload violates its data contract."""


def get_chi_dinh_for_appointment(db, appointment_id):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentNotFound()

    return (
        db.query(ChiDinh)
        .options(
            joinedload(ChiDinh.in_house_unit_user),
            joinedload(ChiDinh.survey_template),
        )
        .filter(ChiDinh.appointment_id == appointment_id)
        .order_by(ChiDinh.created_at.asc())
        .all()
    )


def get_chi_dinh_by_id(db, chi_dinh_id):
    chi_dinh = db.query(ChiDinh).filter(ChiDinh.id == chi_dinh_id).first()
    if not chi_dinh:
        raise ChiDinhNotFound()
    return chi_dinh


def sync_chi_dinh_for_appointment(db, appointment_id, chi_dinh_list):
    """Upsert appointment orders and delete rows omitted from the payload."""
    if not isinstance(chi_dinh_list, list):
        raise InvalidChiDinhPayload('Danh sách chỉ định không hợp lệ')

    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentNotFound()

    existing_chi_dinh = db.query(ChiDinh).filter(ChiDinh.appointment_id == appointment_id).all()
    existing_ids = {item.id for item in existing_chi_dinh}
    existing_by_id = {item.id: item for item in existing_chi_dinh}
    prepared_rows = [_prepare_chi_dinh_payload(db, item_data) for item_data in chi_dinh_list]

    incoming_ids = set()
    result_list = []

    for item_data in prepared_rows:
        chi_dinh_id = item_data.get('id')

        if chi_dinh_id:
            if chi_dinh_id in incoming_ids:
                raise InvalidChiDinhPayload('Danh sách chỉ định có ID bị lặp')
            if chi_dinh_id not in existing_by_id:
                raise InvalidChiDinhPayload('Chỉ định không thuộc lượt khám này')
            chi_dinh = existing_by_id[chi_dinh_id]
            incoming_ids.add(chi_dinh_id)
            _apply_prepared_chi_dinh_payload(chi_dinh, item_data)
            result_list.append(chi_dinh)
        else:
            chi_dinh = ChiDinh(appointment_id=appointment_id)
            _apply_prepared_chi_dinh_payload(chi_dinh, item_data)
            db.add(chi_dinh)
            result_list.append(chi_dinh)

    ids_to_delete = existing_ids - incoming_ids
    if ids_to_delete:
        db.query(ChiDinh).filter(ChiDinh.id.in_(ids_to_delete)).delete(synchronize_session=False)

    return result_list


def update_chi_dinh_fields(db, chi_dinh_id, data):
    if not isinstance(data, dict):
        raise InvalidChiDinhPayload('Dữ liệu cập nhật chỉ định không hợp lệ')

    chi_dinh = db.query(ChiDinh).filter(ChiDinh.id == chi_dinh_id).first()
    if not chi_dinh:
        raise ChiDinhNotFound()

    if 'status' in data:
        status = _normalize_status(data['status'])
        chi_dinh.status = status
        if 'is_completed' not in data:
            chi_dinh.is_completed = status == 'completed'

    if 'note_nurse' in data:
        chi_dinh.note_nurse = _normalize_text(data['note_nurse'], 'Ghi chú xử lý')

    if 'note_patient' in data:
        chi_dinh.note_patient = _normalize_text(data['note_patient'], 'Ghi chú bệnh nhân')

    if 'is_completed' in data:
        is_completed = _normalize_bool(data['is_completed'], 'is_completed')
        if 'status' in data and is_completed != (_normalize_status(data['status']) == 'completed'):
            raise InvalidChiDinhPayload('Trạng thái và trạng thái hoàn thành không khớp')
        chi_dinh.is_completed = is_completed

    if 'scheduled_for' in data:
        chi_dinh.scheduled_for = _parse_scheduled_for_value(data['scheduled_for'])

    if 'result_files' in data:
        if not isinstance(data['result_files'], list):
            raise InvalidChiDinhPayload('Danh sách file kết quả không hợp lệ')
        chi_dinh.result_files = data['result_files']

    return chi_dinh


def delete_chi_dinh_by_id(db, chi_dinh_id):
    chi_dinh = db.query(ChiDinh).filter(ChiDinh.id == chi_dinh_id).first()
    if not chi_dinh:
        raise ChiDinhNotFound()
    db.delete(chi_dinh)


def get_chi_dinh_batch_for_delete(db, chi_dinh_ids):
    if not chi_dinh_ids or not isinstance(chi_dinh_ids, list):
        raise InvalidBatchDelete()

    if any(isinstance(item, bool) or not isinstance(item, int) or item <= 0 for item in chi_dinh_ids):
        raise InvalidBatchDelete()
    if len(set(chi_dinh_ids)) != len(chi_dinh_ids):
        raise InvalidBatchDelete()

    chi_dinh_list = db.query(ChiDinh).filter(ChiDinh.id.in_(chi_dinh_ids)).all()
    if len(chi_dinh_list) != len(chi_dinh_ids):
        raise ChiDinhNotFound()
    return chi_dinh_list


def delete_chi_dinh_batch(db, chi_dinh_list):
    deleted_count = len(chi_dinh_list)
    for chi_dinh in chi_dinh_list:
        db.delete(chi_dinh)
    return deleted_count


def _apply_prepared_chi_dinh_payload(chi_dinh, payload):
    chi_dinh.survey_template_id = payload['survey_template_id']
    chi_dinh.order_name = payload['order_name']
    chi_dinh.location_type = payload['location_type']
    chi_dinh.in_house_unit_id = payload['in_house_unit_id']
    chi_dinh.in_house_unit = payload['in_house_unit']
    chi_dinh.out_facility = payload['out_facility']
    chi_dinh.scheduled_for = payload['scheduled_for']
    chi_dinh.status = payload['status']
    chi_dinh.is_completed = payload['is_completed']


def _prepare_chi_dinh_payload(db, item_data):
    if not isinstance(item_data, dict):
        raise InvalidChiDinhPayload('Mỗi chỉ định phải là một object')

    raw_id = item_data.get('id')
    if raw_id is None or raw_id == '':
        chi_dinh_id = None
    elif isinstance(raw_id, bool):
        raise InvalidChiDinhPayload('ID chỉ định không hợp lệ')
    else:
        try:
            chi_dinh_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise InvalidChiDinhPayload('ID chỉ định không hợp lệ') from exc
        if chi_dinh_id <= 0:
            raise InvalidChiDinhPayload('ID chỉ định không hợp lệ')

    order_name = str(item_data.get('order_name') or '').strip()
    if not order_name:
        raise InvalidChiDinhPayload('Tên chỉ định là bắt buộc')
    if len(order_name) > 255:
        raise InvalidChiDinhPayload('Tên chỉ định tối đa 255 ký tự')

    location_type = _normalize_location_type(item_data.get('location_type', 'in'))
    status = _normalize_status(item_data.get('status', 'sent'))
    is_completed = _normalize_bool(item_data.get('is_completed', False), 'is_completed')
    if is_completed != (status == 'completed'):
        raise InvalidChiDinhPayload('Trạng thái và trạng thái hoàn thành không khớp')

    scheduled_for = _parse_scheduled_for_value(item_data.get('scheduled_for'))
    survey_template_id = _normalize_optional_id(item_data.get('survey_template_id'), 'Mẫu khảo sát')
    if survey_template_id:
        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == survey_template_id,
            SurveyTemplate.is_active.is_(True),
            SurveyTemplate.content.isnot(None),
        ).first()
        if not template:
            raise InvalidChiDinhPayload('Mẫu khảo sát không tồn tại hoặc đã ngừng hoạt động')

    in_house_unit_id = _normalize_optional_id(item_data.get('in_house_unit_id'), 'Người thực hiện')
    performer_name = ''
    if location_type == 'in':
        if not in_house_unit_id:
            raise InvalidChiDinhPayload('Người thực hiện trong cơ sở là bắt buộc')
        performer = db.query(User).filter(
            User.id == in_house_unit_id,
            User.is_active.is_(True),
        ).first()
        if not performer or _role_value(performer) not in PERFORMER_ROLES:
            raise InvalidChiDinhPayload('Người thực hiện không hợp lệ hoặc đã ngừng hoạt động')
        performer_name = performer.full_name or performer.name or ''
    elif in_house_unit_id:
        raise InvalidChiDinhPayload('Không được gán người thực hiện trong cơ sở cho chỉ định ngoài cơ sở')

    out_facility = str(item_data.get('out_facility') or '').strip()
    if len(out_facility) > 255:
        raise InvalidChiDinhPayload('Tên cơ sở ngoài tối đa 255 ký tự')
    if location_type == 'out' and not out_facility:
        raise InvalidChiDinhPayload('Cơ sở ngoài là bắt buộc')

    return {
        'id': chi_dinh_id,
        'survey_template_id': survey_template_id,
        'order_name': order_name,
        'location_type': 'in' if location_type in {'in', 'in_house'} else 'out',
        'in_house_unit_id': in_house_unit_id,
        'in_house_unit': performer_name,
        'out_facility': out_facility,
        'scheduled_for': scheduled_for,
        'status': status,
        'is_completed': is_completed,
    }


def _normalize_optional_id(value, label):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise InvalidChiDinhPayload(f'{label} không hợp lệ')
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise InvalidChiDinhPayload(f'{label} không hợp lệ') from exc
    if normalized <= 0:
        raise InvalidChiDinhPayload(f'{label} không hợp lệ')
    return normalized


def _normalize_location_type(value):
    normalized = str(value or '').strip().lower()
    if normalized not in VALID_LOCATION_TYPES:
        raise InvalidChiDinhPayload('Nơi thực hiện không hợp lệ')
    return normalized


def _normalize_status(value):
    normalized = str(value or '').strip().lower()
    if normalized not in VALID_ORDER_STATUSES:
        raise InvalidChiDinhPayload('Trạng thái chỉ định không hợp lệ')
    return normalized


def _normalize_bool(value, field_name):
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise InvalidChiDinhPayload(f'{field_name} phải là boolean')


def _normalize_text(value, field_name):
    if value is None:
        return None
    if not isinstance(value, str):
        raise InvalidChiDinhPayload(f'{field_name} phải là chuỗi')
    return value.strip()


def _parse_scheduled_for_value(value):
    if value is None or value == '':
        return None
    parsed = _parse_scheduled_for(value)
    if parsed is None:
        raise InvalidChiDinhPayload('Ngày chỉ định không hợp lệ')
    return parsed


def _role_value(user):
    role = getattr(user, 'role', '')
    return str(getattr(role, 'value', role) or '').replace('UserRole.', '').strip().lower()

def _parse_scheduled_for(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        try:
            return datetime.fromisoformat(value.split('T')[0]).date()
        except Exception:
            return None
