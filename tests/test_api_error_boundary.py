"""api_error_boundary keeps each JSON view's historical 500 payload while logging the traceback."""

from __future__ import annotations

from flask import Flask, abort

from app.utils.api_error_contract import api_error_boundary


def build_app():
    application = Flask(__name__)

    @application.route('/boom')
    @api_error_boundary(success=False, message='Lỗi: {error}', items=[])
    def boom():
        raise RuntimeError('db down {x}')

    @application.route('/ok')
    @api_error_boundary(detail='{error}')
    def ok():
        return {'ok': True}

    @application.route('/missing')
    @api_error_boundary(error='{error}')
    def missing():
        abort(404)

    return application


def test_unexpected_error_returns_declared_payload_and_logs(monkeypatch):
    import app.utils.api_error_contract as contract
    logged = []
    monkeypatch.setattr(contract.logger, 'exception', lambda *args, **kwargs: logged.append(args))
    response = build_app().test_client().get('/boom')
    assert response.status_code == 500
    assert response.get_json() == {'success': False, 'message': 'Lỗi: db down {x}', 'items': []}
    assert logged and logged[0][1:] == ('GET', '/boom')


def test_success_passes_through():
    response = build_app().test_client().get('/ok')
    assert response.status_code == 200 and response.get_json() == {'ok': True}


def test_http_errors_keep_their_status_with_the_same_shape():
    response = build_app().test_client().get('/missing')
    assert response.status_code == 404
    assert set(response.get_json()) == {'error'}
