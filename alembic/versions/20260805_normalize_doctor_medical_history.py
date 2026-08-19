"""Normalize the Doctor medical-history contract and detail ownership."""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.utils.risk_assessment import normalize_risk_assessment


revision: str = "20260805_norm_med_history"
down_revision: Union[str, Sequence[str], None] = "20260805_drop_doc_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _canonical_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _normalize_risk_column(connection) -> None:
    inspector = sa.inspect(connection)
    columns = {column["name"]: column for column in inspector.get_columns("examinations")}
    risk_column = columns.get("risk_assessment")
    if not risk_column:
        return

    is_jsonb = isinstance(risk_column["type"], postgresql.JSONB)
    rows = connection.execute(
        sa.text("SELECT id, risk_assessment FROM examinations ORDER BY id")
    ).mappings().all()

    if is_jsonb:
        update_sql = sa.text(
            "UPDATE examinations "
            "SET risk_assessment = CAST(:value AS jsonb) "
            "WHERE id = :id"
        )
        for row in rows:
            connection.execute(
                update_sql,
                {
                    "id": row["id"],
                    "value": _canonical_json(normalize_risk_assessment(row["risk_assessment"], allow_legacy=True)),
                },
            )
        return

    op.add_column(
        "examinations",
        sa.Column("risk_assessment_canonical", postgresql.JSONB(), nullable=True),
    )
    update_sql = sa.text(
        "UPDATE examinations "
        "SET risk_assessment_canonical = CAST(:value AS jsonb) "
        "WHERE id = :id"
    )
    for row in rows:
        connection.execute(
            update_sql,
            {
                "id": row["id"],
                "value": _canonical_json(normalize_risk_assessment(row["risk_assessment"], allow_legacy=True)),
            },
        )
    op.drop_column("examinations", "risk_assessment")
    op.alter_column(
        "examinations",
        "risk_assessment_canonical",
        new_column_name="risk_assessment",
    )


def _normalize_patient_json(connection) -> None:
    for field_name, expected_type in (
        ("physical_history", "array"),
        ("family_history", "array"),
        ("substance_use_history", "object"),
        ("safety_plan", "object"),
    ):
        connection.execute(
            sa.text(
                """
                INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
                SELECT
                    'patients_medical_history_normalization',
                    patients.id::text || ':' || :field_name,
                    jsonb_build_object(:field_name, patients.""" + field_name + """),
                    'Archived non-canonical patient medical-history JSON before normalization'
                FROM patients
                WHERE patients.""" + field_name + """ IS NOT NULL
                  AND jsonb_typeof(patients.""" + field_name + """) NOT IN ('null', :expected_type)
                  AND patients.""" + field_name + """ <> '""'::jsonb
                ON CONFLICT (source_table, source_pk) DO UPDATE
                SET legacy_fields = EXCLUDED.legacy_fields,
                    notes = EXCLUDED.notes,
                    archived_at = now()
                """
            ),
            {"field_name": field_name, "expected_type": expected_type},
        )
    connection.execute(
        sa.text(
            "UPDATE patients SET physical_history = '[]'::jsonb "
            "WHERE physical_history IS NULL OR jsonb_typeof(physical_history) <> 'array'"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE patients SET family_history = '[]'::jsonb "
            "WHERE family_history IS NULL OR jsonb_typeof(family_history) <> 'array'"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE patients SET substance_use_history = '{}'::jsonb "
            "WHERE substance_use_history IS NULL "
            "OR jsonb_typeof(substance_use_history) <> 'object'"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE patients SET safety_plan = '{}'::jsonb "
            "WHERE safety_plan IS NULL OR jsonb_typeof(safety_plan) <> 'object'"
        )
    )


def _archive_and_remove_duplicate_details(connection) -> None:
    connection.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY examination_id, section, field_name
                        ORDER BY updated_at DESC NULLS LAST, id DESC
                    ) AS row_number
                FROM examination_details
            )
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT
                'examination_details_duplicate',
                details.id::text,
                to_jsonb(details),
                'Archived before enforcing one Doctor detail per examination/section/field'
            FROM examination_details AS details
            JOIN ranked ON ranked.id = details.id
            WHERE ranked.row_number > 1
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )
    connection.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY examination_id, section, field_name
                        ORDER BY updated_at DESC NULLS LAST, id DESC
                    ) AS row_number
                FROM examination_details
            )
            DELETE FROM examination_details AS details
            USING ranked
            WHERE ranked.id = details.id
              AND ranked.row_number > 1
            """
        )
    )


def _ensure_detail_unique_constraint(connection) -> None:
    constraint_name = "uq_examination_details_examination_section_field"
    existing = {
        item["name"]
        for item in sa.inspect(connection).get_unique_constraints("examination_details")
    }
    if constraint_name not in existing:
        op.create_unique_constraint(
            constraint_name,
            "examination_details",
            ["examination_id", "section", "field_name"],
        )


def upgrade() -> None:
    connection = op.get_bind()
    _normalize_patient_json(connection)
    _normalize_risk_column(connection)
    _archive_and_remove_duplicate_details(connection)
    _ensure_detail_unique_constraint(connection)


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after medical-history normalization")
