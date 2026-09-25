import importlib.util
import io
from pathlib import Path
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / 'app/utils/pdf_preview.py'
spec = importlib.util.spec_from_file_location('pdf_worker', WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


@pytest.mark.parametrize('url', [
    'http://127.0.0.1:8000/static/css/print/vat_invoice.css',
    'file:///etc/passwd',
    'https://example.com/static/logo.png',
    worker.ORIGIN + '/api/patients/1',
    worker.ORIGIN + '/static/%2e%2e/%2e%2e/.env',
    worker.ORIGIN + '/static/js/shared/pdf-preview.js',
])
def test_denies_non_static_resources(url):
    assert worker.static_asset(url) is None


def test_allows_only_local_static_asset():
    assert worker.static_asset(worker.ORIGIN + '/static/css/print/vat_invoice.css?v=1').is_file()


def test_strips_executable_markup_and_maps_bootstrap():
    html = worker.prepare_html('''<html><head><base href="http://localhost"><meta http-equiv="refresh" content="0;url=http://localhost"><script>alert(1)</script><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"></head><body onload="alert(1)"><iframe src="file:///etc/passwd"></iframe><div class="action-buttons">In</div></body></html>''')
    assert 'script' not in html
    assert 'onload' not in html
    assert 'iframe' not in html
    assert 'http-equiv' not in html
    assert '/static/vendor/pdf/bootstrap.min.css' in html


@pytest.mark.parametrize('html', ['', ' ', 'a' * (worker.MAX_HTML_BYTES + 1), None])
def test_rejects_invalid_html(html):
    with pytest.raises(ValueError):
        worker.prepare_html(html)


def test_real_pdf_unicode_pagination_and_script_isolation():
    pypdf = pytest.importorskip('pypdf')
    html = '''<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:10mm}body{font-family:Roboto}section{break-after:page}</style><section><h1>ĐƠN THUỐC</h1><svg class="barcode-svg" data-barcode="HS00293"></svg><p>Nguyễn Văn Bình</p></section><h1>BỆNH ÁN</h1><script>document.body.innerHTML='INJECTED'</script>'''
    result = subprocess.run([sys.executable, str(WORKER)], input=html.encode(), capture_output=True, timeout=40)
    assert result.returncode == 0, result.stderr.decode()
    assert result.stdout.startswith(b'%PDF-')
    reader = pypdf.PdfReader(io.BytesIO(result.stdout))
    assert len(reader.pages) == 2
    text = ''.join(page.extract_text() for page in reader.pages).replace(' ', '')
    assert 'ĐƠNTHUỐC' in text
    assert 'NguyễnVănBình' in text
    assert 'BỆNHÁN' in text
    assert 'INJECTED' not in text


def test_missing_required_qr_fails_closed():
    html = '<img src="http://127.0.0.1:8000/secret.png" data-required-print-asset="verification-qr">'
    result = subprocess.run([sys.executable, str(WORKER)], input=html.encode(), capture_output=True, timeout=40)
    assert result.returncode != 0
    assert not result.stdout.startswith(b'%PDF-')


def test_no_automatic_print_or_close_hooks():
    files = list((ROOT / 'app/static/js').rglob('*.js')) + list((ROOT / 'app/templates').rglob('*.html'))
    for file in files:
        if file.name.endswith('.min.js'):
            continue
        source = file.read_text()
        assert 'window.print()' not in source, str(file)
        assert 'printWindow.print()' not in source, str(file)
        assert "addEventListener('afterprint'" not in source, str(file)


def test_endpoint_pdf_headers_and_errors(monkeypatch):
    from flask import Flask
    from types import SimpleNamespace
    import types

    auth = types.ModuleType('app.api.auth')
    auth.require_auth = lambda function: lambda: function(SimpleNamespace(id=1))
    monkeypatch.setitem(sys.modules, 'app.api.auth', auth)
    route_spec = importlib.util.spec_from_file_location('pdf_route', ROOT / 'app/api/pdf_preview.py')
    route = importlib.util.module_from_spec(route_spec)
    route_spec.loader.exec_module(route)
    app = Flask(__name__)
    app.register_blueprint(route.pdf_preview_bp)
    client = app.test_client()
    assert client.post('/api/print/preview.pdf', data='test').status_code == 415
    assert client.post('/api/print/preview.pdf', data=' ', content_type='text/html').status_code == 400
    assert client.post('/api/print/preview.pdf', data='a' * (route.MAX_HTML_BYTES + 1), content_type='text/html').status_code == 413
    response = client.post('/api/print/preview.pdf', data='<h1>Preview</h1>', content_type='text/html')
    assert response.status_code == 200
    assert response.data.startswith(b'%PDF-')
    assert response.mimetype == 'application/pdf'
    assert response.headers['Cache-Control'] == 'no-store'
    assert response.headers['Content-Disposition'].startswith('inline;')
