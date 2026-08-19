"""Remove placeholder text that was stored as a fake allergy entry."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260808_clean_allergy_ph"
down_revision: Union[str, Sequence[str], None] = "20260808_normalize_allergies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE patients
            SET allergies = '[]'::jsonb
            WHERE jsonb_typeof(allergies) = 'array'
              AND jsonb_array_length(allergies) = 1
              AND lower(btrim(allergies->0->>'name')) IN
                  ('chưa ghi nhận', 'không rõ', 'không có', 'không')
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported after allergy placeholder cleanup")
