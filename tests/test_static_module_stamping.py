from app.core.static_modules import is_safe_asset_version, stamp_module_imports


SOURCE = """import './doctor-examination/module-registry.js';
import { createReExaminationCalendar } from './re-examination-calendar.js';
import {
  getIcdLookup as lookup,
} from '../shared/context.js';
export * from "./exports.js";
const lazy = () => import('./lazy.js');
const text = 'from ./not-a-module.js';
const external = import('https://cdn.example.com/lib.js');
"""


def test_relative_js_specifiers_receive_the_requested_version():
    stamped = stamp_module_imports(SOURCE, '1790000000')
    assert "import './doctor-examination/module-registry.js?v=1790000000';" in stamped
    assert "from './re-examination-calendar.js?v=1790000000';" in stamped
    assert "from '../shared/context.js?v=1790000000';" in stamped
    assert 'export * from "./exports.js?v=1790000000";' in stamped
    assert "import('./lazy.js?v=1790000000')" in stamped
    assert "const text = 'from ./not-a-module.js';" in stamped
    assert "import('https://cdn.example.com/lib.js')" in stamped
    assert stamped.count('?v=1790000000') == 5


def test_unsafe_or_missing_versions_leave_the_module_untouched():
    assert stamp_module_imports(SOURCE, None) == SOURCE
    assert stamp_module_imports(SOURCE, '') == SOURCE
    assert stamp_module_imports(SOURCE, '1 OR 1') == SOURCE
    assert stamp_module_imports(SOURCE, 'x' * 65) == SOURCE
    assert is_safe_asset_version('1790000000') is True
    assert is_safe_asset_version('abc.def-1') is True
    assert is_safe_asset_version("'; alert(1)") is False


def test_stamping_is_idempotent_for_already_versioned_specifiers():
    once = stamp_module_imports(SOURCE, '7')
    assert stamp_module_imports(once, '7') == once


def test_relative_css_imports_are_stamped():
    from app.core.static_modules import stamp_css_imports
    source = "@import url('./prescriptions/components/prescription-screen.css');\n@import url(\"./components/option-autocomplete.css\");\n@import url('https://fonts.googleapis.com/css2?family=Roboto');\n.a{color:red}"
    stamped = stamp_css_imports(source, '123')
    assert "@import url('./prescriptions/components/prescription-screen.css?v=123');" in stamped
    assert '@import url("./components/option-autocomplete.css?v=123");' in stamped
    assert "https://fonts.googleapis.com/css2?family=Roboto" in stamped and 'Roboto?v=' not in stamped
    assert stamp_css_imports(source, '../x') == source
