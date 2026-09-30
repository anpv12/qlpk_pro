// Drug interaction catalog: CRUD, creatable active-ingredient autocomplete, Excel template/import.
import { byId, delegate, el, icon, on, replace } from './shared/dom.js';
import { downloadFile, HttpError, requestJson } from './shared/http-json.js';
import { setupIngredientAutocomplete } from './drug-interaction-autocomplete.js';

const API_BASE = '/api/drug-interactions';
const ACTIVE_INGREDIENT_API = '/api/active-ingredient?limit=10000';
const state = { interactions: [], ingredients: [], editingId: null };
const FIELDS = ['consequence', 'mechanism', 'management', 'notes'];

const normalize = value => window.QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
const toast = (type, message) => window.QLPKUserFeedback?.show(type, message);
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));

function typeBadge(contra, classes) {
	return el('span', { class: contra ? classes.contra : classes.approved },
		icon(contra ? 'bi-x-octagon-fill' : 'bi-check-circle-fill'), contra ? ' Chống chỉ định' : ' Được đồng thuận');
}

function rowButton(kind, title, iconName, id, className) {
	return el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: className, title,
		dataset: { diAction: kind, diId: id } }, icon(iconName));
}

function interactionRow(item, index) {
	return el('tr', {},
		el('td', {}, index),
		el('td', {}, el('div', { class: 'fw-semibold' }, item.hoat_chat_1 || '—')),
		el('td', { class: 'text-center text-muted' }, icon('bi-arrow-left-right')),
		el('td', {}, el('div', { class: 'fw-semibold' }, item.hoat_chat_2 || '—')),
		el('td', { class: 'text-center' }, typeBadge(item.interaction_type === 'contraindicated', { contra: 'badge-type badge-contra', approved: 'badge-type badge-approved' })),
		el('td', {}, el('div', { class: 'di-preline' }, item.consequence || '—')),
		el('td', {}, el('div', { class: 'd-flex gap-1' },
			rowButton('view', 'Xem', 'bi-eye', item.id, 'btn btn-sm btn-outline-secondary'),
			rowButton('edit', 'Sửa', 'bi-pencil', item.id, 'btn btn-sm'),
			rowButton('danger', 'Xóa', 'bi-trash', item.id, 'btn btn-sm'))));
}

function renderPage(items, offset) {
	const body = byId('di-table-body');
	if (!items.length) {
		replace(body, el('tr', {}, el('td', { colspan: 7, class: 'text-center text-muted py-4' },
			icon('bi-inbox', 'di-empty-icon'), el('br'), 'Chưa có tương tác nào')));
		return;
	}
	replace(body, items.map((item, index) => interactionRow(item, offset + index + 1)));
}

const pagination = window.QLPKPagination.createClient({ render: renderPage });

async function loadInteractions() {
	try {
		state.interactions = await requestJson(API_BASE);
		pagination.setItems(state.interactions);
	} catch (error) {
		console.error('Load interactions error:', error);
	}
}

async function loadActiveIngredients() {
	try {
		const response = await requestJson(ACTIVE_INGREDIENT_API);
		if (response.success && response.data) state.ingredients = response.data.map(item => item.ten_hoat_chat);
	} catch (error) {
		console.error('Load active ingredients error:', error);
	}
}

function setModalTitle(text) {
	replace(byId('di-modal-title'), icon('bi-exclamation-triangle'), ` ${text}`);
}

function openAddModal() {
	state.editingId = null;
	setModalTitle('Thêm tương tác thuốc');
	byId('di-form').reset();
	byId('di-med1-id').value = '';
	byId('di-med2-id').value = '';
	byId('di-type-contra').checked = true;
	modal('diModal').show();
}

function viewInteraction(id) {
	const item = state.interactions.find(entry => entry.id === id);
	if (!item) return;
	byId('view-med1').textContent = item.hoat_chat_1 || '—';
	byId('view-med2').textContent = item.hoat_chat_2 || '—';
	replace(byId('view-type'), typeBadge(item.interaction_type === 'contraindicated', { contra: 'di-view-type-contra', approved: 'di-view-type-approved' }));
	FIELDS.forEach(field => { byId(`view-${field}`).textContent = item[field] || '—'; });
	modal('diViewModal').show();
}

function editInteraction(id) {
	const item = state.interactions.find(entry => entry.id === id);
	if (!item) return;
	state.editingId = id;
	setModalTitle('Sửa tương tác thuốc');
	['1', '2'].forEach(n => {
		byId(`di-med${n}`).value = item[`hoat_chat_${n}`] || '';
		byId(`di-med${n}-id`).value = item[`hoat_chat_${n}`] || '';
	});
	byId(item.interaction_type === 'contraindicated' ? 'di-type-contra' : 'di-type-approved').checked = true;
	FIELDS.forEach(field => { byId(`di-${field}`).value = item[field] || ''; });
	modal('diModal').show();
}

