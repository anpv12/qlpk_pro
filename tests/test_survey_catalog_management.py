"""Survey catalog HTTP regression tests; all database writes roll back."""
import io
import json
import os
from uuid import uuid4

import pytest
from flask import Flask
from sqlalchemy.orm import Session
from app.core.database import engine
from app.models.user import User, UserGroup
from app.models.group import Group
from app.models.survey_template import SurveyTemplate

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='Opt-in PostgreSQL rollback tests')


@pytest.fixture
def catalog(monkeypatch, tmp_path):
    import app.api.auth as auth
    import app.api.survey_templates as api
    import app.api.survey_template_management as management
    import app.api.survey_criteria as criteria
    import app.utils.survey_template_policy as policy
    connection = engine.connect()
    transaction = connection.begin()
    db = Session(bind=connection, expire_on_commit=False)
    actor = User(username='qa_survey_' + uuid4().hex[:15], full_name='QA permissions',
                 hashed_password='unused', role='staff', is_active=True)
    db.add(actor)
    db.flush()

    def child_session():
        return Session(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False)

    def scoped_db():
        session = child_session()
        try:
            yield session
        finally:
            session.close()

    for module in (auth, api, policy, criteria):
        monkeypatch.setattr(module, 'get_db', scoped_db)
    for module in (management, criteria):
        monkeypatch.setattr(module, 'SessionLocal', child_session)
    for module in (api, management, criteria):
        monkeypatch.setattr(module, 'emit_catalog_changed', lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, 'get_current_user', lambda token: actor)
    monkeypatch.setattr(api, 'UPLOAD_FOLDER', str(tmp_path / 'uploads'))
    app = Flask(__name__)
    for bp in (api.survey_templates_router, management.router, criteria.survey_criteria_bp):
        app.register_blueprint(bp, url_prefix='/api')
    client = app.test_client()

    def grant():
        group = Group(code='QA_' + uuid4().hex, name='QA survey managers', permissions=json.dumps(['ql-mau-khaosat']))
        db.add(group)
        db.flush()
        db.add(UserGroup(user_id=actor.id, group_id=group.id))
        db.flush()

    try:
        yield client, db, actor, grant
    finally:
        db.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


HEADERS = {'Authorization': 'Bearer test-only'}


def content():
    return {'questions': [{'id': 'q1', 'text': 'QA', 'type': 'multiple_choice', 'criteria': 'A',
                          'answers': [{'id': 'zero', 'text': 'Không', 'score': 0},
                                      {'id': 'one', 'text': 'Có', 'score': 1}]}]}


def test_all_catalog_writers_require_current_permission(catalog):
    client, db, actor, grant = catalog
    for method, path in [('POST', '/survey-templates'), ('PUT', '/survey-templates/1'),
                         ('DELETE', '/survey-templates/1'), ('POST', '/survey-templates/upload'),
                         ('POST', '/survey-templates/1/duplicate'), ('POST', '/survey-criteria/'),
                         ('PUT', '/survey-criteria/1'), ('DELETE', '/survey-criteria/1')]:
        assert client.open('/api' + path, method=method).status_code == 401
        denied = client.open('/api' + path, method=method, headers=HEADERS, json={})
        assert denied.status_code == 403
        assert denied.json['code'] == 'SURVEY_MANAGEMENT_FORBIDDEN'
    assert client.get('/api/survey-templates/access', headers=HEADERS).json['can_manage'] is False
    # Read remains available for the clinical workflow.
    assert client.get('/api/survey-templates', headers=HEADERS).status_code == 200
    grant()
    assert client.get('/api/survey-templates/access', headers=HEADERS).json['can_manage'] is True
    created = client.post('/api/survey-templates', headers=HEADERS,
                          json={'name': 'QA ' + uuid4().hex, 'content': content()})
    assert created.status_code == 201
    template_id = created.json['data']['id']
    assert client.put(f'/api/survey-templates/{template_id}', headers=HEADERS,
                      json={'name': 'QA renamed ' + uuid4().hex}).status_code == 200
    assert client.delete(f'/api/survey-templates/{template_id}', headers=HEADERS).status_code == 200
    actor.is_active = False
    actor.role = 'admin'
    db.flush()
    # require_auth rejects a deactivated account before any permission check.
    assert client.post('/api/survey-templates', headers=HEADERS, json={}).status_code == 401


