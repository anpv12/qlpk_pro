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


def module_files(path: Path) -> list[Path]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    continued = CONTINUED.search(text)
    if continued:
        return [path] + [JS_ROOT / name.strip() for name in continued.group(1).split(",")]
    match = MANIFEST.search(text)
    if not match:
        return [path]
    part_dir = path.with_name(path.stem + "-parts")
    return [part_dir / name.strip() for name in match.group(1).split(",")] + [path]


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


def read_source(path: Path) -> str:
    """Text of a file; split JS entries and split Python modules include their parts."""
    path = Path(path)
    if path.suffix == ".js":
        return read_module_source(path)
    if path.suffix == ".py":
        return "\n".join(file.read_text(encoding="utf-8", errors="ignore") for file in python_split_files(path))
    return path.read_text(encoding="utf-8", errors="ignore")
