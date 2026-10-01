// Page callbacks set by the entry: onLinked() refreshes the medicine lists after a link is saved.
const hooks = { onLinked() {} };

export function configureReferenceReview(options) {
    Object.assign(hooks, options);
}

const el = id => document.getElementById(id);
let medicineId = null;
let preview = null;
let originalIdentity = null;
let revision = 0;
let controller = null;
let saving = false;
let autocomplete = null;
let modal = null;
let savedPreview = null;
let choosing = false;
let changedCount = 0;
const headers = () => ({'Content-Type': 'application/json'});

async function request(url, options = {}) {
    const response = await fetch(url, {headers: headers(), ...options});
    const data = await response.json();
    if (!response.ok) throw new Error(data.user_message || data.error || 'Không thể tải thông tin thuốc. Hãy thử lại.');
    return data;
}

function status(message, error = false) {
    el('medicineReviewStatus').textContent = message;
    el('medicineReviewStatus').hidden = !message;
    el('medicineReviewStatus').classList.toggle('text-danger', error);
}

function actionKind() {
    if (!preview?.reference || !savedPreview) return null;
    if (!savedPreview.reference) return 'link';
    if (preview.reference.id !== savedPreview.reference.id) return 'change';
    if (preview.review_status === 'pending') return 'confirm';
    if (preview.review_status === 'stale' || changedCount > 0) return 'update';
    return null;
}

function controls() {
    const action = actionKind();
    const hasLink = !!savedPreview?.reference;
    const showSearch = !!savedPreview && choosing;
    const labels = {link: 'Liên kết với thuốc đã chọn', change: 'Lưu liên kết mới',
        confirm: 'Xác nhận liên kết hiện tại', update: 'Cập nhật từ DAV'};
    el('medicineReviewSave').hidden = !action;
    el('medicineReviewSave').disabled = saving || !action || !preview?.can_apply;
    el('medicineReviewSearch').disabled = saving || !showSearch || medicineId == null;
    el('medicineReviewSave').textContent = saving ? 'Đang lưu…' : labels[action] || 'Liên kết với thuốc đã chọn';
    el('medicineReviewSearchSection').hidden = !showSearch;
    el('medicineReviewStart').classList.toggle('mm-review-start--single', !showSearch);
    el('medicineReviewChange').hidden = !hasLink || choosing;
    el('medicineReviewChange').disabled = saving;
    el('medicineReviewCancelChange').hidden = !hasLink || !choosing;
    el('medicineReviewCancelChange').disabled = saving;
    el('medicineReviewCompareSection').hidden = !action || (action === 'update' && changedCount === 0);
    applyTitles(action, hasLink, showSearch);
    el('medicineReferenceReviewModal').querySelectorAll('[data-bs-dismiss]').forEach(button => { button.disabled = saving; });
}

const COMPARE_TITLES = {update: 'Thông tin DAV cần cập nhật', confirm: 'Kiểm tra liên kết hiện tại'};
const AFTER_TITLES = {change: 'Dự kiến sau khi đổi', update: 'Dự kiến sau khi cập nhật'};

function targetTitle(hasLink, showSearch) {
    if (showSearch) return '1. Thuốc trong kho';
    return hasLink ? 'Thuốc đang liên kết DAV' : 'Thuốc trong kho';
}

function modalTitle(hasLink) {
    if (!savedPreview) return 'Thông tin liên kết DAV';
    if (!hasLink) return 'Liên kết thuốc trong kho với DAV';
    return choosing ? 'Đổi thuốc DAV' : 'Thuốc đã liên kết DAV';
}

function applyTitles(action, hasLink, showSearch) {
    el('medicineReviewTargetTitle').textContent = targetTitle(hasLink, showSearch);
    el('medicineReviewSearchTitle').textContent = hasLink ? '2. Chọn thuốc DAV thay thế' : '2. Chọn thuốc tương ứng trên DAV';
    el('medicineReviewCompareTitle').textContent = COMPARE_TITLES[action] || '3. Kiểm tra trước khi lưu';
    el('medicineReviewAfterTitle').textContent = AFTER_TITLES[action] || 'Dự kiến sau khi liên kết';
    el('medicineReferenceReviewTitle').textContent = modalTitle(hasLink);
}

function clearPreview() {
    revision += 1;
    controller?.abort();
    preview = null;
    comparison(originalIdentity, null);
    controls();
}

const normalizeValue = value => String(value || '').trim().toLowerCase();

function sourceCellText(hasSource, sourceValue) {
    if (!hasSource) return 'Chưa chọn thuốc';
    return sourceValue || 'Chưa có thông tin';
}

