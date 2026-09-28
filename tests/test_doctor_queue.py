"""Queue arrival order and retry behavior in rollback-only PostgreSQL transactions."""
import os
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from werkzeug.datastructures import MultiDict
from app.core.database import engine
from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination, ExaminationStatus
from app.models.patient import Patient
from app.models.user import User
from app.modules.appointments.services.query_service import get_appointment_list
from app.modules.appointments.services.transfer_service import transfer_appointments_between_roles
from app.modules.appointments.services.status_transition_service import return_appointment_to_doctor
from app.modules.examinations.services.status_transition import apply_status_transition

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='PostgreSQL rollback QA')


@pytest.fixture
def queue(monkeypatch):
    monkeypatch.setattr('app.modules.appointments.services.transfer_service.sync_transferred_appointment_calendar', lambda *a, **k: None)
    with engine.connect() as conn:
        outer = conn.begin()
        db = Session(bind=conn, expire_on_commit=False)
        try:
            doctors = db.query(User).filter(User.role == 'DOCTOR', User.is_active == True).order_by(User.id).limit(2).all()
            patient = Patient(patient_code='QA-Q-'+uuid4().hex[:12], full_name='QA Doctor queue')
            db.add(patient); db.flush()
            admin = User(username='qa-transfer-'+uuid4().hex[:12], full_name='QA transfer admin',
                         hashed_password='qa', role='admin', is_active=True)
            db.add(admin); db.flush()
            appointments = []
            for _ in range(2):
                apt = Appointment(appointment_code='QA-Q-'+uuid4().hex, patient_id=patient.id,
                    doctor_id=doctors[0].id, appointment_date=datetime.now(), status=AppointmentStatus.CONFIRMED)
                db.add(apt); db.flush()
                exam = Examination(examination_code='QA-Q-'+uuid4().hex, appointment_id=apt.id,
                    patient_id=patient.id, doctor_id=doctors[0].id, examination_date=apt.appointment_date,
                    status=ExaminationStatus.WAITING_TRANSFER)
                db.add(exam); db.flush()
                appointments.append(apt)
            def transfer(apt, doctor):
                result = transfer_appointments_between_roles(db, admin, {
                    'appointment_ids':[apt.id, apt.id], 'to_role':'doctor', 'to_person_id':doctor.id,
                })
                db.flush()
                return result
            def listed(doctor, page=1, per_page=50):
                return get_appointment_list(db, doctor, MultiDict({
                    'doctor':'true', 'examination_status':'doctor_queue', 'patient_id':str(patient.id),
                    'page':str(page), 'per_page':str(per_page),
                }))
            yield SimpleNamespace(db=db, older=appointments[0], newer=appointments[1], doctors=doctors,
                                  transfer=transfer, listed=listed)
        finally:
            db.close()
            outer.rollback()


def test_transfer_order_survives_reload_and_clinical_edits(queue):
    q = queue; doctor = q.doctors[0]
    q.transfer(q.newer, doctor)
    q.transfer(q.older, doctor)
    entered = q.older.doctor_queue_entered_at
    assert [a.id for a in q.listed(doctor).appointments] == [q.older.id, q.newer.id]
    q.newer.notes = 'QA edit must not reorder queue'; q.db.flush(); q.db.expire_all()
    assert [a.id for a in q.listed(doctor).appointments] == [q.older.id, q.newer.id]
    assert q.older.doctor_queue_entered_at == entered


def test_repeated_transfer_is_noop_and_does_not_repeat_notifications(queue):
    q=queue; doctor=q.doctors[0]
    first=q.transfer(q.older,doctor); stamp=q.older.doctor_queue_entered_at
    second=q.transfer(q.older,doctor)
    assert first.appointment_ids == [q.older.id] and first.updated_count == 1
    assert second.appointment_ids == [] and second.updated_count == 0
    assert q.older.doctor_queue_entered_at == stamp


def test_transfer_between_doctors_moves_queue_and_conclusion_is_included(queue):
    q=queue
    q.transfer(q.older,q.doctors[0])
    q.transfer(q.older,q.doctors[1])
    assert q.listed(q.doctors[0]).appointments == []
    assert [a.id for a in q.listed(q.doctors[1]).appointments] == [q.older.id]
    exam=q.older.examinations[0]
    apply_status_transition(exam,ExaminationStatus.CONCLUSION); q.db.flush()
    assert q.listed(q.doctors[1]).pagination['total_count'] == 1
    apply_status_transition(exam,ExaminationStatus.WAITING_PAYMENT); q.db.flush()
    assert q.listed(q.doctors[1]).appointments == []
    apply_status_transition(exam,ExaminationStatus.COMPLETED); q.db.flush()
    return_appointment_to_doctor(q.db,q.older.id); q.db.flush()
    assert q.listed(q.doctors[1]).pagination['total_count'] == 1


def test_queue_pagination_uses_combined_statuses_and_known_arrival_first(queue):
    q=queue; doctor=q.doctors[0]
    q.transfer(q.older,doctor); q.transfer(q.newer,doctor)
    q.newer.doctor_queue_entered_at=None
    q.newer.examinations[0].status=ExaminationStatus.CONCLUSION; q.db.flush()
    first=q.listed(doctor,1,1); second=q.listed(doctor,2,1)
    assert first.appointments[0].id == q.older.id
    assert second.appointments[0].id == q.newer.id
    assert first.pagination['total_count'] == 2 and first.pagination['has_next']
