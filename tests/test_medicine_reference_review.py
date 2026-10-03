"""Human DAV review endpoints, every database write is rolled back."""
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta
import json
import pytest
from test_inventory_receipts import case, pytestmark
from test_medicine_dav_link import dav, link_payload, migrate_reference
from app.models.user import User, UserRole, UserGroup
from app.models.group import Group
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction


@pytest.fixture
def reviewer(case, monkeypatch):
    import app.api.auth as auth
    db, med, _, _, client, _ = case
    actor = db.query(User).filter_by(role=UserRole.ADMIN, is_active=True).first()
    assert actor
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor.id, role='admin', is_active=True))
    return db, med, client, actor.id


def preview_payload(client, med, source):
    response = client.get(f'/api/medicines/{med.id}/reference-review', query_string={'reference_catalog_id': source.id})
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    return data, dict(reference_catalog_id=source.id, reference_version=data['reference']['updated_at'],
        reference_medicine_version=data['medicine_version'], reference_registration_number=source.registration_number,
        reference_link_confirmed=True)


def test_migration_pending_and_review_records_actor_without_stock_changes(case, reviewer):
    db, med, client, actor = reviewer
    original = med.name
    source = dav(db)
    assert migrate_reference(case, link_payload(client, med.id, source)).status_code == 200
    db.expire_all()
    assert med.to_dict()['reference_review_status'] == 'pending'
    data, payload = preview_payload(client, med, source)
    assert data['original']['name'] == original
    assert 'human_review' not in med.reference_snapshot
    response = client.post(f'/api/medicines/{med.id}/reference-review', json=payload)
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert med.reference_snapshot['human_review']['reviewed_by'] == actor
    assert med.to_dict()['reference_review_status'] == 'confirmed'
    assert med.stock_quantity == 0 and med.unit_price == 2000
    data, _ = preview_payload(client, med, source)
    assert data['original']['name'] == original


def test_human_can_correct_prior_mapping_with_stock_preserving_batches_and_history(case, reviewer):
    db, med, client, _ = reviewer
    original = med.name
    first, correct = dav(db), dav(db, strength='20mg', dosage_form='capsule')
    assert migrate_reference(case, link_payload(client, med.id, first)).status_code == 200
    assert client.post('/api/medicine-batches/', json=case[-1]).status_code == 201
    db.expire_all()
    def batches():
        return [tuple(getattr(row, column.name) for column in MedicineBatch.__table__.columns)
                for row in db.query(MedicineBatch).filter_by(medicine_id=med.id).order_by(MedicineBatch.id)]
    batch_before = batches()
    movement_count = db.query(MedicineTransaction).filter_by(medicine_id=med.id).count()
    data, payload = preview_payload(client, med, correct)
    assert data['can_apply'] and data['message']
    response = client.post(f'/api/medicines/{med.id}/reference-review', json=payload)
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert med.reference_catalog_id == correct.id and med.strength == '20mg'
    assert med.stock_quantity == 100 and med.unit_price == 2000 and med.unit == 'viên'
    assert batch_before == batches()
    assert movement_count == db.query(MedicineTransaction).filter_by(medicine_id=med.id).count()
    assert med.reference_snapshot['mapping_history'][0]['identity']['name'] == original


@pytest.mark.parametrize('change', [
    {'reference_link_confirmed':False}, {'reference_link_confirmed':'true'},
    {'reference_version':'stale'}, {'reference_medicine_version':'stale'},
    {'reference_registration_number':'wrong'}, {'unit_price':10}, {'human_review':True},
])
def test_review_rejects_unconfirmed_stale_or_extra_data(reviewer, change):
    db, med, client, _ = reviewer
    source = dav(db)
    _, payload = preview_payload(client, med, source)
    response = client.post(f'/api/medicines/{med.id}/reference-review', json={**payload, **change})
    assert response.status_code in (400, 409), response.get_json()
    db.expire_all()
    assert med.reference_catalog_id is None and med.unit_price == 2000


