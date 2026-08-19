"""Remove all F10-F19 ICD entries from patient physical history."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_sanitize_substance"
down_revision: Union[str, Sequence[str], None] = "20260805_dedupe_substance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()

    connection.execute(
        sa.text(
            r"""
            WITH substance_items AS (
                SELECT p.id, jsonb_agg(items.item ORDER BY items.ord) AS removed_items
                FROM patients AS p
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof(p.physical_history) = 'array' THEN p.physical_history
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY AS items(item, ord)
                JOIN icd ON icd.id = CASE
                    WHEN items.item->>'id' ~ '^[0-9]+$' THEN (items.item->>'id')::integer
                    ELSE NULL
                END
                WHERE items.item->>'type' = 'icd'
                  AND icd.icd_code ~ '^F1[0-9](\.|$)'
                GROUP BY p.id
            )
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT
                'patients',
                substance_items.id::text,
                jsonb_build_object(
                    'physical_history_substance_category_items',
                    substance_items.removed_items
                ),
                'Archived F10-F19 ICD entries before enforcing the physical-history owner boundary'
            FROM substance_items
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = legacy_database_archive.legacy_fields || EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )

    connection.execute(
        sa.text(
            r"""
            WITH cleaned AS (
                SELECT p.id,
                       jsonb_agg(items.item ORDER BY items.ord)
                           FILTER (WHERE NOT (
                               items.item->>'type' = 'icd'
                               AND EXISTS (
                                   SELECT 1
                                   FROM icd
                                   WHERE icd.id = CASE
                                       WHEN items.item->>'id' ~ '^[0-9]+$' THEN (items.item->>'id')::integer
                                       ELSE NULL
                                   END
                                   AND icd.icd_code ~ '^F1[0-9](\.|$)'
                               )
                           )) AS physical_history
                FROM patients AS p
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof(p.physical_history) = 'array' THEN p.physical_history
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY AS items(item, ord)
                GROUP BY p.id
            )
            UPDATE patients AS p
            SET physical_history = COALESCE(cleaned.physical_history, '[]'::jsonb)
            FROM cleaned
            WHERE cleaned.id = p.id
              AND cleaned.physical_history IS DISTINCT FROM p.physical_history
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after substance-history sanitization")
