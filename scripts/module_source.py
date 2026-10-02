"""Read split browser modules (entry + ``<entry>-parts/``) as one plain source.

Split entries carry ``// Parts (nạp trước file này): <topic>.js, ...``; parts run
before the entry. The plain form strips the ``moduleParts.``/``moduleState.``
indirection so source-contract checks keep matching the original code.
"""

from __future__ import annotations

import re
from pathlib import Path

MANIFEST = re.compile(r"^// Parts \(nạp trước file này\): (.+)$", re.M)
CONTINUED = re.compile(r"^// Continued in \(nạp ngay sau file này, cùng scope trang\): (.+)$", re.M)
JS_ROOT = Path(__file__).resolve().parents[1] / "app" / "static" / "js"


RELATIVE_IMPORT = re.compile(r"""^import\s+(?:[^'"]*?from\s+)?['"](\.{1,2}/[^'"]+)['"]""", re.M)


def es_module_files(path: Path, seen: list[Path] | None = None) -> list[Path]:
    """An ES module after the modules it imports from its own ``<stem>-parts/`` folder (dependencies first, once)."""
    seen = [] if seen is None else seen
    path = path.resolve()
    if path in seen:
        return []
    seen.append(path)
    text = path.read_text(encoding="utf-8", errors="ignore")
    files: list[Path] = []
    for spec in RELATIVE_IMPORT.findall(text):
        target = (path.parent / spec).resolve()
        if target.is_file() and target.parent == path.with_name(path.stem + "-parts"):
            files += es_module_files(target, seen)
    return files + [path]


def module_files(path: Path) -> list[Path]:
    """Load order: the entry's parts, the entry, then its continuation files (each expanded the same way)."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not MANIFEST.search(text) and re.search(r"from ['\"]\./" + re.escape(path.stem) + r"-parts/", text):
        return es_module_files(path)
    match = MANIFEST.search(text)
    part_dir = path.with_name(path.stem + "-parts")
    parts = [part_dir / name.strip() for name in match.group(1).split(",")] if match else []
    continued = CONTINUED.search(text)
    following = [part for name in continued.group(1).split(",") for part in module_files(JS_ROOT / name.strip())] if continued else []
    return parts + [path] + following


def read_module_source(path: Path, plain: bool = True) -> str:
    source = "\n".join(file.read_text(encoding="utf-8", errors="ignore") for file in module_files(path))
    if not plain:
        return source
    prefixes = "module(?:Parts|State)"
    if "moduleParts.installers.push(function (inst, outer)" in source:
        prefixes += "|inst|outer"
    source = re.sub(rf"\b(\w+): (?:{prefixes})\.\1\b", r"\1", source)
    return re.sub(rf"\b(?:{prefixes})\.", "", source)


def python_split_files(path: Path) -> list[Path]:
    """A Python module plus sibling ``<stem>_*.py`` modules it imports (split parts/mixins)."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    files = [path]
    for name in re.findall(rf"^from [\w.]*\b({re.escape(path.stem)}_\w+) import", text, re.M):
        sibling = path.with_name(f"{name}.py")
        if sibling.exists() and sibling not in files:
            files.append(sibling)
    return files


CSS_PART_IMPORT = re.compile(r"""^@import url\(['"]?\./([\w-]+)/([\w-]+\.css)['"]?\);$""", re.M)


def css_split_files(path: Path) -> list[Path]:
    """A stylesheet's own topic parts (``@import url('./<stem>/<topic>.css')``), in cascade order."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    parts = [path.with_name(folder) / name for folder, name in CSS_PART_IMPORT.findall(text) if folder == path.stem]
    return parts or [path]


def read_css_source(path: Path) -> str:
    """Stylesheet text with its topic parts inlined in cascade order; other ``@import`` rules stay."""
    path = Path(path)
    text = path.read_text(encoding="utf-8", errors="ignore")
    return CSS_PART_IMPORT.sub(
        lambda match: (path.with_name(match[1]) / match[2]).read_text(encoding="utf-8", errors="ignore")
        if match[1] == path.stem else match[0],
        text,
    )


def read_source(path: Path) -> str:
    """Text of a file; split JS entries, split Python modules and split stylesheets include their parts."""
    path = Path(path)
    if path.suffix == ".css":
        return read_css_source(path)
    if path.suffix == ".js":
        return read_module_source(path)
    if path.suffix == ".py":
        return "\n".join(file.read_text(encoding="utf-8", errors="ignore") for file in python_split_files(path))
    return path.read_text(encoding="utf-8", errors="ignore")
