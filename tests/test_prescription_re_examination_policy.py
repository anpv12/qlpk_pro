"""Real PostgreSQL API transactions, isolated by outer rollback; no notifications."""
import os
from datetime import datetime, timedelta
from uuid import uuid4
from types import SimpleNamespace

import pytest
from flask import Flask
from sqlalchemy.orm import Session
from app.core.database import engine
from app.models.appointment import Appointment, AppointmentCategory, AppointmentStatus
from app.models.prescription import Prescription, PrescriptionItem
from app.models.examination import Examination
from app.models.user import User
from app.models.service import Service
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.modules.prescriptions.services.re_examination_service import latest_re_examination, schedule_state

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='PostgreSQL rollback QA')


@pytest.fixture
def case(monkeypatch):
    import app.api.auth as auth
    import app.modules.prescriptions.api.internal as api
    with engine.connect() as conn:
        outer = conn.begin()
        db = Session(bind=conn, expire_on_commit=False)
        try:
            source = db.query(Appointment).filter_by(id=1101).one()
            actor_id = db.query(User.id).filter(User.is_active == True, User.id != source.doctor_id).order_by(User.id).first()[0]
            parent = Appointment(appointment_code='QA-RE-'+uuid4().hex, patient_id=source.patient_id,
                doctor_id=source.doctor_id, appointment_date=datetime.now(), service_id=source.service_id,
                package_id=source.package_id, appointment_type=source.appointment_type, duration_minutes=30)
            medicine = Medicine(name='QA RE '+uuid4().hex, stock_quantity=20, unit='viên', unit_price=1000)
            db.add_all([parent, medicine]); db.flush()
            batch = MedicineBatch(medicine_id=medicine.id, batch_number='QA-RE-'+uuid4().hex,
                import_date=datetime.now().date(), expiry_date=(datetime.now()+timedelta(days=365)).date(),
                quantity=20, remaining_quantity=20)
            db.add(batch); db.flush()
            def scoped_db():
                child = Session(bind=conn, join_transaction_mode='create_savepoint')
                try: yield child
                finally: child.close()
            monkeypatch.setattr(api, 'get_db', scoped_db)
            monkeypatch.setattr(auth, 'get_db', scoped_db)
            monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor_id, role='admin'))
            monkeypatch.setattr(api, 'emit_examination_changed', lambda *a, **kw: None)
            monkeypatch.setattr(api, 'emit_inventory_changed', lambda *a, **kw: None)
            effects=[]
            monkeypatch.setattr(api, 'sync_re_examination_after_prescription_save', lambda db, result, logger: effects.append(result['action']))
            app=Flask(__name__); app.register_blueprint(api.router, url_prefix='/api/prescription')
            def post(when='', snapshot=None, qty=6, empty=False, extra=None):
                payload={'appointment_id':parent.id, 'medicines':[{'medicine_id':medicine.id,'name':medicine.name,
                    'quantity':qty,'unit':'viên','unit_price':1000,'is_external':False}],
                    're_examination_date':when[:10], 're_examination_time':when[11:] or '09:00'}
                if empty: payload['medicines']=[]
                if extra: payload.update(extra)
                if snapshot is not None: payload['re_examination_snapshot']=snapshot
                response=app.test_client().post('/api/prescription/save',json=payload,headers={'Authorization':'Bearer QA'})
                db.expire_all()
                return response
            def child(status='SCHEDULED', future=True, deleted=False):
                appointment=Appointment(appointment_code='QA-CHILD-'+uuid4().hex,
                    patient_id=source.patient_id,doctor_id=source.doctor_id,
                    original_appointment_id=parent.id,appointment_category=AppointmentCategory.RE_EXAMINATION,
                    status=AppointmentStatus(status),is_deleted=deleted,
                    appointment_date=(datetime.now()+timedelta(days=10 if future else -10)).replace(second=0,microsecond=0),
                    service_id=source.service_id,package_id=source.package_id,appointment_type=source.appointment_type)
                db.add(appointment);db.flush();return appointment
            yield SimpleNamespace(db=db,parent=parent,medicine=medicine,batch=batch,post=post,child=child,effects=effects,actor_id=actor_id,client=app.test_client())
        finally:
            db.close()
            if outer.is_active: outer.rollback()


