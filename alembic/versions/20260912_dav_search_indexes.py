"""Index DAV's accent-insensitive contains search and first-page ordering."""
from alembic import op
import sqlalchemy as sa

revision = '20260912_dav_search_indexes'
down_revision = '20260912_dav_prescription_text'
branch_labels = None
depends_on = None

# Frozen copy of normalized_text_expression. Changing search normalization
# later requires rebuilding these expression indexes in a new migration.
SEARCH_FROM = ('àáảãạăắằẳẵặâấầẩẫậ' 'èéẻẽẹêếềểễệ' 'ìíỉĩị'
               'òóỏõọôốồổỗộơớờởỡợ' 'ùúủũụưứừửữự' 'ỳýỷỹỵđ')
SEARCH_TO = ('aaaaaaaaaaaaaaaaa' 'eeeeeeeeeee' 'iiiii'
             'ooooooooooooooooo' 'uuuuuuuuuuu' 'yyyyyd')
SEARCH_FROM += SEARCH_FROM.upper()
SEARCH_TO += SEARCH_TO.upper()
FIELDS = ('name', 'active_ingredient', 'registration_number',
          'old_registration_number', 'source_id', 'manufacturer_name')


def _repair_invalid_index(name):
    if op.get_context().as_sql:
        return
    valid = op.get_bind().execute(sa.text(
        "SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relname=:name"
    ), {'name': name}).scalar()
    if valid is False:
        op.execute(f'DROP INDEX CONCURRENTLY public.{name}')


def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    with op.get_context().autocommit_block():
        for field in FIELDS:
            name = f'idx_dav_norm_{field}_trgm'
            # A cancelled concurrent build can leave an invalid index. Only
            # repair names owned by this migration when retrying its upgrade.
            _repair_invalid_index(name)
            expression = f"lower(translate({field}, '{SEARCH_FROM}', '{SEARCH_TO}'))"
            op.execute(f'CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} '
                       f'ON public.medicine_reference_catalog USING gin ({expression} gin_trgm_ops)')
        _repair_invalid_index('idx_dav_name_order')
        op.execute('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dav_name_order '
                   'ON public.medicine_reference_catalog (name, registration_number, id)')
    op.execute('ANALYZE public.medicine_reference_catalog')


def downgrade():
    with op.get_context().autocommit_block():
        op.execute('DROP INDEX CONCURRENTLY IF EXISTS public.idx_dav_name_order')
        for field in reversed(FIELDS):
            op.execute(f'DROP INDEX CONCURRENTLY IF EXISTS public.idx_dav_norm_{field}_trgm')
