"""Remove Doctor legacy tables left behind by a stamped migration.

The original cleanup revision already removes these tables for databases that
run the full migration chain.  A restored database can still be stamped at
that revision while retaining the physical tables, so this reconciliation
keeps the schema gate truthful without touching any live table.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260901_reconcile_doctor_legacy"
down_revision: Union[str, Sequence[str], None] = "20260831_drop_order_catalog_perm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_TABLES = (
    ("examination_diagnosis", "examination_diagnosis_id_seq"),
    ("examination_prescriptions", "examination_prescriptions_id_seq"),
    ("examination_records", "examination_records_id_seq"),
    ("medical_records", "medical_records_id_seq"),
)


def _table_exists(connection, table_name: str) -> bool:
    return bool(
        connection.execute(
            sa.text("SELECT to_regclass(:table_name) IS NOT NULL"),
            {"table_name": f"public.{table_name}"},
        ).scalar()
    )


def _archive_table(connection, table_name: str) -> None:
    if not _table_exists(connection, table_name):
        return

    if not _table_exists(connection, "legacy_database_archive"):
        raise RuntimeError(
            "legacy_database_archive is required before removing Doctor legacy tables"
        )

    connection.execute(
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
            "notes": "Archived before reconciling a stale Doctor legacy table",
        },
    )


def upgrade() -> None:
    connection = op.get_bind()

    for table_name, _ in LEGACY_TABLES:
        _archive_table(connection, table_name)

    for table_name, sequence_name in LEGACY_TABLES:
        # RESTRICT is intentional: an unexpected live dependency must stop
        # the migration instead of deleting another workflow's relation.
        connection.execute(sa.text(f'DROP TABLE IF EXISTS public."{table_name}"'))
        connection.execute(sa.text(f'DROP SEQUENCE IF EXISTS public."{sequence_name}"'))


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after Doctor legacy cleanup")
