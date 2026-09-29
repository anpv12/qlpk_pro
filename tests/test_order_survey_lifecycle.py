"""PostgreSQL integration: opt in locally; all clinical writes roll back."""
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from flask import Flask
from sqlalchemy.orm import Session
from app.core.database import engine
from app.models.chi_dinh import ChiDinh
from app.models.examination import Examination
from app.models.survey_template import SurveyTemplate
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.survey_response import SurveyResponse
from app.models.user import User
from app.modules.orders.services.survey_lifecycle import submit_order_survey, finish_order_survey, expire_due_order_surveys, SurveyLifecycleError
from app.modules.orders.services.clinical_order_mutation import _apply_prepared_chi_dinh_payload, update_chi_dinh_fields, InvalidChiDinhPayload
from module_parts import setattr_all

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='Opt-in PostgreSQL rollback tests')


def test_live_draft_preserves_partial_zero_identity_and_revision(case):
    from app.modules.orders.services.survey_draft import save_survey_draft, draft_view
    db, orders, session, payload = case
    partial = {**payload, 'responses': {'q0': 'zero'}, 'revision': 0}
    save_survey_draft(db, partial)
    assert session.draft_revision == 1
    assert draft_view(db, session)['responses'] == {'q0': 'zero'}
    assert session.status == SurveySessionStatus.in_progress
    assert orders[0].status == 'survey_sent'
    assert db.query(SurveyResponse).filter_by(order_id=orders[0].id).count() == 0
    save_survey_draft(db, partial)  # Lost acknowledgement retry.
    assert session.draft_revision == 1
    with pytest.raises(SurveyLifecycleError) as conflict:
        save_survey_draft(db, {**partial, 'responses': {'q1': 'three'}})
    assert conflict.value.status == 409
    save_survey_draft(db, {**partial, 'revision': 1, 'responses': {}})
    assert session.draft_responses == {} and session.draft_revision == 2


@pytest.mark.parametrize('changes', [
    {'patient_id': -1}, {'examination_id': -1}, {'survey_template_id': -1},
    {'session_token': 'invalid'}, {'responses': {'unknown': 'zero'}},
    {'responses': {'q0': 'bad-option'}}, {'responses': {'q0': {'bad': 'object'}}},
    {'revision': True},
])
def test_live_draft_rejects_wrong_identity_or_payload(case, changes):
    from app.modules.orders.services.survey_draft import save_survey_draft
    db, orders, session, payload = case
    with pytest.raises(ValueError):
        save_survey_draft(db, {**payload, 'revision': 0, **changes})
    assert session.draft_revision == 0 and not session.draft_responses
    assert orders[0].status == 'survey_sent'


@pytest.mark.parametrize('closure', ['doctor', 'expired', 'submitted'])
def test_live_draft_is_retained_and_locked_after_submission_or_closure(case, closure):
    from app.modules.orders.services.survey_draft import save_survey_draft
    db, orders, session, payload = case
    save_survey_draft(db, {**payload, 'revision': 0, 'responses': {'q0': 'zero'}})
    frozen = session.template_snapshot
    # Active edits to the catalog must not change the running survey/scoring.
    db.query(SurveyTemplate).filter_by(id=session.survey_template_id).first().content = {'questions': []}
    if closure == 'submitted':
        result, *_ = submit_order_survey(db, payload)
        assert result.template_snapshot == frozen
        assert result.responses == payload['responses']
    elif closure == 'doctor':
        finish_order_survey(db, orders[0].id, actor_id=db.query(User.id).first()[0])
    else:
        orders[0].survey_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        expire_due_order_surveys(db)
    with pytest.raises(SurveyLifecycleError) as ended:
        save_survey_draft(db, {**payload, 'revision': 1})
    assert ended.value.status == 410
    assert session.draft_responses == {'q0': 'zero'} and session.draft_revision == 1


