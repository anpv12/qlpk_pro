from datetime import datetime, timezone
from types import SimpleNamespace

from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.examination import Examination
from app.models.notification import Notification
from app.models.user import User
from app.services.notification_service import NotificationService


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None


class _NotificationDb:
    def __init__(self, *, performer, appointment, order, examination=None):
        self.notifications = []
        self.performer = performer
        self.appointment = appointment
        self.order = order
        self.examination = examination

    def query(self, model):
        if model is User:
            return _Query([self.performer])
        if model is Notification:
            return _Query(self.notifications)
        if model is Appointment:
            return _Query([self.appointment])
        if model is Examination:
            return _Query([self.examination] if self.examination else [])
        if model is ChiDinh:
            return _Query([self.order])
        raise AssertionError(f'unexpected model query: {model}')

    def add(self, notification):
        self.notifications.append(notification)

    def flush(self):
        return None


def _workflow_objects():
    patient = SimpleNamespace(id=287, full_name='Bệnh nhân Test')
    appointment = SimpleNamespace(id=1101, patient_id=patient.id, patient=patient)
    performer = SimpleNamespace(id=24, role='doctor', is_active=True, full_name='Bác sĩ Test')
    order = SimpleNamespace(
        id=9,
        appointment_id=appointment.id,
        order_name='HADS',
        location_type='in',
        in_house_unit_id=performer.id,
        survey_template_id=31,
        created_at=datetime(2026, 9, 1, 13, 0, tzinfo=timezone.utc),
        updated_at=None,
    )
    examination = SimpleNamespace(id=1079, appointment_id=appointment.id)
    return appointment, performer, order, examination


def test_clinical_order_assignment_notification_is_idempotent():
    appointment, performer, order, examination = _workflow_objects()
    db = _NotificationDb(
        performer=performer,
        appointment=appointment,
        order=order,
        examination=examination,
    )
    service = NotificationService()

    first = service.create_clinical_order_assignment_notifications(
        db,
        appointment,
        [{'order': order, 'kind': 'created'}],
    )
    second = service.create_clinical_order_assignment_notifications(
        db,
        appointment,
        [{'order': order, 'kind': 'created'}],
    )

    assert len(first) == 1
    assert second == []
    assert len(db.notifications) == 1
    assert db.notifications[0].event_type == 'clinical_order_assigned'
    assert db.notifications[0].payload['order_id'] == order.id
    assert db.notifications[0].recipient_user_id == performer.id


def test_survey_completion_notification_targets_linked_performer_once():
    appointment, performer, order, examination = _workflow_objects()
    db = _NotificationDb(
        performer=performer,
        appointment=appointment,
        order=order,
        examination=examination,
    )
    session = SimpleNamespace(id=58, examination_id=examination.id)
    service = NotificationService()

    first = service.create_survey_completed_notifications(db, session, template_id=order.survey_template_id)
    second = service.create_survey_completed_notifications(db, session, template_id=order.survey_template_id)

    assert len(first) == 1
    assert second == []
    assert db.notifications[0].event_type == 'survey_completed'
    assert db.notifications[0].payload['session_id'] == session.id
    assert db.notifications[0].payload['survey_template_id'] == order.survey_template_id


def test_external_clinical_order_does_not_notify_internal_performer():
    appointment, performer, order, examination = _workflow_objects()
    order.location_type = 'out'
    order.in_house_unit_id = None
    db = _NotificationDb(
        performer=performer,
        appointment=appointment,
        order=order,
        examination=examination,
    )

    notifications = NotificationService().create_clinical_order_assignment_notifications(
        db,
        appointment,
        [{'order': order, 'kind': 'created'}],
    )

    assert notifications == []
    assert db.notifications == []
