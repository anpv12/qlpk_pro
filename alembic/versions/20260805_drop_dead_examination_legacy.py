"""Archive and remove empty legacy examination tables.

The live workflows use ``examinations``, ``examination_details`` and the
canonical prescription tables. These tables have no current owner or rows.
Archive first so a non-empty environment remains recoverable before removal.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_drop_dead_exam_legacy"
down_revision: Union[str, Sequence[str], None] = "20260805_drop_doc_detail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_TABLES = (
    "examination_prescriptions",
    "examination_records",
    "medical_records",
)


def _table_exists(table_name: str) -> bool:
    return bool(
        op.get_bind().execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :table_name
                """
            ),
            {"table_name": table_name},
        ).scalar()
    )


def _archive_table(table_name: str) -> None:
    if not _table_exists(table_name):
        return

    op.get_bind().execute(
        sa.text(
            f"""
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT :source_table, legacy_row.id::text, to_jsonb(legacy_row), :notes
            FROM {table_name} AS legacy_row
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        ),
        {
            "source_table": table_name,
            "notes": "Archived before removing an empty/unowned legacy examination table",
        },
    )


def upgrade() -> None:
    for table_name in LEGACY_TABLES:
        _archive_table(table_name)
    for table_name in LEGACY_TABLES:
        if _table_exists(table_name):
            op.drop_table(table_name)


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after legacy examination table cleanup")
