"""Mutation services for clinical indications."""

from datetime import datetime

from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.user import User
from sqlalchemy.orm import joinedload

class AppointmentNotFound(Exception):
    """Raised when an appointment does not exist."""

class ChiDinhNotFound(Exception):
    """Raised when a clinical indication does not exist."""

class InvalidBatchDelete(Exception):
    """Raised when batch delete ids are invalid."""

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
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentNotFound()

    existing_chi_dinh = db.query(ChiDinh).filter(ChiDinh.appointment_id == appointment_id).all()
    existing_ids = {item.id for item in existing_chi_dinh}
    existing_by_id = {item.id: item for item in existing_chi_dinh}

    incoming_ids = set()
    result_list = []

    for item_data in chi_dinh_list:
        scheduled_for = _parse_scheduled_for(item_data.get('scheduled_for'))
        chi_dinh_id = item_data.get('id')

        if chi_dinh_id and chi_dinh_id in existing_by_id:
            chi_dinh = existing_by_id[chi_dinh_id]
            incoming_ids.add(chi_dinh_id)
            _apply_chi_dinh_payload(db, chi_dinh, item_data, scheduled_for)
            result_list.append(chi_dinh)
        else:
            chi_dinh = ChiDinh(appointment_id=appointment_id)
            _apply_chi_dinh_payload(db, chi_dinh, item_data, scheduled_for)
            db.add(chi_dinh)
            result_list.append(chi_dinh)

    ids_to_delete = existing_ids - incoming_ids
    if ids_to_delete:
        db.query(ChiDinh).filter(ChiDinh.id.in_(ids_to_delete)).delete(synchronize_session=False)

    return result_list

def update_chi_dinh_fields(db, chi_dinh_id, data):
    chi_dinh = db.query(ChiDinh).filter(ChiDinh.id == chi_dinh_id).first()
    if not chi_dinh:
        raise ChiDinhNotFound()

    if 'status' in data:
        chi_dinh.status = data['status']

    if 'note_nurse' in data:
        chi_dinh.note_nurse = data['note_nurse']

    if 'note_patient' in data:
        chi_dinh.note_patient = data['note_patient']

    if 'is_completed' in data:
        chi_dinh.is_completed = data['is_completed']

    if 'scheduled_for' in data and data['scheduled_for']:
        scheduled_for = _parse_scheduled_for(data['scheduled_for'])
        if scheduled_for:
            chi_dinh.scheduled_for = scheduled_for

    if 'result_files' in data:
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

    chi_dinh_list = db.query(ChiDinh).filter(ChiDinh.id.in_(chi_dinh_ids)).all()
    if not chi_dinh_list:
        raise ChiDinhNotFound()
    return chi_dinh_list

def delete_chi_dinh_batch(db, chi_dinh_list):
    deleted_count = len(chi_dinh_list)
    for chi_dinh in chi_dinh_list:
        db.delete(chi_dinh)
    return deleted_count

def _apply_chi_dinh_payload(db, chi_dinh, item_data, scheduled_for):
    chi_dinh.order_item_id = item_data.get('order_id')
    chi_dinh.survey_template_id = item_data.get('survey_template_id')
    chi_dinh.order_name = item_data.get('order_name', '')
    chi_dinh.location_type = item_data.get('location_type', 'in')
    chi_dinh.in_house_unit_id = item_data.get('in_house_unit_id')
    chi_dinh.in_house_unit = _resolve_in_house_unit(db, chi_dinh.in_house_unit_id, item_data.get('in_house_unit'))
    chi_dinh.out_facility = item_data.get('out_facility')
    chi_dinh.scheduled_for = scheduled_for
    chi_dinh.status = item_data.get('status', 'sent')
    chi_dinh.is_completed = item_data.get('is_completed', False)
    chi_dinh.group_path = item_data.get('group_path')

def _resolve_in_house_unit(db, in_house_unit_id, fallback_name):
    if in_house_unit_id:
        user = db.query(User).filter(User.id == in_house_unit_id).first()
        return user.full_name if user else None
    if fallback_name:
        return fallback_name
    return None

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