def test_http_live_draft_read_is_scoped_and_closed_draft_remains_visible(case, monkeypatch):
    db, orders, session, payload = case
    import app.api.auth as auth
    import app.api.survey_sessions as sessions
    import app.modules.orders.api.chi_dinh as orders_api
    admin = db.query(User).filter(User.role == 'admin').first()
    if not admin:
        pytest.skip('Needs local admin')
    def scoped_db():
        child = Session(bind=db.connection(), join_transaction_mode='create_savepoint', expire_on_commit=False)
        try:
            yield child
        finally:
            child.close()
    for module in (auth, sessions, orders_api):
        monkeypatch.setattr(module, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: admin)
    app = Flask(__name__)
    app.register_blueprint(sessions.survey_sessions, url_prefix='/api')
    app.register_blueprint(orders_api.router, url_prefix='/api/chi-dinh')
    client = app.test_client()
    assert client.get('/api/survey-sessions/draft').status_code == 401
    assert client.get('/api/survey-sessions/draft?session_token=wrong').status_code == 404
    saved = client.put('/api/survey-sessions/draft', json={**payload, 'revision': 0, 'responses': {'q0': 'zero'}})
    assert saved.status_code == 200 and saved.get_json()['data']['revision'] == 1
    path = f'/api/chi-dinh/{orders[0].id}/survey-result'
    assert client.get(path).status_code == 401
    review = client.get(path, headers={'Authorization': 'Bearer QA'}).get_json()['data']
    assert review['review_state'] == 'draft' and review['responses'] == {'q0': 'zero'}
    assert review['can_live'] and review['total_scores'] is None
    db.expire_all()
    finish_order_survey(db, orders[0].id, actor_id=admin.id)
    closed = client.get(path, headers={'Authorization': 'Bearer QA'}).get_json()['data']
    assert closed['order_status'] == 'completed' and not closed['can_live']
    assert closed['review_state'] == 'draft' and closed['responses'] == review['responses']
    assert client.put('/api/survey-sessions/draft', json={**payload, 'revision': 1}).status_code == 410
    own = client.get('/api/survey-sessions/draft', query_string={'session_token': session.session_token}).get_json()['data']
    assert own['responses'] == review['responses'] and not own['submitted']
    from types import SimpleNamespace
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=-1, role='doctor', is_active=True))
    assert client.get(path, headers={'Authorization': 'Bearer QA'}).status_code == 403

@pytest.fixture
def case(request):
    connection = engine.connect()
    transaction = connection.begin()
    db = Session(bind=connection, expire_on_commit=False)
    def cleanup():
        db.close()
        if transaction.is_active: transaction.rollback()
        connection.close()
    request.addfinalizer(cleanup)
    examination = db.query(Examination).first()
    if not examination:
        pytest.skip('Needs a local examination fixture')
    template = SurveyTemplate(name='QA transaction '+uuid4().hex, is_active=True, created_by=db.query(User.id).first()[0],
        content={'questions':[
            {'id':'q0','type':'multiple_choice','text':'Điểm 0','criteria':'A','required':True,'answers':[{'id':'zero','text':'Không','score':0},{'id':'two','text':'Có','score':2}]},
            {'id':'q1','type':'multiple_choice','text':'Cộng điểm','criteria':'A','required':True,'answers':[{'id':'three','text':'Có','score':3},{'id':'none','text':'Không','score':0}]},
        ]})
    db.add(template);db.flush()
    orders=[]
    for _ in range(2):
        order=ChiDinh(appointment_id=examination.appointment_id, survey_template_id=template.id,
            order_name=template.name,location_type='out',out_facility='QA',status='survey_sent',is_completed=False)
        db.add(order);orders.append(order)
    db.flush()
    now=datetime.now(timezone.utc).replace(tzinfo=None)
    session=SurveySession(order_id=orders[0].id,survey_template_id=template.id,
        examination_id=examination.id,patient_id=examination.patient_id,
        session_token=str(uuid4()),expires_at=now+timedelta(hours=1),created_at=now,updated_at=now)
    db.add(session);db.flush()
    orders[0].survey_expires_at = session.expires_at.replace(tzinfo=timezone.utc)
    db.flush()
    payload={'session_token':session.session_token,'patient_id':examination.patient_id,
        'examination_id':examination.id,'survey_template_id':template.id,'responses':{'q0':'zero','q1':'three'}}
    yield db,orders,session,payload



def test_submit_records_result_only_for_exact_order_and_is_idempotent(case):
    db,orders,session,payload=case
    result,order,_,changed=submit_order_survey(db,payload)
    assert changed and result.total_scores=={'A':3}
    assert order.status=='has_result' and not order.is_completed
    assert order.result_at and order.completed_at is None
    assert orders[1].status=='survey_sent'
    assert result.order_id==order.id and result.session_id==session.id
    assert session.status==SurveySessionStatus.completed
    repeated=submit_order_survey(db,payload)
    assert repeated[0].id==result.id and repeated[3] is False
    assert db.query(SurveyResponse).filter_by(session_id=session.id).count()==1
    with pytest.raises(SurveyLifecycleError):
        submit_order_survey(db,{**payload,'responses':{'q0':'two','q1':'three'}})
    assert result.responses==payload['responses']


