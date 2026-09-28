from app.core.http_cache import VERSIONED_STATIC_CACHE_CONTROL, versioned_static_cache_control


def test_versioned_static_assets_are_immutable():
    assert versioned_static_cache_control('/static/js/doctor-examination-entry.js', '1790000000', 200) == VERSIONED_STATIC_CACHE_CONTROL
    assert versioned_static_cache_control('/static/css/shared/color-tokens.css', 'abc', 200) == VERSIONED_STATIC_CACHE_CONTROL


def test_unversioned_html_api_and_error_responses_keep_default_policy():
    assert versioned_static_cache_control('/static/js/doctor-examination-entry.js', None, 200) is None
    assert versioned_static_cache_control('/static/js/doctor-examination-entry.js', '  ', 200) is None
    assert versioned_static_cache_control('/static/js/missing.js', '1', 404) is None
    assert versioned_static_cache_control('/doctor-examination.html', '1', 200) is None
    assert versioned_static_cache_control('/api/appointments/', '1', 200) is None
