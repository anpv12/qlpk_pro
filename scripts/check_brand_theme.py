#!/usr/bin/env python3
"""Guard the shared brand palette and its entry point on rendered web pages."""
from pathlib import Path
import colorsys
import math
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from module_source import css_split_files, read_source  # noqa: E402

# Explicit opt-in protects the clinical, financial and public screens from
# administrative presentation changes, including future shared-theme edits.
CLINIC_WORKSPACE_PAGES = {
    'medicine-management', 'medicine-reference-catalog', 'active-ingredient',
    'allergen', 'drug-interaction', 'user-management', 'group-management',
    'permission-management', 'text-expansion-management', 'service-category',
    'service-management', 'package-management', 'survey-template-management',
    'survey-template-create', 'icd-management', 'holiday-management',
    'doctor-busy-schedule', 'shortcut-settings', 'document-management',
}

CLINIC_PAGINATION_PAGES = {
    'user-management', 'group-management', 'active-ingredient', 'allergen',
    'medicine-reference-catalog', 'text-expansion-management', 'icd-management',
    'survey-template-management', 'service-management', 'service-category',
    'holiday-management', 'drug-interaction',
}


def contrast_on_white(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
              for c in channels]
    luminance = sum(c * weight for c, weight in zip(linear, (0.2126, 0.7152, 0.0722)))
    return 1.05 / (luminance + 0.05)


BRAND_CHANNELS = {(75, 39, 25), (123, 71, 47), (50, 24, 14), (109, 61, 39)}
BRAND_DEFINITIONS = {
    '--qlpk-brand-primary-rgb': 'var(--qlpk-brown-800-rgb)',
    '--qlpk-brand-header-start-rgb': '109, 61, 39',
    '--qlpk-brand-primary': 'rgb(var(--qlpk-brand-primary-rgb))',
    '--qlpk-color-primary': 'var(--qlpk-brand-primary)',
    '--qlpk-brown-800-rgb': '75, 39, 25',
    '--qlpk-brown-800': 'rgb(var(--qlpk-brown-800-rgb))',
    '--qlpk-color-chocolate': 'var(--qlpk-brown-800)',
    '--qlpk-color-primary-rgb': 'var(--qlpk-brand-primary-rgb)',
    '--qlpk-color-header-light': 'rgb(var(--qlpk-brand-header-start-rgb))',
    '--qlpk-color-primary-strong-rgb': 'var(--qlpk-brand-primary-rgb)',
    '--qlpk-color-primary-strong': 'var(--qlpk-brand-primary)',
    '--qlpk-doctor-primary': 'var(--qlpk-brand-primary)',
    '--qlpk-doctor-primary-strong': 'var(--qlpk-color-primary-strong)',
}
BRAND_SOURCE_TOKENS = set(BRAND_DEFINITIONS)


def color_channels(function, value):
    channels = re.split(r'[,\s/]+', value.strip())[:3]
    if len(channels) != 3:
        return None
    try:
        if function.startswith('rgb'):
            return tuple(round(float(channel.rstrip('%')) * (2.55 if channel.endswith('%') else 1))
                         for channel in channels)
        hue_match = re.fullmatch(r'([+-]?[\d.]+)(deg|grad|rad|turn)?', channels[0])
        if not hue_match or not all(channel.endswith('%') for channel in channels[1:]):
            return None
        units = {None: 360, 'deg': 360, 'grad': 400, 'rad': 2 * math.pi, 'turn': 1}
        hue = float(hue_match[1]) / units[hue_match[2]]
        saturation, lightness = (float(channel[:-1]) / 100 for channel in channels[1:])
        return tuple(round(channel * 255) for channel in colorsys.hls_to_rgb(hue % 1, lightness, saturation))
    except (ValueError, OverflowError):
        return None


def brand_literal_matches(source, palette=BRAND_CHANNELS):
    for match in re.finditer(r'#(?:[\da-f]{8}|[\da-f]{6})(?![\w-])', source, re.IGNORECASE):
        channels = tuple(int(match[0][offset:offset + 2], 16) for offset in (1, 3, 5))
        if channels in palette:
            yield match
    for match in re.finditer(r'\b(rgb[a]?|hsl[a]?)\(([^()]*)\)', source, re.IGNORECASE):
        if color_channels(match[1].lower(), match[2]) in palette:
            yield match
    for match in re.finditer(r'--[\w-]+\s*:\s*([+\-\d.%]+(?:[,\s]+[+\-\d.%]+){2})\s*;', source):
        if color_channels('rgb', match[1]) in palette:
            yield match


