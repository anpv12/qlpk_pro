import pytest
from types import SimpleNamespace
from unittest.mock import Mock

from app.modules.orders.services.clinical_order_mutation import (
    InvalidBatchDelete,
    InvalidChiDinhPayload,
    _prepare_chi_dinh_payload,
    get_chi_dinh_batch_for_delete,
    sync_chi_dinh_for_appointment,
)
from app.modules.orders.services.clinical_order_query import InvalidPagination, _positive_int


@pytest.mark.parametrize(
    ('payload', 'message'),
    [
        ({'order_name': ''}, 'Tên chỉ định là bắt buộc'),
        ({'order_name': 'X', 'location_type': 'unknown'}, 'Nơi thực hiện không hợp lệ'),
        ({'order_name': 'X', 'status': 'unknown'}, 'Trạng thái chỉ định không hợp lệ'),
        ({'order_name': 'X', 'is_completed': 'yes'}, 'is_completed phải là boolean'),
        ({'order_name': 'X', 'scheduled_for': 'not-a-date'}, 'Ngày chỉ định không hợp lệ'),
    ],
)
def test_invalid_clinical_order_payload_is_rejected_before_database_write(payload, message):
    with pytest.raises(InvalidChiDinhPayload, match=message):
        _prepare_chi_dinh_payload(object(), payload)


@pytest.mark.parametrize('value', ['0', 0, '-1', -1, 'not-a-number'])
def test_pagination_requires_positive_integers(value):
    with pytest.raises(InvalidPagination):
        _positive_int(value, 'page')


def test_batch_delete_rejects_duplicate_or_non_integer_ids():
    for ids in ([1, 1], ['1'], [0], [True]):
        with pytest.raises(InvalidBatchDelete):
            get_chi_dinh_batch_for_delete(object(), ids)


def test_sync_rejects_duplicate_existing_ids():
    appointment_query = Mock()
    appointment_query.filter.return_value.first.return_value = SimpleNamespace(id=10)
    existing_query = Mock()
    existing_query.filter.return_value.all.return_value = [SimpleNamespace(id=4)]
    db = Mock()
    db.query.side_effect = [appointment_query, existing_query]

    payload = {'id': 4, 'order_name': 'Xét nghiệm', 'location_type': 'out', 'out_facility': 'Cơ sở A'}
    with pytest.raises(InvalidChiDinhPayload, match='ID bị lặp'):
        sync_chi_dinh_for_appointment(db, 10, [payload, payload])
