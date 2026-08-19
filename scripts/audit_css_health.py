#!/usr/bin/env python3
"""CSS health audit for QLPK static stylesheets.

The goal is measurement, not automatic refactoring. The parser is intentionally
small and conservative: it extracts ordinary CSS rules, recurses into common
at-rules, and reports duplicate declaration blocks/selectors so humans can pick
safe owner boundaries.
"""

from __future__ import annotations

import argparse
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS_ROOT = ROOT / "app" / "static" / "css"
SKIP_PARTS = {"_archive", "uploads", "node_modules", "__pycache__"}


@dataclass(frozen=True)
class CssRule:
    file: Path
    selector: str
    declarations: tuple[str, ...]
    context: str = ""


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def iter_css_files() -> list[Path]:
    return sorted(
        path
        for path in CSS_ROOT.rglob("*.css")
        if path.is_file() and not (set(path.parts) & SKIP_PARTS)
    )


def strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def find_matching_brace(text: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    return -1


def normalize_declarations(body: str) -> tuple[str, ...]:
    declarations: list[str] = []
    for chunk in body.split(";"):
        chunk = re.sub(r"\s+", " ", chunk.strip())
        if not chunk or ":" not in chunk:
            continue
        prop, value = chunk.split(":", 1)
        prop = prop.strip().lower()
        value = re.sub(r"\s+", " ", value.strip())
        declarations.append(f"{prop}:{value}")
    return tuple(sorted(declarations))


def split_selectors(prelude: str) -> list[str]:
    selectors: list[str] = []
    current: list[str] = []
    depth = 0
    for char in prelude:
        if char in "([":
            depth += 1
        elif char in ")]" and depth:
            depth -= 1
        if char == "," and depth == 0:
            selector = "".join(current).strip()
            if selector:
                selectors.append(re.sub(r"\s+", " ", selector))
            current = []
        else:
            current.append(char)
    selector = "".join(current).strip()
    if selector:
        selectors.append(re.sub(r"\s+", " ", selector))
    return selectors


def extract_rules(text: str, file: Path, context: str = "") -> list[CssRule]:
    rules: list[CssRule] = []
    index = 0
    while True:
        open_index = text.find("{", index)
        if open_index == -1:
            break
        close_index = find_matching_brace(text, open_index)
        if close_index == -1:
            break
        prelude = text[index:open_index].strip()
        body = text[open_index + 1:close_index]
        index = close_index + 1
        if not prelude:
            continue
        if "{" in body:
            if prelude.startswith(("@media", "@supports", "@container", "@layer")):
                nested_context = f"{context} {prelude}".strip()
                rules.extend(extract_rules(body, file, nested_context))
            continue
        if prelude.startswith("@"):
            continue
        declarations = normalize_declarations(body)
        if not declarations:
            continue
        for selector in split_selectors(prelude):
            rules.append(CssRule(file=file, selector=selector, declarations=declarations, context=context))
    return rules


def owner_for(path: Path) -> str:
    relative = path.relative_to(CSS_ROOT)
    if len(relative.parts) > 1:
        return relative.parts[0]
    return "root"


def summarize(args: argparse.Namespace) -> int:
    css_files = iter_css_files()
    all_rules: list[CssRule] = []
    file_lines: dict[Path, int] = {}
    for path in css_files:
        text = path.read_text(errors="ignore")
        file_lines[path] = text.count("\n") + 1
        all_rules.extend(extract_rules(strip_comments(text), path))

    rules_by_file = Counter(rule.file for rule in all_rules)
    lines_by_owner = Counter({owner: 0 for owner in sorted({owner_for(p) for p in css_files})})
    rules_by_owner = Counter()
    for path, lines in file_lines.items():
        lines_by_owner[owner_for(path)] += lines
    for rule in all_rules:
        rules_by_owner[owner_for(rule.file)] += 1

    declaration_groups: dict[tuple[str, ...], list[CssRule]] = defaultdict(list)
    selector_groups: dict[str, list[CssRule]] = defaultdict(list)
    for rule in all_rules:
        if len(rule.declarations) >= args.min_declarations:
            declaration_groups[rule.declarations].append(rule)
        selector_groups[rule.selector].append(rule)

    duplicate_blocks = [
        (declarations, rules)
        for declarations, rules in declaration_groups.items()
        if len({rule.file for rule in rules}) >= args.min_files and len(rules) >= args.min_occurrences
    ]
    duplicate_blocks.sort(key=lambda item: (len(item[0]) * len(item[1]), len(item[1]), len(item[0])), reverse=True)

    duplicate_selectors = [
        (selector, rules)
        for selector, rules in selector_groups.items()
        if len({rule.file for rule in rules}) >= 2
    ]
    duplicate_selectors.sort(key=lambda item: (len({rule.file for rule in item[1]}), len(item[1])), reverse=True)

    print("CSS HEALTH AUDIT")
    print(f"files={len(css_files)} rules={len(all_rules)} lines={sum(file_lines.values())}")
    print("\nOWNER SUMMARY")
    for owner, lines in lines_by_owner.most_common():
        print(f"  {owner:14s} lines={lines:5d} rules={rules_by_owner[owner]:4d}")

    print("\nLARGEST FILES")
    for path, lines in sorted(file_lines.items(), key=lambda item: item[1], reverse=True)[:args.top_files]:
        print(f"  {lines:5d} lines {rules_by_file[path]:4d} rules  {rel(path)}")

    print("\nDUPLICATE DECLARATION BLOCKS")
    for declarations, rules in duplicate_blocks[:args.top_duplicates]:
        files = sorted({rel(rule.file) for rule in rules})
        sample_selectors = ", ".join(rule.selector for rule in rules[:4])
        sample_declarations = "; ".join(declarations[:5])
        if len(declarations) > 5:
            sample_declarations += "; ..."
        print(f"  occurrences={len(rules):3d} files={len(files):2d} declarations={len(declarations):2d}")
        print(f"    declarations: {sample_declarations}")
        print(f"    selectors: {sample_selectors}")
        print(f"    files: {', '.join(files[:6])}{' ...' if len(files) > 6 else ''}")

    print("\nDUPLICATE SELECTORS ACROSS FILES")
    for selector, rules in duplicate_selectors[:args.top_selectors]:
        files = sorted({rel(rule.file) for rule in rules})
        print(f"  files={len(files):2d} occurrences={len(rules):2d} selector={selector}")
        print(f"    {', '.join(files[:8])}{' ...' if len(files) > 8 else ''}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit QLPK CSS size and duplication")
    parser.add_argument("--top-files", type=int, default=15)
    parser.add_argument("--top-duplicates", type=int, default=25)
    parser.add_argument("--top-selectors", type=int, default=25)
    parser.add_argument("--min-declarations", type=int, default=3)
    parser.add_argument("--min-files", type=int, default=2)
    parser.add_argument("--min-occurrences", type=int, default=2)
    return summarize(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