def test_calendar_read_defaults_and_existing_identity_without_writes(case):
    c = case
    start = datetime.now().strftime('%Y-%m-%d')
    end = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
    url = f'/api/prescription/appointment/{c.parent.id}/re-examination-calendar?start={start}&end={end}'
    before = c.db.query(Appointment).count()
    result = c.client.get(url, headers={'Authorization': 'Bearer QA'})
    assert result.status_code == 200, result.json
    assert result.json['doctor_name'] == c.db.get(User, c.actor_id).full_name
    assert result.json['service_name'].strip().lower() == 'khám tổng quát'
    assert result.json['schedule']['appointment_id'] is None
    assert c.db.query(Appointment).count() == before
    assert c.medicine.stock_quantity == c.batch.remaining_quantity == 20
    child = c.child()
    result = c.client.get(url, headers={'Authorization': 'Bearer QA'})
    assert result.json['doctor_name'] == child.doctor.full_name
    assert result.json['schedule']['appointment_id'] == child.id
    assert any(event['id'] == child.id for event in result.json['events'])
    event = next(event for event in result.json['events'] if event['id'] == child.id)
    assert event['doctor_id'] == child.doctor_id
    assert event['doctor_color'] == child.doctor.calendar_color
    doctor_option = next(item for item in result.json['doctors'] if item['id'] == child.doctor_id)
    assert doctor_option['calendar_color'] == child.doctor.calendar_color


@pytest.mark.parametrize('status,deleted,visible', [
    ('CANCELLED', False, False), ('CANCELLED', True, False),
    ('SCHEDULED', True, False), ('SCHEDULED', False, True),
    ('CONFIRMED', False, True), ('NO_SHOW', False, True),
    (None, False, True),
])
def test_print_and_verify_followup_visibility_preserves_history(case, status, deleted, visible):
    from app.modules.prescriptions.services.read_service import build_appointment_prescription_payload
    from app.modules.prescriptions.view_models.print_prescription import build_internal_prescription_print_view_model
    from app.modules.prescriptions.view_models.public_prescription import build_public_prescription_view_model
    c = case
    child = c.child(status, deleted=deleted) if status else None
    when = child.appointment_date.date() if child else datetime.now().date()
    rx = Prescription(appointment_id=c.parent.id, prescription_code='QA-' + uuid4().hex[:14],
                      re_examination_date=when)
    c.db.add(rx); c.db.flush()
    c.db.add(PrescriptionItem(prescription_id=rx.id, medicine_id=c.medicine.id,
                             medicine_name=c.medicine.name, quantity=1))
    c.db.flush()
    internal = build_appointment_prescription_payload(c.db, c.parent.id)
    printed = build_internal_prescription_print_view_model(c.db, c.parent.id)['prescriptionData']
    verified = build_public_prescription_view_model(c.db, rx.prescription_code)
    for payload in (internal, printed, verified):
        assert payload['show_re_examination_date'] is visible
        assert payload['re_examination_date'] == when.isoformat()
        assert len(payload['medicines']) == 1
    if child:
        assert internal['re_examination_snapshot']['status'] == status
        assert internal['re_examination_appointment_id'] == child.id
    c.db.refresh(rx)
    assert rx.re_examination_date == when
    assert c.medicine.stock_quantity == c.batch.remaining_quantity == 20


def test_calendar_range_validation_and_auth(case):
    c = case
    url = f'/api/prescription/appointment/{c.parent.id}/re-examination-calendar'
    assert c.client.get(url).status_code == 401
    for query in ('', '?start=2026-09-01&end=2027-09-01', '?start=2026-09-02&end=2026-09-01'):
        assert c.client.get(url + query, headers={'Authorization': 'Bearer QA'}).status_code == 400


