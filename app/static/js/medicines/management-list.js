import { state } from './management-state.js';
import { byId, delegate, el, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { confirmDelete, editMedicine } from './management-form.js';
import { getUserFacingResponseMessage, medicinePageSize, setElementVisible, showCustomToast } from '../medicine-management.js';
import { updateDashboard } from './management-overview.js';
import { formatStockDisplay, showStockDetail } from './management-stock.js';
import { openMedicineReferenceReview } from './reference-review.js';
import { getPageDateFormatter } from '../shared/page-date-format.js';

// Load categories from API

// Load medicines from API
let missingImportPriceOnly = false;

const REFERENCE_REVIEW_LABELS = { confirmed: 'Đã xác nhận DAV', unlinked: 'Chọn thuốc từ DAV' };

function toggleMissingImportPriceFilter() {
	missingImportPriceOnly = !missingImportPriceOnly;
	byId('searchInput').value = '';
	document.getElementById('missingImportPriceFilter').setAttribute('aria-pressed', String(missingImportPriceOnly));
	document.getElementById('missingImportPriceFilterState').hidden = !missingImportPriceOnly;
	state.currentPage = 1;
	loadMedicines();
}

async function loadMedicines() {
	if (!window.QLPKApiTransport.hasSession()) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}
	const searchTerm = byId('searchInput').value;
	const sortBy = byId('sortByFilter')?.value || 'updated_at'; // Mặc định sort theo updated_at

	// Tạo URL với tham số phân trang và tìm kiếm
	const requestId = ++state.medicineListRequest;
	let url = `/api/medicines/?page=${state.currentPage}&per_page=${medicinePageSize}`;
	if (missingImportPriceOnly) url += '&missing_import_price=true';
	if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
	url += `&sort_by=${encodeURIComponent(sortBy)}`; // Luôn gửi sort_by

	try {
		const data = await requestJson(url);
		if (requestId !== state.medicineListRequest) return;
		state.medicines = data.medicines || [];
		state.canReviewMedicineReference = data.can_review_reference === true;
		state.totalPages = data.total_pages || 1;
		state.totalItems = data.total || 0;
	} catch (error) {
		if (requestId !== state.medicineListRequest) return;
		showCustomToast('error', error?.status === 401 ? 'Phiên đăng nhập đã hết hạn' : 'Lỗi tải danh sách thuốc');
		state.medicines = [];
		state.totalPages = 1;
		state.totalItems = 0;
	}
	renderMedicineTable();
	updateDashboard();
	updateTableInfo();
	renderPagination();
}

// Load tất cả thuốc cho dropdown (không phân trang)
async function loadAllMedicines() {
	if (!window.QLPKApiTransport.hasSession()) return;
	try {
		state.allMedicines = (await requestJson('/api/medicines/?page=1&per_page=5000')).medicines || [];
	} catch (error) {
		console.error('Error loading all medicines:', error);
		state.allMedicines = [];
	}
}

// Filter medicines based on search criteria
function filterMedicines() {
	state.currentPage = 1; // Reset về trang đầu khi filter
	loadMedicines(); // Load lại dữ liệu từ server với filter mới
}

// Reset all filters
function resetFilters() {
	missingImportPriceOnly = false;
	document.getElementById('missingImportPriceFilter').setAttribute('aria-pressed', 'false');
	document.getElementById('missingImportPriceFilterState').hidden = true;
	byId('searchInput').value = '';
	const sortBy = byId('sortByFilter');
	if (sortBy) sortBy.value = '';

	state.currentPage = 1;
	loadMedicines(); // Load lại dữ liệu từ server
}