def test_configured_result_is_frozen_on_submit(case):
    db, orders, session, payload = case
    template = db.query(SurveyTemplate).filter_by(id=session.survey_template_id).first()
    template.content = {**template.content, 'result_config': {
        'scoring_method': 'total', 'calculation_type': 'average',
        'conditions': [{'operator': '>=', 'min_score': 1, 'conclusion': 'QA kết luận'}]}}
    result, *_ = submit_order_survey(db, payload)
    assert result.total_scores == {'A': 3}
    assert result.to_dict()['result_summary']['score'] == 1.5
    assert result.to_dict()['result_summary']['conclusions'][0]['conclusion'] == 'QA kết luận'
    template.content = {'questions': []}
    assert result.to_dict()['result_summary']['score'] == 1.5


@pytest.mark.parametrize('state,expected', [('invalid', 400), ('empty_repaired', 200), ('draft_invalid', 400)])
def test_generate_validates_template_and_only_repairs_empty_snapshots(case, monkeypatch, state, expected):
    from copy import deepcopy
    import app.api.survey_sessions as api
    import app.api.auth as auth
    db, orders, session, payload = case
    template = db.query(SurveyTemplate).filter_by(id=session.survey_template_id).first()
    invalid = deepcopy(template.content)
    invalid['questions'][0]['answers'][0]['score'] = None
    session.template_snapshot = {'name': template.name, 'content': invalid}
    if state == 'invalid':
        template.content = invalid
    if state == 'draft_invalid':
        session.draft_responses = {'q0': 'zero'}
    db.flush()
    admin = db.query(User).filter(User.role == 'admin').first()
    def scoped_db():
        child = Session(bind=db.connection(), join_transaction_mode='create_savepoint', expire_on_commit=False)
        try:
            yield child
        finally:
            child.close()
    setattr_all(monkeypatch,api, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: admin)
    setattr_all(monkeypatch,api, 'emit_order_changed', lambda *args, **kwargs: None)
    setattr_all(monkeypatch,api, 'emit_survey_changed', lambda *args, **kwargs: None)
    app = Flask(__name__)
    app.register_blueprint(api.survey_sessions, url_prefix='/api')
    result = app.test_client().post('/api/survey-sessions/generate', headers={'Authorization': 'Bearer QA'}, json={
        'patient_id': session.patient_id, 'examination_id': session.examination_id,
        'template_id': template.id, 'order_id': orders[0].id})
    assert result.status_code == expected, result.get_json()
    if expected == 400:
        assert result.get_json()['code'] == 'SURVEY_TEMPLATE_INVALID'
        assert result.get_json()['message'] == 'Mẫu khảo sát chưa đủ cấu hình điểm. Vui lòng kiểm tra lại.'
    else:
        assert result.get_json()['data']['session_id'] == session.id


@pytest.mark.parametrize('changes',[{'patient_id':-1},{'examination_id':-1},{'survey_template_id':-1}, {'responses':{'q0':'bad','q1':'three'}}, {'responses':{'q0':'zero'}}])
def test_invalid_submission_does_not_complete(case,changes):
    db,orders,session,payload=case
    with pytest.raises(ValueError): submit_order_survey(db,{**payload,**changes})
    assert orders[0].status=='survey_sent' and not orders[0].is_completed
    assert session.status==SurveySessionStatus.pending
    assert db.query(SurveyResponse).filter_by(session_id=session.id).count()==0


@pytest.mark.parametrize('status',[SurveySessionStatus.closed,SurveySessionStatus.expired])
def test_closed_and_expired_links_do_not_complete(case,status):
    db,orders,session,payload=case
    session.status=status;db.flush()
    with pytest.raises(SurveyLifecycleError): submit_order_survey(db,payload)
    assert orders[0].status=='survey_sent'


