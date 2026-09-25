"""Persist Doctor queue arrival order independently of clinical edits."""
from alembic import op
import sqlalchemy as sa

revision = '20260909_doctor_queue'
down_revision = '20260906_survey_live_draft'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('appointments', sa.Column('doctor_queue_entered_at', sa.DateTime(timezone=True), nullable=True))
    # Only historical transfer records for the current assignee provide a known arrival time.
    op.execute("""UPDATE appointments a SET doctor_queue_entered_at=t.arrived_at
        FROM (SELECT appointment_id, recipient_user_id, MAX(created_at) AS arrived_at
              FROM notifications WHERE event_type='appointment_transferred_to_doctor'
              GROUP BY appointment_id, recipient_user_id) t
        WHERE a.id=t.appointment_id AND a.doctor_id=t.recipient_user_id""")
    op.create_index('ix_appointments_doctor_queue', 'appointments', ['doctor_id', 'doctor_queue_entered_at', 'id'])


def downgrade():
    op.drop_index('ix_appointments_doctor_queue', table_name='appointments')
    op.drop_column('appointments', 'doctor_queue_entered_at')
