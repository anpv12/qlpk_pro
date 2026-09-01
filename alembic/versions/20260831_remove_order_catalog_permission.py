"""Remove persisted permissions and shortcuts for the retired order catalog."""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260831_drop_order_catalog_perm"
down_revision: Union[str, Sequence[str], None] = "20260831_drop_order_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PERMISSION = "ql-danhmuc-chidinh"
_TARGET_URL = "/order-catalog.html"


def _table_exists(connection, table_name: str) -> bool:
    return connection.execute(
        sa.text("SELECT to_regclass(:table_name) IS NOT NULL"),
        {"table_name": f"public.{table_name}"},
    ).scalar()


def _archive_shortcuts(connection) -> None:
    if not _table_exists(connection, "user_shortcuts"):
        return

    rows = connection.execute(
        sa.text(
            "SELECT id, to_jsonb(user_shortcuts) AS payload "
            "FROM public.user_shortcuts WHERE target_url = :target_url"
        ),
        {"target_url": _TARGET_URL},
    ).mappings().all()
    if not rows:
        return
    if not _table_exists(connection, "legacy_database_archive"):
        raise RuntimeError(
            "legacy_database_archive is required before removing catalog shortcuts"
        )

    for row in rows:
        connection.execute(
            sa.text(
                """
                INSERT INTO public.legacy_database_archive
                    (source_table, source_pk, legacy_fields, notes)
                VALUES
                    (:source_table, :source_pk, :legacy_fields, :notes)
                ON CONFLICT (source_table, source_pk) DO UPDATE
                SET legacy_fields = EXCLUDED.legacy_fields,
                    notes = EXCLUDED.notes,
                    archived_at = now()
                """
            ),
            {
                "source_table": "user_shortcuts_order_catalog_cleanup",
                "source_pk": str(row["id"]),
                "legacy_fields": row["payload"],
                "notes": "Archived before removing a shortcut to the retired order catalog",
            },
        )

    connection.execute(
        sa.text("DELETE FROM public.user_shortcuts WHERE target_url = :target_url"),
        {"target_url": _TARGET_URL},
    )


def _remove_group_permission(connection) -> None:
    if not _table_exists(connection, "groups"):
        return

    rows = connection.execute(
        sa.text("SELECT id, permissions FROM public.groups WHERE permissions IS NOT NULL")
    ).mappings().all()
    for row in rows:
        try:
            permissions = json.loads(row["permissions"])
        except (TypeError, ValueError):
            continue
        if not isinstance(permissions, list) or _PERMISSION not in permissions:
            continue
        cleaned = [permission for permission in permissions if permission != _PERMISSION]
        connection.execute(
            sa.text("UPDATE public.groups SET permissions = :permissions WHERE id = :id"),
            {"permissions": json.dumps(cleaned, ensure_ascii=False), "id": row["id"]},
        )


def upgrade() -> None:
    connection = op.get_bind()
    _archive_shortcuts(connection)
    _remove_group_permission(connection)


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported for the removed order catalog permission")
