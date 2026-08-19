"""remove retired Doctor mental-detail aliases"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_drop_doc_detail"
down_revision: Union[str, Sequence[str], None] = "20260805_drop_patient_symptoms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT
                'examination_details',
                id::text,
                to_jsonb(examination_details),
                'Archived before removing retired Doctor mental-detail aliases'
            FROM examination_details
            WHERE section = 'bac_si_kham_kham_tam_than'
              AND field_name IN ('general_manifestations', 'notes')
            ON CONFLICT (source_table, source_pk) DO UPDATE
            SET legacy_fields = EXCLUDED.legacy_fields,
                notes = EXCLUDED.notes,
                archived_at = now()
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM examination_details
            WHERE section = 'bac_si_kham_kham_tam_than'
              AND field_name IN ('general_manifestations', 'notes')
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after Doctor detail alias cleanup")
