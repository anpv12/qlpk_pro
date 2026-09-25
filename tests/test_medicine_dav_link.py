"""Opt-in rollback coverage for DAV-only APIs and internal migration."""
from uuid import uuid4
import pytest
from test_inventory_receipts import case, pytestmark
from app.models.medicine import Medicine
from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from app.models.medicine_transaction import MedicineTransaction


def dav(db, **changes):
    item = MedicineReferenceCatalog(source='DAV', source_id='QA-'+uuid4().hex,
        name='QA DAV '+uuid4().hex, active_ingredient='ingredient', strength='10mg',
        manufacturer_name='QA manufacturer', manufacturer_country='VN',
        registration_number='QA-'+uuid4().hex, dosage_form='tablet',
        is_active=True, is_expired=False, is_deleted=False, raw_payload={})
    for key, value in changes.items():
        setattr(item, key, value)
    db.add(item)
    db.flush()
    return item



def migrate_reference(case, payload):
    """Exercise the internal writer directly; no user endpoint enables migration."""
    from flask import jsonify
    from sqlalchemy.orm import Session
    from app.modules.medicines.services.catalog_service import CatalogValidationError, write_clinic_medicine
    db, med, actor, _, client, _ = case
    with client.application.app_context(), Session(bind=db.connection(), join_transaction_mode='create_savepoint') as session:
        try:
            medicine = session.get(Medicine, med.id)
            write_clinic_medicine(session, payload, actor, medicine, allow_reference_mapping=True)
            session.commit()
            response = jsonify(medicine=medicine.to_dict())
        except CatalogValidationError as error:
            session.rollback()
            response = jsonify(user_message=str(error))
            response.status_code = error.status
        return response


def link_payload(client, medicine_id, source):
    return dict(reference_catalog_id=source.id, reference_link_confirmed=True,
                reference_registration_number=source.registration_number,
                reference_version=source.updated_at.isoformat() if source.updated_at else None,
                reference_medicine_version=client.get(f'/api/medicines/{medicine_id}').get_json()['updated_at'])


@pytest.mark.parametrize('keyword', ['Diropam', 'ingredient', 'QA-SEARCH-DIROPAM'])
def test_internal_migration_search_accepts_name_ingredient_and_registration(case, keyword):
    from app.modules.medicines.services.reference_catalog_query import list_reference_catalog
    db, med, _, _, client, _ = case
    source = dav(db, name='Diropam QA', registration_number='QA-SEARCH-DIROPAM')
    result = list_reference_catalog(db, search=keyword, autocomplete=True, clinic_medicine_id=med.id, per_page=100)
    chosen = next(item for item in result['items'] if item['id'] == source.id)
    assert chosen['reference_preview']['can_apply'] is True
    response = migrate_reference(case, {
        'reference_catalog_id':chosen['id'], 'reference_version':chosen['updated_at'],
        'reference_registration_number':chosen['registration_number'], 'reference_link_confirmed':True,
        'reference_medicine_version':chosen['reference_preview']['medicine_version']})
    assert response.status_code == 200, response.get_json()
    assert response.get_json()['medicine']['reference_catalog_id'] == source.id


def test_remap_preserves_stock_receipts_settings_and_records_previous_link(case):
    db, med, _, _, client, receipt = case
    first, second = dav(db, route='Uống'), dav(db, route='Uống')
    assert migrate_reference(case, link_payload(client, med.id, first)).status_code == 200
    assert client.post('/api/medicine-batches/', json=receipt).status_code == 201
    before = client.get(f'/api/medicines/{med.id}').get_json()
    movements = db.query(MedicineTransaction).filter_by(medicine_id=med.id).count()
    result = migrate_reference(case, link_payload(client, med.id, second))
    assert result.status_code == 200, result.get_json()
    after = result.get_json()['medicine']
    for key in ('id', 'internal_code', 'stock_quantity', 'batch_count', 'unit_price', 'unit', 'units_per_box'):
        assert after[key] == before[key]
    assert after['name'] == second.name and after['reference_catalog_id'] == second.id
    assert after['conversion_locked'] is True
    db.expire_all()
    assert med.reference_snapshot['mapping_history'][-1]['reference_catalog_id'] == first.id
    assert db.query(MedicineTransaction).filter_by(medicine_id=med.id).count() == movements


