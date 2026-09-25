"""Link new dispensing evidence to visits without backfilling legacy prices."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260920_medicine_visit_ledger'
down_revision = '20260915_medicine_price_history'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('medicine_transactions', sa.Column('appointment_id', sa.Integer(), nullable=True))
    op.add_column('medicine_transactions', sa.Column('operation_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('medicine_transactions', sa.Column('sale_unit_price', sa.Numeric(15, 2), nullable=True))
    op.add_column('medicine_transactions', sa.Column('original_transaction_id', sa.Integer(), nullable=True))
    op.add_column('medicine_transactions', sa.Column('sale_amount_delta', sa.Numeric(15, 2), nullable=True))
    op.create_foreign_key('fk_medicine_transaction_visit', 'medicine_transactions', 'appointments', ['appointment_id'], ['id'])
    op.create_foreign_key('fk_medicine_transaction_origin', 'medicine_transactions', 'medicine_transactions', ['original_transaction_id'], ['id'])
    for column in ('appointment_id', 'operation_id', 'original_transaction_id'):
        op.create_index('ix_medicine_transactions_' + column, 'medicine_transactions', [column])


def downgrade():
    op.drop_constraint('fk_medicine_transaction_origin', 'medicine_transactions', type_='foreignkey')
    op.drop_constraint('fk_medicine_transaction_visit', 'medicine_transactions', type_='foreignkey')
    for column in ('appointment_id', 'operation_id', 'original_transaction_id'):
        op.drop_index('ix_medicine_transactions_' + column, table_name='medicine_transactions')
    for column in ('sale_amount_delta', 'original_transaction_id', 'sale_unit_price', 'operation_id', 'appointment_id'):
        op.drop_column('medicine_transactions', column)
