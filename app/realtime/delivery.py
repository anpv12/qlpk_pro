from app.models.appointment import Appointment
from app.models.examination import Examination
from app.utils.clinical_access import (
    appointment_in_user_scope, has_full_patient_scope, patient_in_user_scope,
)


CLINICAL_EVENTS = {
    'appointment.changed', 'examination.changed', 'order.changed',
    'survey.changed', 'payment.changed', 'patient.changed',
}
CLINICAL_KEYS = {
    'action', 'appointment_id', 'examination_id', 'patient_id', 'order_id',
    'session_id', 'response_id', 'entity', 'entity_id', 'folder_id',
    'attachment_id', 'attachment_ids', 'appointment_ids', 'order_ids',
}


def is_clinical_event(event_type, payload):
    return event_type in CLINICAL_EVENTS or event_type == 'document.changed' and (
        payload.get('patient_id') is not None or payload.get('entity') in {'attachment', 'safety_plan'})


def positive_id(value):
    if type(value) is int and value > 0:
        return value
    return None


def can_receive_clinical_payload(db, user, payload):
    if has_full_patient_scope(user):
        return True
    appointment_ids = payload.get('appointment_ids')
    if appointment_ids is not None:
        if not isinstance(appointment_ids, list) or not appointment_ids:
            return False
        return all(_appointment_allowed(db, user, identity, payload.get('patient_id')) for identity in appointment_ids)
    if payload.get('appointment_id') is not None:
        return _appointment_allowed(db, user, payload['appointment_id'], payload.get('patient_id'))
    if payload.get('examination_id') is not None:
        identity = positive_id(payload['examination_id'])
        if identity is None:
            return False
        examination = db.query(Examination).filter(Examination.id == identity).first()
        return bool(examination and _appointment_allowed(db, user, examination.appointment_id, payload.get('patient_id')))
    patient_id = positive_id(payload.get('patient_id'))
    return bool(patient_id and patient_in_user_scope(db, user, patient_id))


def _appointment_allowed(db, user, identity, patient_id):
    identity = positive_id(identity)
    if identity is None:
        return False
    appointment = db.query(Appointment).filter(Appointment.id == identity).first()
    if not appointment or appointment.is_deleted:
        return False
    if patient_id is not None and patient_id != appointment.patient_id:
        return False
    return appointment_in_user_scope(user, appointment)


def project_payload(event_type, payload, *, clinical_allowed=False):
    if is_clinical_event(event_type, payload):
        if not clinical_allowed:
            return {'action': 'changed'}
        projected = {key: value for key, value in payload.items() if key in CLINICAL_KEYS}
        if event_type == 'patient.changed' and payload.get('action') == 'family_member_updated':
            projected['data'] = payload.get('data')
        return projected
    if event_type == 'notification.changed':
        return dict(payload)
    allowed_keys = {'action', 'entity', 'entity_id', 'folder_id'}
    if event_type == 'presence.changed':
        allowed_keys.update({'user_id', 'role'})
    return {key: value for key, value in payload.items() if key in allowed_keys}
