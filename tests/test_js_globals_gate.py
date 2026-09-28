import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('qlpk_js_globals_gate', ROOT / 'scripts/check_js_globals.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def test_implicit_browser_event_cannot_be_whitelisted_or_resolved_by_unrelated_scope(monkeypatch, tmp_path, capsys):
    (tmp_path / 'page.html').write_text('<script src="/static/js/page.js"></script>')
    monkeypatch.setattr(gate, 'TEMPLATES', tmp_path)
    monkeypatch.setattr(gate, 'find_eslint', lambda value: 'qa-eslint')
    monkeypatch.setattr(gate, 'eslint_undefined', lambda binary: {'app/static/js/page.js': {'event'}})
    monkeypatch.setattr(gate, 'defines', lambda script, name: True)
    monkeypatch.setattr(gate.sys, 'argv', ['check_js_globals.py'])
    assert 'event' not in gate.LIBRARY_GLOBALS
    assert gate.main() == 1
    assert "['event']" in capsys.readouterr().out


def test_explicit_event_parameter_has_no_undefined_reference(monkeypatch, tmp_path, capsys):
    (tmp_path / 'page.html').write_text('<script src="/static/js/page.js"></script>')
    monkeypatch.setattr(gate, 'TEMPLATES', tmp_path)
    monkeypatch.setattr(gate, 'find_eslint', lambda value: 'qa-eslint')
    monkeypatch.setattr(gate, 'eslint_undefined', lambda binary: {})
    monkeypatch.setattr(gate.sys, 'argv', ['check_js_globals.py'])
    assert gate.main() == 0
    assert 'unresolved=0' in capsys.readouterr().out
