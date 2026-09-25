"""Keep repeated lot receipts and future movement balance snapshots."""
from alembic import op
import sqlalchemy as sa

revision = '20260910_inventory_receipts'
down_revision = '20260909_doctor_queue'
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    for constraint in inspector.get_unique_constraints('medicine_batches'):
        if constraint['column_names'] == ['batch_number']:
            op.drop_constraint(constraint['name'], 'medicine_batches', type_='unique')
    for index in inspector.get_indexes('medicine_batches'):
        if index['column_names'] == ['batch_number'] and index.get('unique') and not index.get('duplicates_constraint'):
            op.drop_index(index['name'], table_name='medicine_batches')
    indexes = sa.inspect(op.get_bind()).get_indexes('medicine_batches')
    if not any(i['name'] == 'ix_medicine_batches_batch_number' for i in indexes):
        op.create_index('ix_medicine_batches_batch_number', 'medicine_batches', ['batch_number'])
    op.add_column('medicine_transactions', sa.Column('balance_after', sa.Numeric(10, 2), nullable=True))


def downgrade():
    duplicates = op.get_bind().execute(sa.text(
        'SELECT 1 FROM medicine_batches GROUP BY batch_number HAVING COUNT(*) > 1 LIMIT 1'
    )).first()
    if duplicates:
        raise RuntimeError('Cannot restore unique lot numbers: repeated receipts exist; preserve receipt history.')
    op.drop_column('medicine_transactions', 'balance_after')
    op.drop_index('ix_medicine_batches_batch_number', table_name='medicine_batches')
    op.create_index('ix_medicine_batches_batch_number', 'medicine_batches', ['batch_number'], unique=True)
