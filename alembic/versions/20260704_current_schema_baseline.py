"""current schema baseline

Revision ID: 20260704_legacy_db_cleanup
Revises: 
Create Date: 2026-07-05

This baseline supersedes the legacy multi-head migration graph archived under
``_archive/alembic-prebaseline-20260705``. The local database was already
stamped at this revision before the graph reset, so existing environments do
not need to run schema-changing SQL for this revision.
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401 - register all live model tables


revision: str = "20260704_legacy_db_cleanup"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the current live schema on a fresh database."""
    # Current model metadata includes DAV trigram search indexes.
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    """Prevent accidental destructive downgrade of the baseline schema."""
    raise RuntimeError("Downgrade is not supported for the current schema baseline")