function comparisonRow(label, originalValue, sourceValue, hasSource) {
    const row = document.createElement('tr');
    const term = document.createElement('th');
    term.setAttribute('scope', 'row');
    term.textContent = label;
    const originalCell = document.createElement('td');
    const sourceCell = document.createElement('td');
    originalCell.textContent = originalValue || 'Chưa có thông tin';
    sourceCell.textContent = sourceCellText(hasSource, sourceValue);
    if (!originalValue) originalCell.classList.add('mm-review-missing');
    if (!sourceValue) sourceCell.classList.add('mm-review-missing');
    const changed = hasSource && normalizeValue(originalValue) !== normalizeValue(sourceValue);
    if (changed) {
        sourceCell.classList.add('mm-review-diff');
        sourceCell.setAttribute('title', 'Sẽ thay đổi khi lưu liên kết');
    }
    row.append(term, originalCell, sourceCell);
    return {row, changed};
}

function comparison(original, source, changes) {
    const parent = el('medicineReviewComparison');
    parent.replaceChildren();
    changedCount = 0;
    el('medicineReviewChanges').textContent = '';
    el('medicineReviewChanges').hidden = true;
    if (!original) return;
    const entries = changes?.length ? changes.map(item => [item.label, item.before, item.after]) : [
        ['Tên thuốc', original.name, source?.name],
        ['Hoạt chất', original.generic_name, source?.active_ingredient],
        ['Hàm lượng', original.strength, source?.strength],
        ['Nước sản xuất', original.origin, source?.manufacturer_country]
    ];
    const missingFields = [];
    for (const [label, originalValue, sourceValue] of entries) {
        const {row, changed} = comparisonRow(label, originalValue, sourceValue, !!source);
        if (changed) {
            changedCount += 1;
            if (originalValue && !sourceValue) missingFields.push(label.toLowerCase());
        }
        parent.append(row);
    }
    if (source && missingFields.length) {
        el('medicineReviewChanges').textContent = `Lưu ý: DAV chưa có ${missingFields.join(', ')}; giá trị đang lưu sẽ bị để trống.`;
        el('medicineReviewChanges').hidden = false;
    }
}

function renderTarget(identity) {
    el('medicineReviewTargetName').textContent = identity?.name || 'Chưa có tên thuốc';
    el('medicineReviewTargetDetails').textContent = [identity?.generic_name,
        identity?.strength, identity?.origin].filter(Boolean).join(' · ');
}

function linkStatusText(data) {
    if (data.review_status === 'confirmed') {
        const reviewedAt = data.human_review?.reviewed_at ? new Date(data.human_review.reviewed_at).toLocaleString('vi-VN') : '';
        return `Đã liên kết DAV${reviewedAt ? ' · ' + reviewedAt : ''}.`;
    }
    if (data.review_status === 'stale') return 'Liên kết DAV cần kiểm tra lại.';
    return data.reference ? 'Liên kết hiện có chưa được xác nhận.' : 'Chưa liên kết DAV.';
}

function actionStatusText(data, action) {
    if (action === 'change' || action === 'link') {
        return `Đang đối chiếu với: ${data.reference.name}. Kiểm tra thông tin bên dưới trước khi lưu.`;
    }
    if (action === 'update') {
        return changedCount > 0 ? 'Nguồn DAV có thông tin cần kiểm tra trước khi cập nhật.'
            : 'Nguồn DAV đã thay đổi; các thông tin đối chiếu không đổi. Cập nhật để ghi nhận nguồn hiện tại.';
    }
    if (action === 'confirm') return 'Đối chiếu thuốc thực tế trước khi xác nhận liên kết này.';
    return choosing && data.reference ? 'Bạn đang chọn đúng thuốc đã liên kết. Không cần lưu lại.' : '';
}

function previewStatusText(data, action) {
    if (data.can_apply && (action === 'change' || action === 'link')) return '';
    return data.message || actionStatusText(data, action);
}

async function loadPreview(referenceId) {
    if (saving || medicineId == null) return;
    clearPreview();
    const requestRevision = revision;
    controller = new AbortController();
    status('Đang tải thông tin để đối chiếu…');
    const suffix = referenceId == null ? '' : '?reference_catalog_id=' + encodeURIComponent(referenceId);
    try {
        const data = await request(`/api/medicines/${medicineId}/reference-review${suffix}`, {signal: controller.signal});
        if (requestRevision !== revision) return;
        preview = data;
        if (referenceId == null) {
            savedPreview = data;
            choosing = !data.reference;
        }
        originalIdentity = data.current || data.original;
        renderTarget(originalIdentity);
        comparison(originalIdentity, data.reference, data.rows);
        if (referenceId == null) el('medicineReviewLinkStatus').textContent = linkStatusText(data);
        status(previewStatusText(data, actionKind()), !data.can_apply && !!data.reference);
        controls();
    } catch (error) {
        if (requestRevision !== revision || error.name === 'AbortError') return;
        status(error.message, true);
        controls();
    }
}

