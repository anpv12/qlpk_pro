import { el, replace } from './shared/dom.js';
import { state } from './orders/order-management-state.js';
import { checkSurveyStatusUpdate } from './orders/order-management-survey-level.js';
import { loadOrderDetail } from './orders/order-management-detail.js';
import { deleteOrder } from './orders/order-management-actions.js';
import { initializePage } from './orders/order-management-init.js';

// Order Management - Quản lý chỉ định CLS

// Configuration constants for DASS-21 survey

// Global variables
state.currentPage = 1;
const perPage = 50;
let totalPages = 1;
let totalOrders = 0;
const selectedOrderIds = new Set();
state.currentOrderDetail = null;
state.saveCustomOrderNote = null;

// Survey realtime context for modal refresh
state.lastKnownSurveyStatus = null;
state.currentExaminationId = null;
state.currentSurveySession = null;


// Handler reference cho orderStatusSelect autosave (để có thể remove listener)
state.orderStatusChangeHandler = null;

// Filter state
const filterState = {
	patient_name: '',
	from_date: '',
	to_date: '',
	status_group: 'active',
	location_type: '' // Thay đổi mặc định từ 'in' thành '' để hiển thị tất cả
};

let ordersRequestVersion = 0;
let expiryRefreshTimer = null;
const RESULT_FILE_MAX_BYTES = 25 * 1024 * 1024;
const RESULT_FILE_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']);
const FILTER_INPUT_DEBOUNCE_MS = 200; // Giảm từ 400ms xuống 200ms để search nhanh hơn
state.filterInputTimer = null;
state.patientInputHandler = null; // Store handler reference for cleanup
state.patientInputKeydownHandler = null; // Store keydown handler reference for cleanup

// API call wrapper
function apiCall(url, options = {}) {
	const defaultOptions = {
		headers: {
			'Content-Type': 'application/json'
		}
	};

	const finalOptions = {
		...defaultOptions,
		...options,
		headers: {
			...(defaultOptions.headers || {}),
			...(options.headers || {})
		}
	};

	return fetch(url, finalOptions)
		.then(response => {
			if (response.status === 401) {
				window.location.href = '/login.html';
			}
			return response;
		});
}

// Toast notification
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

// Confirm dialog với SweetAlert2
async function showConfirmDialog({
	title = 'Xác nhận',
	text = 'Bạn có chắc chắn muốn thực hiện?',
	icon = 'warning',
	confirmText = 'Xác nhận',
	cancelText = 'Hủy bỏ',
	variant = 'danger'
} = {}) {
	if (typeof Swal === 'undefined') {
		showCustomToast('error', 'Không thể mở hộp thoại xác nhận. Thao tác đã được hủy.');
		return false;
	}

	const allowedVariants = new Set(['danger', 'warning', 'primary', 'success']);
	const confirmVariant = allowedVariants.has(variant) ? variant : 'danger';

	const result = await Swal.fire({
		title: title,
		text: text,
		icon: icon,
		showCancelButton: true,
		confirmButtonText: confirmText,
		cancelButtonText: cancelText,
		buttonsStyling: false,
		reverseButtons: true,
		focusCancel: true,
		customClass: {
			container: 'qlpk-confirm-container',
			popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${confirmVariant}`,
			icon: 'qlpk-confirm-dialog__icon',
			title: 'qlpk-confirm-dialog__title',
			htmlContainer: 'qlpk-confirm-dialog__text',
			actions: 'qlpk-confirm-dialog__actions',
			confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${confirmVariant}`,
			cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
		}
	});

	return result.isConfirmed;
}

