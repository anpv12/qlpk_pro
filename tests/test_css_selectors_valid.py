"""Every CSS rule selector in app stylesheets has balanced brackets (a broken selector drops the whole rule)."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'app' / 'static' / 'css'


def preludes(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    depth, start = 0, 0
    for index, char in enumerate(text):
        if char == '{':
            if depth == 0 or text[start:index].strip().startswith('@') is False:
                yield text[start:index].strip()
            depth += 1
            start = index + 1
        elif char == '}':
            depth -= 1
            start = index + 1
        elif char == ';' and depth <= 1:
            start = index + 1


def test_selectors_have_balanced_brackets():
    broken = []
    for path in ROOT.rglob('*.css'):
        for prelude in preludes(path.read_text(encoding='utf-8')):
            if not prelude or prelude.startswith('@') or re.fullmatch(r'[\d.%\s,fromto]+', prelude):
                continue
            if prelude.count('(') != prelude.count(')') or prelude.count('[') != prelude.count(']') or prelude[0] in ')]*,':
                broken.append(f'{path.relative_to(ROOT)}: {prelude[:80]}')
    assert broken == []
