/* global addBatchImportRow, changePage, confirmBatchImport, deleteMedicine, deleteSelectedMedicines, exportMedicineListExcel, filterMedicines, initializeAdministrationMethodAutocomplete, initializeImportedTypeAutocomplete, initializePrescriptionTypeAutocomplete, loadAllMedicines, loadImportLedger, loadMedicines, medicineSaving, resetFilters, resetForm, saveMedicine, showImportBatchModal, switchImportTab, updateDashboard, updatePackagingInfo, updateStockQuantityLabels */
/* exported allMedicines, canReviewMedicineReference, currentPage, escapeHtml, getUserFacingResponseMessage, medicineListRequest, medicinePageSize, medicines, setPackagingInfoActive, showCustomToast, totalItems, totalPages */

// Medicine Management JavaScript

// Helper functions
function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}

function escapeHtml(text) {
	if (!text) return '';
	const map = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, m => map[m]);
}

function getUserFacingResponseMessage(xhr, statuses, fallback, field = 'user_message') {
	const payload = xhr && xhr.responseJSON;
	const candidate = payload && payload[field];
	if (!statuses.includes(xhr && xhr.status) || typeof candidate !== 'string' || !candidate.trim()) return fallback;
	return candidate;
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

let currentPage = 1;
let medicinePageSize = 10;
let medicineListRequest = 0;
let totalPages = 1;
let totalItems = 0;
let medicines = [];
let canReviewMedicineReference = false;
let allMedicines = []; // Danh sách tất cả thuốc cho dropdown (không phân trang)

function setElementVisible(element, isVisible) {
	if (!element) return;
	element.classList.toggle('mm-hidden', !isVisible);
}

function setPackagingInfoActive(element, isActive) {
	if (!element) return;
	element.classList.toggle('text-muted', !isActive);
	element.classList.toggle('mm-packaging-info-text--active', isActive);
}

// Initialize when document is ready
$(document).ready(function () {
	document.querySelectorAll('[data-medicine-icon]').forEach(element => {
		element.innerHTML = window.QLPKIconSystem.renderSectionIcon(element.dataset.medicineIcon);
	});
	document.querySelectorAll('[data-medicine-action-icon]').forEach(element => {
		element.innerHTML = window.QLPKIconSystem.renderActionIcon(element.dataset.medicineActionIcon);
	});
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = '/login.html';
		return;
	}

	$('#logoutBtn').on('click', function () {
		window.QLPKAppHeader?.logout();
	});

	loadMedicines();
	loadAllMedicines(); // Load tất cả thuốc cho dropdown
	updateDashboard(); // Load dashboard data
	bindEvents();
	initializeAutocompleteComponents();
	initializeSaleUnitAutocomplete();

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['inventory.changed'],
			debounceMs: 500,
			handler: function () {
				loadMedicines();
				loadAllMedicines();
				updateDashboard();
			}
		});
	}
});

// Initialize autocomplete components
function initializeAutocompleteComponents() {
	// Khởi tạo autocomplete components cho 4 field mới

	// Khởi tạo autocomplete cho các field mới chuyển từ select
	initializePrescriptionTypeAutocomplete();
	initializeAdministrationMethodAutocomplete();
	initializeImportedTypeAutocomplete();
}

