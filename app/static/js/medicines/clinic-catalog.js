(function (window) {
    'use strict';
    let selected = null;
    let existing = null;
    let formRevision = 0;
    let autocomplete = null;
    const cache = new Map();
    const cacheLifetime = 30000;
    const cacheLimit = 20;
    let cacheToken = null;
    const el = id => document.getElementById(id);
    const identityFields = ['name', 'generic_name', 'strength', 'origin'];

    function resetMapping() {
        el('medicineFormError').classList.add('d-none');
        el('medicineFormError').textContent = '';
    }

    function fillMappedFields(defaults = {}) {
        const route = defaults.administration_method || defaults.suggested_administration_method || '';
        const values = {
            administrationMethod: route,
            administrationMethodValue: route,
            importedType: defaults.is_imported === true ? 'Ngoại' : defaults.is_imported === false ? 'Nội' : '',
            importedTypeValue: defaults.is_imported == null ? '' : String(defaults.is_imported),
            saleUnit: defaults.unit || '', saleUnitValue: defaults.unit || '',
            packagingUnit: defaults.packaging_unit || '', unitsPerBox: defaults.units_per_box || ''
        };
        Object.entries(values).forEach(([id, value]) => { el(id).value = value; });
        setSourceLocks(['administration_method', 'is_imported'].filter(field => defaults[field] != null && defaults[field] !== ''));
        window.updatePackagingInfo();
    }

    function setSourceLocks(fields = []) {
        for (const [field, id] of [['administration_method', 'administrationMethod'], ['is_imported', 'importedType']]) {
            el(id).disabled = fields.includes(field);
            el(id).placeholder = fields.includes(field) ? 'Chưa có' : id === 'administrationMethod' ? 'Chọn đường dùng' : 'Chọn Nội/Ngoại';
            el(id + 'Dropdown').classList.add('mm-hidden');
        }
    }

    function showSettings(visible) {
        el('medicineEditFields').hidden = false;
        el('medicineEditFields').disabled = !visible;
        el('medicineSaveButton').disabled = !visible;
    }

    function closeDropdown() { autocomplete?.close(); }

    function addDetail(parent, label, value, className = 'mm-dav-detail') {
        if (!value) return;
        const line = document.createElement('div');
        line.className = className;
        const tag = document.createElement('span');
        tag.className = 'mm-dav-detail-label';
        tag.textContent = label + ': ';
        const text = document.createElement('span');
        text.textContent = value;
        line.append(tag, text);
        parent.append(line);
    }

    function renderIdentity(parent, item) {
        parent.replaceChildren();
        el('davPackagingText').textContent = item.packaging ? `${item.packaging} · ` : '';
        el('davPackagingText').hidden = !item.packaging;
        addDetail(parent, 'Tên thuốc', item.name || 'Chưa ghi nhận', 'mm-dav-name');
        if (item.strength && !(item.name || '').includes(item.strength)) {
            addDetail(parent, 'Hàm lượng', item.strength);
        }
        if (item.active_ingredient && item.active_ingredient !== item.name) {
            addDetail(parent, 'Hoạt chất', item.active_ingredient);
        }
        addDetail(parent, 'Dạng bào chế', item.dosage_form);
        addDetail(parent, 'Đóng gói', item.packaging);
        addDetail(parent, 'Nhà sản xuất', item.manufacturer_name || 'Chưa ghi nhận');
        addDetail(parent, 'Nước sản xuất', item.manufacturer_country);
        addDetail(parent, 'SĐK', item.registration_number);
    }

    function renderBatchPrices(pricing) {
        const input = el('medicine-import_price');
        input.value = pricing?.import_price ?? '';
        input.placeholder = 'Chưa có';
        input.disabled = true;
        input.readOnly = true;
    }

    function renderExpiryAction(medicine) {
        const hasBatches = Boolean(medicine?.id && medicine.batch_count > 0);
        el('medicine-expiry_date').disabled = !hasBatches;
        el('medicineExpiryLabel').textContent = hasBatches ? 'Xem hạn dùng' : 'Chưa có lô';
        el('medicineExpiryIcon').hidden = !hasBatches;
        const hasId = Boolean(medicine?.id);
        el('medicineImportOpen').disabled = !hasId;
        el('medicineImportLabel').textContent = hasId ? 'Nhập kho' : 'Lưu thuốc trước';
        el('medicineImportIcon').hidden = !hasId;
    }

    function reset() {
        formRevision += 1;
        resetMapping();
        autocomplete?.clear();
        cache.clear();
        cacheToken = null;
        selected = null;
        existing = null;
        renderExpiryAction(null);
        renderBatchPrices(null);
        el('medicine-unit_price').value = '';
        el('medicine-unit_price').disabled = true;
        el('medicine-unit_price').readOnly = true;
        window.MedicinePriceEditor?.reset();
        el('davSearchInput').value = '';
        el('davSelection').replaceChildren();
        el('davPackagingText').textContent = '';
        el('davPackagingText').hidden = true;
        el('davSelectedRow').hidden = true;
        el('davChangeButton').hidden = false;
        el('davContext').textContent = '';
        el('davContext').hidden = true;
        el('davSearchControls').hidden = false;
        el('davSourceSection').hidden = false;
        showSettings(false);
        setSourceLocks();
        el('medicineConversionNote').hidden = true;
        el('medicineFlowGuide').textContent = 'Chọn thuốc trong danh mục DAV, sau đó kiểm tra thông tin phòng khám.';
        el('medicineEditActions').hidden = false;
        el('davChangeButton').disabled = false;
        el('davChangeButton').textContent = 'Đổi thuốc';
        el('davSearchLabel').textContent = 'Tìm thuốc trong danh mục';
        el('davSearchInput').placeholder = 'Gõ tên thuốc, hoạt chất hoặc số đăng ký…';
        ['saleUnit', 'packagingUnit', 'unitsPerBox'].forEach(id => { el(id).disabled = false; });
        el('saleUnit').placeholder = 'Chọn đơn vị dùng';
        el('unitsPerBox').placeholder = 'Nhập số đơn vị';
    }

    function setExisting(medicine) {
        reset();
        existing = medicine;
        renderExpiryAction(medicine);
        renderBatchPrices(medicine.latest_batch_pricing);
        el('medicine-unit_price').value = medicine.unit_price ?? '';
        window.MedicinePriceEditor?.setExisting(medicine);
        showSettings(true);
        setSourceLocks(medicine.catalog_locked_fields || []);
        el('medicineFlowGuide').textContent = 'Thông tin đăng ký thuốc (Cục Quản lý Dược)';
        if (medicine.conversion_locked || medicine.batch_count > 0) {
            ['saleUnit', 'packagingUnit', 'unitsPerBox'].forEach(id => { el(id).disabled = true; });
            el('saleUnit').placeholder = 'Chưa có';
            el('unitsPerBox').placeholder = 'Chưa có';
            el('medicineConversionNote').hidden = false;
        }
        if (medicine.reference_catalog_id) {
            selected = {id: medicine.reference_catalog_id};
            el('davSearchControls').hidden = true;
            el('davSelectedRow').hidden = false;
            el('davChangeButton').hidden = true;
            renderIdentity(el('davSelection'), medicine.reference_identity || medicine.reference_current || {});
            if (medicine.reference_status === 'review_required') {
                el('davContext').hidden = false;
                el('davContext').textContent = 'Thông tin danh mục đã thay đổi hoặc thuốc không còn hiệu lực. Hãy dùng “Cần xác nhận DAV” trong danh sách thuốc để kiểm tra lại.';
            }
        } else {
            renderIdentity(el('davSelection'), {name: medicine.name, active_ingredient: medicine.generic_name,
                strength: medicine.strength, manufacturer_country: medicine.origin});
            el('medicineFlowGuide').textContent = 'Thông tin thuốc gốc (chưa liên kết Cục Quản lý Dược)';
            el('davSelectedRow').hidden = false;
            el('davChangeButton').hidden = true;
            el('davSearchControls').hidden = true;
        }
    }

    function choose(item) {
        if (existing) return;
        closeDropdown();
        if (item.clinic_medicine_id) {
            window.editMedicine(item.clinic_medicine_id);
            return;
        }
        selected = item;
        const form = el('medicineForm');
        form.querySelector('[name="name"]').value = item.name || '';
        el('genericNameInput').value = item.active_ingredient || '';
        el('genericNameValue').value = item.active_ingredient || '';
        form.querySelector('[name="strength"]').value = item.strength || '';
        form.querySelector('[name="origin"]').value = item.manufacturer_country || '';
        renderIdentity(el('davSelection'), item);
        el('medicineFlowGuide').textContent = 'Thông tin đăng ký thuốc (Cục Quản lý Dược)';
        resetMapping();
        if (!existing) {
            const defaults = item.clinic_defaults || {};
            fillMappedFields(defaults);
            showSettings(true);
        }
        el('davSearchControls').hidden = true;
        el('davSelectedRow').hidden = false;
        el('davChangeButton').focus();
    }

    function changeSelection() {
        if (existing) return;
        el('davPackagingText').textContent = '';
        el('davPackagingText').hidden = true;
        autocomplete?.clear();
        selected = null;
        resetMapping();
        if (!existing) { fillMappedFields(); showSettings(false); }
        identityFields.forEach(field => {
            const original = existing?.[field] || '';
            el('medicineForm').querySelector(`[name="${field}"]`).value = original;
        });
        el('genericNameInput').value = existing?.generic_name || '';
        el('genericNameValue').value = existing?.generic_name || '';
        el('davSelectedRow').hidden = true;
        el('medicineFlowGuide').textContent = 'Chọn thuốc trong danh mục DAV, sau đó kiểm tra thông tin phòng khám.';
        el('davSearchControls').hidden = false;
        el('davSearchInput').focus();
        el('davSearchInput').select();
    }

    function clearCache() {
        cache.clear();
        closeDropdown();
    }

    async function loadOptions(query, {skip, limit, signal}) {
        const currentForm = formRevision;
        const params = new URLSearchParams({search: query, status: 'active',
            page: String(Math.floor(skip / limit) + 1), per_page: String(limit), mode: 'autocomplete'});
        const key = params.toString();
        const sessionRevision = window.QLPKApiTransport.sessionRevision();
        if (sessionRevision !== cacheToken) { cache.clear(); cacheToken = sessionRevision; }
        const cached = cache.get(key);
        let result;
        if (cached && Date.now() - cached.createdAt < cacheLifetime) result = cached.result;
        else {
            cache.delete(key);
            const response = await fetch(`/api/medicine-reference-catalog?${params}`, {signal});
            result = await response.json();
            if (!response.ok || !result.success) {
                if (currentForm === formRevision && !signal.aborted) cache.clear();
                throw new Error('Không tải được danh mục DAV.');
            }
            if (currentForm === formRevision && !signal.aborted
                && window.QLPKApiTransport.sessionRevision() === cacheToken) {
                cache.set(key, {result, createdAt: Date.now()});
                if (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
            }
        }
        return {data: result.data, pagination: {per_page: limit, has_next: Boolean(result.has_more)}};
    }

    function payload(data) {
        if (existing) delete data.unit_price;
        else data.unit_price = Number(el('medicine-unit_price').value || 0);
        identityFields.forEach(field => delete data[field]);
        delete data.category_type;
        if (existing?.conversion_locked || existing?.batch_count > 0) {
            ['unit', 'packaging', 'packaging_unit', 'units_per_box'].forEach(field => delete data[field]);
        }
        for (const field of existing?.catalog_locked_fields || []) delete data[field];
        if (!existing && !selected) return 'Hãy chọn thuốc từ DAV trước khi lưu.';
        if (!existing && selected?.clinic_defaults && selected.clinic_defaults.is_imported == null && data.is_imported == null) {
            return 'DAV chưa có nước sản xuất. Hãy xác nhận thuốc Nội/Ngoại trước khi lưu.';
        }
        if (!existing && selected) {
            data.reference_catalog_id = selected.id;
            data.reference_version = selected.updated_at;
        }
        return null;
    }

    window.ClinicMedicineCatalog = {reset, setExisting, payload};
    document.addEventListener('DOMContentLoaded', () => {
        el('davChangeButton').addEventListener('click', changeSelection);
        autocomplete = new window.QLPKAutocompleteField(el('davSearchField'), {
            multiple: false, limit: 12, emptyQueryLimit: 12, searchDebounceMs: 250,
            isEnabled: () => !existing && !el('davSearchControls').hidden,
            getLabel: item => [item.name, item.strength].filter(Boolean).join(' · '),
            getDescription: item => [
                item.clinic_medicine_id ? 'Đã có trong Tủ thuốc · Chọn để mở' : '',
                item.active_ingredient, item.manufacturer_name,
                (item.registration_number || item.old_registration_number) && `SĐK: ${item.registration_number || item.old_registration_number}`
            ].filter(Boolean).join(' · '),
            emptyText: 'Không có gợi ý. Nhập tên thuốc, hoạt chất hoặc số đăng ký để tìm.',
            loadOptions,
            onChange: (_, {action, item}) => { if (action === 'select') choose(item); }
        });
        window.jQuery('#medicineModal').on('hide.bs.modal', event => {
            closeDropdown();
        });
        if (window.QLPKRealtimePageHooks) {
            window.QLPKRealtimePageHooks.register({types: ['inventory.changed'], handler: clearCache});
        }
        reset();
    });
})(window);
