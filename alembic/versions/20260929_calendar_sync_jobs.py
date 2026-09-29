"""Durable Google Calendar sync requests for appointment create/update/cancel/re-examination."""
from alembic import op
import sqlalchemy as sa

revision = '20260929_calendar_sync_jobs'
down_revision = '20260928_calendar_transfer_jobs'
branch_labels = None
depends_on = None

TABLE = 'google_calendar_sync_jobs'
COLUMNS = {'id', 'appointment_id', 'token', 'attempts', 'next_attempt_at', 'completed_at', 'last_error', 'created_at'}
INDEXES = {
    'ix_google_calendar_sync_jobs_appointment_id': ['appointment_id'],
    'ix_google_calendar_sync_jobs_next_attempt_at': ['next_attempt_at'],
}


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table(TABLE):
        columns = {column['name'] for column in inspector.get_columns(TABLE)}
        if columns != COLUMNS:
            raise RuntimeError(f'{TABLE} exists with an unexpected schema; reconcile it before upgrading.')
    else:
        op.create_table(
            TABLE,
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('appointment_id', sa.Integer(), sa.ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False),
            sa.Column('token', sa.String(32), nullable=False),
            sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('completed_at', sa.DateTime(timezone=True)),
            sa.Column('last_error', sa.String(80)),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    existing = {index['name'] for index in sa.inspect(op.get_bind()).get_indexes(TABLE)}
    for name, columns in INDEXES.items():
        if name not in existing:
            op.create_index(name, TABLE, columns)


def downgrade():
    op.drop_table(TABLE)
