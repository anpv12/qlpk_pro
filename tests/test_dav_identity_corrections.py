from copy import deepcopy

import pytest
from app.modules.medicines.services.dav_reference_sync import normalize_dav_item


@pytest.fixture(params=[
    (16739, '893110043900', 'Exidamin', '10mg', 'Escitalopram (dưới dạng Escitalopram oxalat)'),
    (16723, '893110045400', 'Mebamrol', '100mg', 'Clozapin'),
])
def raw(request):
    source_id, registration, name, quantity, ingredient = request.param
    return {'id': source_id, 'soDangKy': registration, 'tenThuoc': name,
            'thongTinThuocCoBan': {'hoatChatChinh': quantity, 'hamLuong': ingredient}}


def test_verified_swaps_are_corrected_without_mutating_source_and_are_idempotent(raw):
    original = deepcopy(raw)
    result = normalize_dav_item(raw)
    assert raw == original and result['raw_payload'] == original
    assert result['active_ingredient'] == raw['thongTinThuocCoBan']['hamLuong']
    assert result['strength'] == raw['thongTinThuocCoBan']['hoatChatChinh']
    assert normalize_dav_item(raw) == result
    fixed = deepcopy(raw)
    fixed['thongTinThuocCoBan'].update(hoatChatChinh=result['active_ingredient'], hamLuong=result['strength'])
    normalized = normalize_dav_item(fixed)
    assert normalized['active_ingredient'] == result['active_ingredient']
    assert normalized['strength'] == result['strength']


@pytest.mark.parametrize('changed', ['id', 'soDangKy', 'tenThuoc', 'hoatChatChinh', 'hamLuong'])
def test_unknown_source_identity_or_values_are_never_swapped(raw, changed):
    if changed in ('hoatChatChinh', 'hamLuong'):
        raw['thongTinThuocCoBan'][changed] = 'unexpected'
    else:
        raw[changed] = 'unexpected'
    result = normalize_dav_item(raw)
    assert result['active_ingredient'] == raw['thongTinThuocCoBan']['hoatChatChinh']
    assert result['strength'] == raw['thongTinThuocCoBan']['hamLuong']
