"""Archive and remove unowned Doctor detail fields."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_drop_doc_legacy"
down_revision: Union[str, Sequence[str], None] = "20260805_drop_dead_exam_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DOCTOR_SECTIONS = (
    "bac_si_kham_form_kham",
    "bac_si_kham_tien_su",
    "bac_si_kham_kham_tong_quat",
    "bac_si_kham_kham_tam_than",
)


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO legacy_database_archive (source_table, source_pk, legacy_fields, notes)
            SELECT
                'examination_details_doctor_legacy',
                id::text,
                to_jsonb(examination_details),
                'Archived before removing unowned Doctor detail fields'
            FROM examination_details
            WHERE section IN (
                'bac_si_kham_form_kham',
                'bac_si_kham_tien_su',
                'bac_si_kham_kham_tong_quat',
                'bac_si_kham_kham_tam_than'
            )
              AND NOT (
                (section = 'bac_si_kham_form_kham' AND field_name IN ('main_reason'))
                OR (section = 'bac_si_kham_tien_su' AND field_name IN ('medical_history'))
                OR (
                    section = 'bac_si_kham_kham_tong_quat'
                    AND field_name IN (
                        'general_examination', 'bieu_hien_chung', 'circulation',
                        'digestive', 'renal_urogenital', 'musculoskeletal', 'ent',
                        'endocrine_nutrition_others', 'neurological'
                    )
                )
                OR (
                    section = 'bac_si_kham_kham_tam_than'
                    AND field_name IN (
                        'orientation', 'emotions', 'perception', 'thought',
                        'behavior', 'memory', 'intelligence', 'attention'
                    )
                )
              )
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
            WHERE section IN (
                'bac_si_kham_form_kham',
                'bac_si_kham_tien_su',
                'bac_si_kham_kham_tong_quat',
                'bac_si_kham_kham_tam_than'
            )
              AND NOT (
                (section = 'bac_si_kham_form_kham' AND field_name IN ('main_reason'))
                OR (section = 'bac_si_kham_tien_su' AND field_name IN ('medical_history'))
                OR (
                    section = 'bac_si_kham_kham_tong_quat'
                    AND field_name IN (
                        'general_examination', 'bieu_hien_chung', 'circulation',
                        'digestive', 'renal_urogenital', 'musculoskeletal', 'ent',
                        'endocrine_nutrition_others', 'neurological'
                    )
                )
                OR (
                    section = 'bac_si_kham_kham_tam_than'
                    AND field_name IN (
                        'orientation', 'emotions', 'perception', 'thought',
                        'behavior', 'memory', 'intelligence', 'attention'
                    )
                )
              )
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after Doctor detail cleanup")