def test_stale_form_cannot_overwrite_backend_completion(case):
    db,orders,session,payload=case
    submit_order_survey(db,payload)
    order=orders[0]
    form={key:getattr(order,key) for key in ['survey_template_id','order_name','location_type','in_house_unit_id','in_house_unit','out_facility','scheduled_for']}
    form.update(status='sent',is_completed=False)
    _apply_prepared_chi_dinh_payload(order,form)
    assert order.status=='has_result' and not order.is_completed
    with pytest.raises(InvalidChiDinhPayload): update_chi_dinh_fields(db,order.id,{'status':'sent'})


def test_snapshot_is_preserved_when_template_changes(case):
    db,orders,session,payload=case
    result,*_=submit_order_survey(db,payload)
    original=result.template_snapshot
    result.survey_template.content={'questions':[]}
    db.flush()
    assert result.template_snapshot==original and len(original['content']['questions'])==2


@pytest.mark.parametrize('closure', [None, 'doctor', 'expired'])
def test_review_reads_saved_submission_after_closure_and_template_edit(case, monkeypatch, closure):
    db, orders, session, payload = case
    import app.api.auth as auth
    import app.modules.orders.api.chi_dinh as orders_api
    result, *_ = submit_order_survey(db, payload)
    snapshot = result.template_snapshot
    result.survey_template.content = {'questions': []}
    if closure == 'doctor':
        finish_order_survey(db, orders[0].id, actor_id=result.survey_template.created_by)
    elif closure == 'expired':
        orders[0].survey_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        expire_due_order_surveys(db)
    db.flush()
    before = (orders[0].status, result.responses.copy(), result.total_scores.copy())
    admin = db.query(User).filter(User.role == 'admin').first()
    if not admin:
        pytest.skip('Needs local admin')
    def scoped_db():
        child = Session(bind=db.connection(), join_transaction_mode='create_savepoint', expire_on_commit=False)
        try:
            yield child
        finally:
            child.close()
    monkeypatch.setattr(orders_api, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: admin)
    app = Flask(__name__)
    app.register_blueprint(orders_api.router, url_prefix='/api/chi-dinh')
    client = app.test_client()
    path = f'/api/chi-dinh/{orders[0].id}/survey-result'
    assert client.get(path).status_code == 401
    response = client.get(path, headers={'Authorization': 'Bearer QA'})
    assert response.status_code == 200
    data = response.get_json()['data']
    assert data['template_content'] == snapshot['content']
    assert data['responses'] == payload['responses']
    assert data['can_live'] == (closure is None)
    assert data['patient'] == {'full_name': result.patient.full_name, 'phone': result.patient.phone}
    empty = client.get(f'/api/chi-dinh/{orders[1].id}/survey-result', headers={'Authorization': 'Bearer QA'}).get_json()['data']
    assert empty['review_state'] == 'empty' and empty['responses'] == {}
    from types import SimpleNamespace
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=-1, role='doctor', is_active=True))
    assert client.get(path, headers={'Authorization': 'Bearer QA'}).status_code == 403
    db.expire_all()
    assert before == (orders[0].status, result.responses, result.total_scores)


