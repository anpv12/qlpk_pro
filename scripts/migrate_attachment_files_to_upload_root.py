#!/usr/bin/env python3
"""Move/copy legacy attachment files into the configured QLPK upload root.

The attachments table stores only the physical server filename. Preview and
download routes resolve that filename under QLPK_UPLOAD_ROOT/attachments. This
script reconciles old files that may still live in previous checkout folders.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from flask import Flask
from sqlalchemy import asc


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.core.database import SessionLocal  # noqa: E402
from app.models import Attachment  # noqa: E402
from app.utils.upload_storage import upload_dir, upload_path, upload_root  # noqa: E402


ATTACHMENTS_CATEGORY = "attachments"


@dataclass
class MigrationItem:
    id: int
    patient_id: int
    filename: str
    original_filename: str
    expected_size: int | None
    status: str
    destination: str
    source: str | None = None
    actual_size: int | None = None
    message: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Copy or move attachment files into QLPK_UPLOAD_ROOT/attachments "
            "so preview/download routes can open existing records."
        )
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--apply",
        action="store_true",
        help="write files to the destination. Without this flag the script is dry-run only.",
    )
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="preview the migration without writing files. This is the default.",
    )
    parser.add_argument(
        "--move",
        action="store_true",
        help="move files instead of copy. Requires --apply. Copy is safer and remains the default.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="overwrite an existing destination file when it differs from the source.",
    )
    parser.add_argument(
        "--source-root",
        action="append",
        default=[],
        help=(
            "extra legacy source root to search. Can be either an upload root "
            "containing attachments/ or the attachments directory itself. Repeatable."
        ),
    )
    parser.add_argument(
        "--report-json",
        type=Path,
        help="optional path to write the full migration report as JSON.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="optional limit for a small verification run.",
    )
    return parser.parse_args()


def is_safe_stored_filename(filename: str) -> bool:
    if not filename or filename.strip() != filename:
        return False
    path = Path(filename)
    return not path.is_absolute() and len(path.parts) == 1 and path.name == filename


def unique_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        key = str(path.resolve(strict=False))
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result


def candidate_roots(extra_roots: list[str]) -> list[Path]:
    configured_upload_root = upload_root()
    roots = [
        configured_upload_root / ATTACHMENTS_CATEGORY,
        REPO_ROOT / "uploads" / ATTACHMENTS_CATEGORY,
        REPO_ROOT / "app" / "uploads" / ATTACHMENTS_CATEGORY,
        REPO_ROOT / "app" / "static" / "uploads" / ATTACHMENTS_CATEGORY,
        REPO_ROOT / "_archive",
    ]

    for raw_root in extra_roots:
        root = Path(raw_root).expanduser()
        roots.extend([root, root / ATTACHMENTS_CATEGORY])

    return unique_paths(roots)


def find_source(
    filename: str,
    original_filename: str,
    expected_size: int | None,
    roots: list[Path],
    destination: Path,
) -> Path | None:
    destination_key = str(destination.resolve(strict=False))
    for root in roots:
        direct = root / filename
        if str(direct.resolve(strict=False)) == destination_key:
            continue
        if direct.is_file():
            return direct

    if original_filename:
        original_matches: list[Path] = []
        suffix = f"_{original_filename}"
        for root in roots:
            if not root.exists() or not root.is_dir():
                continue
            for candidate in root.iterdir():
                if str(candidate.resolve(strict=False)) == destination_key:
                    continue
                if (
                    candidate.is_file()
                    and candidate.name.endswith(suffix)
                    and validate_size(expected_size, file_size(candidate))
                ):
                    original_matches.append(candidate)

        if original_matches:
            return sorted(original_matches)[0]

    archive_root = REPO_ROOT / "_archive"
    if archive_root.exists():
        matches = sorted(path for path in archive_root.rglob(filename) if path.is_file())
        for match in matches:
            if str(match.resolve(strict=False)) != destination_key:
                return match

        if original_filename:
            suffix = f"_{original_filename}"
            matches = sorted(
                path
                for path in archive_root.rglob("*")
                if path.is_file()
                and path.name.endswith(suffix)
                and validate_size(expected_size, file_size(path))
            )
            for match in matches:
                if str(match.resolve(strict=False)) != destination_key:
                    return match

    return None


def file_size(path: Path) -> int | None:
    try:
        return path.stat().st_size
    except OSError:
        return None


def validate_size(expected: int | None, actual: int | None) -> bool:
    if expected in (None, 0) or actual is None:
        return True
    return expected == actual


def migrate_item(
    attachment: Attachment,
    roots: list[Path],
    apply: bool,
    move: bool,
    overwrite: bool,
) -> MigrationItem:
    filename = attachment.filename or ""
    destination = upload_path(ATTACHMENTS_CATEGORY, filename) if filename else upload_path(ATTACHMENTS_CATEGORY, "")
    expected_size = attachment.file_size

    base = MigrationItem(
        id=attachment.id,
        patient_id=attachment.patient_id,
        filename=filename,
        original_filename=attachment.original_filename or "",
        expected_size=expected_size,
        status="pending",
        destination=str(destination),
    )

    if not is_safe_stored_filename(filename):
        base.status = "invalid_filename"
        base.message = "DB filename is empty, absolute, nested, or has surrounding whitespace."
        return base

    if destination.is_file():
        actual_size = file_size(destination)
        base.actual_size = actual_size
        if validate_size(expected_size, actual_size):
            base.status = "already_ok"
            return base

        source = find_source(filename, attachment.original_filename or "", expected_size, roots, destination)
        base.source = str(source) if source else None
        if not overwrite:
            base.status = "size_mismatch"
            base.message = "Destination exists but size differs from DB. Use --overwrite only after checking the source."
            return base
        if not source:
            base.status = "size_mismatch"
            base.message = "Destination exists with wrong size and no alternate source was found."
            return base

        source_size = file_size(source)
        base.actual_size = source_size
        if not validate_size(expected_size, source_size):
            base.status = "size_mismatch"
            base.message = "Alternate source exists but its size differs from DB."
            return base

        if apply:
            shutil.copy2(source, destination)
        base.status = "overwritten" if apply else "would_overwrite"
        return base

    source = find_source(filename, attachment.original_filename or "", expected_size, roots, destination)
    base.source = str(source) if source else None
    if not source:
        base.status = "missing"
        base.message = "No physical file found in destination or source candidates."
        return base

    source_size = file_size(source)
    base.actual_size = source_size
    if not validate_size(expected_size, source_size):
        base.status = "size_mismatch"
        base.message = "Found source file but its size differs from DB."
        return base

    if apply:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if move:
            shutil.move(str(source), str(destination))
        else:
            shutil.copy2(source, destination)
        base.status = "moved" if move else "copied"
    else:
        base.status = "would_move" if move else "would_copy"

    return base


def summarize(items: list[MigrationItem]) -> dict[str, int]:
    summary: dict[str, int] = {"total": len(items)}
    for item in items:
        summary[item.status] = summary.get(item.status, 0) + 1
    return summary


def print_report(items: list[MigrationItem], summary: dict[str, int], apply: bool) -> None:
    print("Attachment file migration")
    print(f"Mode: {'APPLY' if apply else 'DRY-RUN'}")
    print(f"Upload root: {upload_root()}")
    print(f"Attachment destination: {upload_path(ATTACHMENTS_CATEGORY)}")
    print("Summary:")
    for key in sorted(summary):
        print(f"  {key}: {summary[key]}")

    problem_statuses = {"missing", "size_mismatch", "invalid_filename"}
    problems = [item for item in items if item.status in problem_statuses]
    if problems:
        print("\nProblems:")
        for item in problems[:100]:
            print(
                f"  #{item.id} patient={item.patient_id} status={item.status} "
                f"file={item.filename!r} expected={item.expected_size} actual={item.actual_size}"
            )
            if item.source:
                print(f"    source: {item.source}")
            if item.message:
                print(f"    note: {item.message}")
        if len(problems) > 100:
            print(f"  ... {len(problems) - 100} more problem rows omitted from console output")


def main() -> int:
    args = parse_args()
    apply = bool(args.apply)

    if args.move and not apply:
        print("ERROR: --move requires --apply. Run dry-run first, then apply with --move if needed.", file=sys.stderr)
        return 2

    flask_app = Flask("qlpk_attachment_migration", root_path=str(REPO_ROOT))
    with flask_app.app_context():
        upload_dir(ATTACHMENTS_CATEGORY)
        roots = candidate_roots(args.source_root)

        db = SessionLocal()
        try:
            query = db.query(Attachment).order_by(asc(Attachment.id))
            if args.limit:
                query = query.limit(args.limit)
            attachments = query.all()
        finally:
            db.close()

        items = [
            migrate_item(
                attachment,
                roots=roots,
                apply=apply,
                move=bool(args.move),
                overwrite=bool(args.overwrite),
            )
            for attachment in attachments
        ]
        summary = summarize(items)
        print_report(items, summary, apply)

        if args.report_json:
            args.report_json.parent.mkdir(parents=True, exist_ok=True)
            args.report_json.write_text(
                json.dumps(
                    {
                        "mode": "apply" if apply else "dry-run",
                        "upload_root": str(upload_root()),
                        "attachment_destination": str(upload_path(ATTACHMENTS_CATEGORY)),
                        "summary": summary,
                        "items": [asdict(item) for item in items],
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(f"\nJSON report written: {args.report_json}")

        unresolved = summary.get("missing", 0) + summary.get("size_mismatch", 0) + summary.get("invalid_filename", 0)
        return 1 if unresolved else 0


if __name__ == "__main__":
    raise SystemExit(main())