def test_document_upload_edit_download_and_last_page(catalog):
    client, db, actor, grant = catalog
    grant()
    prefix = 'QA file ' + uuid4().hex
    payload = b'%PDF-1.4\nQA survey document\n%%EOF'
    response = client.post('/api/survey-templates/upload', headers=HEADERS,
                           data={'name': prefix, 'file': (io.BytesIO(payload), 'survey.pdf')})
    assert response.status_code == 201
    template_id = response.json['data']['id']
    detail = client.get(f'/api/survey-templates/{template_id}', headers=HEADERS).json['data']
    assert detail['template_kind'] == 'document' and detail['can_start_survey'] is False
    page = client.get('/api/survey-templates', headers=HEADERS,
                      query_string={'search': prefix, 'page': 99, 'per_page': 10}).json
    assert page['pagination'] == {'page': 1, 'pages': 1, 'per_page': 10, 'total': 1}
    assert page['data'][0]['file_name'] == 'survey.pdf' and page['data'][0]['readiness'] == 'document'
    assert client.put(f'/api/survey-templates/{template_id}', headers=HEADERS,
                      json={'name': prefix, 'description': 'Updated metadata'}).status_code == 200
    download = client.get(f'/api/survey-templates/download/{template_id}', headers=HEADERS)
    assert download.status_code == 200 and download.data == payload
    assert 'attachment' in download.headers['Content-Disposition']
    assert client.delete(f'/api/survey-templates/{template_id}', headers=HEADERS).status_code == 200
    assert client.get(f'/api/survey-templates/download/{template_id}', headers=HEADERS).status_code == 404
    empty = client.get('/api/survey-templates', headers=HEADERS, query_string={'search': prefix, 'page': 2}).json
    assert empty['pagination']['page'] == 1 and empty['pagination']['total'] == 0


def test_blank_threshold_rejected_but_zero_accepted(catalog):
    client, db, actor, grant = catalog
    grant()
    survey = content()
    survey['result_config'] = {'conditions': [{'operator': '>=', 'min_score': None, 'conclusion': 'QA'}]}
    data = {'name': 'QA threshold ' + uuid4().hex, 'content': survey}
    assert client.post('/api/survey-templates', json=data, headers=HEADERS).status_code == 400
    survey['result_config']['conditions'][0]['min_score'] = 0
    response = client.post('/api/survey-templates', json=data, headers=HEADERS)
    assert response.status_code == 201
    detail = client.get('/api/survey-templates/' + str(response.json['data']['id']), headers=HEADERS).json['data']
    assert detail['readiness'] == 'ready'


def test_readiness_distinguishes_missing_points_and_scores_only(catalog):
    client, db, actor, grant = catalog
    for missing, expected in [(True, 'needs_configuration'), (False, 'scores_only')]:
        survey = content()
        if missing:
            survey['questions'][0]['answers'][0]['score'] = None
        template = SurveyTemplate(name='QA legacy ' + uuid4().hex, content=survey, created_by=actor.id, is_active=True)
        db.add(template)
        db.flush()
        detail = client.get(f'/api/survey-templates/{template.id}', headers=HEADERS).json['data']
        assert detail['readiness'] == expected
        assert detail['can_start_survey'] is not missing


def test_edit_freezes_legacy_results_and_sessions_before_catalog_changes(catalog):
    from copy import deepcopy
    from datetime import datetime, timedelta, timezone
    from app.models.examination import Examination
    from app.models.survey_response import SurveyResponse
    from app.models.survey_session import SurveySession
    client, db, actor, grant = catalog
    grant()
    examination = db.query(Examination).first()
    assert examination is not None, 'Local rollback QA needs one examination'
    template = SurveyTemplate(name='QA snapshot ' + uuid4().hex, content=content(), created_by=actor.id)
    db.add(template)
    db.flush()
    original = {'name': template.name, 'content': deepcopy(template.content)}
    submitted = SurveyResponse(examination_id=examination.id, patient_id=examination.patient_id,
        survey_template_id=template.id, responses={'q1': 'one'}, total_scores={'A': 1})
    session = SurveySession(examination_id=examination.id, patient_id=examination.patient_id,
        survey_template_id=template.id, session_token=str(uuid4()),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db.add_all([submitted, session])
    db.flush()
    updated = deepcopy(template.content)
    updated['questions'][0]['text'] = 'Updated question'
    updated['questions'][0]['answers'][1]['score'] = 9
    response = client.put(f'/api/survey-templates/{template.id}', headers=HEADERS,
        json={'name': original['name'] + ' changed', 'content': updated})
    assert response.status_code == 200
    db.expire_all()
    assert submitted.template_snapshot == session.template_snapshot == original
    assert submitted.responses == {'q1': 'one'} and submitted.total_scores == {'A': 1}
    assert template.content['questions'][0]['answers'][1]['score'] == 9
    # A later metadata-only edit must not overwrite the frozen historical copy.
    assert client.put(f'/api/survey-templates/{template.id}', headers=HEADERS,
        json={'name': original['name'] + ' renamed again'}).status_code == 200
    db.expire_all()
    assert submitted.template_snapshot == session.template_snapshot == original


@pytest.mark.parametrize('name', ['   ', None, 42, 'X' * 256])
def test_invalid_names_return_validation_errors(catalog, name):
    client, db, actor, grant = catalog
    grant()
    response = client.post('/api/survey-templates', headers=HEADERS,
        json={'name': name, 'content': content()})
    assert response.status_code == 400


def test_trimmed_duplicate_and_non_object_payload_are_rejected(catalog):
    client, db, actor, grant = catalog
    grant()
    name = 'QA names ' + uuid4().hex
    response = client.post('/api/survey-templates', headers=HEADERS,
        json={'name': '  ' + name + '  ', 'content': content()})
    assert response.status_code == 201 and response.json['data']['name'] == name
    assert client.post('/api/survey-templates', headers=HEADERS,
        json={'name': name, 'content': content()}).status_code == 400
    assert client.post('/api/survey-templates', headers=HEADERS, json=[1]).status_code == 400