// Hàm kiểm tra cảnh báo cho thuốc
function getMedicineWarnings(medicine) {
	const warnings = [];
	const stockQuantity = parseFloat(medicine.stock_quantity) || 0;

	// Cảnh báo tồn kho = 0
	if (stockQuantity === 0) {
		warnings.push({
			type: 'out_of_stock',
			icon: 'bi-x-circle-fill',
			color: 'error',
			text: 'Hết tồn kho'
		});
	}
	// Cảnh báo tồn kho thấp (nếu có ngưỡng cảnh báo)
	else if (medicine.low_stock_threshold && medicine.low_stock_threshold > 0) {
		const threshold = parseFloat(medicine.low_stock_threshold) || 0;
		if (stockQuantity <= threshold) {
			warnings.push({
				type: 'low_stock',
				icon: 'bi-exclamation-triangle-fill',
				color: 'warning',
				text: `Tồn kho thấp (${stockQuantity} ≤ ${threshold})`
			});
		}
	}

	// Cảnh báo sắp hết hạn (nếu có thông tin)
	if (medicine.is_expiring_soon) {
		warnings.push({
			type: 'expiring',
			icon: 'bi-clock-fill',
			color: 'warning',
			text: 'Sắp hết hạn'
		});
	}

	return warnings;
}

// Hàm render badge cảnh báo
function renderWarningBadges(warnings) {
	return (warnings || []).map(warning => [' ', el('span', { class: `badge qlpk-status--${warning.color} ms-1 medicine-warning-badge`, tabindex: '0', role: 'img', 'aria-label': warning.text },
		el('i', { class: `bi ${warning.icon}`, 'aria-hidden': 'true' }))]);
}

function initializeMedicineWarningTooltips() {
	document.querySelectorAll('#medicineTable .medicine-warning-badge').forEach(badge => {
		const tooltip = new window.bootstrap.Tooltip(badge, {
			title: badge.getAttribute('aria-label'),
			trigger: 'hover focus',
			delay: {show: 120, hide: 0},
			animation: false,
			container: 'body',
			placement: 'top',
			html: false
		});
		badge.addEventListener('keydown', event => {
			if (event.key === 'Escape') tooltip.hide();
		});
	});
}

function disposeMedicineWarningTooltips() {
	document.querySelectorAll('#medicineTable .medicine-warning-badge').forEach(badge => {
		window.bootstrap.Tooltip.getInstance(badge)?.dispose();
	});
}

const onClick = (node, handler) => { node.addEventListener('click', handler); return node; };

function referenceCell(medicine) {
	if (!state.canReviewMedicineReference) return '—';
	const className = medicine.reference_review_status === 'confirmed' ? 'stock-detail-badge mm-reference-button text-success' : 'stock-detail-badge mm-reference-button';
	return onClick(el('button', { type: 'button', class: className, title: 'Xem hoặc đổi liên kết DAV' },
		REFERENCE_REVIEW_LABELS[medicine.reference_review_status] || 'Cần xác nhận DAV'), () => openMedicineReferenceReview(medicine.id));
}

function medicineRow(medicine, index) {
	const rowNumber = (state.currentPage - 1) * medicinePageSize + index + 1;
	const batchCount = medicine.batch_count || 0;
	// Highlight màu đỏ nếu tồn kho = 0
	const stockQuantity = parseFloat(medicine.stock_quantity) || 0;
	const stockDisplayClass = stockQuantity === 0 ? 'text-danger fw-bold medicine-stock-empty' : 'medicine-stock-normal';
	const latestImportPrice = medicine.latest_batch_pricing?.import_price;
	const edit = () => editMedicine(medicine.id);
	return el('tr', {},
		el('td', {}, el('input', { type: 'checkbox', class: 'form-check-input medicine-checkbox qlpk-row-select', value: medicine.id })),
		el('td', {}, rowNumber),
		el('td', {}, onClick(el('span', { class: 'medicine-link' }, medicine.name || ''), edit), renderWarningBadges(getMedicineWarnings(medicine))),
		el('td', {}, medicine.nearest_expiry_date ? formatDate(medicine.nearest_expiry_date) : '-'),
		el('td', {}, latestImportPrice != null ? formatCurrency(latestImportPrice) : '-'),
		el('td', {}, formatCurrency(medicine.unit_price)),
		el('td', {}, onClick(el('button', { type: 'button', class: 'badge stock-detail-badge', title: 'Xem chi tiết tồn kho', 'aria-label': `Xem chi tiết ${batchCount} lần nhập` }, `${batchCount} lần`),
			() => showStockDetail(medicine.id))),
		el('td', {}, el('div', { class: `medicine-stock-display ${stockDisplayClass}` }, formatStockDisplay(medicine))),
		el('td', { class: 'mm-reference-column' }, referenceCell(medicine)),
		el('td', {},
			onClick(el('button', { 'data-qlpk-button': 'edit', 'data-qlpk-button-variant': 'soft', class: 'action-btn', title: 'Sửa' }, el('i', { class: 'bi bi-pencil' })), edit), ' ',
			onClick(el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'action-btn delete', title: 'Xóa' }, el('i', { class: 'bi bi-trash' })),
				() => confirmDelete(medicine.id))));
}

