import ast
from pathlib import Path

from flask import Flask, jsonify


def test_legacy_refresh_is_authenticated_and_never_mints_a_token():
    source = Path(__file__).resolve().parents[1] / 'main.py'
    tree = ast.parse(source.read_text())
    handler = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'refresh_token_api')
    assert any(isinstance(node, ast.Name) and node.id == 'require_auth' for node in handler.decorator_list)
    handler.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=[handler], type_ignores=[]))
    namespace = {'jsonify': jsonify}
    exec(compile(module, str(source), 'exec'), namespace)
    with Flask(__name__).app_context():
        response, status = namespace['refresh_token_api'](object())
    assert status == 410
    assert response.json['code'] == 'auth.login_required'
    assert 'token' not in response.json
    assert 'access_token' not in response.json
