from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask

from app.modules.prescriptions.api import internal
from app.modules.prescriptions.services import save_service


@pytest.mark.parametrize('value', ['abc', -1, 'NaN', 'Infinity', None, '', True, [], {}, '10000000'])
def test_invalid_quantity_is_rejected(value):
    with pytest.raises(save_service.PrescriptionInputValidationError):
        save_service.normalize_prescription_quantity(value)


@pytest.mark.parametrize('value,expected', [(0, 0), ('0', 0), (0.25, 1), ('1.01', 2), (Decimal('9999999'), 9999999)])
def test_valid_quantity_keeps_whole_unit_rounding(value, expected):
    assert save_service.normalize_prescription_quantity(value) == expected


@pytest.mark.parametrize('rows', [None, {}, 'bad', [None], ['bad'], [{'name': 'Test'}]])
def test_invalid_rows_are_rejected(rows):
    with pytest.raises(save_service.PrescriptionInputValidationError):
        save_service.normalize_prescription_medicines(rows)


@pytest.mark.parametrize('medicine_type', ['TOXIC', 'UNKNOWN'])
def test_unsupported_catalog_type_does_not_use_client_type(medicine_type):
    with pytest.raises(save_service.PrescriptionInputValidationError):
        save_service.group_medicines_by_prescription_type(
            [{'name': 'Test', 'medicine_id': 1, 'quantity': 1, 'prescription_type': 'BASIC'}],
            {1: {'prescription_type': medicine_type}},
        )


@pytest.mark.parametrize('medicine_type', ['BASIC', 'H', 'N'])
def test_supported_catalog_type_is_preserved(medicine_type):
    grouped = save_service.group_medicines_by_prescription_type(
        [{'name': 'Test', 'medicine_id': 1, 'quantity': 1}],
        {1: {'prescription_type': medicine_type}},
    )
    assert list(grouped) == [medicine_type]


@pytest.mark.parametrize('medicine_type,quantity', [('TOXIC', 1), ('BASIC', -1), ('BASIC', 'abc')])
def test_invalid_input_rejected_before_item_deletion_or_stock_changes(monkeypatch, medicine_type, quantity):
    database = MagicMock()
    database.query.return_value.filter.return_value.all.return_value = [
        SimpleNamespace(id=5, prescription_type='BASIC')]
    monkeypatch.setattr(save_service, 'collect_old_prescription_item_totals', lambda *args: {})
    monkeypatch.setattr(save_service, 'load_medicine_catalog', lambda *args: {
        1: {'name': 'Test', 'prescription_type': medicine_type}})
    stock_writer = MagicMock()
    monkeypatch.setattr(save_service, 'apply_prescription_batch_stock_deltas', stock_writer)
    with pytest.raises(save_service.PrescriptionInputValidationError):
        save_service.save_prescription_transaction(
            database, appointment_id=1, user_id=1,
            medicines=[{'medicine_id': 1, 'name': 'Test', 'quantity': quantity, 'unit_price': 0}],
            usage_instructions='', re_examination_date=None)
    stock_writer.assert_not_called()
    database.query.return_value.filter.return_value.delete.assert_not_called()
    database.commit.assert_not_called()
    database.rollback.assert_called_once()


def test_code_lock_precedes_count_and_handles_more_than_100_collisions():
    database = MagicMock()
    query = database.query.return_value.filter.return_value
    query.count.return_value = 0
    query.first.side_effect = [True] * 101 + [None]
    result = save_service.generate_prescription_code(database, 'C')
    assert result.endswith('102-C')
    assert database.mock_calls[0][0] == 'execute'
    statement = database.execute.call_args.args[0]
    assert 'pg_advisory_xact_lock' in str(statement)
    assert list(statement.compile().params.values()) == [79836, 1]


def test_invalid_quantity_api_returns_400_without_save(monkeypatch):
    database = MagicMock()
    monkeypatch.setattr(internal, 'get_db', lambda: iter([database]))
    writer = MagicMock()
    monkeypatch.setattr(internal, 'save_prescription_transaction', writer)
    application = Flask(__name__)
    with application.test_request_context('/save', method='POST', json={
        'appointment_id': 1, 'medicines': [{'name': 'Test', 'quantity': 'abc'}],
    }):
        response, status = internal.save_prescription.__wrapped__(SimpleNamespace(id=1))
    assert status == 400
    assert response.get_json()['code'] == 'prescription.invalid_input'
    writer.assert_not_called()
    database.rollback.assert_called_once()
