import { state } from './state.js';
import { byId, el, icon, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { formatDateTime, showLoading } from './output.js';
import { isPaymentPaid, perPage, showCustomToast } from '../payment-waiting.js';

// Load payment data from API
async function loadPaymentData() {
	showLoading(true);
	const params = new URLSearchParams({ page: state.currentPage, per_page: perPage, status: byId('statusFilter').value,
		start_date: byId('startDate').value, end_date: byId('endDate').value, search: byId('searchInput').value });
	try {
		const response = await requestJson(`/api/payment-waiting?${params}`);
		state.paymentData = response.data || [];
		state.totalItems = response.total || 0;
		state.totalPages = Math.ceil(state.totalItems / perPage);
		state.filteredData = [...state.paymentData];
		renderPaymentTable();
		updatePagination();
	} catch {
		showCustomToast('error', 'Có lỗi xảy ra khi tải dữ liệu');
	}
	showLoading(false);
}

function rowButton(className, title, iconName, id) {
	return el('button', { 'data-qlpk-button': 'edit', 'data-qlpk-button-variant': 'soft', class: `btn btn-sm ${className}`, 'data-payment-id': id, title }, icon(iconName));
}

// Render payment table; blank filler rows keep the grid height at one full page.
function renderPaymentTable() {
	const tbody = byId('paymentTableBody');
	if (!state.filteredData.length) {
		replace(tbody, el('tr', {}, el('td', { colspan: 7, class: 'text-center py-4' }, icon('bi-inbox', 'text-muted pw-empty-icon'), el('p', { class: 'text-muted mt-2' }, 'Không có dữ liệu'))));
		return;
	}
	const rows = state.filteredData.map(payment => {
		const id = Number(payment.id) || 0;
		return el('tr', {},
			el('td', {}, el('input', { type: 'checkbox', class: 'form-check-input payment-checkbox', value: id })),
			el('td', {}, payment.patient_name || ''), el('td', {}, payment.phone_number || ''),
			el('td', {}, formatDateTime(payment.examination_date)), el('td', {}, payment.doctor_name || ''),
			el('td', {}, statusBadge(payment)),
			el('td', { class: 'text-center' }, el('div', { class: 'd-flex gap-1 justify-content-center' },
				rowButton('js-edit-payment', 'Chỉnh sửa', 'bi-pencil', id), ' ', rowButton('js-delete-payment', 'Trả lại', 'bi-trash', id))));
	});
	const fillers = Array.from({ length: Math.max(0, perPage - state.filteredData.length) }, () =>
		el('tr', { class: 'empty-row pw-empty-row' }, el('td', {}, '\u00a0'), Array.from({ length: 6 }, () => el('td'))));
	replace(tbody, rows, fillers);
}

function statusBadge(payment) {
	return isPaymentPaid(payment)
		? el('span', { class: 'qlpk-status qlpk-status--success pw-payment-status' }, icon('bi-check-circle-fill'), 'Đã thanh toán')
		: el('span', { class: 'qlpk-status qlpk-status--warning pw-payment-status' }, icon('bi-clock-fill'), 'Chờ thanh toán');
}

function pageItem(label, page, stateClass) {
	return el('li', { class: `page-item ${stateClass}` }, el('a', { class: 'page-link js-change-page', href: '#', 'data-page': page }, label));
}

function updatePagination() {
	const pagination = byId('pagination');
	if (state.totalPages <= 1) {
		replace(pagination);
		return;
	}
	const pages = [];
	for (let i = Math.max(1, state.currentPage - 2); i <= Math.min(state.totalPages, state.currentPage + 2); i++) pages.push(pageItem(i, i, i === state.currentPage ? 'active' : ''));
	replace(pagination, pageItem('Trước', state.currentPage - 1, state.currentPage === 1 ? 'disabled' : ''), pages,
		pageItem('Sau', state.currentPage + 1, state.currentPage === state.totalPages ? 'disabled' : ''));
	byId('totalItems').textContent = state.totalItems;
}

function changePage(page) {
	if (page < 1 || page > state.totalPages) return;
	state.currentPage = page;
	loadPaymentData();
}

function performSearch() {
	state.currentPage = 1;
	loadPaymentData();
}

function applyFilters() {
	state.currentPage = 1;
	loadPaymentData();
}

function updateSelectedItems() {
	const boxes = [...document.querySelectorAll('.payment-checkbox')];
	const checked = boxes.filter(box => box.checked);
	state.selectedItems = checked.map(box => box.value);
	const selectAll = byId('selectAll');
	selectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
	if (checked.length === 0) selectAll.checked = false;
	else if (checked.length === boxes.length) selectAll.checked = true;
}

export { applyFilters, changePage, loadPaymentData, performSearch, updateSelectedItems };