def strip_style_comments(source):
    return re.sub(r'/\*.*?\*/|<!--.*?-->', lambda match: '\n' * match[0].count('\n'), source, flags=re.DOTALL)


def check_chocolate_source(css_root, source_root=None):
    errors = []
    token_path = css_root / 'shared/color-tokens.css'
    token_files = {token_path, *css_split_files(token_path)}
    tokens = strip_style_comments(read_source(token_path))
    for name, expected in BRAND_DEFINITIONS.items():
        values = re.findall(rf'{re.escape(name)}\s*:\s*([^;{{}}]+);', tokens)
        if len(values) != 1 or re.sub(r'\s+', '', values[0]).lower() != re.sub(r'\s+', '', expected).lower():
            errors.append(f'{name}: must retain one canonical definition ({expected})')
    source_root = source_root or css_root
    for source_path in sorted(source_root.rglob('*')):
        if source_path.suffix not in {'.css', '.html', '.js', '.svg'} or not source_path.is_file():
            continue
        source = strip_style_comments(source_path.read_text())
        if source_path in token_files:
            for name in BRAND_DEFINITIONS:
                source = re.sub(rf'{re.escape(name)}\s*:\s*[^;{{}}]+;', '', source)
        else:
            for name in BRAND_SOURCE_TOKENS:
                if re.search(rf'{re.escape(name)}\s*:', source):
                    errors.append(f'{source_path.relative_to(source_root)}: cannot redefine {name}')
        for match in brand_literal_matches(source):
            line = source.count('\n', 0, match.start()) + 1
            errors.append(f'{source_path.relative_to(source_root)}:{line}: use shared brand tokens, not {match[0]}')
    return errors


def main():
    errors = check_chocolate_source(ROOT / 'app/static/css', ROOT / 'app')
    errors.extend(check_brand_surfaces(ROOT / 'app/static/css'))
    errors.extend(check_primary_background_contract(ROOT / 'app/static/css'))
    pages = list((ROOT / 'app/templates').glob('*.html'))
    for page in pages:
        source = page.read_text()
        clinic_styles = source.count('/static/css/shared/clinic-workspace.css')
        clinic_body = bool(re.search(r'<body[^>]*\bqlpk-clinic-page\b', source))
        expected_clinic = page.stem in CLINIC_WORKSPACE_PAGES
        if clinic_styles != int(expected_clinic) or clinic_body != expected_clinic:
            errors.append(f'{page.name}: clinic workspace opt-in scope mismatch')
        expected_pagination = int(page.stem in CLINIC_PAGINATION_PAGES)
        if (source.count("include 'partials/clinic-pagination.html'") != expected_pagination
                or source.count('/static/js/components/clinic-pagination.js') != expected_pagination):
            errors.append(f'{page.name}: clinic pagination owner/scope mismatch')
        if source.count("include 'partials/brand-theme.html'") != 1:
            errors.append(f'{page.name}: expected one brand theme include')
        if '/static/css/shared/color-tokens.css' in source:
            errors.append(f'{page.name}: duplicate token stylesheet outside shared include')
    tokens = read_source(ROOT / 'app/static/css/shared/color-tokens.css')
    if '--qlpk-color-primary: var(--qlpk-brand-primary);' not in tokens:
        errors.append('Primary must resolve to the shared header-light brand source')
    if min(contrast_on_white('#4b2719'), contrast_on_white('#6d3d27')) < 4.5:
        errors.append('Primary must retain 4.5:1 contrast for white action text')
    for filename, prefix in [('admin-management-ui.css', 'admin-accent'),
                             ('icon-tokens.css', 'qlpk-icon-action-view')]:
        source = read_source(ROOT / 'app/static/css/shared' / filename)
        if f'--{prefix}: var(--qlpk-color-primary);' not in source:
            errors.append(f'{filename}: brand alias must use shared primary')
    # State colors are deliberately separate from branding.
    feedback = read_source(ROOT / 'app/static/css/shared/feedback-tokens.css')
    for name, color in [('success', '#198754'), ('warning', '#b45309'), ('error', '#dc2626')]:
        if not re.search(rf'--qlpk-feedback-{name}:\s*{color};', feedback):
            errors.append(f'Feedback {name} must retain its semantic color')
    # Operational badges use white text on a solid semantic background;
    # the same colors also appear as status text on white data tables.
    for name in ('success', 'info', 'warning', 'error', 'critical', 'neutral'):
        match = re.search(rf'--qlpk-feedback-{name}:\s*(#[0-9a-fA-F]{{6}});', feedback)
        if not match or contrast_on_white(match[1]) < 4.5:
            errors.append(f'Feedback {name}: status text must meet 4.5:1 contrast')
    for error in errors:
        print(f'[FAIL] {error}')
    if not errors:
        print(f'[OK] Brand entry point: {len(pages)} pages; shared primary and semantic feedback')
    return bool(errors)


