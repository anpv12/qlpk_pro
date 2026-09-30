"""Uploaded Excel file for the catalog import endpoints (active ingredients, allergens, drug interactions)."""

from flask import jsonify, request


def catalog_excel_upload():
    """Return ``(file, None)`` for a usable .xlsx/.xls upload, else ``(None, error_response)``."""
    if 'file' not in request.files:
        return None, (jsonify({'success': False, 'message': 'Không tìm thấy file'}), 400)
    file = request.files['file']
    if file.filename == '':
        return None, (jsonify({'success': False, 'message': 'Tên file rỗng'}), 400)
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return None, (jsonify({'success': False, 'message': 'Chỉ hỗ trợ định dạng Excel (.xlsx, .xls)'}), 400)
    return file, None
