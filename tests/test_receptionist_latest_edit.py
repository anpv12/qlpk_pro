import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from werkzeug.datastructures import MultiDict

import app.models
from app.core.database import engine
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.examination import Examination, ExaminationStatus
from app.modules.appointments.services import query_service
from app.api.appointment import _mark_latest_edited_appointment


@pytest.fixture
def queue(monkeypatch):
    if os.getenv('QLPK_RUN_DB_TESTS') != '1':
        pytest.skip('Opt-in local PostgreSQL rollback QA')
    assert engine.url.database == 'qlpk_db'
    now = datetime(2026, 9, 20, 17, 30, tzinfo=timezone.utc)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)

    monkeypatch.setattr(query_service, 'datetime', Clock)
    with engine.connect() as connection:
        outer = connection.begin()
        db = Session(bind=connection, expire_on_commit=False)
        try:
            existing = db.query(Appointment).first()
            prefix = 'QA-badge-' + uuid4().hex
            patients = [Patient(patient_code=f'{prefix}-{index}', full_name=f'{prefix}-{index}') for index in range(3)]
            db.add_all(patients)
            db.flush()
            rows = [Appointment(appointment_code=f'{prefix}-{index}', patient_id=patients[index].id,
                doctor_id=existing.doctor_id, appointment_date=datetime(2026, 9, 21, 9 + index),
                status=AppointmentStatus.CONFIRMED, created_at=now, updated_at=stamp) for index, stamp in enumerate([
                    now - timedelta(hours=2), now - timedelta(minutes=15), None])]
            db.add_all(rows)
            db.flush()
            db.add_all([Examination(examination_code=f'{prefix}-{index}', appointment_id=row.id,
                patient_id=row.patient_id, doctor_id=row.doctor_id, examination_date=row.appointment_date,
                status=ExaminationStatus.WAITING_TRANSFER) for index, row in enumerate(rows)])
            db.flush()

            def listed(page=1, search=prefix, receptionist=True):
                args = MultiDict({'search': search, 'receptionist': str(receptionist).lower(),
                    'examination_status': 'waiting_transfer', 'page': str(page), 'per_page': '1'})
                result = query_service.get_appointment_list(db, SimpleNamespace(id=-1, role='admin'), args)
                payload = [{'id': row.id} for row in result.appointments]
                _mark_latest_edited_appointment(payload, result, args)
                return result, payload

            yield SimpleNamespace(db=db, rows=rows, listed=listed, now=now)
        finally:
            db.close()
            outer.rollback()


def test_latest_update_today_vietnam_can_be_on_later_page(queue):
    result, payload = queue.listed()
    assert result.latest_edited_id == queue.rows[1].id
    assert payload == [{'id': queue.rows[2].id, 'is_latest_edited': False}]
    result, payload = queue.listed(page=2)
    assert result.latest_edited_id == queue.rows[1].id
    assert payload == [{'id': queue.rows[0].id, 'is_latest_edited': False}]
    result, payload = queue.listed(page=3)
    assert payload == [{'id': queue.rows[1].id, 'is_latest_edited': True}]


def test_search_recomputes_latest_without_created_at_fallback(queue):
    for index, expected in [(0, False), (1, True), (2, False)]:
        _, payload = queue.listed(search=queue.rows[index].appointment_code)
        assert payload[0]['is_latest_edited'] is expected


def test_yesterday_no_badge_and_empty_list(queue):
    queue.rows[1].updated_at = queue.now - timedelta(days=1)
    queue.db.flush()
    result, payload = queue.listed()
    assert result.latest_edited_id is None
    assert not payload[0]['is_latest_edited']
    result, payload = queue.listed(search='no-match-' + uuid4().hex)
    assert result.latest_edited_id is None and payload == []


def test_equal_updates_choose_one_id_and_other_screens_unchanged(queue):
    queue.rows[0].updated_at = queue.rows[1].updated_at
    queue.db.flush()
    assert queue.listed()[0].latest_edited_id == queue.rows[1].id
    result, payload = queue.listed(receptionist=False)
    assert result.latest_edited_id is None
    assert 'is_latest_edited' not in payload[0]


@pytest.mark.parametrize('stamp,expected', [
    (datetime(2026, 9, 20, 16, 59, 59, tzinfo=timezone.utc), False),
    (datetime(2026, 9, 20, 17, 0, tzinfo=timezone.utc), True),
    (datetime(2026, 9, 21, 17, 0, tzinfo=timezone.utc), False),
])
def test_vietnam_midnight_boundary(queue, stamp, expected):
    queue.rows[1].updated_at = stamp
    queue.db.flush()
    _, payload = queue.listed(search=queue.rows[1].appointment_code)
    assert payload[0]['is_latest_edited'] is expected
