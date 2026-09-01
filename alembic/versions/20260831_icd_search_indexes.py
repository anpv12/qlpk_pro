"""Add trigram indexes for the normalized ICD search expressions."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.utils.search_normalization import (
    VIETNAMESE_SEARCH_FROM,
    VIETNAMESE_SEARCH_TO,
)


revision: str = "20260831_icd_search"
down_revision: Union[str, Sequence[str], None] = "20260828_survey_perf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalized_expression(column_name: str) -> str:
    source = VIETNAMESE_SEARCH_FROM.replace("'", "''")
    target = VIETNAMESE_SEARCH_TO.replace("'", "''")
    return f"lower(translate({column_name}, '{source}', '{target}'))"


def upgrade() -> None:
    """Make accent-insensitive contains searches indexable in PostgreSQL."""
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    for index_name, column_name in (
        ("ix_icd_icd_code_normalized_trgm", "icd_code"),
        ("ix_icd_disease_name_normalized_trgm", "disease_name"),
    ):
        expression = _normalized_expression(column_name)
        op.execute(
            sa.text(
                f"""
                CREATE INDEX IF NOT EXISTS {index_name}
                ON public.icd USING gin ({expression} gin_trgm_ops)
                WHERE is_deleted = false
                """
            )
        )


def downgrade() -> None:
    """Drop only the indexes owned by this revision; keep pg_trgm available."""
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_icd_disease_name_normalized_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_icd_icd_code_normalized_trgm"))