def test_http_submit_failure_rolls_back_and_reader_does_not_write(case,monkeypatch):
    db,orders,session,payload=case
    # Use savepoint sessions so endpoint commits/rollbacks cannot escape outer test transaction.
    import app.api.survey_responses as responses
    import app.api.survey_sessions as sessions
    import app.api.auth as auth
    import app.modules.orders.api.chi_dinh as orders_api
    admin=db.query(User).filter(User.role=='admin').first()
    if not admin: pytest.skip('Needs local admin for authorized read test')
    def scoped_db():
        child=Session(bind=db.connection(),join_transaction_mode='create_savepoint',expire_on_commit=False)
        try: yield child
        finally: child.close()
    for module in (responses,sessions,orders_api): monkeypatch.setattr(module,'get_db',scoped_db)
    monkeypatch.setattr(auth,'get_current_user',lambda token:admin)
    setattr_all(monkeypatch,sessions,'_emit_survey_completion_notifications',lambda *args:None)
    app=Flask(__name__)
    app.register_blueprint(responses.survey_responses_router,url_prefix='/api')
    app.register_blueprint(sessions.survey_sessions,url_prefix='/api')
    app.register_blueprint(orders_api.router,url_prefix='/api/chi-dinh')
    client=app.test_client()
    assert client.post('/api/survey-responses/public',json={**payload,'responses':{'q0':'bad'}}).status_code==400
    assert client.put('/api/survey-sessions/update-status-by-token',json={'session_token':session.session_token,'status':'completed'}).status_code==409
    assert client.post('/api/survey-responses/public',json=payload).status_code==200
    db.expire_all()
    assert orders[0].status=='has_result'
    before=(db.query(SurveySession).count(),db.query(SurveyResponse).count())
    path=f'/api/chi-dinh/{orders[0].id}/survey-result'
    assert client.get(path).status_code==401
    result=client.get(path,headers={'Authorization':'Bearer QA'}).get_json()['data']
    assert result['responses']==payload['responses']
    assert before==(db.query(SurveySession).count(),db.query(SurveyResponse).count())
    rejected=client.post('/api/survey-sessions/generate',headers={'Authorization':'Bearer QA'},json={
        'order_id':orders[0].id,'patient_id':session.patient_id,'examination_id':session.examination_id,'template_id':session.survey_template_id})
    assert rejected.status_code==409
    assert client.post(f'/api/chi-dinh/{orders[0].id}/finish-survey').status_code==401
    assert client.post(f'/api/survey-sessions/close/{session.session_token}').status_code==401
    assert client.put('/api/survey-sessions/update-status-by-token',json={'session_token':session.session_token,'status':'closed'}).status_code==409
    from types import SimpleNamespace
    monkeypatch.setattr(auth,'get_current_user',lambda token:SimpleNamespace(id=-1,role='doctor', is_active=True))
    assert client.post(f'/api/chi-dinh/{orders[0].id}/finish-survey',headers={'Authorization':'Bearer QA'}).status_code==403
    monkeypatch.setattr(auth,'get_current_user',lambda token:SimpleNamespace(id=admin.id,role='staff', is_active=True))
    assert client.post(f'/api/chi-dinh/{orders[0].id}/finish-survey',headers={'Authorization':'Bearer QA'}).status_code==403
    monkeypatch.setattr(auth,'get_current_user',lambda token:admin)
    assert client.post(f'/api/chi-dinh/{orders[0].id}/finish-survey',headers={'Authorization':'Bearer QA'}).status_code==200
    db.expire_all()
    assert orders[0].status=='completed' and orders[0].completion_reason=='doctor'
    assert client.get(path,headers={'Authorization':'Bearer QA'}).get_json()['data']['responses']==payload['responses']


@pytest.mark.parametrize('with_result', [False, True])
def test_doctor_finishes_with_or_without_result_and_cannot_reopen(case, with_result):
    db, orders, session, payload = case
    if with_result:
        submit_order_survey(db, payload)
    actor_id = db.query(User.id).first()[0]
    order, changed = finish_order_survey(db, orders[0].id, actor_id=actor_id)
    assert changed and order.status == 'completed' and order.is_completed
    assert order.completion_reason == 'doctor' and order.completed_by == actor_id
    assert orders[1].status == 'survey_sent'
    assert session.status == (SurveySessionStatus.completed if with_result else SurveySessionStatus.closed)
    before = order.completed_at
    assert finish_order_survey(db, order.id, actor_id=actor_id)[1] is False
    assert order.completed_at == before
    assert db.query(SurveyResponse).filter_by(order_id=order.id).count() == int(with_result)
    if not with_result:
        with pytest.raises(SurveyLifecycleError): submit_order_survey(db, payload)


@pytest.mark.parametrize('with_result', [False, True])
def test_deadline_finishes_at_exact_expiry_and_preserves_results(case, with_result):
    db, orders, session, payload = case
    if with_result:
        submit_order_survey(db, payload)
    deadline = orders[0].survey_expires_at
    assert orders[0] not in expire_due_order_surveys(db, deadline - timedelta(seconds=1))
    changed = expire_due_order_surveys(db, deadline)
    assert orders[0] in changed
    assert orders[0].status == 'completed' and orders[0].completion_reason == 'expired'
    assert orders[0].completed_at == deadline and orders[0].completed_by is None
    assert orders[0] not in expire_due_order_surveys(db, deadline + timedelta(minutes=1))
    assert session.status == (SurveySessionStatus.completed if with_result else SurveySessionStatus.expired)
    result = db.query(SurveyResponse).filter_by(session_id=session.id).first()
    assert bool(result) == with_result
    if result: assert result.responses == payload['responses'] and result.total_scores == {'A':3}


