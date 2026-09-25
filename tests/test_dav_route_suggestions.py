from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from app.modules.medicines.services.catalog_mapping import clinic_defaults
from app.modules.medicines.services.dav_reference_sync import normalize_dav_item
from app.modules.medicines.services.reference_route import suggest_reference_route, route_suggestion_fields


@pytest.mark.parametrize('form,expected', [
    ('Dung dịch uống', 'Uống'), ('Thuốc bột pha hỗn dịch uống', 'Uống'),
    ('Cốm pha hỗn dịch uống', 'Uống'), ('Dung dịch tiêm', 'Tiêm'),
    ('Thuốc bột pha tiêm', 'Tiêm'), ('Dung dịch tiêm truyền', 'Tiêm truyền'),
    ('Dung dịch truyền', 'Truyền'), ('Dung dịch nhỏ mắt', 'Nhỏ mắt'),
    ('Hỗn dịch nhỏ mắt', 'Nhỏ mắt'), ('Dung dịch nhỏ tai', 'Nhỏ tai'),
    ('Dung dịch nhỏ mũi', 'Nhỏ mũi'), ('Hỗn dịch xịt mũi', 'Xịt mũi'),
    ('Kem bôi da', 'Bôi ngoài da'), ('Viên đặt âm đạo', 'Đặt âm đạo'),
    ('Viên đặt trực tràng', 'Đặt trực tràng'), ('Viên ngậm dưới lưỡi', 'Ngậm dưới lưỡi'),
])
def test_catalog_and_clinic_share_the_route_rule(form, expected):
    source = SimpleNamespace(route=None, dosage_form=form, packaging='', manufacturer_country='Việt Nam',
                             **route_suggestion_fields(None, form))
    assert suggest_reference_route(None, form) == expected
    assert clinic_defaults(source)['suggested_administration_method'] == expected
    assert clinic_defaults(source)['administration_method'] == ''


@pytest.mark.parametrize('form', [None, '', '--', 'Viên nén', 'Viên nang mềm',
    'Viên đặt', 'Dung dịch', 'Nguyên liệu làm thuốc', 'Kem',
    'Dung dịch nhỏ mắt, nhỏ tai', 'Dung dịch uống hoặc tiêm', 'Dung dịch tiêm bắp hoặc uống'])
def test_ambiguous_forms_do_not_get_a_route(form):
    assert suggest_reference_route(None, form) is None


@pytest.mark.parametrize('route', ['Tiêm tĩnh mạch', 'Uống', 'Tiêm bắp, tiêm tĩnh mạch'])
def test_explicit_source_route_always_takes_priority(route):
    source = MedicineReferenceCatalog(name='Thuốc', route=route, dosage_form='Dung dịch tiêm')
    assert source.to_dict()['route'] == route
    assert source.to_dict()['suggested_route'] is None


def test_case_spacing_and_accents_do_not_change_the_suggestion():
    assert suggest_reference_route('  ', '  DUNG  DỊCH\nNHỎ MẮT. ') == 'Nhỏ mắt'
    assert suggest_reference_route(None, 'thuoc bot pha hon dich uong') == 'Uống'


@pytest.mark.parametrize('form,expected', [
    ('Thuốc bột uống', 'Uống'),
    ('Si rô', 'Uống'),
    ('Sirô uống nhỏ giọt', 'Uống'),
    ('Thuốc cốm pha dung dịch uống', 'Uống'),
    ('Bột pha thành hỗn dịch để uống', 'Uống'),
    ('Viên nén nhai', 'Uống'),
    ('Viên nén phân tán trong khoang miệng', 'Uống'),
    ('Viên nén bao phim tan trong ruột', 'Uống'),
    ('Viên nang cứng chứa vi hạt bao tan trong ruột', 'Uống'),
    ('Thuốc tiêm đông khô', 'Tiêm'),
    ('Bột đông khô và dung môi pha dung dịch tiêm', 'Tiêm'),
    ('Dung dịch đậm đặc để pha dung dịch tiêm truyền', 'Tiêm truyền'),
    ('Dung dịch tiêm truyền tĩnh mạch', 'Truyền tĩnh mạch'),
    ('Dung dịch truyền tĩnh mạch sau khi pha loãng', 'Truyền tĩnh mạch'),
    ('Bột pha tiêm đường tĩnh mạch', 'Tiêm tĩnh mạch'),
    ('Dung dịch tiêm tĩnh mạch chậm', 'Tiêm tĩnh mạch'),
    ('Thuốc bột pha tiêm bắp', 'Tiêm bắp'),
    ('Dung dịch tiêm dưới da', 'Tiêm dưới da'),
    ('Dung dịch tiêm trong da', 'Tiêm trong da'),
    ('Dung dịch thuốc nhỏ mắt', 'Nhỏ mắt'),
    ('Bột pha hỗn dịch nhỏ tai', 'Nhỏ tai'),
    ('Dung dịch thuốc nhỏ mũi', 'Nhỏ mũi'),
    ('Thuốc mỡ tra mắt', 'Tra mắt'),
    ('Hỗn dịch thuốc xịt mũi dạng phân liều', 'Xịt mũi'),
    ('Kem bôi ngoài da', 'Bôi ngoài da'),
    ('Dung dịch dùng ngoài', 'Dùng ngoài'),
    ('Viên nén không bao đặt âm đạo', 'Đặt âm đạo'),
    ('Viên đạn đặt hậu môn', 'Đặt trực tràng'),
    ('Gel thụt trực tràng', 'Thụt trực tràng'),
    ('Viên đông khô đặt dưới lưỡi', 'Ngậm dưới lưỡi'),
    ('Dung dịch súc miệng', 'Súc miệng'),
    ('Viên nang chứa bột dùng để hít', 'Hít'),
    ('Thuốc phun mù hệ hỗn dịch dùng để hít qua đường miệng', 'Hít'),
    ('Dung dịch khí dung', 'Hít'),
    ('Miếng dán hấp thu qua da', 'Qua da'),
])
def test_expanded_forms_preserve_meaning_and_reject_extra_routes(form, expected):
    # Exercise the shared reader/defaults, including real DAV Unicode/spacing.
    for value in (form, '  ' + form.upper().replace(' ', '\n  ') + '. '):
        source = MedicineReferenceCatalog(name='Thuốc', dosage_form=value,
                                           **route_suggestion_fields(None, value))
        assert source.to_dict()['suggested_route'] == expected
        assert source.route is None
        assert clinic_defaults(source)['suggested_administration_method'] == expected
        assert suggest_reference_route('Đường dùng nguồn', value) is None
    for value in ('Không dùng ' + form, form + ', nhỏ tai', form + ' hoặc uống',
                  form + '; đường dùng chưa xác định'):
        assert suggest_reference_route(None, value) is None