def check_primary_background_contract(css_root):
    errors = []
    for filename in sorted(css_root.rglob('*.css')):
        source = strip_style_comments(filename.read_text())
        for match in re.finditer(r'(?:^|[;{}])\s*([\w-]+)\s*:\s*([^;{}]+)', source):
            property_name, value = match.groups()
            if property_name in {'color', 'border-color', 'background-color', 'accent-color', 'fill', 'stroke', 'box-shadow'} and 'var(--qlpk-workflow-context-header-bg)' in value:
                errors.append(f'{filename.name}: header gradient is an image, not a color for {property_name}')
            if property_name == 'background' and re.search(r'linear-gradient\([^;]*var\(--qlpk-color-primary\)', value):
                errors.append(f'{filename.name}: use shared header background instead of a private primary gradient')
    return errors


def stylesheet_owner(css_root, filename):
    """Stylesheet path relative to css_root; a topic part reports the stylesheet that imports it."""
    owner = filename.parent.with_suffix('.css')
    if owner.is_file() and filename in css_split_files(owner):
        filename = owner
    return filename.relative_to(css_root).as_posix()


def check_brand_surfaces(css_root):
    errors = []
    old_channels = {(75, 39, 25), (50, 24, 14), (90, 48, 31), (113, 78, 61),
                    (91, 56, 41), (56, 23, 8), (99, 54, 33), (107, 66, 44), (74, 51, 40)}
    old_solid = re.compile(r'var\(--qlpk-(?:brown-[6789]00|color-chocolate|color-brown|header-bg)(?=[,)])')
    allowed_header_files = {'components/app-header.css', 'components/waiting-queue-card.css',
                            'pages/receptionist-new.css'}
    for filename in sorted(css_root.rglob('*.css')):
        relative = stylesheet_owner(css_root, filename)
        if relative == 'shared/color-tokens.css' or relative.startswith('print/'):
            continue
        source = strip_style_comments(filename.read_text())
        for match in re.finditer(r'(?:^|[;{}])\s*([\w-]+)\s*:\s*([^;{}]+)', source):
            property_name, value = match.groups()
            is_surface = re.fullmatch(r'background(?:-color)?|border[\w-]*', property_name)
            is_brand_alias = property_name.startswith('--') and re.search(
                r'(?:brand|accent|primary|clinical|tone-bg|active-bg|icon-end)(?:-strong|-hover|-dark|-soft)?$', property_name)
            if not (is_surface or is_brand_alias):
                continue
            if not old_solid.search(value) and not any(brand_literal_matches(value, old_channels)):
                continue
            if 'rgba(' in value or 'color-mix(' in value:
                continue
            if relative in allowed_header_files and 'linear-gradient(' in value:
                continue
            if relative == 'components/app-header.css' and value.strip() == 'var(--qlpk-header-bg)':
                continue
            line = source.count('\n', 0, match.start()) + 1
            errors.append(f'{relative}:{line}: use shared primary for brand surfaces, not the dark palette')
    return errors


if __name__ == '__main__':
    raise SystemExit(main())
