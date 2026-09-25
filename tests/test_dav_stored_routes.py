"""Transactional checks for persisted DAV inference and future source sync."""
import os
from copy import deepcopy

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import engine
from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from app.modules.medicines.services.dav_reference_sync import upsert_dav_item
from app.modules.medicines.services.reference_route import ROUTE_RULE_VERSION
from scripts.persist_dav_route_suggestions import apply, prepare, protected_snapshot

pytestmark = pytest.mark.skipif(os.environ.get('QLPK_RUN_DB_TESTS') != '1', reason='Opt-in rollback DB tests')


@pytest.fixture
def db():
    with engine.connect() as connection:
        transaction = connection.begin()
        connection.execute(text("SET LOCAL statement_timeout = '30s'"))
        session = Session(bind=connection)
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


def test_backfill_preserves_protected_fields_and_is_idempotent(db):
    # Fixed negative IDs avoid consuming the live sequence during rollback QA.
    db.add_all([
        MedicineReferenceCatalog(id=-91501, source='DAV', source_id='test-route-missing',
                                 name='Test', dosage_form='Dung dịch tiêm'),
        MedicineReferenceCatalog(id=-91502, source='DAV', source_id='test-route-ambiguous',
                                 name='Test', dosage_form='Viên nén',
                                 suggested_route='Uống', suggested_route_rule_version='obsolete'),
        MedicineReferenceCatalog(id=-91503, source='DAV', source_id='test-route-explicit',
                                 name='Test', dosage_form='Dung dịch tiêm', route='Tiêm bắp',
                                 suggested_route='Tiêm', suggested_route_rule_version='obsolete'),
        MedicineReferenceCatalog(id=-91504, source='OTHER', source_id='test-route-other',
                                 name='Test', dosage_form='Dung dịch tiêm'),
    ])
    db.flush()
    before = protected_snapshot(db)
    plan = prepare(db)
    with pytest.raises(ValueError, match='thay đổi'):
        apply(db, expected_fingerprint='stale', expected_updates=plan['updates'])
    result = apply(db, expected_fingerprint=plan['fingerprint'], expected_updates=plan['updates'])
    assert result['updates'] >= 3
    assert protected_snapshot(db) == before
    rows = db.execute(text('SELECT id,suggested_route,suggested_route_rule_version FROM medicine_reference_catalog WHERE id<0')).all()
    values = {id: (route, version) for id, route, version in rows}
    assert values[-91501] == ('Tiêm', ROUTE_RULE_VERSION)
    assert values[-91502] == values[-91503] == values[-91504] == (None, None)
    again = prepare(db)
    assert again['updates'] == 0
    assert apply(db, expected_fingerprint=again['fingerprint'], expected_updates=0)['updates'] == 0


def test_sync_persists_replaces_and_clears_route_suggestions(db):
    db.add(MedicineReferenceCatalog(id=-91505, source='DAV', source_id='test-route-sync', name='Test'))
    db.flush()
    raw = {'id': 'test-route-sync', 'tenThuoc': 'Test',
           'thongTinThuocCoBan': {'dangBaoChe': 'Dung dịch tiêm', 'tenDuongDung': None}}
    for form, route, expected in [('Dung dịch tiêm', None, 'Tiêm'),
                                  ('Dung dịch uống', None, 'Uống'),
                                  ('Viên nén', None, None),
                                  ('Dung dịch tiêm', 'Tiêm bắp', None),
                                  ('Dung dịch tiêm', None, 'Tiêm')]:
        raw['thongTinThuocCoBan'].update(dangBaoChe=form, tenDuongDung=route)
        source_before = deepcopy(raw)
        assert upsert_dav_item(db, raw) == 'updated'
        db.flush()
        db.expire_all()
        row = db.get(MedicineReferenceCatalog, -91505)
        assert row.route == route and row.dosage_form == form
        assert row.raw_payload == source_before and raw == source_before
        assert row.suggested_route == expected
        assert row.suggested_route_rule_version == (ROUTE_RULE_VERSION if expected else None)