def test_calendar_respects_doctor_visibility(case):
    from app.modules.prescriptions.services.re_examination_service import build_re_examination_calendar
    c = case
    child = c.child()
    actor = SimpleNamespace(id=c.actor_id, role='DOCTOR', full_name='QA')
    result = build_re_examination_calendar(c.db, actor, c.parent, {
        'start': datetime.now().strftime('%Y-%m-%d'),
        'end': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
    })
    assert child.id not in [event['id'] for event in result['events']]


@pytest.mark.parametrize('status,future', [('NO_SHOW',True),('NO_SHOW',False),('CONFIRMED',True),('CONFIRMED',False),('CANCELLED',True),('CANCELLED',False),('SCHEDULED',False),('SCHEDULED',True)])
def test_unchanged_existing_schedule_all_statuses_saves_six_once(case,status,future):
    c=case; child=c.child(status,future,deleted=status=='CANCELLED'); state=schedule_state(child)
    for _ in range(2):
        response=c.post(state['datetime'],state)
        assert response.status_code==200,response.json
        assert response.json['re_examination_sync_result']['action']=='unchanged'
    assert c.medicine.stock_quantity==c.batch.remaining_quantity==14
    assert c.db.query(Appointment).filter_by(original_appointment_id=c.parent.id).count()==1
    assert c.db.query(MedicineTransaction).filter_by(medicine_id=c.medicine.id).count()==1
    assert child.status.value==status


@pytest.mark.parametrize('status,future', [('NO_SHOW',True),('CONFIRMED',True),('CANCELLED',True),('SCHEDULED',False)])
@pytest.mark.parametrize('cancel',[False,True])
def test_locked_edit_or_cancel_rejected_before_stock(case,status,future,cancel):
    c=case; child=c.child(status,future,deleted=status=='CANCELLED'); state=schedule_state(child)
    when='' if cancel else (datetime.now()+timedelta(days=20)).strftime('%Y-%m-%d %H:%M')
    response=c.post(when,state)
    if status=='CANCELLED' and cancel:
        assert response.status_code==200  # retry cancellation is a no-op
        return
    assert response.status_code==409,response.json
    assert c.medicine.stock_quantity==c.batch.remaining_quantity==20
    assert c.db.query(Prescription).filter_by(appointment_id=c.parent.id).count()==0
    assert c.db.query(MedicineTransaction).filter_by(medicine_id=c.medicine.id).count()==0


def test_create_retry_update_cancel_and_preserve_cancelled_reader(case):
    c=case; when=(datetime.now()+timedelta(days=20)).strftime('%Y-%m-%d %H:%M'); empty=schedule_state(None)
    first=c.post(when,empty);assert first.status_code==200,first.json
    first_state=first.json['re_examination_sync_result'];child_id=first_state['appointment_id']
    again=c.post(when,empty);assert again.status_code==200,again.json
    assert again.json['re_examination_sync_result']['action']=='unchanged'
    updated=(datetime.now()+timedelta(days=21)).strftime('%Y-%m-%d %H:%M')
    response=c.post(updated,first_state);assert response.status_code==200,response.json
    assert response.json['re_examination_sync_result']['appointment_id']==child_id
    response=c.post('',response.json['re_examination_sync_result']);assert response.status_code==200,response.json
    child=latest_re_examination(c.db,c.parent.id)
    assert child.id==child_id and child.status==AppointmentStatus.CANCELLED
    assert not schedule_state(child)['editable']
    assert c.db.query(Appointment).filter_by(original_appointment_id=c.parent.id).count()==1
    assert c.db.query(Examination).filter_by(appointment_id=child_id).one().is_active is False
    assert c.medicine.stock_quantity==14