@pytest.mark.parametrize('change', [{'strength':'20mg'}, {'active_ingredient':'other ingredient'}, {'dosage_form':'solution'}])
def test_remap_cannot_change_clinical_identity_with_stock(case, change):
    db, med, _, _, client, receipt = case
    first, second = dav(db), dav(db, **change)
    assert migrate_reference(case, link_payload(client, med.id, first)).status_code == 200
    assert client.post('/api/medicine-batches/', json=receipt).status_code == 201
    response = migrate_reference(case, link_payload(client, med.id, second))
    assert response.status_code == 409, response.get_json()
    db.expire_all()
    assert med.reference_catalog_id == first.id and med.stock_quantity == 100


def test_remap_requires_preview_versions_and_cannot_write_settings_together(case):
    db, med, _, _, client, _ = case
    first, second = dav(db), dav(db)
    assert migrate_reference(case, link_payload(client, med.id, first)).status_code == 200
    payload = link_payload(client, med.id, second)
    for extra in ({'reference_version':'stale'}, {'reference_medicine_version':'stale'}, {'reference_registration_number':'wrong'}, {'unit_price':1}):
        response = migrate_reference(case, {**payload, **extra})
        assert response.status_code in (400, 409), response.get_json()
    assert migrate_reference(case, {'reference_catalog_id':second.id}).status_code == 409
    without_version = {key:value for key,value in payload.items() if key != 'reference_version'}
    assert migrate_reference(case, without_version).status_code == 409
    db.expire_all()
    assert med.reference_catalog_id == first.id


def test_remap_can_correct_unused_medicine_but_cannot_take_another_medicines_link(case):
    db, med, _, _, client, _ = case
    first, replacement, occupied = dav(db), dav(db, strength='20mg'), dav(db)
    assert migrate_reference(case, link_payload(client, med.id, first)).status_code == 200
    response = migrate_reference(case, link_payload(client, med.id, replacement))
    assert response.status_code == 200, response.get_json()
    assert response.get_json()['medicine']['strength'] == '20mg'
    assert client.post('/api/medicines/', json={'reference_catalog_id':occupied.id,'unit':'viên'}).status_code == 201
    response = migrate_reference(case, link_payload(client, med.id, occupied))
    assert response.status_code == 409
    db.expire_all()
    assert med.reference_catalog_id == replacement.id


def test_same_source_can_be_refreshed_and_ordinary_edit_cannot_override_source(case):
    db, med, _, _, client, _ = case
    source = dav(db, route='Uống')
    assert migrate_reference(case, link_payload(client, med.id, source)).status_code == 200
    for data in ({'administration_method':'Tiêm'}, {'is_imported':True}, {'origin':'Đức'}, {'name':'other'}):
        assert client.put(f'/api/medicines/{med.id}', json=data).status_code == 409
    source.name = 'Tên danh mục đã cập nhật'
    db.flush()
    result = migrate_reference(case, link_payload(client, med.id, source))
    assert result.status_code == 200, result.get_json()
    assert result.get_json()['medicine']['name'] == source.name
    assert result.get_json()['medicine']['reference_status'] == 'linked'
    assert client.put(f'/api/medicines/{med.id}', json={'unit_price':3456,'description':'ghi chú'}).status_code == 409
    assert client.put(f'/api/medicines/{med.id}', json={'description':'ghi chú'}).status_code == 200


def test_missing_source_route_remains_editable_and_bad_ingredient_cannot_create(case):
    db, med, _, _, client, _ = case
    source = dav(db, route=None)
    assert client.put(f'/api/medicines/{med.id}', json={'administration_method':'Uống'}).status_code == 200
    result = migrate_reference(case, link_payload(client, med.id, source))
    assert result.status_code == 200, result.get_json()
    record = result.get_json()['medicine']
    assert record['administration_method'] == 'Uống'
    assert 'administration_method' not in record['catalog_locked_fields']
    assert client.put(f'/api/medicines/{med.id}', json={'administration_method':'Ngậm'}).status_code == 200
    invalid = dav(db, active_ingredient='10mg', strength='Escitalopram')
    assert client.post('/api/medicines/', json={'reference_catalog_id':invalid.id,'unit':'viên'}).status_code == 400


