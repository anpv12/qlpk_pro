"""Link submitted surveys to their clinical order and session."""
from alembic import op
import sqlalchemy as sa
revision = '20260905_order_survey_lifecycle'
down_revision = '20260901_reconcile_doctor_legacy'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('chi_dinh', sa.Column('survey_sent_at', sa.DateTime(timezone=True)))
    op.add_column('chi_dinh', sa.Column('completed_at', sa.DateTime(timezone=True)))
    for table in ('survey_sessions', 'survey_responses'):
        op.add_column(table, sa.Column('order_id', sa.Integer(), sa.ForeignKey('chi_dinh.id', ondelete='SET NULL')))
        op.create_index('ix_' + table + '_order_id', table, ['order_id'])
    op.add_column('survey_sessions', sa.Column('survey_template_id', sa.Integer(), sa.ForeignKey('survey_templates.id')))
    op.add_column('survey_responses', sa.Column('session_id', sa.Integer(), sa.ForeignKey('survey_sessions.id', ondelete='SET NULL')))
    op.create_unique_constraint('uq_survey_responses_session_id', 'survey_responses', ['session_id'])
    op.add_column('survey_responses', sa.Column('template_snapshot', sa.JSON()))
    # Only unambiguous identities are backfilled. Response content/scores are untouched.
    op.execute("""UPDATE survey_responses r SET order_id=x.order_id FROM (
        SELECT r.id,min(o.id) order_id FROM survey_responses r
        JOIN examinations e ON e.id=r.examination_id AND e.patient_id=r.patient_id
        JOIN chi_dinh o ON o.appointment_id=e.appointment_id AND o.survey_template_id=r.survey_template_id
        GROUP BY r.id HAVING count(o.id)=1) x WHERE r.id=x.id""")
    op.execute("""UPDATE survey_sessions s SET order_id=x.order_id,survey_template_id=x.template_id FROM (
        SELECT s.id,min(o.id) order_id,min(o.survey_template_id) template_id FROM survey_sessions s
        JOIN examinations e ON e.id=s.examination_id AND e.patient_id=s.patient_id
        JOIN chi_dinh o ON o.appointment_id=e.appointment_id AND o.survey_template_id IS NOT NULL
        GROUP BY s.id HAVING count(o.id)=1) x WHERE s.id=x.id""")
    op.execute("UPDATE chi_dinh SET status='sent',is_completed=false WHERE status IN ('draft','processing')")
    op.execute("UPDATE chi_dinh SET is_completed=(status='completed')")
    op.execute("""UPDATE chi_dinh o SET survey_sent_at=x.sent_at,
        status=CASE WHEN o.status='completed' THEN o.status ELSE 'survey_sent' END
        FROM (SELECT order_id,min(created_at) AT TIME ZONE 'UTC' sent_at FROM survey_sessions
        WHERE order_id IS NOT NULL GROUP BY order_id) x WHERE o.id=x.order_id""")
    op.create_check_constraint('ck_chi_dinh_status', 'chi_dinh', "status IN ('sent','survey_sent','completed')")
    op.create_check_constraint('ck_chi_dinh_completed', 'chi_dinh', "is_completed = (status = 'completed')")

def downgrade():
    op.drop_constraint('ck_chi_dinh_completed','chi_dinh',type_='check')
    op.drop_constraint('ck_chi_dinh_status','chi_dinh',type_='check')
    op.execute("UPDATE chi_dinh SET status='sent' WHERE status='survey_sent'")
    op.drop_column('survey_responses','template_snapshot')
    op.drop_constraint('uq_survey_responses_session_id','survey_responses',type_='unique')
    op.drop_column('survey_responses','session_id')
    op.drop_column('survey_sessions','survey_template_id')
    for table in ('survey_sessions','survey_responses'):
        op.drop_index('ix_'+table+'_order_id',table_name=table)
        op.drop_column(table,'order_id')
    op.drop_column('chi_dinh','completed_at')
    op.drop_column('chi_dinh','survey_sent_at')
