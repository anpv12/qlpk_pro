"""Separate available survey results from final closure."""
from alembic import op
import sqlalchemy as sa

revision = '20260905_order_survey_closure'
down_revision = '20260905_order_survey_lifecycle'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('chi_dinh', sa.Column('survey_expires_at', sa.DateTime(timezone=True)))
    op.add_column('chi_dinh', sa.Column('result_at', sa.DateTime(timezone=True)))
    op.add_column('chi_dinh', sa.Column('completion_reason', sa.String(20)))
    op.add_column('chi_dinh', sa.Column('completed_by', sa.Integer(), sa.ForeignKey('users.id')))
    op.create_index('ix_chi_dinh_survey_expires_at', 'chi_dinh', ['survey_expires_at'])
    op.drop_constraint('ck_chi_dinh_status', 'chi_dinh', type_='check')
    op.create_check_constraint('ck_chi_dinh_status', 'chi_dinh', "status IN ('sent','survey_sent','has_result','completed')")
    # Previous completed survey orders meant a successfully validated submission.
    # Do not promote ambiguous legacy responses merely because a row exists.
    op.execute("""UPDATE chi_dinh SET result_at=completed_at, status='has_result',
        is_completed=false,completed_at=NULL WHERE survey_template_id IS NOT NULL
        AND status='completed' AND EXISTS (SELECT 1 FROM survey_responses r WHERE r.order_id=chi_dinh.id)""")
    op.execute("""UPDATE chi_dinh o SET survey_expires_at=s.expires_at AT TIME ZONE 'UTC'
        FROM (SELECT DISTINCT ON (order_id) order_id,expires_at FROM survey_sessions
        WHERE order_id IS NOT NULL ORDER BY order_id,id DESC) s WHERE o.id=s.order_id""")
    op.execute("""UPDATE chi_dinh o SET status='completed',is_completed=true,
        completed_at=survey_expires_at,completion_reason='expired'
        WHERE survey_template_id IS NOT NULL AND status!='completed'
        AND survey_expires_at<=CURRENT_TIMESTAMP""")
    op.execute("""UPDATE survey_sessions s SET status='expired',updated_at=o.completed_at AT TIME ZONE 'UTC'
        FROM chi_dinh o WHERE s.order_id=o.id AND o.completion_reason='expired'
        AND s.status IN ('pending','in_progress')""")


def downgrade():
    op.execute("UPDATE chi_dinh SET status='completed',is_completed=true,completed_at=result_at WHERE status='has_result'")
    op.drop_constraint('ck_chi_dinh_status', 'chi_dinh', type_='check')
    op.create_check_constraint('ck_chi_dinh_status', 'chi_dinh', "status IN ('sent','survey_sent','completed')")
    op.drop_index('ix_chi_dinh_survey_expires_at', table_name='chi_dinh')
    for column in ('completed_by', 'completion_reason', 'result_at', 'survey_expires_at'):
        op.drop_column('chi_dinh', column)