def test_stale_edit_conflicts_but_untouched_snapshot_preserves_new_schedule(case):
    c=case; child=c.child(); old=schedule_state(child)
    child.appointment_date+=timedelta(days=1);child.status=AppointmentStatus.CONFIRMED;c.db.flush()
    changed=child.appointment_date.strftime('%Y-%m-%d %H:%M')
    request=(datetime.now()+timedelta(days=23)).strftime('%Y-%m-%d %H:%M')
    response=c.post(request,old)
    assert response.status_code==409,response.json
    assert response.json['code']=='re-examination-conflict'
    assert c.medicine.stock_quantity==20
    response=c.post(old['datetime'],old)
    assert response.status_code==200,response.json
    assert response.json['re_examination_sync_result']['datetime']==changed
    assert c.db.query(Prescription).filter_by(appointment_id=c.parent.id).one().re_examination_date==child.appointment_date.date()


def test_latest_identity_is_creation_order_not_largest_scheduled_date(case):
    from app.modules.prescriptions.services.read_service import _build_re_examination_fields
    c=case;old=c.child();old.appointment_date+=timedelta(days=100);c.db.flush()
    new=c.child('CANCELLED',deleted=True)
    assert latest_re_examination(c.db,c.parent.id).id==new.id
    assert _build_re_examination_fields(new)['re_examination_status']=='CANCELLED'


def test_past_or_malformed_new_date_does_not_write_prescription(case):
    c=case
    for when in [(datetime.now()-timedelta(days=1)).strftime('%Y-%m-%d %H:%M'),'bad-date']:
        response=c.post(when,schedule_state(None));assert response.status_code==400,response.json
        assert c.medicine.stock_quantity==20
    assert c.db.query(Prescription).filter_by(appointment_id=c.parent.id).count()==0


def test_schedule_failure_rolls_back_prescription_and_stock(case,monkeypatch):
    import app.modules.prescriptions.services.re_examination_service as service
    c=case
    def fail(db,plan):
        raise RuntimeError('QA scheduling write failure')
    monkeypatch.setattr(service,'apply_re_examination_plan',fail)
    response=c.post((datetime.now()+timedelta(days=20)).strftime('%Y-%m-%d %H:%M'),schedule_state(None))
    assert response.status_code==500
    assert c.medicine.stock_quantity==c.batch.remaining_quantity==20
    assert c.db.query(Prescription).filter_by(appointment_id=c.parent.id).count()==0
    assert c.db.query(MedicineTransaction).filter_by(medicine_id=c.medicine.id).count()==0
    assert c.db.query(Appointment).filter_by(original_appointment_id=c.parent.id).count()==0


def test_schedule_plan_serializes_on_parent_and_child_rows():
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError
    from app.modules.prescriptions.services.re_examination_service import plan_re_examination
    with engine.connect() as first, engine.connect() as second:
        a=Session(bind=first);b=Session(bind=second)
        try:
            plan_re_examination(a,1101,{})
            b.execute(text("SET LOCAL lock_timeout='100ms'"))
            with pytest.raises(OperationalError):
                plan_re_examination(b,1101,{})
            b.rollback()
            # A competing direct edit to the child is blocked as well.
            b.execute(text("SET LOCAL lock_timeout='100ms'"))
            with pytest.raises(OperationalError):
                b.execute(text('SELECT id FROM appointments WHERE id=1149 FOR UPDATE'))
            b.rollback();a.rollback()
            assert plan_re_examination(b,1101,{})['action']=='unchanged'
        finally:
            a.rollback();b.rollback();a.close();b.close()


def test_unchanged_schedule_skips_all_external_integrations():
    import logging
    from unittest.mock import Mock
    from app.modules.prescriptions.services.re_examination_service import sync_re_examination_after_prescription_save
    db=Mock()
    sync_re_examination_after_prescription_save(db,{'action':'unchanged'},logging.getLogger(__name__))
    assert db.mock_calls==[]


