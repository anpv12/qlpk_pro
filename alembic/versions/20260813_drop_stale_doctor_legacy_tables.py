"""Reconcile and remove physically stale Doctor legacy tables.

The 2026-08-05 cleanup revisions already removed these tables from the
canonical schema.  Some databases can still carry the old physical tables
because the revisions were marked applied after a restore or schema drift.
Archive any rows once more, then remove the tables and their orphaned
sequences without cascading into live tables.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260813_drop_doctor_legacy"
down_revision: Union[str, Sequence[str], None] = "20260808_clean_allergy_ph"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_TABLES = (
    ("examination_diagnosis", "examination_diagnosis_id_seq"),
    ("examination_prescriptions", "examination_prescriptions_id_seq"),
    ("examination_records", "examination_records_id_seq"),
    ("medical_records", "medical_records_id_seq"),
)


def _table_exists(table_name: str) -> bool:
    return bool(
        op.get_bind()
        .execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :table_name
                """
            ),
            {"table_name": table_name},
        )
        .scalar()
    )


def _archive_table(table_name: str) -> None:
    if not _table_exists(table_name):
        return
    if not _table_exists("legacy_database_archive"):
        raise RuntimeError(
            "legacy_database_archive is required before dropping Doctor legacy tables"
        )

    # Names are fixed constants above; interpolating them keeps PostgreSQL's
    # row-to-JSON conversion parameter-safe for the archive payload.
    op.get_bind().execute(
        sa.text(
            f"""
            INSERT INTO public.legacy_database_archive
                (source_table, source_pk, legacy_fields, notes)
            SELECT :source_table, legacy_row.id::text, to_jsonb(legacy_row), :notes
            FROM public."{table_name}" AS legacy_row
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        ),
        {
            "source_table": table_name,
            "notes": "Archived before removing a stale Doctor legacy table",
        },
    )


def upgrade() -> None:
    for table_name, _ in LEGACY_TABLES:
        _archive_table(table_name)

    for table_name, sequence_name in LEGACY_TABLES:
        # Do not use CASCADE: an unexpected live dependency must stop the
        # migration instead of silently deleting another workflow's relation.
        op.execute(sa.text(f'DROP TABLE IF EXISTS public."{table_name}"'))
        op.execute(sa.text(f'DROP SEQUENCE IF EXISTS public."{sequence_name}"'))


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after Doctor legacy table cleanup")