@pytest.mark.parametrize('data', [{'unit_price':'NaN'}, {'prescription_type':'BAD'}, {'category_type':'EQUIPMENT'}, {'administration_method':'x'*51}])
def test_catalog_validation_uses_business_labels(case, data):
    _, med, _, _, client, _ = case
    response = client.put(f'/api/medicines/{med.id}', json=data)
    assert response.status_code == 400
    message = response.get_json()['user_message']
    assert not any(word in message for word in ('unit_price', 'prescription_type', 'DRUG', 'BASIC', 'JSON', 'administration_method'))


def test_create_uses_dav_identity_and_rejects_duplicate(case):
    db, _, _, _, client, _ = case
    source = dav(db)
    payload = {'reference_catalog_id': source.id, 'unit':'viên', 'unit_price':2000}
    result = client.post('/api/medicines/', json=payload)
    assert result.status_code == 201, result.get_json()
    medicine = result.get_json()['medicine']
    assert medicine['name'] == source.name and medicine['reference_status'] == 'linked'
    assert medicine['reference_review_status'] == 'confirmed'
    assert medicine['stock_quantity'] == 0 and medicine['category_type'] == 'DRUG'
    created = db.get(Medicine, medicine['id'])
    assert created.reference_snapshot['human_review']['reviewed_by']
    duplicate = client.post('/api/medicines/', json=payload)
    assert duplicate.status_code == 409
    assert duplicate.get_json()['existing_medicine_id'] == medicine['id']


@pytest.mark.parametrize('country,imported', [('Việt Nam',False),('Đức',True)])
def test_mapping_save_and_reload_preserves_conversion_and_unknown_country(case, country, imported):
    db, _, _, _, client, _ = case
    source = dav(db, manufacturer_country=country, route='Uống', packaging='Hộp 3 vỉ x 10 viên')
    response = client.post('/api/medicines/', json={'reference_catalog_id':source.id,
        'unit':'viên', 'packaging_unit':'hộp', 'units_per_box':30, 'unit_price':1234})
    assert response.status_code == 201, response.get_json()
    record = client.get('/api/medicines/' + str(response.get_json()['medicine']['id'])).get_json()
    assert record['administration_method'] == 'Uống'
    assert record['is_imported'] is imported
    assert record['packaging'] == '1 hộp = 30 viên'
    assert record['unit_price'] == 1234 and record['stock_quantity'] == 0


def test_missing_country_requires_explicit_classification(case):
    db, _, _, _, client, _ = case
    source = dav(db, manufacturer_country=None)
    payload = {'reference_catalog_id':source.id, 'unit':'viên'}
    response = client.post('/api/medicines/', json=payload)
    assert response.status_code == 400
    assert 'Nội/Ngoại' in response.get_json()['error']
    response = client.post('/api/medicines/', json={**payload, 'is_imported':True})
    assert response.status_code == 201
    assert response.get_json()['medicine']['is_imported'] is True


@pytest.mark.parametrize('extra', [{'name':'forged'}, {'strength':'99mg'}, {'category_type':'SUPPLEMENT'}, {'category_type':'EQUIPMENT'}, {'stock_quantity':0}, {'unit_price':'NaN'}])
def test_direct_payload_cannot_bypass_dav_or_stock(case, extra):
    db, _, _, _, client, _ = case
    source = dav(db)
    result = client.post('/api/medicines/', json={'reference_catalog_id':source.id,'unit':'viên',**extra})
    assert result.status_code == 400
    assert db.query(Medicine).filter_by(reference_catalog_id=source.id).count() == 0


def test_manual_creation_is_removed(case):
    _, _, _, _, client, _ = case
    assert client.post('/api/medicines/', json={'name':'manual','unit':'viên','category_type':'DRUG','prescription_type':'BASIC'}).status_code == 400


@pytest.mark.parametrize('reference_id', [None, '', 0, -1, True, '123'])
def test_creation_rejects_missing_or_invalid_dav_id(case, reference_id):
    db, _, _, _, client, _ = case
    before = db.query(Medicine).count()
    response = client.post('/api/medicines/', json={'reference_catalog_id':reference_id, 'unit':'viên'})
    assert response.status_code == 400
    assert db.query(Medicine).count() == before


def test_creation_rejects_non_dav_source(case):
    db, _, _, _, client, _ = case
    source = dav(db, source='OTHER')
    response = client.post('/api/medicines/', json={'reference_catalog_id':source.id, 'unit':'viên'})
    assert response.status_code == 400
    assert db.query(Medicine).filter_by(reference_catalog_id=source.id).count() == 0


