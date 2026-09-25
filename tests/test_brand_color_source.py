from pathlib import Path

import pytest

from scripts.check_brand_theme import BRAND_DEFINITIONS, check_chocolate_source, check_brand_surfaces, check_primary_background_contract, contrast_on_white


def create_palette(tmp_path):
    shared = tmp_path / 'shared'
    shared.mkdir()
    palette = shared / 'color-tokens.css'
    palette.write_text(':root {\n' + ''.join(
        f'  {name}: {value};\n' for name, value in BRAND_DEFINITIONS.items()
    ) + '}\n')
    return palette


def test_repository_has_one_brand_color_source():
    root = Path(__file__).resolve().parents[1]
    assert check_chocolate_source(root / 'app/static/css', root / 'app') == []
    assert check_brand_surfaces(root / 'app/static/css') == []
    assert check_primary_background_contract(root / 'app/static/css') == []


def test_shared_color_references_are_allowed(tmp_path):
    create_palette(tmp_path)
    (tmp_path / 'component.css').write_text(
        '.control { color: var(--qlpk-color-chocolate); '
        'background: var(--header-bg, var(--qlpk-brown-800)); '
        'border-color: rgba(var(--qlpk-brown-800-rgb), 0.12); }'
    )
    assert check_chocolate_source(tmp_path) == []


@pytest.mark.parametrize('color', [
    '#4B2719', '#4b271980', '#7B472f', '#7b472fFF', '#32180e',
    'rgb(75, 39, 25)', 'rgba(75, 39, 25, 0.12)', 'rgb(75 39 25 / 12%)',
    'rgb(75.0 39.0 25.0)', 'rgb(29.411765% 15.294118% 9.803922% / 20%)',
    'rgb(123 71 47)', 'rgba(50, 24, 14, .5)',
    'hsl(16.8 50% 19.607843%)', 'hsla(16.8, 50%, 19.607843%, .2)',
    'hsl(0.046666667turn 50% 19.607843% / 20%)',
])
def test_equivalent_color_literals_are_rejected(tmp_path, color):
    create_palette(tmp_path)
    (tmp_path / 'component.css').write_text(f'.control {{ background: var(--header-bg, {color}); }}')
    errors = check_chocolate_source(tmp_path)
    assert any('component.css' in error and 'use shared brand tokens' in error for error in errors)


@pytest.mark.parametrize('channels', ['75, 39, 25', '75 39 25', '123, 71, 47', '50, 24, 14'])
def test_raw_channel_aliases_are_rejected(tmp_path, channels):
    create_palette(tmp_path)
    (tmp_path / 'component.css').write_text(f'.control {{ --local-rgb: {channels}; }}')
    assert any('use shared brand tokens' in error for error in check_chocolate_source(tmp_path))


@pytest.mark.parametrize('extension', ['css', 'html', 'js', 'svg'])
def test_guard_scans_all_frontend_source_types(tmp_path, extension):
    css_root = tmp_path / 'styles'
    css_root.mkdir()
    create_palette(css_root)
    (tmp_path / f'component.{extension}').write_text('"rgba(75, 39, 25, 0.12)"')
    assert any(f'component.{extension}' in error for error in check_chocolate_source(css_root, tmp_path))


def test_duplicate_palette_definition_is_rejected(tmp_path):
    palette = create_palette(tmp_path)
    palette.write_text(palette.read_text() + ':root { --other: rgba(75, 39, 25, .12); }')
    assert any('use shared brand tokens' in error for error in check_chocolate_source(tmp_path))


def test_brand_color_cannot_be_changed_silently(tmp_path):
    palette = create_palette(tmp_path)
    palette.write_text(palette.read_text().replace('75, 39, 25', '113, 78, 61'))
    assert any('must retain' in error for error in check_chocolate_source(tmp_path))


def test_canonical_source_cannot_be_overridden(tmp_path):
    create_palette(tmp_path)
    (tmp_path / 'component.css').write_text('.control { --qlpk-brown-800: var(--other); }')
    assert any('cannot redefine' in error for error in check_chocolate_source(tmp_path))


def test_other_palette_and_semantic_colors_are_preserved(tmp_path):
    create_palette(tmp_path)
    (tmp_path / 'component.css').write_text(
        '.control { color: #714e3d; background: #198754; border-color: rgba(11, 95, 86, .2); }'
    )
    assert check_chocolate_source(tmp_path) == []