async function save() {
    if (saving || !preview?.can_apply || !actionKind()) return;
    saving = true;
    autocomplete.close();
    controls();
    const source = preview.reference;
    try {
        await request(`/api/medicines/${medicineId}/reference-review`, {
            method: 'POST', body: JSON.stringify({
                reference_catalog_id: source.id, reference_version: source.updated_at,
                reference_medicine_version: preview.medicine_version,
                reference_registration_number: source.registration_number || source.old_registration_number,
                reference_link_confirmed: true
            })
        });
        saving = false;
        modal.hide();
        hooks.onLinked();
    } catch (error) {
        saving = false;
        choosing = true;
        clearPreview();
        status(error.message + ' Hãy tìm và đối chiếu lại trước khi xác nhận.', true);
    }
    controls();
}

export function openMedicineReferenceReview(id) {
    if (saving) return;
    medicineId = id;
    originalIdentity = null;
    savedPreview = null;
    choosing = false;
    el('medicineReviewTargetName').textContent = 'Đang tải thuốc trong kho…';
    el('medicineReviewTargetDetails').textContent = '';
    el('medicineReviewLinkStatus').textContent = '';
    clearPreview();
    autocomplete.clear();
    el('medicineReviewSearch').value = '';
    modal.show();
    loadPreview();
}

document.addEventListener('DOMContentLoaded', () => {
    const root = el('medicineReferenceReviewModal');
    modal = window.bootstrap.Modal.getOrCreateInstance(root);
    autocomplete = new window.QLPKAutocompleteField(el('medicineReviewField'), {
        multiple: false, limit: 12, emptyQueryLimit: 12, searchDebounceMs: 250,
        isEnabled: () => medicineId != null && !!savedPreview && choosing && !saving,
        getLabel: item => [item.name, item.strength].filter(Boolean).join(' · '),
        getDescription: item => [item.active_ingredient, item.manufacturer_name,
            item.registration_number || item.old_registration_number,
            item.clinic_medicine_id && item.clinic_medicine_id !== medicineId ? 'Đã liên kết với thuốc khác' : ''].filter(Boolean).join(' · '),
        emptyText: 'Không tìm thấy. Thử tên thuốc, hoạt chất hoặc số đăng ký khác.',
        loadOptions: async (query, {skip, limit, signal}) => {
            const params = new URLSearchParams({search: query, status: 'active', mode: 'autocomplete',
                page: Math.floor(skip / limit) + 1, per_page: limit});
            const data = await request('/api/medicine-reference-catalog?' + params, {signal});
            return {data: data.data || [], pagination: {per_page: limit, has_next: !!data.has_more}};
        },
        onChange: (_, {action, item}) => {
            if (!choosing || saving) return;
            if (action === 'select') { autocomplete.close(); loadPreview(item.id); }
            else if (action === 'remove') {
                clearPreview();
                status('Hãy tìm và chọn thuốc DAV để đối chiếu.');
            }
        }
    });
    el('medicineReviewSearch').addEventListener('input', () => {
        if (!saving && choosing) { clearPreview(); status('Hãy chọn thuốc trong kết quả tìm kiếm để đối chiếu.'); }
    });
    el('medicineReviewChange').addEventListener('click', () => {
        if (saving || !savedPreview?.reference) return;
        choosing = true;
        clearPreview();
        autocomplete.clear();
        status('Tìm thuốc DAV thay thế. Liên kết hiện tại chỉ thay đổi sau khi bạn lưu.');
        el('medicineReviewSearch').focus();
    });
    el('medicineReviewCancelChange').addEventListener('click', () => {
        if (saving || !savedPreview?.reference) return;
        choosing = false;
        autocomplete.clear();
        autocomplete.close();
        loadPreview();
    });
    el('medicineReviewSave').addEventListener('click', save);
    root.addEventListener('hide.bs.modal', event => {
        if (saving) { event.preventDefault(); return; }
        medicineId = null;
        originalIdentity = null;
        savedPreview = null;
        choosing = false;
        clearPreview();
        autocomplete.clear();
        autocomplete.close();
    });
});