def test_two_tab_counts_respect_filters_and_ignore_pagination(case):
    from app.modules.orders.services.clinical_order_query import get_chi_dinh_list_result
    db, orders, session, payload = case
    submit_order_survey(db, payload)
    actor = db.query(User).filter(User.role=='admin').first()
    if not actor: pytest.skip('Needs admin')
    # Isolate the case using the existing location filter, without patient fixtures.
    marker = 'qa_' + uuid4().hex[:10]
    for order in orders: order.location_type = marker
    db.flush()
    finish_order_survey(db, orders[1].id, actor_id=actor.id)
    for group, expected in [('active',orders[0]),('completed',orders[1])]:
        result = get_chi_dinh_list_result(db, actor, {'status_group':group,'location_type':marker,'per_page':1,'page':99})
        assert result.group_counts == {'active':1,'completed':1}
        assert result.items == [expected] and result.page == 1
        assert result.next_expiry_at
    empty = get_chi_dinh_list_result(db, actor, {'location_type':marker,'patient_name':uuid4().hex})
    assert empty.total == 0 and empty.group_counts == {'active':0,'completed':0}


def test_other_legacy_link_cannot_replace_an_available_result(case):
    db, orders, session, payload = case
    result, *_ = submit_order_survey(db, payload)
    other = SurveySession(order_id=orders[0].id, survey_template_id=session.survey_template_id,
        examination_id=session.examination_id, patient_id=session.patient_id,
        session_token=str(uuid4()), expires_at=session.expires_at)
    db.add(other); db.flush()
    with pytest.raises(SurveyLifecycleError):
        submit_order_survey(db, {**payload, 'session_token':other.session_token})
    assert db.query(SurveyResponse).filter_by(order_id=orders[0].id).count() == 1
    assert result.total_scores == {'A':3}


def test_session_status_restores_link_and_qr_without_generation_cache(case, monkeypatch):
    """A fresh detail read has the same QR/link as generate, scoped to its order."""
    import base64
    from urllib.parse import urlparse, parse_qs
    import app.api.survey_sessions as sessions
    import app.api.auth as auth
    db, orders, session, payload = case
    admin = db.query(User).filter(User.role == 'admin').first()
    if not admin:
        pytest.skip('Needs local admin for authorized read test')
    def scoped_db():
        child = Session(bind=db.connection(), join_transaction_mode='create_savepoint', expire_on_commit=False)
        try:
            yield child
        finally:
            child.close()
    setattr_all(monkeypatch,sessions, 'get_db', scoped_db)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: admin)
    setattr_all(monkeypatch,sessions, 'emit_order_changed', lambda *args, **kwargs: None)
    setattr_all(monkeypatch,sessions, 'emit_survey_changed', lambda *args, **kwargs: None)
    app = Flask(__name__)
    app.register_blueprint(sessions.survey_sessions, url_prefix='/api')
    client = app.test_client()
    path = f'/api/survey-sessions/{session.examination_id}/status?order_id={orders[0].id}'
    headers = {'Authorization': 'Bearer QA'}
    assert client.get(path).status_code == 401
    read = client.get(path, headers=headers).get_json()['data']
    parsed = parse_qs(urlparse(read['survey_url']).query)
    assert parsed == {'patient_id': [str(session.patient_id)], 'examination_id': [str(session.examination_id)],
                      'session_token': [session.session_token], 'template_id': [str(session.survey_template_id)]}
    assert base64.b64decode(read['qr_code'].split(',')[1]).startswith(b'\x89PNG\r\n\x1a\n')
    generated = client.post('/api/survey-sessions/generate', headers=headers, json={
        'patient_id': session.patient_id, 'examination_id': session.examination_id,
        'template_id': session.survey_template_id, 'order_id': orders[0].id})
    assert generated.status_code == 200
    data = generated.get_json()['data']
    assert data['survey_url'] == read['survey_url'] and data['qr_code'] == read['qr_code']
    assert data['session_id'] == session.id  # Regeneration preserves an active session/draft.
    assert client.get(path, headers=headers).get_json()['data']['qr_code'] == read['qr_code']
    other = client.get(f'/api/survey-sessions/{session.examination_id}/status?order_id={orders[1].id}', headers=headers).get_json()['data']
    assert other['status'] == 'not_started' and 'qr_code' not in other
