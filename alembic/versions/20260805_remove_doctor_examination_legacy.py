"""remove legacy Doctor examination fields and diagnosis table

The live Doctor workflow owns visit symptoms in ``examinations.main_symptoms``
and diagnosis in the canonical examination fields. Archive the unused legacy
values before removing their schema so the cleanup is auditable and recoverable
without keeping a runtime fallback.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260805_drop_exam_legacy"
down_revision: Union[str, Sequence[str], None] = "20260704_legacy_db_cleanup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return bool(op.get_bind().execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalar())


def _column_exists(table_name: str, column_name: str) -> bool:
    return bool(op.get_bind().execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar())


def _create_archive_table() -> None:
    if not _table_exists("legacy_database_archive"):
        op.create_table(
            "legacy_database_archive",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("source_table", sa.String(length=100), nullable=False),
            sa.Column("source_pk", sa.String(length=100), nullable=False),
            sa.Column("legacy_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("source_table", "source_pk", name="uq_legacy_database_archive_source"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legacy_database_archive_source_table "
        "ON legacy_database_archive (source_table)"
    )


def _archive_examination_columns() -> None:
    if not _table_exists("examinations"):
        return
    columns = [column for column in ("symptoms", "prescription", "notes") if _column_exists("examinations", column)]
    if not columns:
        return
    fields = ", ".join(f"'{column}', NULLIF({column}, '')" for column in columns)
    legacy_object = f"jsonb_strip_nulls(jsonb_build_object({fields}))"
    op.execute(
        sa.text(
            f"""
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT 'examinations', id::text, {legacy_object},
                   'Archived before removing legacy examination columns'
            FROM examinations
            WHERE {legacy_object} <> '{{}}'::jsonb
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = legacy_database_archive.legacy_fields || EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )


def _archive_diagnosis_rows() -> None:
    if not _table_exists("examination_diagnosis"):
        return
    op.execute(
        sa.text(
            """
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT 'examination_diagnosis', id::text, to_jsonb(examination_diagnosis),
                   'Archived before removing the unused examination_diagnosis table'
            FROM examination_diagnosis
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )


def upgrade() -> None:
    _create_archive_table()
    _archive_examination_columns()
    _archive_diagnosis_rows()

    for column in ("symptoms", "prescription", "notes"):
        if _column_exists("examinations", column):
            op.drop_column("examinations", column)

    if _table_exists("examination_diagnosis"):
        op.drop_table("examination_diagnosis")


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after Doctor examination legacy cleanup")
