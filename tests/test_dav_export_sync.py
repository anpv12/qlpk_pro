from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from openpyxl import load_workbook


def test_export_external_text_is_literal_and_long_values_are_preserved(monkeypatch):
    from app.modules.medicines.services import reference_catalog_export as export
    values = {field: None for _, field, _ in export.COLUMNS if field}
    values.update(source_id='00123', name='=HYPERLINK("bad")', active_ingredient='Dài ' * 300,
                  registration_number='00001234', is_active=True, is_deleted=False,
                  is_expired=False, withdrawn=False, registration_expiry_date=datetime(2030, 1, 2, tzinfo=timezone.utc))
    query = Mock()
    query.with_entities.return_value = query
    query.order_by.return_value = query
    query.yield_per.return_value = [SimpleNamespace(**values)]
    monkeypatch.setattr(export, 'build_reference_catalog_query', lambda *a, **k: query)
    sheet = load_workbook(export.build_reference_catalog_excel(None)).active
    assert sheet['B7'].value == '00123' and sheet['K7'].value == '00001234'
    assert sheet['B7'].number_format == '@' and sheet['K7'].number_format == '@'
    assert sheet['C7'].value == values['name'] and sheet['C7'].data_type == 's'
    assert sheet['D7'].value == values['active_ingredient']
    assert sheet['N7'].value == datetime(2030, 1, 2)
    assert sheet.row_dimensions[7].height > 30


def test_sync_consumes_all_source_pages(monkeypatch):
    from app.modules.medicines.services import dav_reference_sync as sync
    calls = []
    def fetch(**kwargs):
        calls.append(kwargs['skip_count'])
        return {'total_count': 5, 'items': list(range(kwargs['skip_count'], min(5, kwargs['skip_count'] + 2)))}
    monkeypatch.setattr(sync, 'fetch_dav_page', fetch)
    monkeypatch.setattr(sync, 'upsert_dav_item', lambda db, item: 'updated')
    db = Mock()
    result = sync.sync_dav_reference_catalog(db, page_size=2)
    assert calls == [0, 2, 4]
    assert result['completed'] is True and result['fetched'] == 5
    db.commit.assert_called_once()
