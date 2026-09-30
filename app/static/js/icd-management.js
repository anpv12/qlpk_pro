// ICD catalogue: server-paged search with disease-group filter, add/edit modals with field validation,
// delete confirmation, realtime refresh; Excel template/import lives in icd-management/import-export.js.
import { byId, delegate, el, icon, on, replace } from './shared/dom.js';
import { bindImportExport } from './icd-management/import-export.js';

const state = { page: 1, pageSize: 10, search: '', group: '', currentId: null, editMode: false, saving: false, revision: 0 };
const FORM_FIELDS = '#addICDForm input, #addICDForm textarea, #editICDForm input, #editICDForm textarea';
export const showToast = (message, type = 'success') => window.QLPKUserFeedback?.show(type, message);
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));
const setShown = (node, shown) => { node.style.display = shown ? '' : 'none'; };
const busy = show => byId('icdTableBody').setAttribute('aria-busy', String(show));

function renderICDState(message, retry = false) {
	replace(byId('icdTableBody'), el('tr', {}, el('td', { colspan: 6, class: 'text-center py-4' }, el('div', { role: 'status' }, message),
		retry ? el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', id: 'retryICDList', class: 'btn mt-2' }, 'Thử lại') : null)));
}

function renderICDList(list) {
	if (!list.length) {
		renderICDState('Không tìm thấy mã ICD phù hợp.');
		return;
	}
	const button = (kind, title, iconName, action, icd) => el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: 'btn', title,
		dataset: { icdAction: action, icdId: icd.id, icdCode: icd.icd_code } }, icon(iconName));
	replace(byId('icdTableBody'), list.map(icd => el('tr', {},
		el('td', {}, el('span', { class: 'text-primary fw-bold' }, icd.icd_code)),
		el('td', {}, el('div', { class: 'fw-semibold' }, icd.disease_name)),
		el('td', {}, el('div', { class: 'text-muted' }, icd.description || 'Không có mô tả')),
		el('td', {}, el('div', { class: 'text-muted' }, icd.disease_group || 'Chưa phân nhóm')),
		el('td', {}, el('span', { class: 'text-muted' }, new Date(icd.created_at).toLocaleDateString('vi-VN'))),
		el('td', { class: 'text-center' }, el('div', { class: 'btn-group btn-group-sm', role: 'group' },
			button('edit', 'Chỉnh sửa', 'bi-pencil', 'edit', icd), ' ', button('danger', 'Xóa', 'bi-trash', 'delete', icd))))));
}

function listParams(page) {
	const params = new URLSearchParams({ skip: (page - 1) * state.pageSize, limit: state.pageSize });
	if (state.search) params.set('search', state.search);
	if (state.group) params.set('disease_group', state.group);
	return params;
}

export async function loadICDList(page = 1) {
	const revision = ++state.revision;
	state.page = page;
	busy(true);
	setShown(byId('clinicPagination'), false);
	renderICDState('Đang tải danh sách ICD…');
	try {
		const response = await fetch(`/api/icd/?${listParams(page)}`);
		if (revision !== state.revision) return undefined;
		if (!response.ok) {
			const message = { 401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 403: 'Bạn không có quyền xem danh mục ICD.' }[response.status];
			renderICDState(message || 'Không tải được danh sách ICD. Vui lòng thử lại.', !message);
			return undefined;
		}
		const data = await response.json();
		if (revision !== state.revision) return undefined;
		if (!Array.isArray(data.data) || !data.pagination) throw new Error('Invalid ICD list response');
		const lastPage = Math.max(1, Number(data.pagination.total_pages) || 1);
		if (page > lastPage) return loadICDList(lastPage);
		renderICDList(data.data);
		state.page = data.pagination.current_page;
		state.pagination.update({ page: state.page, pageSize: data.pagination.per_page, total: data.pagination.total_count });
		setShown(byId('clinicPagination'), true);
	} catch {
		if (revision === state.revision) renderICDState('Không tải được danh sách ICD. Vui lòng thử lại.', true);
	} finally {
		if (revision === state.revision) busy(false);
	}
	return undefined;
}
export const reloadCurrentPage = () => loadICDList(state.page);

async function loadDiseaseGroups() {
	const select = byId('diseaseGroupFilter');
	try {
		const response = await fetch('/api/icd/groups/list');
		if (!response.ok) return;
		const groups = await response.json();
		const selected = select.value;
		select.querySelectorAll('option').forEach(option => { if (option.value !== '') option.remove(); });
		groups.forEach(group => select.append(new Option(group, group)));
		if (selected) select.value = selected;
	} catch { /* bộ lọc nhóm là tùy chọn: danh sách vẫn dùng được khi thiếu */ }
}

function searchICD() {
	state.search = byId('searchInput').value.trim();
	state.group = byId('diseaseGroupFilter').value;
	loadICDList(1);
}

export function validateField(field) {
	const value = field.value.trim();
	const feedback = [...field.parentElement.children].filter(node => node !== field && node.classList.contains('invalid-feedback'));
	let error = '';
	field.classList.remove('is-invalid', 'is-valid');
	feedback.forEach(node => { node.textContent = ''; });
	if (field.required && !value) error = 'Trường này là bắt buộc';
	const maxLength = parseInt(field.getAttribute('maxlength'), 10);
	if (value && maxLength && value.length > maxLength) error = `Không được vượt quá ${maxLength} ký tự`;
	if (field.getAttribute('name') === 'icd_code' && value && !/^[A-Z0-9.-]+$/i.test(value)) error = 'Mã ICD chỉ được chứa chữ cái, số, dấu gạch ngang và dấu chấm';
	if (error) {
		field.classList.add('is-invalid');
		feedback.forEach(node => { node.textContent = error; });
	} else if (value) {
		field.classList.add('is-valid');
	}
	return !error;
}

const validateForm = () => (state.editMode ? ['editICDCode', 'editDiseaseName'] : ['icdCode', 'diseaseName']).map(id => validateField(byId(id))).every(Boolean);

function resetForm() {
	byId('addICDForm').reset();
	byId('editICDForm').reset();
	document.querySelectorAll(FORM_FIELDS).forEach(field => field.classList.remove('is-invalid', 'is-valid'));
	document.querySelectorAll('#addICDForm .invalid-feedback, #editICDForm .invalid-feedback').forEach(node => { node.textContent = ''; });
	state.editMode = false;
	state.currentId = null;
}

async function editICD(id) {
	try {
		busy(true);
		const response = await fetch(`/api/icd/${id}`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
		if (!response.ok) throw new Error('Lỗi khi tải thông tin ICD');
		const icd = await response.json();
		byId('editICDId').value = icd.id;
		byId('editICDCode').value = icd.icd_code ?? '';
		byId('editDiseaseName').value = icd.disease_name ?? '';
		byId('editDescription').value = icd.description || '';
		byId('editDiseaseGroup').value = icd.disease_group || '';
		state.editMode = true;
		state.currentId = id;
		modal('editICDModal').show();
	} catch {
		showToast('Lỗi khi tải thông tin ICD', 'error');
	} finally {
		busy(false);
	}
}

function setSaving(show) {
	document.querySelectorAll('#addICDForm button[type="submit"], #editICDForm button[type="submit"]').forEach(button => {
		button.disabled = show;
		button.setAttribute('aria-busy', String(show));
	});
}

export async function saveICD() {
	if (state.saving || !validateForm()) return;
	const editing = state.editMode;
	const prefix = editing ? 'edit' : '';
	const value = (name, plain) => byId(editing ? `${prefix}${name}` : plain).value.trim();
	state.saving = true;
	try {
		setSaving(true);
		const payload = { icd_code: value('ICDCode', 'icdCode'), disease_name: value('DiseaseName', 'diseaseName'), description: value('Description', 'description'), disease_group: value('DiseaseGroup', 'diseaseGroup') };
		const response = await fetch(editing ? `/api/icd/${state.currentId}` : '/api/icd/', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		if (!response.ok) throw new Error('Lỗi khi lưu mã ICD');
		showToast(editing ? 'Cập nhật mã ICD thành công' : 'Thêm mã ICD thành công', 'success');
		modal(editing ? 'editICDModal' : 'addICDModal').hide();
		reloadCurrentPage();
	} catch {
		showToast('Không thể lưu mã ICD. Vui lòng kiểm tra thông tin và thử lại.', 'error');
	} finally {
		state.saving = false;
		setSaving(false);
	}
}

function showDeleteLoading(show) {
	byId('deleteSpinner').classList.toggle('d-none', !show);
	byId('deleteIcon').classList.toggle('d-none', show);
	byId('confirmDeleteBtn').disabled = show;
}

async function confirmDelete() {
	try {
		showDeleteLoading(true);
		const response = await fetch(`/api/icd/${state.currentId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
		if (!response.ok) throw new Error('Lỗi khi xóa mã ICD');
		showToast('Xóa mã ICD thành công', 'success');
		modal('deleteModal').hide();
		reloadCurrentPage();
	} catch {
		showToast('Không thể xóa mã ICD. Vui lòng thử lại.', 'error');
	} finally {
		showDeleteLoading(false);
	}
}

function bind() {
	on(byId('icdSearchForm'), 'submit', event => {
		event.preventDefault();
		searchICD();
	});
	delegate(byId('icdTableBody'), 'click', '#retryICDList', () => reloadCurrentPage());
	delegate(byId('icdTableBody'), 'click', '[data-icd-action]', (event, button) => {
		if (button.dataset.icdAction === 'edit') {
			editICD(Number(button.dataset.icdId));
			return;
		}
		state.currentId = Number(button.dataset.icdId);
		byId('deleteICDCode').textContent = button.dataset.icdCode;
		modal('deleteModal').show();
	});
	on(byId('diseaseGroupFilter'), 'change', searchICD);
	document.querySelectorAll(FORM_FIELDS).forEach(field => on(field, 'blur', () => validateField(field)));
	['addICDModal', 'editICDModal'].forEach(id => on(byId(id), 'hidden.bs.modal', resetForm));
	['addICDForm', 'editICDForm'].forEach(id => on(byId(id), 'submit', event => {
		event.preventDefault();
		saveICD();
	}));
	on(byId('confirmDeleteBtn'), 'click', confirmDelete);
	bindImportExport({ showToast, reload: reloadCurrentPage });
}

state.pagination = window.QLPKPagination.create({ onChange(page, size) {
	state.pageSize = size;
	loadICDList(page);
} });
bind();
loadICDList();
loadDiseaseGroups();
window.QLPKRealtimePageHooks?.register({
	types: ['catalog.changed'],
	filter: event => event && event.payload && event.payload.entity === 'icd',
	handler() {
		reloadCurrentPage();
		loadDiseaseGroups();
	},
	debounceMs: 350,
});
