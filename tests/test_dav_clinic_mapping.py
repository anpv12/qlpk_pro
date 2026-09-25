from types import SimpleNamespace
import pytest
from app.modules.medicines.services.catalog_mapping import clinic_defaults
from app.modules.medicines.services.reference_route import route_suggestion_fields


def defaults(**changes):
    source = dict(manufacturer_country='Việt Nam', route='Uống', dosage_form='Viên nén', packaging='Hộp 3 vỉ x 10 viên')
    source.update(changes)
    source.update(route_suggestion_fields(source['route'], source['dosage_form']))
    return clinic_defaults(SimpleNamespace(**source))


def test_count_units_inside_outer_package():
    result = defaults()
    assert result == dict(administration_method='Uống', is_imported=False,
                         suggested_administration_method=None,
                         unit='viên', packaging_unit='hộp', units_per_box=30)
    assert defaults(packaging='Hộp 1 lọ 30 viên')['units_per_box'] == 30
    assert defaults(packaging='Lọ 60 viên')['packaging_unit'] == 'lọ'
    assert defaults(packaging='Hộp 2 vỉ × 14 viên')['units_per_box'] == 28


@pytest.mark.parametrize('packaging', ['Hộp 3 vỉ x 10 viên hoặc hộp 5 vỉ x 10 viên',
    'Hộp 3 vỉ x 10 viên; kèm dung môi', 'Hộp 0 viên', 'Hộp 1 chai 100ml',
    'Hộp 3 vỉ x 10 viên 5mg', 'Hộp 999999999 viên', ''])
def test_ambiguous_or_non_count_packaging_is_not_converted(packaging):
    result = defaults(packaging=packaging)
    assert result['units_per_box'] is None


def test_liquid_never_guesses_ml_or_bottle_from_dosage_form():
    result = defaults(dosage_form='Dung dịch uống', packaging='')
    assert result['unit'] is None and result['units_per_box'] is None


def test_fdg_keeps_range_and_maps_each_known_field_independently():
    result = defaults(route=None, dosage_form='Dung dịch tiêm', packaging='Lọ 15,8-16ml')
    assert result['administration_method'] == ''
    assert result['suggested_administration_method'] == 'Tiêm'
    assert result['unit'] == 'ml'
    assert result['packaging_unit'] == 'lọ'
    assert result['units_per_box'] is None


@pytest.mark.parametrize('packaging,count', [('Lọ 10ml',10),('Chai 100 ml',100),
    ('Lọ 15,8ml',None),('Lọ 15.8ml',None),('Lọ 0ml',None),
    ('Hộp 10 ống x 10ml',None),('Lọ 10-20ml',None)])
def test_liquid_only_suggests_exact_supported_conversion(packaging, count):
    result = defaults(route=None, dosage_form='Dung dịch uống', packaging=packaging)
    assert result['unit'] == 'ml'
    assert result['units_per_box'] == count


def test_package_container_does_not_require_known_conversion():
    result = defaults(packaging='Tuýp 20g', dosage_form='Kem bôi da', route=None)
    assert result['packaging_unit'] == 'tuýp'
    assert result['unit'] is None and result['units_per_box'] is None
    assert result['suggested_administration_method'] == 'Bôi ngoài da'
    assert defaults(packaging='Hộp 30 viên hoặc lọ 100 viên')['packaging_unit'] is None


def test_form_suggestion_never_overrides_explicit_route_or_locks_legacy_settings():
    from app.modules.medicines.services.catalog_service import source_settings
    assert defaults(route='Tiêm tĩnh mạch', dosage_form='Dung dịch tiêm')['suggested_administration_method'] is None
    assert defaults(route=None, dosage_form='Viên đặt')['suggested_administration_method'] is None
    settings = source_settings({'route':None,'dosage_form':'Dung dịch tiêm','packaging':'Lọ 10ml',
                                'manufacturer_country':'Việt Nam'})
    assert 'administration_method' not in settings


@pytest.mark.parametrize('country,expected', [(' Việt Nam ',False),('Vietnam',False),('VN',False),
    ('Đức',True),('India',True),('',None),('Chưa xác định',None),(None,None)])
def test_origin_mapping(country, expected):
    assert defaults(manufacturer_country=country)['is_imported'] is expected


def test_route_is_preserved_without_truncation():
    assert defaults(route='Tiêm bắp, tiêm tĩnh mạch')['administration_method'] == 'Tiêm bắp, tiêm tĩnh mạch'
    assert defaults(route='x'*51)['administration_method'] is None
