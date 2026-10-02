// Text expansion (abbreviation) catalog: filtered server-paged list, stats, add/edit modal, delete,
// Excel import/export/template and reset. Every change refreshes the page's live expansion cache.
// Shared page runtime (formerly classic script tags), in page order.
import './shared/confirmation-dialog.js';
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import './components/clinic-pagination.js';
import './text-expansion.js';
import { byId, debounce, delegate, el, icon, on, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { QLPKConfirmationDialog } from './shared/confirmation-dialog.js';
import { QLPKPagination } from './components/clinic-pagination.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';

const state = { page: 1, pageSize: 10, revision: 0 };
const CATEGORY_LABELS = { medical: 'Y tế', psychological: 'Tâm lý', general: 'Chung' };
const toast = (type, message) => window.QLPKUserFeedback?.show(type, message);
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));
const refreshLiveCache = () => window.textExpansion?.refreshTextExpansions?.();

function categoryBadge(category) {
	const known = Object.hasOwn(CATEGORY_LABELS, category);
	return el('span', { class: `category-badge category-${known ? category : 'general'}` }, known ? CATEGORY_LABELS[category] : category);
}

function actionButton(kind, title, iconName, id) {
	return el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: 'btn btn-sm', dataset: { teAction: kind, teId: id }, title }, icon(iconName));
}

function renderRows(items) {
	const body = byId('textExpansionsTableBody');
	if (!items.length) {
		replace(body, el('tr', {}, el('td', { colspan: 6, class: 'text-center py-4' },
			icon('bi-inbox', 'text-muted text-expansion-empty-icon'), el('div', { class: 'text-muted mt-2' }, 'Không có dữ liệu'))));
		return;
	}
	replace(body, items.map(item => el('tr', {},
		el('td', {}, el('strong', {}, item.abbreviation)),
		el('td', {}, item.full_text),
		el('td', {}, categoryBadge(item.category)),
		el('td', {}, item.description || '-'),
		el('td', {}, item.is_active ? el('span', { class: 'qlpk-status qlpk-status--success' }, 'Đang hoạt động') : el('span', { class: 'qlpk-status qlpk-status--neutral' }, 'Không hoạt động')),
		el('td', {}, el('div', { class: 'action-buttons' }, actionButton('edit', 'Sửa', 'bi-pencil', item.id), ' ', actionButton('danger', 'Xóa', 'bi-trash', item.id))))));
}

async function loadTextExpansions(page = 1) {
	const revision = ++state.revision;
	const category = byId('categoryFilter').value;
	const status = byId('statusFilter').value;
	const search = byId('searchInput').value;
	const params = new URLSearchParams({ page, per_page: state.pageSize, ...(category && category !== 'all' && { category }), ...(status && { is_active: status }), ...(search && { search }) });
	try {
		const response = await requestJson(`/api/text-expansions/?${params}`);
		if (revision !== state.revision) return;
		if (!response.success) throw new Error('list rejected');
		const lastPage = Math.max(1, response.pagination.pages);
		if (page > lastPage) {
			loadTextExpansions(lastPage);
			return;
		}
		renderRows(response.data);
		state.pagination.update({ page: response.pagination.page, pageSize: state.pageSize, total: response.pagination.total });
		state.page = response.pagination.page;
	} catch {
		toast('error', 'Không thể tải danh sách từ viết tắt. Vui lòng thử lại.');
	}
}

async function loadStats() {
	try {
		const response = await requestJson('/api/text-expansions/');
		if (!response.success) return;
		const total = response.pagination.total;
		const active = response.data.filter(item => item.is_active).length;
		byId('totalCount').textContent = total;
		byId('activeCount').textContent = active;
		byId('inactiveCount').textContent = total - active;
		byId('categoryCount').textContent = new Set(response.data.map(item => item.category)).size;
	} catch { /* thống kê là phụ: giữ số cũ khi lỗi */ }
}

function afterChange(page = state.page) {
	loadTextExpansions(page);
	loadStats();
	refreshLiveCache();
}

// Runs a request whose JSON reports { success }; any failure shows the same message.
async function mutate(request, done, failed) {
	try {
		const response = await request();
		if (!response.success) throw new Error('rejected');
		done(response);
	} catch {
		toast('error', failed);
	}
}

function showAddModal() {
	byId('modalTitle').textContent = 'Thêm từ viết tắt';
	byId('textExpansionForm').reset();
	byId('expansionId').value = '';
	byId('isActive').checked = true;
	modal('textExpansionModal').show();
}