// Autocomplete for sale unit (đơn vị tính)
function initializeSaleUnitAutocomplete() {
	const input = document.getElementById('saleUnit');
	const dropdown = document.getElementById('saleUnitDropdown');
	if (!input || !dropdown) return;

	const units = [
		{ value: 'viên', label: 'viên' },
		{ value: 'gói', label: 'gói' },
		{ value: 'tuýp', label: 'tuýp' },
		{ value: 'chai', label: 'chai' },
		{ value: 'ống', label: 'ống' },
		{ value: 'ml', label: 'ml' },
		{ value: 'g', label: 'g' },
		{ value: 'giọt', label: 'giọt' },
		{ value: 'bơm tiêm', label: 'bơm tiêm' },
		{ value: 'liều', label: 'liều' },
		{ value: 'túi', label: 'túi' },
		{ value: 'vỉ', label: 'vỉ' },
				{ value: 'lít', label: 'lít' },
		{ value: 'miếng', label: 'miếng' },
		{ value: 'bút tiêm', label: 'bút tiêm' },
		{ value: 'viên nang', label: 'viên nang' },
		{ value: 'lọ', label: 'lọ' },
		{ value: 'miếng dán', label: 'miếng dán' }
	];

	function render(list) {
		dropdown.innerHTML = '';
		list.forEach(item => {
			const div = document.createElement('div');
			div.className = 'occupation-item';
			div.textContent = item.label;
			div.onclick = () => {
				input.value = item.label;
				// Lưu trực tiếp tiếng Việt vào hidden input
				document.getElementById('saleUnitValue').value = item.value;
				setElementVisible(dropdown, false);
				// Cập nhật quy cách và label khi thay đổi đơn vị dùng
				updatePackagingInfo();
				updateStockQuantityLabels();
			};
			dropdown.appendChild(div);
		});
		setElementVisible(dropdown, list.length > 0);
	}

	function filter(keyword) {
		const kw = normalizeSearchText(keyword);
		if (!kw) return units;
		return units.filter(u => normalizeSearchText(u.label).includes(kw) || normalizeSearchText(u.value).includes(kw));
	}

	input.addEventListener('focus', () => render(filter(input.value)));
	input.addEventListener('input', () => {
		document.getElementById('saleUnitValue').value = input.value;
		render(filter(input.value));
		// Cập nhật quy cách khi thay đổi đơn vị dùng
		updatePackagingInfo();
	});
	input.addEventListener('change', () => {
		// Cập nhật quy cách khi thay đổi đơn vị dùng
		updatePackagingInfo();
		// Đồng bộ giá trị hidden input khi người dùng nhập trực tiếp
		// Lưu trực tiếp giá trị tiếng Việt (không cần convert)
		const displayValue = input.value;
		document.getElementById('saleUnitValue').value = displayValue;
	});
	document.addEventListener('click', (e) => {
		if (!dropdown.contains(e.target) && e.target !== input) {
			setElementVisible(dropdown, false);
		}
	});
}

// Bind all events
function bindEvents() {
	$('#medicinePageSize').on('change', function () {
		const size = Number(this.value);
		if (![10, 20, 50, 100].includes(size)) return;
		medicinePageSize = size;
		currentPage = 1;
		loadMedicines();
	});
	$('#pagination').on('click', 'button[data-page]', function () {
		changePage(Number(this.dataset.page));
	});

	// Search functionality
	$('#searchBtn').on('click', function () {
		currentPage = 1;
		filterMedicines();
	});

	$('#searchInput').on('keypress', function (e) {
		if (e.which === 13) {
			currentPage = 1;
			filterMedicines();
		}
	});

	// Reset filters
	$('#resetBtn').on('click', function () {
		resetFilters();
	});

	// Form submission
	$('#medicineForm').on('submit', function (e) {
		e.preventDefault();
		saveMedicine();
	});

	// Delete confirmation
	$('#confirmDeleteBtn').on('click', function () {
		deleteMedicine();
	});

	// Delete selected medicines
	$('#deleteSelectedBtn').on('click', function () {
		deleteSelectedMedicines();
	});

	$('#importWarehouseBtn').on('click', function () {
		showImportBatchModal();
	});

	// Tab "Lịch sử nhập" gộp trong modal Nhập kho theo đơn hàng
	$('#importTabOrder').on('click', function () { switchImportTab('order'); });
	$('#importTabLedger').on('click', function () { switchImportTab('ledger'); });
	$('#importLedgerSearch').on('input', debounce(function () {
		if (!document.getElementById('importLedgerPane').hidden) loadImportLedger(1);
	}, 400));
	$('#importLedgerStatus').on('change', function () {
		if (!document.getElementById('importLedgerPane').hidden) loadImportLedger(1);
	});

	// Thêm dòng thuốc vào bảng nhập kho
	$('#addBatchRowBtn').on('click', function () {
		addBatchImportRow();
	});

	// Xử lý xác nhận nhập kho theo đơn hàng
	$('#confirmImportBatchBtn').on('click', function () {
		confirmBatchImport();
	});

	// Nút xuất dữ liệu
	$('#exportDataBtn').on('click', function () {
		exportMedicineListExcel();
	});

	// Modal events
	$('#medicineModal').on('hide.bs.modal', function (event) {
		if (medicineSaving) event.preventDefault();
	});
	$('#medicineModal').on('hidden.bs.modal', function () {
		resetForm();
	});

	// Khi mở modal thêm mới, reset form
	$('#addMedicineBtn').on('click', function () {
		resetForm();
		$('#medicineModal').modal('show');
	});
}

// Show toast notification
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message, { duration: 5000 });
}