@pytest.mark.parametrize('linked', [False, True])
def test_user_api_cannot_link_relink_unlink_or_refresh_even_with_migration_flag(case, linked):
    db, med, _, _, client, _ = case
    first, replacement = dav(db), dav(db)
    if linked:
        assert migrate_reference(case, link_payload(client, med.id, first)).status_code == 200
    before = client.get(f'/api/medicines/{med.id}').get_json()
    for payload in (
        {'reference_catalog_id':replacement.id},
        link_payload(client, med.id, replacement),
        {**link_payload(client, med.id, first), 'allow_reference_mapping':True},
        {'reference_link_confirmed':True},
        *([{'reference_catalog_id':None}, link_payload(client, med.id, first)] if linked else []),
    ):
        response = client.put(f'/api/medicines/{med.id}', json=payload)
        assert response.status_code == 409, response.get_json()
        after = client.get(f'/api/medicines/{med.id}').get_json()
        for key in ('reference_catalog_id', 'name', 'strength', 'stock_quantity', 'unit_price'):
            assert after[key] == before[key]
    assert client.put(f'/api/medicines/{med.id}', json={'unit_price':3210}).status_code == 409


@pytest.mark.parametrize('changes', [{'is_active':False},{'is_expired':True},{'is_deleted':True},{'raw_payload':{'isDaRutSoDangKy':True}}])
def test_unavailable_dav_cannot_be_selected(case, changes):
    db, _, _, _, client, _ = case
    source = dav(db, **changes)
    assert client.post('/api/medicines/', json={'reference_catalog_id':source.id,'unit':'viên'}).status_code == 400


def test_legacy_link_requires_confirmation_preserves_stock_history_and_id(case):
    db, med, _, _, client, receipt = case
    assert client.post('/api/medicine-batches/',json=receipt).status_code == 201
    db.expire_all()
    old_name, old_id, balance = med.name, med.id, med.stock_quantity
    movements = db.query(MedicineTransaction).filter_by(medicine_id=old_id).count()
    source = dav(db)
    assert client.put(f'/api/medicines/{old_id}',json={'name':'manual rename'}).status_code == 409
    assert migrate_reference(case, {'reference_catalog_id':source.id}).status_code == 400
    current = client.get(f'/api/medicines/{old_id}').get_json()
    response = migrate_reference(case, {'reference_catalog_id':source.id,'reference_link_confirmed':True,
        'reference_registration_number':source.registration_number, 'reference_medicine_version':current['updated_at']})
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert med.id == old_id and med.stock_quantity == balance and med.name == source.name
    assert med.reference_snapshot['previous_identity']['name'] == old_name
    assert db.query(MedicineTransaction).filter_by(medicine_id=old_id).count() == movements
    for data in ({'name':'another'}, {'reference_catalog_id':None}, {'unit':'hộp'}):
        assert client.put(f'/api/medicines/{old_id}',json=data).status_code == 409


def test_migration_exact_registration_preserves_different_inventory_conversion(case):
    from app.modules.medicines.services.reference_catalog_query import list_reference_catalog
    db, med, _, _, client, _ = case
    med.packaging_unit, med.units_per_box, med.strength = 'hộp', 50, '10mg'
    db.flush()
    source = dav(db, packaging='Hộp 3 vỉ x 10 viên', dosage_form='Viên nén', strength=None,
                 old_registration_number='OLD-'+uuid4().hex)
    result = list_reference_catalog(db, autocomplete=True, registration_number=source.registration_number,
                                    clinic_medicine_id=med.id)
    assert len(result['items']) == 1
    preview = result['items'][0]['reference_preview']
    assert preview['can_apply'] is True
    assert next(row for row in preview['rows'] if row['label'] == 'Hàm lượng')['after'] is None
    assert not list_reference_catalog(db, autocomplete=True, registration_number=source.name)['items']
    assert not list_reference_catalog(db, autocomplete=True, registration_number=source.registration_number[:-1])['items']
    assert list_reference_catalog(db, autocomplete=True, registration_number=source.old_registration_number.lower())['items'][0]['id'] == source.id
    payload = dict(reference_catalog_id=source.id, reference_link_confirmed=True,
                   reference_registration_number=source.registration_number,
                   reference_medicine_version=preview['medicine_version'])
    response = migrate_reference(case, payload)
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert med.name == source.name and med.reference_catalog_id == source.id and med.stock_quantity == 0
    assert med.strength is None and med.units_per_box == 50 and med.packaging_unit == 'hộp'