def test_changed_existing_schedule_requires_loaded_identity(case):
    c=case;c.child()
    response=c.post((datetime.now()+timedelta(days=25)).strftime('%Y-%m-%d %H:%M'))
    assert response.status_code==409,response.json
    assert response.json['code']=='re-examination-conflict'
    assert c.medicine.stock_quantity==20


def test_legacy_prescription_date_is_not_an_existing_appointment(case):
    c=case;date=(datetime.now()-timedelta(days=20)).date()
    c.db.add(Prescription(appointment_id=c.parent.id,re_examination_date=date));c.db.flush()
    snapshot={**schedule_state(None),'datetime':f'{date.isoformat()} 09:00'}
    response=c.post(snapshot['datetime'],snapshot)
    assert response.status_code==200,response.json
    assert response.json['re_examination_sync_result']['appointment_id'] is None
    assert response.json['re_examination_sync_result']['datetime']==snapshot['datetime']
    assert c.db.query(Appointment).filter_by(original_appointment_id=c.parent.id).count()==0


def test_empty_prescription_uses_catalog_default_and_authenticated_actor(case):
    c=case
    c.parent.service_id=None;c.parent.package_id=None;c.parent.appointment_type=None;c.db.flush()
    original_doctor=c.parent.doctor_id
    assert original_doctor!=c.actor_id
    when=(datetime.now()+timedelta(days=27)).strftime('%Y-%m-%d %H:%M')
    response=c.post(when,schedule_state(None),empty=True,extra={'doctor_id':original_doctor,'re_examination_service_id':99999999})
    assert response.status_code==200,response.json
    child=latest_re_examination(c.db,c.parent.id)
    service=c.db.query(Service).filter_by(name='Khám tổng quát',is_active=True).one()
    assert child.doctor_id==c.actor_id and child.service_id==service.id and child.package_id is None
    assert child.duration_minutes==service.duration_minutes
    exam=c.db.query(Examination).filter_by(appointment_id=child.id).one()
    assert exam.doctor_id==c.actor_id and exam.service_id==service.id
    assert c.db.query(Prescription).filter_by(appointment_id=c.parent.id).count()==0
    assert response.json['prescription_id'] is None
    assert c.parent.doctor_id==original_doctor and c.parent.service_id is None
    assert c.medicine.stock_quantity==20


@pytest.mark.parametrize('problem',['missing','duplicate'])
def test_invalid_default_catalog_blocks_atomically(case,problem):
    c=case;service=c.db.query(Service).filter_by(name='Khám tổng quát',is_active=True).one()
    if problem=='missing': service.is_active=False
    else: c.db.add(Service(name='Khám tổng quát',is_active=True,category_id=service.category_id))
    c.db.flush()
    response=c.post((datetime.now()+timedelta(days=27)).strftime('%Y-%m-%d %H:%M'),schedule_state(None))
    assert response.status_code==400,response.json
    assert 'Khám tổng quát' in response.json['detail']
    assert c.db.query(Prescription).filter_by(appointment_id=c.parent.id).count()==0
    assert c.db.query(Appointment).filter_by(original_appointment_id=c.parent.id).count()==0
    assert c.medicine.stock_quantity==c.batch.remaining_quantity==20


def test_date_edit_preserves_existing_doctor_service_even_without_default(case):
    c=case;child=c.child()
    default=c.db.query(Service).filter_by(name='Khám tổng quát',is_active=True).one()
    different=c.db.query(Service).filter(Service.id!=default.id).first()
    child.service_id=different.id;child.package_id=None
    default.is_active=False;c.db.flush()
    old_doctor=child.doctor_id;assert old_doctor!=c.actor_id
    state=schedule_state(child)
    response=c.post((datetime.now()+timedelta(days=29)).strftime('%Y-%m-%d %H:%M'),state,empty=True)
    assert response.status_code==200,response.json
    assert child.doctor_id==old_doctor and child.service_id==different.id


