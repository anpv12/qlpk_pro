"""Bound existing avatar uploads to the avatar size used by the app header.

Usage: python scripts/optimize_uploaded_avatars.py [--dry-run]

Files keep their name and format (URLs stored in the database stay valid).
Originals that get rewritten are copied to ``_archive/uploads-avatars-original-<date>/``.
"""

import os
import shutil
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils.image_optimizer import InvalidImageError, optimize_image  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def main():
    dry_run = '--dry-run' in sys.argv
    avatar_dir = Path(os.environ.get('QLPK_UPLOAD_ROOT') or PROJECT_ROOT / 'uploads') / 'avatars'
    backup_dir = PROJECT_ROOT / '_archive' / f'uploads-avatars-original-{date.today():%Y%m%d}'
    before = after = rewritten = skipped = 0
    for path in sorted(avatar_dir.iterdir()):
        if not path.is_file() or path.name.startswith('.'):
            continue
        ext = path.suffix.lower().lstrip('.')
        data = path.read_bytes()
        before += len(data)
        try:
            optimized, _ = optimize_image(data, ext, keep_format=True)
        except InvalidImageError:
            skipped += 1
            after += len(data)
            print(f'skip (không đọc được ảnh): {path.name}')
            continue
        if len(optimized) >= len(data):
            after += len(data)
            continue
        after += len(optimized)
        rewritten += 1
        print(f'{path.name}: {len(data) // 1024} KB -> {len(optimized) // 1024} KB')
        if dry_run:
            continue
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_dir / path.name)
        path.write_bytes(optimized)
    print(f'rewritten={rewritten} skipped={skipped} total {before // 1024} KB -> {after // 1024} KB' + (' (dry-run)' if dry_run else ''))


if __name__ == '__main__':
    main()
