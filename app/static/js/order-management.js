/* global checkSurveyStatusUpdate, deleteOrder, loadOrderDetail */
/* exported FILTER_INPUT_DEBOUNCE_MS, RESULT_FILE_EXTENSIONS, RESULT_FILE_MAX_BYTES, attrJson, currentExaminationId, currentOrderDetail, currentPage, currentSurveySession, filterInputTimer, formatDateOnly, lastKnownSurveyStatus, orderStatusChangeHandler, patientInputHandler, patientInputKeydownHandler, saveCustomOrderNote, showConfirmDialog */

// Order Management - Quản lý chỉ định CLS

// Configuration constants for DASS-21 survey

// Global variables
let currentPage = 1;
const perPage = 50;
let totalPages = 1;
let totalOrders = 0;
const selectedOrderIds = new Set();
let currentOrderDetail = null;
let saveCustomOrderNote = null;

// Survey realtime context for modal refresh
let lastKnownSurveyStatus = null;
let currentExaminationId = null;
let currentSurveySession = null;


// Handler reference cho orderStatusSelect autosave (để có thể remove listener)
let orderStatusChangeHandler = null;

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
let filterInputTimer = null;
let patientInputHandler = null; // Store handler reference for cleanup
let patientInputKeydownHandler = null; // Store keydown handler reference for cleanup

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
    return `<span class="qlpk-status status-pill ${config.className} ${escapeHtml(status)}">${escapeHtml(config.label)}</span>`;
}

function buildOrdersQuery() {
	const params = new URLSearchParams();
	if (filterState.patient_name) params.append('patient_name', filterState.patient_name);
	if (filterState.from_date) params.append('from_date', filterState.from_date);
	if (filterState.to_date) params.append('to_date', filterState.to_date);
	params.append('status_group', filterState.status_group);
	if (filterState.location_type) params.append('location_type', filterState.location_type);
	params.append('page', currentPage);
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
	currentPage = data.page || 1;
	document.getElementById('ordersActiveCount').textContent = data.group_counts.active;
	document.getElementById('ordersCompletedCount').textContent = data.group_counts.completed;
}

function scheduleOrderExpiryRefresh(nextExpiryAt) {
	clearTimeout(expiryRefreshTimer);
	if (!nextExpiryAt) return;
	const delay = Math.max(100, Math.min(2147483647, new Date(nextExpiryAt).getTime() - Date.now() + 100));
	expiryRefreshTimer = setTimeout(async () => {
		await loadOrders();
		if (currentExaminationId) await checkSurveyStatusUpdate(currentExaminationId);
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
		tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-navy">
                    <i class="bi bi-inbox om-empty-icon"></i>
                    <p class="mt-2 mb-0">Chưa có chỉ định nào</p>
                </td>
            </tr>
        `;
		return;
	}

	tbody.innerHTML = orders.map((order, index) => {
		const patient = order.patient || {};
		const doctor = order.doctor || {};

		const patientName = patient.full_name || '—';
		const patientPhone = patient.phone || 'Chưa có';
		const orderName = order.order_name || '—';
		const doctorName = doctor.full_name || doctor.name || '—';
		const createdDate = formatDisplayDate(order.created_at);
		const statusBadge = getStatusBadge(order.status);
		const orderId = order.id;

		return `
            <tr data-order-id="${orderId}">
                <td>${(currentPage - 1) * perPage + index + 1}</td>
                <td>
                    <div class="fw-semibold">
                        <a href="#" class="text-decoration-none order-detail-link" data-order-id="${orderId}">${escapeHtml(patientName)}</a>
                    </div>
                    <small class="text-navy">SĐT: ${escapeHtml(patientPhone)}</small>
                </td>
                <td>${escapeHtml(orderName)}</td>
                <td>${escapeHtml(doctorName)}</td>
                <td>${createdDate}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="om-actions">
                        ${window.QLPKIconSystem.renderActionButton({ action: 'edit', label: 'Chi tiết chỉ định', className: 'order-detail-btn', attrs: { 'data-order-id': orderId } })}
                        ${window.QLPKIconSystem.renderActionButton({ action: 'delete', label: 'Xóa chỉ định', className: 'order-delete-btn', attrs: { 'data-order-id': orderId } })}
                    </div>
                </td>
            </tr>
        `;
	}).join('');

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

// Escape HTML
function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function attrJson(values) {
	return JSON.stringify(values).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
		footer.innerHTML = `
            <span>${totalOrders} chỉ định / ${totalPages} trang</span>
            ${totalPages > 1 ? `<nav class="d-flex align-items-center gap-2" aria-label="Phân trang chỉ định">
                <button type="button" class="om-button om-button--secondary" id="ordersPrevPage" ${currentPage === 1 ? 'disabled' : ''}>Trước</button>
                <label class="d-flex align-items-center gap-2">Trang <input id="ordersPageNumber" class="form-control form-control-sm om-page-number" type="number" min="1" max="${totalPages}" value="${currentPage}"></label>
                <button type="button" class="om-button om-button--secondary" id="ordersNextPage" ${currentPage === totalPages ? 'disabled' : ''}>Sau</button>
            </nav>` : ''}
        `;
		const go = value => {
			const page = Number(value);
			if (!Number.isInteger(page) || page < 1 || page > totalPages) {
				document.getElementById('ordersPageNumber').value = currentPage;
				return;
			}
			currentPage = page;
			loadOrders();
		};
		document.getElementById('ordersPrevPage')?.addEventListener('click', () => go(currentPage - 1));
		document.getElementById('ordersNextPage')?.addEventListener('click', () => go(currentPage + 1));
		document.getElementById('ordersPageNumber')?.addEventListener('change', event => go(event.target.value));
	}
}