// Hàm hiển thị ngày giờ (dd/mm/yyyy HH:mm)
function formatDisplayDate(dateString) {
	if (!dateString) return '—';
	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '—';

		// Dùng window.formatDateDisplay cho phần ngày
		const datePart = window.formatDateDisplay(date);

		// Thêm phần giờ
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${datePart} ${hours}:${minutes}`;
	} catch (e) {
		return dateString;
	}
}

// Hàm hiển thị chỉ ngày (dd/mm/yyyy)
function formatDateOnly(dateString) {
	if (!dateString) return '—';
	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '—';
		return window.formatDateDisplay(date);
	} catch (e) {
		return dateString;
	}
}

// Get status badge HTML
function getStatusBadge(status) {
    const config = window.ClinicalOrderStatusUtils.getOrderStatusConfig(status);
    return el('span', { class: `qlpk-status status-pill ${config.className} ${status ?? ''}` }, config.label ?? '');
}

function buildOrdersQuery() {
	const params = new URLSearchParams();
	if (filterState.patient_name) params.append('patient_name', filterState.patient_name);
	if (filterState.from_date) params.append('from_date', filterState.from_date);
	if (filterState.to_date) params.append('to_date', filterState.to_date);
	params.append('status_group', filterState.status_group);
	if (filterState.location_type) params.append('location_type', filterState.location_type);
	params.append('page', state.currentPage);
	params.append('per_page', perPage);
	return params;
}

async function readOrdersError(response) {
	const errorText = await response.text();
	console.error('API Error Response:', response.status, errorText);
	let error;
	try {
		error = JSON.parse(errorText);
	} catch (e) {
		error = { detail: errorText || 'Lỗi không xác định' };
	}
	return new Error(error.detail || 'Lỗi khi tải danh sách chỉ định');
}

function applyOrdersPage(data) {
	totalOrders = data.total || 0;
	totalPages = data.total_pages || 1;
	state.currentPage = data.page || 1;
	document.getElementById('ordersActiveCount').textContent = data.group_counts.active;
	document.getElementById('ordersCompletedCount').textContent = data.group_counts.completed;
}

function scheduleOrderExpiryRefresh(nextExpiryAt) {
	clearTimeout(expiryRefreshTimer);
	if (!nextExpiryAt) return;
	const delay = Math.max(100, Math.min(2147483647, new Date(nextExpiryAt).getTime() - Date.now() + 100));
	expiryRefreshTimer = setTimeout(async () => {
		await loadOrders();
		if (state.currentExaminationId) await checkSurveyStatusUpdate(state.currentExaminationId);
	}, delay);
}

async function loadOrders() {
	const version = ++ordersRequestVersion;
	try {
		const response = await apiCall(`/api/chi-dinh?${buildOrdersQuery().toString()}`);
		if (!response.ok) throw await readOrdersError(response);

		const data = await response.json();
		if (version !== ordersRequestVersion) return;
		applyOrdersPage(data);
		scheduleOrderExpiryRefresh(data.next_expiry_at);

		renderOrdersTable(data.chi_dinh || []);
		updateSelectedCount();

	} catch (error) {
		if (version !== ordersRequestVersion) return;
		console.error('Error loading orders:', error);
		showCustomToast('error', 'Không thể tải danh sách chỉ định. Vui lòng thử lại.');
		renderOrdersTable([]);
	}
}

// Render orders table
function renderOrdersTable(orders) {
	const tbody = document.querySelector('#ordersTableBody');
	if (!tbody) return;

	if (orders.length === 0) {
		replace(tbody, el('tr', null,
			el('td', { colspan: '7', class: 'text-center py-4 text-navy' },
				el('i', { class: 'bi bi-inbox om-empty-icon' }),
				el('p', { class: 'mt-2 mb-0' }, 'Chưa có chỉ định nào'))));
		return;
	}

	const icons = window.QLPKIconSystem;
	replace(tbody, orders.map((order, index) => {
		const patient = order.patient || {};
		const doctor = order.doctor || {};
		const orderId = order.id;
		return el('tr', { 'data-order-id': orderId },
			el('td', null, (state.currentPage - 1) * perPage + index + 1),
			el('td', null,
				el('div', { class: 'fw-semibold' },
					el('a', { href: '#', class: 'text-decoration-none order-detail-link', 'data-order-id': orderId }, patient.full_name || '—')),
				' ',
				el('small', { class: 'text-navy' }, `SĐT: ${patient.phone || 'Chưa có'}`)
			),
			el('td', null, order.order_name || '—'),
			el('td', null, doctor.full_name || doctor.name || '—'),
			el('td', null, formatDisplayDate(order.created_at)),
			el('td', null, getStatusBadge(order.status)),
			el('td', null,
				el('div', { class: 'om-actions' },
					icons.createActionButton({ action: 'edit', label: 'Chi tiết chỉ định', className: 'order-detail-btn', attrs: { 'data-order-id': orderId } }),
					' ',
					icons.createActionButton({ action: 'delete', label: 'Xóa chỉ định', className: 'order-delete-btn', attrs: { 'data-order-id': orderId } })
				)
			)
		);
	}));

	// Update total count in header
	const headerCount = document.querySelector('.order-card h4');
	if (headerCount) {
		headerCount.textContent = `Danh sách chỉ định CLS (${totalOrders})`;
	}
	const statTotal = document.getElementById('stat-total');
	if (statTotal) {
		statTotal.textContent = totalOrders;
	}

	// Attach event listeners
	attachTableEventListeners();
}

// Attach event listeners to table
function attachTableEventListeners() {
	// Checkbox select
	document.querySelectorAll('.order-select').forEach(checkbox => {
		checkbox.addEventListener('change', function () {
			const orderId = parseInt(this.dataset.orderId);
			if (this.checked) {
				selectedOrderIds.add(orderId);
			} else {
				selectedOrderIds.delete(orderId);
			}
			updateSelectAllCheckbox();
			updateSelectedCount();
		});
	});

	// Detail button
	document.querySelectorAll('.order-detail-btn, .order-detail-link').forEach(btn => {
		btn.addEventListener('click', async function (e) {
			e.preventDefault();
			const orderId = parseInt(this.dataset.orderId);
			await loadOrderDetail(orderId);
		});
	});

	// Delete button
	document.querySelectorAll('.order-delete-btn').forEach(btn => {
		btn.addEventListener('click', async function (e) {
			e.preventDefault();
			const orderId = parseInt(this.dataset.orderId);
			await deleteOrder(orderId);
		});
	});
}

// Update select all checkbox
function updateSelectAllCheckbox() {
	const selectAll = document.getElementById('selectAllOrders');
	if (!selectAll) return;

	const allCheckboxes = document.querySelectorAll('.order-select');
	const checkedCount = document.querySelectorAll('.order-select:checked').length;

	selectAll.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
	selectAll.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
}

// Update selected count (Legacy function name, now just updates totals)
function updateSelectedCount() {
	const footer = document.querySelector('.order-card__footer');
	if (footer) {
		const pager = totalPages > 1 ? el('nav', { class: 'd-flex align-items-center gap-2', 'aria-label': 'Phân trang chỉ định' },
			el('button', { type: 'button', class: 'om-button om-button--secondary', id: 'ordersPrevPage', disabled: state.currentPage === 1 }, 'Trước'),
			el('label', { class: 'd-flex align-items-center gap-2' }, 'Trang ',
				el('input', { id: 'ordersPageNumber', class: 'form-control form-control-sm om-page-number', type: 'number', min: '1', max: totalPages, defaultValue: state.currentPage })),
			el('button', { type: 'button', class: 'om-button om-button--secondary', id: 'ordersNextPage', disabled: state.currentPage === totalPages }, 'Sau')
		) : null;
		replace(footer, el('span', null, `${totalOrders} chỉ định / ${totalPages} trang`), pager);
		const go = value => {
			const page = Number(value);
			if (!Number.isInteger(page) || page < 1 || page > totalPages) {
				document.getElementById('ordersPageNumber').value = state.currentPage;
				return;
			}
			state.currentPage = page;
			loadOrders();
		};
		document.getElementById('ordersPrevPage')?.addEventListener('click', () => go(state.currentPage - 1));
		document.getElementById('ordersNextPage')?.addEventListener('click', () => go(state.currentPage + 1));
		document.getElementById('ordersPageNumber')?.addEventListener('change', event => go(event.target.value));
	}
}

export { FILTER_INPUT_DEBOUNCE_MS, RESULT_FILE_EXTENSIONS, RESULT_FILE_MAX_BYTES, apiCall, filterState, formatDateOnly, formatDisplayDate, getStatusBadge, loadOrders, selectedOrderIds, showConfirmDialog, showCustomToast, updateSelectedCount };

// Entry evaluates after every slice it imports; start after DOMContentLoaded so classic page helpers
// (datepicker-init sets the default date range on that event) are ready first.
document.addEventListener('DOMContentLoaded', initializePage);