def test_review_cannot_be_spoofed_through_regular_edit(reviewer):
    db, med, client, _ = reviewer
    source = dav(db)
    _, payload = preview_payload(client, med, source)
    assert client.put(f'/api/medicines/{med.id}', json=payload).status_code == 409
    db.expire_all()
    assert med.reference_catalog_id is None


def test_review_source_change_requires_reconfirmation(reviewer):
    db, med, client, _ = reviewer
    source = dav(db)
    _, payload = preview_payload(client, med, source)
    assert client.post(f'/api/medicines/{med.id}/reference-review', json=payload).status_code == 200
    db.expire_all()
    source.strength = '30mg'
    source.updated_at = datetime.now(timezone.utc) + timedelta(seconds=1)
    db.flush()
    assert med.to_dict()['reference_review_status'] == 'stale'
    assert client.post(f'/api/medicines/{med.id}/reference-review', json=payload).status_code == 409


@pytest.mark.parametrize('flag', ['is_deleted', 'is_expired', 'is_registration_withdrawn'])
def test_unavailable_source_cannot_be_confirmed(reviewer, flag):
    db, med, client, _ = reviewer
    source = dav(db, **({'raw_payload': {'isDaRutSoDangKy': True}} if flag == 'is_registration_withdrawn' else {flag: True}))
    data, payload = preview_payload(client, med, source)
    assert not data['can_apply']
    assert client.post(f'/api/medicines/{med.id}/reference-review', json=payload).status_code == 400


def test_review_enforces_real_inventory_permission(case, monkeypatch):
    import app.api.auth as auth
    db, med, _, _, client, _ = case
    actor = User(username='QA-review-'+str(med.id), full_name='QA', hashed_password='unused', role=UserRole.STAFF, is_active=True)
    db.add(actor)
    db.flush()
    monkeypatch.setattr(auth, 'get_current_user', lambda token: SimpleNamespace(id=actor.id, role='admin', is_active=True))
    url = f'/api/medicines/{med.id}/reference-review'
    assert client.get(url).status_code == 403
    assert client.post(url, json={}).status_code == 403
    group = Group(code='QA-review-'+str(med.id), name='QA', permissions=json.dumps(['ql-kho-thuoc']))
    db.add(group)
    db.flush()
    db.add(UserGroup(user_id=actor.id, group_id=group.id))
    db.flush()
    assert client.get(url).status_code == 200


def test_duplicate_source_blocks_preview_and_confirm(reviewer):
    from app.models.medicine import Medicine
    db, med, client, _ = reviewer
    source = dav(db)
    other = Medicine(name='QA duplicate', unit='viên', unit_price=1000, reference_catalog_id=source.id)
    db.add(other)
    db.flush()
    data, payload = preview_payload(client, med, source)
    assert not data['can_apply'] and 'thuốc khác' in data['message']
    assert client.post(f'/api/medicines/{med.id}/reference-review', json=payload).status_code == 409
    db.expire_all()
    assert med.reference_catalog_id is None and other.reference_catalog_id == source.id


def test_explicit_migration_acceptance_is_confirmed_but_source_changes_require_review(case):
    db, med, _, _, client, _ = case
    source = dav(db)
    assert migrate_reference(case, link_payload(client, med.id, source)).status_code == 200
    db.expire_all()
    assert med.to_dict()['reference_review_status'] == 'pending'
    med.reference_snapshot = {**med.reference_snapshot, 'mapping_acceptance': {
        'accepted_at': datetime.now(timezone.utc).isoformat(), 'basis': 'explicit_user_request'}}
    db.flush()
    assert med.to_dict()['reference_review_status'] == 'confirmed'
    assert not med.reference_snapshot.get('human_review')
    source.strength = '40mg'
    db.flush()
    assert med.to_dict()['reference_review_status'] == 'stale'
