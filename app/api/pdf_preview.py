import subprocess
import sys
import os
import signal
from pathlib import Path
from threading import BoundedSemaphore

from flask import Blueprint, Response, jsonify, request

from app.api.auth import require_auth


pdf_preview_bp = Blueprint('pdf_preview', __name__)
render_slots = BoundedSemaphore(2)
MAX_HTML_BYTES = 8 * 1024 * 1024


@pdf_preview_bp.post('/api/print/preview.pdf')
@require_auth
def preview_pdf(user):
    if request.content_length is None or request.content_length > MAX_HTML_BYTES:
        return jsonify(detail='Tài liệu vượt quá 8 MB'), 413
    if request.mimetype != 'text/html':
        return jsonify(detail='Tài liệu phải là HTML'), 415
    html = request.get_data()
    if not html.strip():
        return jsonify(detail='Tài liệu rỗng'), 400
    if not render_slots.acquire(blocking=False):
        return jsonify(detail='Đang tạo tài liệu khác, vui lòng thử lại'), 429
    try:
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve().parents[1] / 'utils/pdf_preview.py')],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            start_new_session=True,
            cwd=Path(__file__).resolve().parents[2],
        )
        try:
            output, _ = process.communicate(input=html, timeout=45)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            return jsonify(detail='Tạo PDF quá thời gian, vui lòng thử lại'), 504
        if process.returncode or not output.startswith(b'%PDF-'):
            return jsonify(detail='Không thể tạo PDF. Kiểm tra bộ tạo PDF và tài nguyên của tài liệu.'), 503
        return Response(output, mimetype='application/pdf', headers={
            'Content-Disposition': 'inline; filename="preview.pdf"',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        })
    except OSError:
        return jsonify(detail='Bộ tạo PDF chưa sẵn sàng'), 503
    finally:
        render_slots.release()