function editTextExpansion(id) {
	mutate(() => requestJson(`/api/text-expansions/${id}`), ({ data }) => {
		byId('modalTitle').textContent = 'Sửa từ viết tắt';
		byId('expansionId').value = data.id;
		byId('abbreviation').value = data.abbreviation;
		byId('fullText').value = data.full_text;
		byId('category').value = data.category;
		byId('description').value = data.description || '';
		byId('isActive').checked = Boolean(data.is_active);
		modal('textExpansionModal').show();
	}, 'Không thể tải từ viết tắt. Vui lòng thử lại.');
}

function saveTextExpansion() {
	const form = byId('textExpansionForm');
	if (!form.checkValidity()) {
		form.reportValidity();
		return;
	}
	const data = { abbreviation: byId('abbreviation').value.trim(), full_text: byId('fullText').value.trim(), category: byId('category').value,
		description: byId('description').value.trim(), is_active: byId('isActive').checked };
	const id = byId('expansionId').value;
	mutate(() => requestJson(id ? `/api/text-expansions/${id}` : '/api/text-expansions/', { method: id ? 'PUT' : 'POST', json: data }), () => {
		toast('success', id ? 'Cập nhật thành công' : 'Thêm mới thành công');
		modal('textExpansionModal').hide();
		afterChange();
	}, 'Không thể lưu từ viết tắt. Vui lòng kiểm tra lại.');
}

async function deleteTextExpansion(id) {
	if (!await QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa từ viết tắt này?')) return;
	mutate(() => requestJson(`/api/text-expansions/${id}`, { method: 'DELETE' }), () => {
		toast('success', 'Xóa thành công');
		afterChange();
	}, 'Không thể xóa từ viết tắt. Vui lòng thử lại.');
}

function showImportModal() {
	byId('importFile').value = '';
	modal('importModal').show();
}

function importFromExcel() {
	const input = byId('importFile');
	if (!input.files.length) {
		toast('error', 'Vui lòng chọn file Excel');
		return;
	}
	const formData = new FormData();
	formData.append('file', input.files[0]);
	mutate(() => requestJson('/api/text-expansions/import', { method: 'POST', body: formData }), response => {
		toast('success', 'Đã nhập từ viết tắt.');
		if (response.errors && response.errors.length > 0) toast('warning', 'Một số dòng không nhập được, vui lòng kiểm tra file.');
		modal('importModal').hide();
		afterChange();
	}, 'Không thể nhập từ viết tắt. Vui lòng kiểm tra tệp và thử lại.');
}

async function exportToExcel() {
	try {
		const response = await fetch('/api/text-expansions/export');
		if (!response.ok) throw new Error('Export failed');
		const url = URL.createObjectURL(await response.blob());
		const anchor = el('a', { href: url, download: 'text_expansions.xlsx' });
		document.body.appendChild(anchor);
		try { anchor.click(); } finally {
			anchor.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		}
	} catch {
		toast('error', 'Không thể xuất từ viết tắt. Vui lòng thử lại.');
	}
}

function downloadTemplate() {
	const rows = [
		{ abbreviation: 'bt', full_text: 'bình thường', category: 'general', description: 'Từ viết tắt cho bình thường', is_active: true },
		{ abbreviation: 'tt', full_text: 'tình trạng', category: 'general', description: 'Từ viết tắt cho tình trạng', is_active: true },
	];
	const workbook = window.XLSX.utils.book_new();
	window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(rows), 'Template');
	window.XLSX.writeFile(workbook, 'text_expansions_template.xlsx');
}

async function resetAll() {
	if (!await QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa TẤT CẢ từ viết tắt? Hành động này không thể hoàn tác!', { confirmText: 'Xóa tất cả' })) return;
	mutate(() => requestJson('/api/text-expansions/reset', { method: 'POST' }), () => {
		toast('success', 'Reset thành công');
		afterChange(1);
	}, 'Không thể khôi phục dữ liệu mặc định. Vui lòng thử lại.');
}

const PAGE_ACTIONS = { 'show-add': showAddModal, 'show-import': showImportModal, export: exportToExcel, reset: resetAll, save: saveTextExpansion,
	template: downloadTemplate, import: importFromExcel, edit: id => editTextExpansion(id), danger: id => deleteTextExpansion(id) };

delegate(document, 'click', '[data-te-action]', (event, button) => PAGE_ACTIONS[button.dataset.teAction]?.(Number(button.dataset.teId)));
on(byId('categoryFilter'), 'change', () => loadTextExpansions());
on(byId('statusFilter'), 'change', () => loadTextExpansions());
on(byId('searchInput'), 'keyup', debounce(() => loadTextExpansions(1), 500));
state.pagination = QLPKPagination.create({ onChange(page, size) {
	state.pageSize = size;
	loadTextExpansions(page);
} });
QLPKRealtimePageHooks?.register({
	types: ['catalog.changed'],
	filter: event => event && event.payload && event.payload.entity === 'text_expansion',
	handler: () => afterChange(),
	debounceMs: 350,
});
loadTextExpansions();
loadStats();
