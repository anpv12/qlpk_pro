"""Patch helpers for API/service modules split into ``<module>_partN`` siblings.

Split modules re-export moved functions, but each part binds its own imports,
so a monkeypatch must reach every sibling that holds the same name.
"""

from __future__ import annotations

import importlib
import pkgutil


def part_modules(module):
    package_name, _, stem = module.__name__.rpartition(".")
    package = importlib.import_module(package_name)
    parts = []
    for info in pkgutil.iter_modules(package.__path__):
        if info.name.startswith(f"{stem}_part") and info.name[len(stem) + 5:].isdigit():
            parts.append(importlib.import_module(f"{package_name}.{info.name}"))
    return parts


def setattr_all(monkeypatch, module, name, value, **kwargs):
    """monkeypatch.setattr on the module and on every split part that binds ``name``."""
    monkeypatch.setattr(module, name, value, **kwargs)
    for part in part_modules(module):
        if hasattr(part, name):
            monkeypatch.setattr(part, name, value, **kwargs)
