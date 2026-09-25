"""Persist in-progress survey answers separately from submitted results."""
from alembic import op
import sqlalchemy as sa

revision = '20260906_survey_live_draft'
down_revision = '20260905_order_survey_closure'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('survey_sessions', sa.Column('draft_responses', sa.JSON(), nullable=True))
    op.add_column('survey_sessions', sa.Column('draft_revision', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('survey_sessions', sa.Column('draft_updated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('survey_sessions', sa.Column('template_snapshot', sa.JSON(), nullable=True))
    # Legacy sessions freeze their currently available template at upgrade time.
    # This does not invent missing drafts or historical template versions.
    op.execute("""UPDATE survey_sessions s SET template_snapshot=
        json_build_object('name', t.name, 'content', t.content)
        FROM survey_templates t WHERE s.survey_template_id=t.id""")


def downgrade():
    for column in ('template_snapshot', 'draft_updated_at', 'draft_revision', 'draft_responses'):
        op.drop_column('survey_sessions', column)