def test_documentation_comments_do_not_count_as_definitions(tmp_path):
    create_palette(tmp_path)
    (tmp_path / 'component.css').write_text('/* Former literal: #4b2719 and rgba(75, 39, 25, .2) */')
    (tmp_path / 'component.html').write_text('<!-- Former literal: #7b472f -->')
    assert check_chocolate_source(tmp_path) == []


@pytest.mark.parametrize('token', [
    '--qlpk-brand-primary', '--qlpk-brand-primary-rgb', '--qlpk-color-primary',
    '--qlpk-color-primary-rgb', '--qlpk-color-primary-strong', '--qlpk-doctor-primary',
    '--qlpk-color-header-light',
])
def test_pages_cannot_redefine_the_primary_color(tmp_path, token):
    create_palette(tmp_path)
    (tmp_path / 'page.css').write_text(f'.page {{ {token}: var(--qlpk-brown-800); }}')
    assert any('cannot redefine' in error for error in check_chocolate_source(tmp_path))


@pytest.mark.parametrize('declaration', [
    'background: var(--qlpk-color-chocolate)',
    'border-left: 3px solid var(--qlpk-brown-800)',
    'background: linear-gradient(var(--qlpk-color-primary), var(--qlpk-brown-900))',
    '--dialog-brand: var(--qlpk-header-bg, var(--qlpk-brown-800))',
    '--dialog-primary: var(--qlpk-brown-600)',
    '--workflow-switch-active-bg: var(--qlpk-color-chocolate)',
    'background: #714e3d',
    'border-color: rgb(90, 48, 31)',
])
def test_dark_palette_cannot_be_used_as_a_brand_surface(tmp_path, declaration):
    (tmp_path / 'page.css').write_text(f'.block {{ color: white; {declaration}; }}')
    assert any('shared primary' in error for error in check_brand_surfaces(tmp_path))


def test_neutral_ink_dividers_and_semantic_colors_are_not_brand_surfaces(tmp_path):
    (tmp_path / 'page.css').write_text(
        '.block { color: var(--qlpk-brown-800); border-color: rgba(var(--qlpk-brown-800-rgb), .12); '
        'background: var(--qlpk-color-brown-soft); } '
        '.danger { background: var(--qlpk-feedback-error); }'
    )
    assert check_brand_surfaces(tmp_path) == []


def test_header_gradient_can_keep_its_dark_endpoint(tmp_path):
    components = tmp_path / 'components'
    components.mkdir()
    (components / 'app-header.css').write_text(
        '.header { background: linear-gradient(var(--qlpk-color-header-light), var(--qlpk-brown-800)); }'
    )
    assert check_brand_surfaces(tmp_path) == []


def test_primary_ink_uses_header_endpoint_with_readable_white_text():
    assert BRAND_DEFINITIONS['--qlpk-brand-primary-rgb'] == 'var(--qlpk-brown-800-rgb)'
    assert BRAND_DEFINITIONS['--qlpk-color-header-light'] == 'rgb(var(--qlpk-brand-header-start-rgb))'
    assert BRAND_DEFINITIONS['--qlpk-color-primary'] == 'var(--qlpk-brand-primary)'
    assert contrast_on_white('#4b2719') >= 4.5
    assert contrast_on_white('#6d3d27') >= 4.5


@pytest.mark.parametrize('property_name', ['color', 'border-color', 'background-color', 'accent-color', 'fill', 'stroke', 'box-shadow'])
def test_gradient_cannot_be_used_as_a_color(tmp_path, property_name):
    (tmp_path / 'page.css').write_text(f'.title {{ {property_name}: var(--qlpk-workflow-context-header-bg); }}')
    assert check_primary_background_contract(tmp_path)


def test_primary_gradient_has_one_background_owner(tmp_path):
    (tmp_path / 'page.css').write_text('.modal-header { background: linear-gradient(var(--qlpk-color-primary), var(--qlpk-color-primary)); }')
    assert check_primary_background_contract(tmp_path)


def test_old_primary_cannot_return_even_in_palette(tmp_path):
    palette = create_palette(tmp_path)
    palette.write_text(palette.read_text() + ':root { --legacy: #7b472f; }')
    assert check_chocolate_source(tmp_path)