// Render medicine table
function renderMedicineTable() {
	const tbody = document.querySelector('#medicineTable tbody');
	disposeMedicineWarningTooltips();
	if (state.medicines.length === 0) {
		replace(tbody, el('tr', {}, el('td', { colspan: 10, class: 'text-start text-muted py-4' }, 'Không có thuốc phù hợp.')));
		return;
	}
	replace(tbody, state.medicines.map(medicineRow));
	initializeMedicineWarningTooltips();
}

const medicineCheckboxes = () => [...document.querySelectorAll('.medicine-checkbox')];

// Select-all and row checkboxes, delegated once on the table
function bindMedicineSelection() {
	byId('selectAllCheckbox').addEventListener('change', event => {
		medicineCheckboxes().forEach(box => { box.checked = event.target.checked; });
		toggleDeleteButton();
	});
	delegate(document.querySelector('#medicineTable tbody'), 'change', '.medicine-checkbox', () => {
		const boxes = medicineCheckboxes();
		byId('selectAllCheckbox').checked = boxes.length > 0 && boxes.every(box => box.checked);
		toggleDeleteButton();
	});
}

// Toggle delete button visibility
function toggleDeleteButton() {
	setElementVisible(byId('deleteSelectedBtn'), medicineCheckboxes().some(box => box.checked));
}

let pendingBulkDeleteIds = [];

// Delete selected medicines: open the bulk confirmation; confirmBulkDelete() runs on its button
function deleteSelectedMedicines() {
	const selectedIds = medicineCheckboxes().filter(box => box.checked).map(box => box.value);
	if (selectedIds.length === 0) {
		showCustomToast('warning', 'Vui lòng chọn thuốc cần xóa');
		return;
	}
	pendingBulkDeleteIds = selectedIds;
	byId('bulkDeleteCount').textContent = selectedIds.length;
	window.bootstrap.Modal.getOrCreateInstance(byId('confirmBulkDeleteModal')).show();
}

async function confirmBulkDelete() {
	const selectedIds = pendingBulkDeleteIds;
	pendingBulkDeleteIds = [];
	window.bootstrap.Modal.getOrCreateInstance(byId('confirmBulkDeleteModal')).hide();
	if (!selectedIds.length) return;
	if (!window.QLPKApiTransport.hasSession()) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}
	// Xóa từng thuốc; chờ đủ kết quả rồi mới tải lại để bảng không giữ dòng đã xóa.
	const results = await Promise.all(selectedIds.map(id => requestJson(`/api/medicines/${id}`, { method: 'DELETE' })
		.then(() => ({ ok: true }), error => ({ ok: false, error }))));
	const deletedCount = results.filter(result => result.ok).length;
	const failed = results.filter(result => !result.ok);
	if (deletedCount) showCustomToast('success', `Đã xóa ${deletedCount} thuốc thành công`);
	if (failed.length) {
		showCustomToast('error', getUserFacingResponseMessage(failed[0].error, [409], 'Có lỗi xảy ra khi xóa thuốc'));
	}
	if (deletedCount) {
		loadMedicines();
		updateDashboard();
	}
}

