"""Link clinic medicines to DAV without rewriting legacy stock or prescriptions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260912_medicine_dav_link'
down_revision = '20260910_inventory_receipts'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('medicines', sa.Column('reference_catalog_id', sa.Integer(), nullable=True))
    op.add_column('medicines', sa.Column('reference_snapshot', postgresql.JSONB(), nullable=True))
    op.create_foreign_key('fk_medicines_reference_catalog', 'medicines', 'medicine_reference_catalog', ['reference_catalog_id'], ['id'], ondelete='RESTRICT')
    op.create_unique_constraint('uq_medicines_reference_catalog', 'medicines', ['reference_catalog_id'])
    op.create_unique_constraint('uq_medicine_reference_source', 'medicine_reference_catalog', ['source', 'source_id'])
    op.alter_column('medicines', 'name', type_=sa.String(500), existing_type=sa.String(255))
    op.alter_column('medicines', 'generic_name', type_=sa.Text(), existing_type=sa.String(255))
    op.alter_column('medicines', 'strength', type_=sa.Text(), existing_type=sa.String(100))


def downgrade():
    if op.get_bind().execute(sa.text('SELECT 1 FROM medicines WHERE reference_catalog_id IS NOT NULL LIMIT 1')).first():
        raise RuntimeError('DAV links exist; downgrade would lose verified identity and audit snapshots.')
    op.drop_constraint('uq_medicine_reference_source', 'medicine_reference_catalog', type_='unique')
    op.drop_constraint('uq_medicines_reference_catalog', 'medicines', type_='unique')
    op.drop_constraint('fk_medicines_reference_catalog', 'medicines', type_='foreignkey')
    op.drop_column('medicines', 'reference_snapshot')
    op.drop_column('medicines', 'reference_catalog_id')
    op.alter_column('medicines', 'name', type_=sa.String(255), existing_type=sa.String(500))
    op.alter_column('medicines', 'generic_name', type_=sa.String(255), existing_type=sa.Text())
    op.alter_column('medicines', 'strength', type_=sa.String(100), existing_type=sa.Text())
