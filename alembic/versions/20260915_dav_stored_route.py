"""Store derived DAV routes separately from upstream values.

Backfill existing rows with scripts/persist_dav_route_suggestions.py after
upgrade. Rule evaluation belongs to that versioned writer, not this migration.
"""
from alembic import op
import sqlalchemy as sa

revision = '20260915_dav_stored_route'
down_revision = '20260912_dav_search_indexes'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('medicine_reference_catalog', sa.Column('suggested_route', sa.Text(), nullable=True))
    op.add_column('medicine_reference_catalog', sa.Column('suggested_route_rule_version', sa.String(32), nullable=True))


def downgrade():
    op.drop_column('medicine_reference_catalog', 'suggested_route_rule_version')
    op.drop_column('medicine_reference_catalog', 'suggested_route')
