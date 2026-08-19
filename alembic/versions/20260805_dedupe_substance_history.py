"""Remove substance-use ICD entries duplicated in patient physical history."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_dedupe_substance"
down_revision: Union[str, Sequence[str], None] = "20260805_norm_med_history"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SUBSTANCE_CODES = (
    ("F10", "alcohol_used"),
    ("F11", "opioids_used"),
    ("F12", "cannabis_used"),
    ("F13", "sedatives_used"),
    ("F14", "cocaine_used"),
    ("F15", "stimulants_used"),
    ("F16", "hallucinogens_used"),
    ("F17", "tobacco_used"),
    ("F18", "inhalants_used"),
    ("F19", "other_substance_used"),
)


def _substance_values_sql() -> str:
    return ", ".join(
        "('%s', '%s')" % (code, usage_key)
        for code, usage_key in SUBSTANCE_CODES
    )


def upgrade() -> None:
    connection = op.get_bind()
    substance_values = _substance_values_sql()

    duplicate_items = f"""
        WITH substance_codes(icd_code, usage_key) AS (
            VALUES {substance_values}
        )
        SELECT p.id, jsonb_agg(items.item ORDER BY items.ord) AS duplicate_items
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
        JOIN substance_codes ON substance_codes.icd_code = icd.icd_code
        WHERE items.item->>'type' = 'icd'
          AND p.substance_use_history->>substance_codes.usage_key = 'true'
        GROUP BY p.id
    """

    connection.execute(
        sa.text(
            f"""
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT
                'patients',
                duplicate_rows.id::text,
                jsonb_build_object(
                    'physical_history_substance_duplicates',
                    duplicate_rows.duplicate_items
                ),
                'Archived substance-use ICD entries before removing their duplicate patient physical-history representation'
            FROM ({duplicate_items}) AS duplicate_rows
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = legacy_database_archive.legacy_fields || EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )

    connection.execute(
        sa.text(
            f"""
            WITH substance_codes(icd_code, usage_key) AS (
                VALUES {substance_values}
            ), duplicate_positions AS (
                SELECT p.id, items.ord
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
                JOIN substance_codes ON substance_codes.icd_code = icd.icd_code
                WHERE items.item->>'type' = 'icd'
                  AND p.substance_use_history->>substance_codes.usage_key = 'true'
            ), cleaned AS (
                SELECT p.id,
                       jsonb_agg(items.item ORDER BY items.ord)
                           FILTER (WHERE duplicate_positions.ord IS NULL) AS physical_history
                FROM patients AS p
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof(p.physical_history) = 'array' THEN p.physical_history
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY AS items(item, ord)
                LEFT JOIN duplicate_positions
                    ON duplicate_positions.id = p.id
                   AND duplicate_positions.ord = items.ord
                GROUP BY p.id
            )
            UPDATE patients AS p
            SET physical_history = COALESCE(cleaned.physical_history, '[]'::jsonb)
            FROM cleaned
            WHERE cleaned.id = p.id
              AND EXISTS (
                  SELECT 1 FROM duplicate_positions
                  WHERE duplicate_positions.id = p.id
              )
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after substance-history deduplication")
