"""Preserve full DAV names and strengths in future prescription snapshots."""
from alembic import op
import sqlalchemy as sa

revision = '20260912_dav_prescription_text'
down_revision = '20260912_medicine_dav_link'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('prescription_items', 'medicine_name', type_=sa.String(500), existing_type=sa.String(255))
    op.alter_column('prescription_items', 'strength', type_=sa.Text(), existing_type=sa.String(100))


def downgrade():
    op.alter_column('prescription_items', 'medicine_name', type_=sa.String(255), existing_type=sa.String(500))
    op.alter_column('prescription_items', 'strength', type_=sa.String(100), existing_type=sa.Text())