def selection_fixture(c):
    from app.models.user import UserRole
    doctor = User(username='qa-select-'+uuid4().hex, full_name='QA Doctor', hashed_password='unused',
                  role=UserRole.DOCTOR, is_active=True)
    base = c.db.query(Service).first()
    service = Service(name='QA Service '+uuid4().hex, category_id=base.category_id,
                      default_price=0, duration_minutes=45, is_active=True)
    c.db.add_all([doctor, service]); c.db.flush()
    return doctor, service, {'doctor_id': doctor.id, 'service_id': service.id, 'package_id': None}


def test_selected_service_doctor_create_reload_and_retry(case):
    c = case; doctor, service, selection = selection_fixture(c)
    when = (datetime.now()+timedelta(days=15)).strftime('%Y-%m-%d 09:00')
    original = schedule_state(None)
    for _ in range(2):
        result = c.post(when, original, extra={'re_examination_selection': selection})
        assert result.status_code == 200, result.json
        assert result.json['re_examination_sync_result']['selection'] == selection
    child = latest_re_examination(c.db, c.parent.id)
    assert (child.doctor_id, child.service_id, child.duration_minutes) == (doctor.id, service.id, 45)
    assert c.db.query(Appointment).filter_by(original_appointment_id=c.parent.id).count() == 1
    exam = c.db.query(Examination).filter_by(appointment_id=child.id).one()
    assert (exam.doctor_id, exam.service_id) == (doctor.id, service.id)
    response = c.client.get(f'/api/prescription/appointment/{c.parent.id}', headers={'Authorization':'Bearer QA'})
    assert response.status_code == 200
    assert response.json['re_examination_snapshot']['selection'] == selection


def test_selection_only_change_updates_exam_and_stale_snapshot(case):
    c = case; child = c.child(); old = schedule_state(child)
    _, _, selected = selection_fixture(c)
    response = c.post(old['datetime'], old, extra={'re_examination_selection': selected})
    assert response.status_code == 200, response.json
    assert response.json['re_examination_sync_result']['action'] == 'update'
    assert schedule_state(c.db.get(Appointment, child.id))['selection'] == selected
    # An untouched stale editor must retain the changed selection.
    response = c.post(old['datetime'], old, extra={'re_examination_selection': old['selection']})
    assert response.status_code == 200
    assert response.json['re_examination_sync_result']['selection'] == selected
    _, _, another = selection_fixture(c)
    response = c.post(old['datetime'], old, extra={'re_examination_selection': another})
    assert response.status_code == 409


@pytest.mark.parametrize('invalid', ['doctor', 'service', 'inactive_doctor', 'inactive_service', 'staff', 'missing', 'both'])
def test_invalid_selection_rolls_back_schedule_and_stock(case, invalid):
    c = case; doctor, service, selection = selection_fixture(c)
    if invalid == 'doctor': selection['doctor_id'] = -1
    if invalid == 'service': selection['service_id'] = -1
    if invalid == 'inactive_doctor': doctor.is_active = False
    if invalid == 'inactive_service': service.is_active = False
    if invalid == 'staff': doctor.role = 'staff'
    if invalid == 'missing': selection.pop('service_id')
    if invalid == 'both': selection['package_id'] = 1
    c.db.flush()
    response = c.post((datetime.now()+timedelta(days=15)).strftime('%Y-%m-%d 09:00'), schedule_state(None),
                      extra={'re_examination_selection': selection})
    assert response.status_code == 400, response.json
    assert latest_re_examination(c.db, c.parent.id) is None
    assert c.medicine.stock_quantity == c.batch.remaining_quantity == 20


def test_locked_selection_change_rejected(case):
    c = case; child = c.child(status='CONFIRMED'); old = schedule_state(child)
    _, _, selected = selection_fixture(c)
    response = c.post(old['datetime'], old, extra={'re_examination_selection': selected})
    assert response.status_code == 409
    assert schedule_state(c.db.get(Appointment, child.id))['selection'] == old['selection']
