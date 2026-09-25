"""Audit immediate medicine price changes without inventing past effective dates."""
from alembic import op
import sqlalchemy as sa

revision = '20260915_medicine_price_history'
down_revision = '20260915_dav_stored_route'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('medicine_price_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('medicine_id', sa.Integer(), sa.ForeignKey('medicines.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('old_price', sa.Numeric(10, 2), nullable=True),
        sa.Column('new_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('effective_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('effective_to', sa.DateTime(timezone=True), nullable=True),
        sa.Column('changed_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.CheckConstraint('new_price >= 0 AND (old_price IS NULL OR old_price >= 0)', name='ck_medicine_price_nonnegative'),
        sa.CheckConstraint('effective_to IS NULL OR effective_to > effective_from', name='ck_medicine_price_interval'))
    op.create_index('uq_medicine_price_open', 'medicine_price_history', ['medicine_id'], unique=True,
                    postgresql_where=sa.text('effective_to IS NULL'))
    op.create_index('ix_medicine_price_timeline', 'medicine_price_history', ['medicine_id', 'id'])


def downgrade():
    op.drop_table('medicine_price_history')
