"""Version stamping for ES module imports served from ``/static/js`` and for
relative ``@import`` rules served from ``/static/css``.

Templates load module entries as ``/static/js/<entry>.js?v=<app_version>``.
Relative ``import``/``export`` specifiers inside those modules do not carry the
version, so browsers had to revalidate every module on each navigation. When a
module is requested with a version, the same version is appended to each
relative ``.js`` specifier so the whole module graph becomes immutable-cacheable.
The same applies to relative ``@import url('./x.css')`` rules inside stylesheets.
"""

import re

SAFE_VERSION = re.compile(r'^[A-Za-z0-9._-]{1,64}$')
RELATIVE_JS_SPECIFIER = re.compile(
    r"""(?P<lead>\b(?:from|import)\s*\(?\s*)(?P<quote>['"])(?P<spec>\.{1,2}/[^'"?\n]+?\.js)(?P=quote)"""
)
RELATIVE_CSS_IMPORT = re.compile(
    r"""(?P<lead>@import\s+url\(\s*)(?P<quote>['"]?)(?P<spec>\.{1,2}/[^'")?\n]+?\.css)(?P=quote)(?P<tail>\s*\))"""
)


def is_safe_asset_version(version):
    return bool(version) and bool(SAFE_VERSION.match(str(version)))


def stamp_module_imports(source, version):
    """Append ``?v=<version>`` to relative ``.js`` import/export specifiers."""
    if not is_safe_asset_version(version):
        return source
    return RELATIVE_JS_SPECIFIER.sub(
        lambda match: f"{match.group('lead')}{match.group('quote')}{match.group('spec')}?v={version}{match.group('quote')}",
        source,
    )


def stamp_css_imports(source, version):
    """Append ``?v=<version>`` to relative ``@import url(...)`` stylesheet rules."""
    if not is_safe_asset_version(version):
        return source
    return RELATIVE_CSS_IMPORT.sub(
        lambda match: f"{match.group('lead')}{match.group('quote')}{match.group('spec')}?v={version}{match.group('quote')}{match.group('tail')}",
        source,
    )
