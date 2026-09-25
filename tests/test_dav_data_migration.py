"""Reviewed manifest migration uses the real writer with full rollback."""
import pytest
from app.models.user import User, UserRole
from test_inventory_receipts import case, pytestmark
from test_medicine_dav_link import dav
from scripts.migrate_clinic_medicines_to_dav import (
    apply_plans, database_identity, fingerprint, prepare, row_snapshot,
)


def manifest_for(db, med, source):
    med.internal_code = 'QA-MAP-' + str(med.id)
    db.flush()
    db.refresh(med)
    db.refresh(source)
    return {'database': database_identity(db), 'medicines': [{
        'medicine_id': med.id, 'reference_catalog_id': source.id,
        'medicine_sha256': fingerprint(row_snapshot(med)),
        'reference_sha256': fingerprint(row_snapshot(source)),
        'registration_number': source.registration_number,
        'evidence': 'Explicit test mapping; not a name-search auto-match.',
    }]}


def test_preview_is_read_only_and_apply_preserves_stock_receipts_and_settings(case):
    db, med, actor, _, client, receipt = case
    assert client.post('/api/medicine-batches/', json=receipt).status_code == 201
    db.refresh(med)
    med.packaging_unit, med.units_per_box, med.strength = 'hộp', 50, '5mg'
    source = dav(db, packaging='Hộp 3 vỉ x 10 viên', dosage_form='Viên nén', strength='50mg')
    manifest = manifest_for(db, med, source)
    original = row_snapshot(med)
    plans = prepare(db, manifest)
    assert row_snapshot(med) == original
    admin = db.query(User).filter_by(role=UserRole.ADMIN, is_active=True).first()
    report = apply_plans(db, plans, admin.id)
    assert med.reference_catalog_id == source.id
    assert med.strength == '50mg'
    for key in ('id', 'stock_quantity', 'internal_code', 'unit_price', 'units_per_box', 'unit'):
        assert getattr(med, key) == original[key]
    assert report['preserved_dependents']['medicine_batches']['rows'] == 1
    assert report['preserved_dependents']['medicine_transactions']['rows'] == 1
    with pytest.raises(ValueError):
        prepare(db, manifest)


@pytest.mark.parametrize('target', ['medicine', 'reference', 'database'])
def test_stale_review_is_rejected_before_writes(case, target):
    db, med, _, _, _, _ = case
    source = dav(db)
    manifest = manifest_for(db, med, source)
    if target == 'medicine':
        med.unit_price = 1234
    elif target == 'reference':
        source.strength = '20mg'
    else:
        manifest['database']['database'] = 'wrong_database'
    db.flush()
    with pytest.raises(ValueError):
        prepare(db, manifest)
    assert med.reference_catalog_id is None


def test_duplicate_mapping_or_missing_evidence_cannot_be_applied(case):
    db, med, _, _, _, _ = case
    source = dav(db)
    manifest = manifest_for(db, med, source)
    manifest['medicines'].append(dict(manifest['medicines'][0]))
    with pytest.raises(ValueError):
        prepare(db, manifest)
    manifest['medicines'].pop()
    manifest['medicines'][0]['evidence'] = ''
    with pytest.raises(ValueError):
        prepare(db, manifest)
    assert med.reference_catalog_id is None


def test_invalid_actor_cannot_apply(case):
    db, med, _, _, _, _ = case
    source = dav(db)
    plans = prepare(db, manifest_for(db, med, source))
    with pytest.raises(ValueError):
        apply_plans(db, plans, -1)
    assert med.reference_catalog_id is None
