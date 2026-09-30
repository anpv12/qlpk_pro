"""Patch helpers for API/service modules split into ``<module>_<topic>`` siblings.

Split modules re-export moved functions, but each part binds its own imports,
so a monkeypatch must reach every sibling that holds the same name.
"""

from __future__ import annotations

import importlib
import inspect
import re


def part_modules(module):
    """Sibling ``<stem>_*`` modules the split module imports its moved routes/functions from."""
    package_name, _, stem = module.__name__.rpartition(".")
    source = inspect.getsource(module)
    names = re.findall(rf"^from {re.escape(package_name)}\.({re.escape(stem)}_\w+) import", source, re.M)
    return [importlib.import_module(f"{package_name}.{name}") for name in dict.fromkeys(names)]


def setattr_all(monkeypatch, module, name, value, **kwargs):
    """monkeypatch.setattr on the module and every split part that binds ``name``; at least one must bind it."""
    targets = [target for target in [module, *part_modules(module)] if hasattr(target, name)]
    if not targets:
        raise AttributeError(f"{module.__name__} and its split parts have no attribute {name!r}")
    for target in targets:
        monkeypatch.setattr(target, name, value, **kwargs)
