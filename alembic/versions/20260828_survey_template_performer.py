"""Add the default performer link for survey templates."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260828_survey_perf"
down_revision: Union[str, Sequence[str], None] = "20260813_drop_doctor_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The current-schema baseline creates tables from the live SQLAlchemy
    # metadata.  IF NOT EXISTS keeps this revision safe for both fresh and
    # already-stamped databases.
    op.execute(
        sa.text(
            """
            ALTER TABLE public.survey_templates
            ADD COLUMN IF NOT EXISTS default_performer_id INTEGER
            REFERENCES public.users(id)
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade is not supported for survey performer ownership")