def test_supplement_rejects_source_with_quantity_in_ingredient_field(case):
    from app.modules.medicines.services.catalog_service import reference_preview
    db, med, _, _, client, _ = case
    source = dav(db, active_ingredient='10mg', strength='Escitalopram')
    preview = reference_preview(med, source)
    assert preview['can_apply'] is False and 'Hoạt chất' in preview['message']
    response = migrate_reference(case, dict(reference_catalog_id=source.id,
        reference_link_confirmed=True, reference_registration_number=source.registration_number,
        reference_medicine_version=preview['medicine_version']))
    assert response.status_code == 409
    db.expire_all()
    assert med.reference_catalog_id is None


def test_supplement_requires_matching_registration_and_fresh_medicine(case):
    db, med, _, _, client, _ = case
    source = dav(db, strength=None, old_registration_number='OLD-'+uuid4().hex)
    med.strength = '10mg'
    db.flush()
    current = client.get(f'/api/medicines/{med.id}').get_json()
    payload = dict(reference_catalog_id=source.id, reference_link_confirmed=True,
                   reference_registration_number=source.registration_number,
                   reference_medicine_version=current['updated_at'])
    for registration in ('', 'wrong'):
        assert migrate_reference(case, {**payload, 'reference_registration_number':registration}).status_code == 400
    assert migrate_reference(case, {**payload, 'reference_medicine_version':'stale'}).status_code == 409
    # Ordinary clinic settings remain editable without linking a source.
    assert client.put(f'/api/medicines/{med.id}', json={'description':'Ghi chú mới'}).status_code == 200
    current = client.get(f'/api/medicines/{med.id}').get_json()
    response = migrate_reference(case, {**payload,
        'reference_registration_number':source.old_registration_number,
        'reference_medicine_version':current['updated_at']})
    assert response.status_code == 200, response.get_json()
    db.expire_all()
    assert med.strength is None and med.unit_price == 2000 and med.stock_quantity == 0


def test_source_updates_flag_review_without_rewriting_clinic_identity(case):
    db, _, _, _, client, _ = case
    source = dav(db)
    record = client.post('/api/medicines/',json={'reference_catalog_id':source.id,'unit':'viên'}).get_json()['medicine']
    source.strength = '20mg'
    db.flush()
    updated = client.get(f"/api/medicines/{record['id']}").get_json()
    assert updated['strength'] == '10mg' and updated['reference_status'] == 'review_required'
    assert updated['reference_current']['strength'] == '20mg'


def test_legacy_non_drug_cannot_receive_more_stock(case):
    db, med, _, _, client, receipt = case
    med.category_type = 'SUPPLEMENT'
    db.flush()
    assert client.post('/api/medicine-batches/',json=receipt).status_code == 400
    db.expire_all()
    assert med.stock_quantity == 0


def test_full_dav_text_fits_clinic_and_prescription_snapshot(case):
    from app.models.prescription import Prescription, PrescriptionItem
    db, _, _, appointment, client, _ = case
    source = dav(db, name='A'*333, strength='B'*1225, active_ingredient='C'*1732)
    response = client.post('/api/medicines/',json={'reference_catalog_id':source.id,'unit':'viên'})
    assert response.status_code == 201, response.get_json()
    medicine = response.get_json()['medicine']
    prescription = Prescription(appointment_id=appointment, prescription_code='QA-'+uuid4().hex[:16])
    db.add(prescription)
    db.flush()
    item = PrescriptionItem(prescription_id=prescription.id, medicine_id=medicine['id'],
                            medicine_name=medicine['name'], strength=medicine['strength'])
    db.add(item)
    db.flush()
    db.refresh(item)
    assert item.medicine_name == source.name and item.strength == source.strength


def test_stale_dav_selection_requires_new_review(case):
    db, _, _, _, client, _ = case
    source = dav(db)
    response = client.post('/api/medicines/',json={'reference_catalog_id':source.id,'unit':'viên','reference_version':'stale'})
    assert response.status_code == 409
    assert db.query(Medicine).filter_by(reference_catalog_id=source.id).count() == 0