@pytest.mark.parametrize('form', [
    'Viên nén bao phim', 'Viên nang cứng', 'Viên nén phân tán',
    'Bột pha hỗn dịch', 'Dung môi pha tiêm', 'Nước cất pha tiêm',
    'Dung dịch nhỏ mắt, mũi', 'Dung dịch nhỏ mắt/nhỏ tai',
    'Dung dịch dùng ngoài (dung dịch súc miệng)',
    'Dung dịch tiêm bắp, tiêm tĩnh mạch',
    'Dung dịch tiêm truyền tĩnh mạch/tiêm dưới da',
    'Bột pha tiêm/truyền và hít', 'Dung dịch tiêm và uống',
    'Thuốc bột dùng pha hỗn dịch để uống và dùng qua đường trực tràng',
    'Viên đạn đặt âm đạo, trực tràng', 'Viên nang chứa bột để hít và uống',
    'Miếng dán', 'Thuốc phun mù', 'Dung dịch thẩm phân máu',
    'Dung dịch tiêm tủy sống', 'Hộp chứa 1 bơm tiêm đóng sẵn 1 ml dung dịch tiêm',
])
def test_incomplete_mixed_and_non_dosage_form_descriptions_remain_unknown(form):
    assert suggest_reference_route(None, form) is None


def test_sync_and_read_preserve_raw_route_and_recompute_suggestion():
    raw = {'id': 'test-route', 'tenThuoc': 'Thuốc',
           'thongTinThuocCoBan': {'dangBaoChe': 'Dung dịch tiêm', 'tenDuongDung': None}}
    before = deepcopy(raw)
    source = MedicineReferenceCatalog(**normalize_dav_item(raw))
    assert source.to_dict()['suggested_route'] == 'Tiêm'
    assert source.route is None and source.raw_payload == before and raw == before
    raw['thongTinThuocCoBan']['dangBaoChe'] = 'Viên nén'
    for key, value in normalize_dav_item(raw).items():
        setattr(source, key, value)
    assert source.to_dict()['suggested_route'] is None
    raw['thongTinThuocCoBan'].update(dangBaoChe='Dung dịch tiêm', tenDuongDung='Tiêm dưới da')
    for key, value in normalize_dav_item(raw).items():
        setattr(source, key, value)
    assert source.to_dict()['route'] == 'Tiêm dưới da'
    assert source.to_dict()['suggested_route'] is None


def test_readers_use_stored_values_without_running_inference(monkeypatch):
    from app.modules.medicines.services import reference_route
    def unexpected_inference(*args):
        raise AssertionError('Reader must not compute a route')
    monkeypatch.setattr(reference_route, 'suggest_reference_route', unexpected_inference)
    source = MedicineReferenceCatalog(name='Thuốc', dosage_form='Dung dịch tiêm',
                                      suggested_route='Tiêm', suggested_route_rule_version='2026-09-14.2')
    assert source.to_dict()['suggested_route'] == 'Tiêm'
    assert clinic_defaults(source)['suggested_administration_method'] == 'Tiêm'
    source.suggested_route = None
    assert source.to_dict()['suggested_route'] is None
    assert clinic_defaults(source)['suggested_administration_method'] is None
    source.suggested_route = 'Tiêm'
    source.route = 'Tiêm bắp'
    assert source.to_dict()['suggested_route'] is None
    assert clinic_defaults(source)['suggested_administration_method'] is None
