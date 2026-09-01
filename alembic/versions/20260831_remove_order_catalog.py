"""Remove the retired clinical-order catalog tables and references.

The clinical indication workflow now accepts free text or a survey template.
Catalog rows are archived before their tables/columns are removed so the
cleanup does not erase the historical values without an audit trail.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260831_drop_order_catalog"
down_revision: Union[str, Sequence[str], None] = "20260831_icd_search"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_ARCHIVE_NOTES = "Archived before removing the retired clinical indication catalog"


def _table_exists(connection, table_name: str) -> bool:
    return connection.execute(
        sa.text("SELECT to_regclass(:table_name) IS NOT NULL"),
        {"table_name": f"public.{table_name}"},
    ).scalar()


def _column_exists(connection, table_name: str, column_name: str) -> bool:
    return connection.execute(
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
    ).scalar() is not None


def _require_archive_table(connection) -> None:
    if not _table_exists(connection, "legacy_database_archive"):
        raise RuntimeError(
            "legacy_database_archive is required before removing the order catalog"
        )


def _archive_table(connection, table_name: str) -> None:
    if not _table_exists(connection, table_name):
        return

    _require_archive_table(connection)
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
            "source_table": f"{table_name}_catalog_cleanup",
            "notes": _ARCHIVE_NOTES,
        },
    )


def _archive_chi_dinh_catalog_fields(connection) -> None:
    if not _table_exists(connection, "chi_dinh"):
        return

    legacy_columns = []
    predicates = []
    if _column_exists(connection, "chi_dinh", "order_item_id"):
        legacy_columns.extend(["'order_item_id'", "order_item_id"])
        predicates.append("order_item_id IS NOT NULL")
    if _column_exists(connection, "chi_dinh", "group_path"):
        legacy_columns.extend(["'group_path'", "NULLIF(BTRIM(group_path), '')"])
        predicates.append("NULLIF(BTRIM(group_path), '') IS NOT NULL")
    if not predicates:
        return

    _require_archive_table(connection)
    legacy_columns.extend(["'order_name'", "order_name", "'appointment_id'", "appointment_id"])
    connection.execute(
        sa.text(
            f"""
            INSERT INTO public.legacy_database_archive
                (source_table, source_pk, legacy_fields, notes)
            SELECT
                'chi_dinh_catalog_cleanup',
                id::text,
                jsonb_strip_nulls(jsonb_build_object({', '.join(legacy_columns)})),
                :notes
            FROM public.chi_dinh
            WHERE {' OR '.join(predicates)}
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        ),
        {"notes": _ARCHIVE_NOTES},
    )


def upgrade() -> None:
    connection = op.get_bind()

    # Archive the dropped catalog records and any historical references first.
    _archive_table(connection, "order_categories")
    _archive_table(connection, "order_items")
    _archive_chi_dinh_catalog_fields(connection)

    if _table_exists(connection, "chi_dinh"):
        connection.execute(
            sa.text(
                "ALTER TABLE public.chi_dinh "
                "DROP CONSTRAINT IF EXISTS chi_dinh_order_item_id_fkey"
            )
        )
        for column_name in ("order_item_id", "group_path"):
            connection.execute(
                sa.text(
                    f"ALTER TABLE public.chi_dinh "
                    f"DROP COLUMN IF EXISTS {column_name}"
                )
            )

    # RESTRICT is intentional: an unexpected external reference must stop the
    # migration instead of silently deleting another application's objects.
    connection.execute(sa.text("DROP TABLE IF EXISTS public.order_items"))
    connection.execute(sa.text("DROP TABLE IF EXISTS public.order_categories"))


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported for the removed order catalog")