// Get unit display name (giữ backward compatibility cho dữ liệu cũ, nhưng mặc định return trực tiếp)
function getUnitDisplay(unit) {
	if (!unit) return '';

	// Nếu đã là tiếng Việt, return trực tiếp
	const unitLower = unit.toLowerCase().trim();
	const vietnameseUnits = ['viên', 'chai', 'gói', 'tuýp', 'ống', 'vỉ', 'hộp', 'lọ', 'giọt', 'viên nang', 'miếng dán', 'bơm tiêm', 'liều', 'túi', 'dụng cụ', 'lít', 'miếng', 'bút tiêm', 'ml', 'g', 'mg', 'mcg'];
	if (vietnameseUnits.includes(unitLower)) {
		return unit;
	}

	// Backward compatibility: convert từ tiếng Anh sang tiếng Việt (cho dữ liệu cũ)
	const units = {
		// Đơn vị dùng
		'tablet': 'viên',
		'tablets': 'viên',
		'pill': 'viên',
		'pills': 'viên',
		'capsule': 'viên nang',
		'capsules': 'viên nang',
		'vial': 'lọ',
		'vials': 'lọ',
		'bottle': 'chai',
		'bottles': 'chai',
		'pack': 'gói',
		'packet': 'gói',
		'packets': 'gói',
		'sachet': 'gói',
		'sachets': 'gói',
		'tube': 'tuýp',
		'tubes': 'tuýp',
		'ampoule': 'ống',
		'ampoules': 'ống',
		'syringe': 'bơm tiêm',
		'syringes': 'bơm tiêm',
		'strip': 'vỉ',
		'strips': 'vỉ',
		'blister': 'vỉ',
		'blisters': 'vỉ',
		'box': 'hộp',
		'boxes': 'hộp',
		'jar': 'lọ',
		'jars': 'lọ',
		'drop': 'giọt',
		'drops': 'giọt',
		'patch': 'miếng dán',
		'patches': 'miếng dán',
		// Đơn vị đo lường
		'milliliter': 'ml',
		'millilitre': 'ml',
		'milligram': 'mg',
		'milligrams': 'mg',
		'microgram': 'mcg',
		'micrograms': 'mcg',
		'gram': 'g',
		'grams': 'g',
		'liter': 'lít',
		'litre': 'lít',
		'l': 'lít'
	};
	return units[unitLower] || unit;
}

// Format currency
function formatCurrency(amount) {
	if (!amount && amount !== 0) return '0 ₫';
	return new Intl.NumberFormat('vi-VN', {
		style: 'currency',
		currency: 'VND',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).format(amount);
}

// Format date to DD/MM/YYYY
function formatDate(dateString) {
	if (!dateString) return '-';

	// Dùng formatter ngày của trang nếu có
	if (typeof getPageDateFormatter() === 'function') {
		return getPageDateFormatter()(dateString);
	}

	// Fallback: format thủ công với zero-padding
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return '-';

	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
}

// Update table info
function updateTableInfo() {
	const start = state.totalItems ? (state.currentPage - 1) * medicinePageSize + 1 : 0;
	const end = Math.min(state.currentPage * medicinePageSize, state.totalItems);
	byId('tableInfo').textContent = `${start}–${end} / ${state.totalItems} mục`;
}

function pageButton(label, page, { active = false, disabled = false } = {}) {
	return el('li', { class: ['page-item', active && 'active', disabled && 'disabled'].filter(Boolean).join(' ') },
		el('button', { type: 'button', class: 'page-link', 'data-page': page, disabled, 'aria-current': active ? 'page' : null }, label));
}

// Render pagination (clicks are delegated on #pagination by the page entry)
function renderPagination() {
	const items = [];
	if (state.totalPages > 1) {
		items.push(pageButton('Trước', state.currentPage - 1, { disabled: state.currentPage === 1 }));
		for (let i = 1; i <= state.totalPages; i++) {
			if (i === 1 || i === state.totalPages || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
				items.push(pageButton(i, i, { active: i === state.currentPage }));
			} else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
				items.push(el('li', { class: 'page-item disabled' }, el('span', { class: 'page-link' }, '...')));
			}
		}
		items.push(pageButton('Sau', state.currentPage + 1, { disabled: state.currentPage === state.totalPages }));
	}
	replace(byId('pagination'), items);
}

// Change page
function changePage(page) {
	if (page < 1 || page > state.totalPages) return;
	state.currentPage = page;
	loadMedicines(); // Load dữ liệu trang mới từ server
}

// Helpers

// Edit medicine

export { bindMedicineSelection, changePage, confirmBulkDelete, deleteSelectedMedicines, renderMedicineTable, filterMedicines, formatCurrency, formatDate, getUnitDisplay, loadAllMedicines, loadMedicines, resetFilters, toggleMissingImportPriceFilter };
