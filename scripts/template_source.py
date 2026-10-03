"""Page views of Jinja templates for static contract checkers.

Pages share markup through parameterised partials (``{% set x = {...} %}`` then
``{% include 'partials/...' %}``), so reading a page file alone misses the
assets and markup it really serves.

- ``expanded_source(path)``: the page text with every referenced template inlined right
  after its tag: ``{% include %}``, ``{% extends %}`` and the macro files of ``{% from ... import %}`` /
  ``{% import %}`` (the tag is kept so owner counts still work; each file once per reference).
- ``rendered_page(path)``: the page rendered by Jinja with a stub context, i.e.
  the HTML the browser receives, with partial parameters resolved.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

import jinja2

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "app" / "templates"
INCLUDE = re.compile(r"""\{%-?\s*(?:include|extends|from|import)\s+['"]([^'"]+)['"][^%]*-?%\}""")
STUB_CONTEXT = {"app_version": "", "qlpk_public_page": False}


def expanded_source(path: Path, _seen: tuple[Path, ...] = ()) -> str:
    path = Path(path).resolve()
    text = path.read_text(encoding="utf-8")
    if path in _seen:
        return text

    def inline(match: re.Match) -> str:
        partial = TEMPLATES / match.group(1)
        if not partial.exists():
            return match.group(0)
        return match.group(0) + "\n" + expanded_source(partial, (*_seen, path))

    return INCLUDE.sub(inline, text)


@lru_cache(maxsize=None)
def _environment(templates: Path) -> jinja2.Environment:
    return jinja2.Environment(loader=jinja2.FileSystemLoader(str(templates)), undefined=jinja2.ChainableUndefined)


def rendered_page(path: Path, templates: Path = TEMPLATES) -> str:
    templates = Path(templates).resolve()
    name = Path(path).resolve().relative_to(templates).as_posix()
    return _environment(templates).get_template(name).render(**STUB_CONTEXT)


if __name__ == "__main__":
    import json
    import sys

    # JSON {template name: rendered HTML} for the named page templates (all pages when none are given).
    names = sys.argv[1:] or sorted(page.name for page in TEMPLATES.glob("*.html"))
    json.dump({name: rendered_page(TEMPLATES / name) for name in names}, sys.stdout, ensure_ascii=False)