async function saveNewIngredientIfNeeded(name) {
	if (state.ingredients.some(entry => normalize(entry) === normalize(name))) return;
	try {
		await requestJson('/api/active-ingredient', { method: 'POST', json: { ten_hoat_chat: name } });
	} catch (error) {
		if (!(error instanceof HttpError)) console.error('Auto-save ingredient error:', error);
	}
}

async function saveInteraction(event) {
	event.preventDefault();
	const hc1 = byId('di-med1-id').value;
	const hc2 = byId('di-med2-id').value;
	if (!hc1 || !hc2) {
		toast('error', 'Vui lòng nhập/chọn đủ 2 hoạt chất');
		return;
	}
	const payload = { hoat_chat_1: hc1, hoat_chat_2: hc2, interaction_type: document.querySelector('input[name="interaction_type"]:checked').value };
	FIELDS.forEach(field => { payload[field] = byId(`di-${field}`).value.trim(); });
	try {
		await saveNewIngredientIfNeeded(hc1);
		await saveNewIngredientIfNeeded(hc2);
		const editing = state.editingId;
		await requestJson(editing ? `${API_BASE}/${editing}` : API_BASE, { method: editing ? 'PUT' : 'POST', json: payload });
		toast('success', editing ? 'Cập nhật thành công' : 'Thêm thành công');
		window.bootstrap.Modal.getInstance(byId('diModal')).hide();
		loadInteractions();
		loadActiveIngredients();
	} catch (error) {
		toast('error', error instanceof HttpError ? 'Không thể lưu tương tác thuốc. Vui lòng kiểm tra lại.' : 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
	}
}

async function removeInteraction(id) {
	if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc muốn xóa tương tác này?')) return;
	try {
		await requestJson(`${API_BASE}/${id}`, { method: 'DELETE' });
		toast('success', 'Đã xóa');
		loadInteractions();
	} catch (error) {
		toast('error', error instanceof HttpError ? 'Không thể xóa tương tác thuốc. Vui lòng thử lại.' : 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
	}
}

function setupSearch() {
	on(byId('di-search'), 'input', event => {
		const query = normalize(event.target.value);
		pagination.setItems(query ? state.interactions.filter(item => ['hoat_chat_1', 'hoat_chat_2', 'consequence']
			.some(field => normalize(item[field]).includes(query))) : state.interactions);
	});
}

async function importFile(input) {
	const file = input.files && input.files[0];
	if (!file) return;
	const formData = new FormData();
	formData.append('file', file);
	toast('success', 'Đang xử lý file...');
	try {
		const result = await requestJson('/api/drug-interactions/import', { method: 'POST', body: formData });
		if (result.success) {
			toast('success', 'Đã nhập dữ liệu tương tác thuốc.');
			loadInteractions();
		} else {
			toast('error', 'Không thể nhập tương tác thuốc. Vui lòng kiểm tra tệp và thử lại.');
		}
	} catch {
		toast('error', 'Không thể nhập tương tác thuốc. Vui lòng kiểm tra tệp và thử lại.');
	}
	input.value = '';
}

function bindActions() {
	on(byId('di-form'), 'submit', saveInteraction);
	on(byId('btn-add-interaction'), 'click', openAddModal);
	on(byId('btn-di-download-template'), 'click', () => downloadFile('/api/drug-interactions/template', 'mau_import_tuong_tac_thuoc.xlsx')
		.catch(() => toast('error', 'Có lỗi xảy ra khi tải file mẫu')));
	on(byId('btn-di-import-excel'), 'click', () => byId('di-import-file').click());
	on(byId('di-import-file'), 'change', event => importFile(event.target));
	const actions = { view: viewInteraction, edit: editInteraction, danger: removeInteraction };
	delegate(byId('di-table-body'), 'click', '[data-di-action]', (event, button) => actions[button.dataset.diAction](Number(button.dataset.diId)));
}

async function init() {
	await loadActiveIngredients();
	await loadInteractions();
	const ingredients = () => state.ingredients;
	setupIngredientAutocomplete(byId('di-med1'), byId('di-med1-id'), ingredients, normalize);
	setupIngredientAutocomplete(byId('di-med2'), byId('di-med2-id'), ingredients, normalize);
	setupSearch();
	bindActions();
	window.QLPKRealtimePageHooks?.register({
		types: ['inventory.changed'], debounceMs: 500,
		async handler(event) {
			const entity = event && event.payload ? event.payload.entity : null;
			if (!entity || entity === 'drug_interaction' || entity === 'active_ingredient') {
				await loadActiveIngredients();
				await loadInteractions();
			}
		},
	});
}

init();
