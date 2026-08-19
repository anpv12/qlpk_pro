"""remove the unused patient-level symptom duplicate"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_drop_patient_symptoms"
down_revision: Union[str, Sequence[str], None] = "20260805_drop_exam_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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


def upgrade() -> None:
    if not _column_exists("patients", "main_symptoms"):
        return

    op.execute(
        sa.text(
            """
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT
                'patients',
                id::text,
                jsonb_build_object('main_symptoms', main_symptoms),
                'Archived before removing patient-level symptom duplicate'
            FROM patients
            WHERE main_symptoms IS NOT NULL AND btrim(main_symptoms) <> ''
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = legacy_database_archive.legacy_fields || EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )
    op.drop_column("patients", "main_symptoms")


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after patient symptom cleanup")
