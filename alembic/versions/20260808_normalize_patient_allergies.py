"""Normalize patients.allergies from packed text to canonical JSONB rows."""

from __future__ import annotations

import json
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260808_normalize_allergies"
down_revision: Union[str, Sequence[str], None] = "20260805_sanitize_substance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _parse_legacy_value(raw: str) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for raw_entry in re.split(r"\s*;\s*|\r?\n", raw or ""):
        part = raw_entry.strip()
        if not part:
            continue
        pieces = [piece.strip() for piece in part.split("|")]
        name = pieces[0]
        if not name:
            continue
        level = pieces[1].lower() if len(pieces) > 1 else ""
        if level not in {"", "nghi_ngo", "chac_chan"}:
            level = ""
        entries.append({
            "name": name,
            "level": level,
            "symptom": "|".join(pieces[2:]).strip() if len(pieces) > 2 else "",
        })
    return entries


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, allergies
            FROM patients
            WHERE allergies IS NOT NULL AND btrim(allergies) <> ''
            ORDER BY id
            """
        )
    ).mappings().all()

    for row in rows:
        raw_value = str(row["allergies"])
        connection.execute(
            sa.text(
                """
                INSERT INTO legacy_database_archive
                    (source_table, source_pk, legacy_fields, notes)
                VALUES
                    ('patients', :source_pk,
                     jsonb_build_object('allergies_text', CAST(:raw_value AS text)),
                     'Archived packed-text allergies before canonical JSONB migration')
                ON CONFLICT (source_table, source_pk) DO UPDATE
                SET legacy_fields = legacy_database_archive.legacy_fields || EXCLUDED.legacy_fields,
                    notes = EXCLUDED.notes,
                    archived_at = now()
                """
            ),
            {"source_pk": str(row["id"]), "raw_value": raw_value},
        )
        connection.execute(
            sa.text("UPDATE patients SET allergies = :value WHERE id = :patient_id"),
            {"patient_id": row["id"], "value": json.dumps(_parse_legacy_value(raw_value), ensure_ascii=False)},
        )

    op.execute(
        """
        ALTER TABLE patients
        ALTER COLUMN allergies TYPE jsonb
        USING CASE
            WHEN allergies IS NULL OR btrim(allergies) = '' THEN '[]'::jsonb
            ELSE allergies::jsonb
        END
        """
    )
    op.alter_column(
        "patients",
        "allergies",
        existing_type=sa.JSON(),
        server_default=sa.text("'[]'::jsonb"),
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after allergy contract migration")
