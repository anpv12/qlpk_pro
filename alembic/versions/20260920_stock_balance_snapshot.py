"""Snapshot aggregate inventory for new movements only."""
from alembic import op
import sqlalchemy as sa

revision = '20260920_stock_balance_snapshot'
down_revision = '20260920_medicine_visit_ledger'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('medicine_transactions', sa.Column('stock_balance_after', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('medicine_transactions', 'stock_balance_after')
