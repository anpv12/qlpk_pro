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
let filteredMedicines = [];
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

// Load categories from API

// Load medicines from API
let missingImportPriceOnly = false;

function toggleMissingImportPriceFilter() {
	missingImportPriceOnly = !missingImportPriceOnly;
	$('#searchInput').val('');
	document.getElementById('missingImportPriceFilter').setAttribute('aria-pressed', String(missingImportPriceOnly));
	document.getElementById('missingImportPriceFilterState').hidden = !missingImportPriceOnly;
	currentPage = 1;
	loadMedicines();
}

function loadMedicines() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	// Lấy tham số tìm kiếm hiện tại
	const searchTerm = $('#searchInput').val();
	const sortBy = $('#sortByFilter').val() || 'updated_at'; // Mặc định sort theo updated_at

	// Tạo URL với tham số phân trang và tìm kiếm
	const requestId = ++medicineListRequest;
	let url = `/api/medicines/?page=${currentPage}&per_page=${medicinePageSize}`;
	if (missingImportPriceOnly) url += '&missing_import_price=true';
	if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
	url += `&sort_by=${encodeURIComponent(sortBy)}`; // Luôn gửi sort_by

	$.ajax({
		url: url,
		method: 'GET',
		success: function (data) {
			if (requestId !== medicineListRequest) return;
			medicines = data.medicines || [];
			canReviewMedicineReference = data.can_review_reference === true;
			totalPages = data.total_pages || 1;
			totalItems = data.total || 0;
			renderMedicineTable();
			updateDashboard();
			updateTableInfo();
			renderPagination();
		},
			error: function (xhr, status, error) {
				if (requestId !== medicineListRequest) return;
				if (xhr.status === 401) {
					// Handle unauthorized
					showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
				} else {
					showCustomToast('error', 'Lỗi tải danh sách thuốc');
				}
				medicines = [];
				totalPages = 1;
				totalItems = 0;
				renderMedicineTable();
				updateDashboard();
				updateTableInfo();
				renderPagination();
			}
		});
}

// Load tất cả thuốc cho dropdown (không phân trang)
function loadAllMedicines() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		return;
	}

	$.ajax({
		url: `/api/medicines/?page=1&per_page=5000`,
		method: 'GET',
		success: function (data) {
			allMedicines = data.medicines || [];
		},
		error: function (xhr, status, error) {
			console.error('Error loading all medicines:', error);
			allMedicines = [];
		}
	});
}

// Filter medicines based on search criteria
function filterMedicines() {
	currentPage = 1; // Reset về trang đầu khi filter
	loadMedicines(); // Load lại dữ liệu từ server với filter mới
}

// Reset all filters
function resetFilters() {
	missingImportPriceOnly = false;
	document.getElementById('missingImportPriceFilter').setAttribute('aria-pressed', 'false');
	document.getElementById('missingImportPriceFilterState').hidden = true;
	$('#searchInput').val('');
	$('#sortByFilter').val('');

	currentPage = 1;
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
			color: 'danger',
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
	if (!warnings || warnings.length === 0) return '';
	return warnings.map(warning =>
		`<span class="badge bg-${warning.color} ms-1 medicine-warning-badge" tabindex="0" role="img" aria-label="${escapeHtml(warning.text)}">
            <i class="bi ${warning.icon}" aria-hidden="true"></i>
        </span>`
	).join('');
}

function initializeMedicineWarningTooltips() {
	document.querySelectorAll('#medicineTable .medicine-warning-badge').forEach(badge => {
		const tooltip = new bootstrap.Tooltip(badge, {
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
		bootstrap.Tooltip.getInstance(badge)?.dispose();
	});
}

// Render medicine table
function renderMedicineTable() {
	const tbody = $('#medicineTable tbody');
	disposeMedicineWarningTooltips();
	tbody.empty();

	if (medicines.length === 0) {
		tbody.html('<tr><td colspan="10" class="text-start text-muted py-4">Không có thuốc phù hợp.</td></tr>');
		return;
	}

	medicines.forEach((medicine, index) => {
		const rowNumber = (currentPage - 1) * medicinePageSize + index + 1;
		const batchCount = medicine.batch_count || 0;

		// Kiểm tra cảnh báo
		const warnings = getMedicineWarnings(medicine);
		const warningBadges = renderWarningBadges(warnings);

		// Highlight màu đỏ nếu tồn kho = 0
		const stockQuantity = parseFloat(medicine.stock_quantity) || 0;
		const stockDisplayClass = stockQuantity === 0 ? 'text-danger fw-bold medicine-stock-empty' : 'medicine-stock-normal';

		const latestImportPrice = medicine.latest_batch_pricing?.import_price;

		const row = `
            <tr>
                <td><input type="checkbox" class="form-check-input medicine-checkbox qlpk-row-select" value="${medicine.id}"></td>
                <td>${rowNumber}</td>
                <td>
                    <span class="medicine-link" onclick="editMedicine(${medicine.id})">${escapeHtml(medicine.name)}</span>
                    ${warningBadges}
                </td>
                <td>${medicine.nearest_expiry_date ? formatDate(medicine.nearest_expiry_date) : '-'}</td>
                <td>${latestImportPrice != null ? formatCurrency(latestImportPrice) : '-'}</td>
                <td>${formatCurrency(medicine.unit_price)}</td>
                <td>
                    <button type="button" class="badge stock-detail-badge" onclick="showStockDetail(${medicine.id})" title="Xem chi tiết tồn kho" aria-label="Xem chi tiết ${batchCount} lần nhập">
                        ${batchCount} lần
                    </button>
                </td>
                <td>
                    <div class="medicine-stock-display ${stockDisplayClass}">${formatStockDisplay(medicine)}</div>
                </td>
                <td class="mm-reference-column">
                    ${canReviewMedicineReference ? `<button type="button" class="stock-detail-badge mm-reference-button ${medicine.reference_review_status === 'confirmed' ? 'text-success' : ''}" title="Xem hoặc đổi liên kết DAV" onclick="openMedicineReferenceReview(${medicine.id})">${medicine.reference_review_status === 'confirmed' ? 'Đã xác nhận DAV' : medicine.reference_review_status === 'unlinked' ? 'Chọn thuốc từ DAV' : 'Cần xác nhận DAV'}</button>` : '—'}
                </td>
                <td>
                    <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="action-btn" onclick="editMedicine(${medicine.id})" title="Sửa">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="action-btn delete" onclick="confirmDelete(${medicine.id})" title="Xóa">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
		tbody.append(row);
	});

	initializeMedicineWarningTooltips();
	// Bind checkbox events
	bindCheckboxEvents();
}

// Bind checkbox events
function bindCheckboxEvents() {
	// Select all checkbox
	$('#selectAllCheckbox').off('change').on('change', function () {
		const isChecked = $(this).is(':checked');
		$('.medicine-checkbox').prop('checked', isChecked);
		toggleDeleteButton();
	});

	// Individual checkboxes
	$('.medicine-checkbox').off('change').on('change', function () {
		const totalCheckboxes = $('.medicine-checkbox').length;
		const checkedCheckboxes = $('.medicine-checkbox:checked').length;

		$('#selectAllCheckbox').prop('checked', totalCheckboxes === checkedCheckboxes);
		toggleDeleteButton();
	});
}

// Toggle delete button visibility
function toggleDeleteButton() {
	const checkedCount = $('.medicine-checkbox:checked').length;
	if (checkedCount > 0) {
		$('#deleteSelectedBtn').show();
	} else {
		$('#deleteSelectedBtn').hide();
	}
}

// Delete selected medicines
function deleteSelectedMedicines() {
	const selectedIds = $('.medicine-checkbox:checked').map(function () {
		return $(this).val();
	}).get();

	if (selectedIds.length === 0) {
		showCustomToast('warning', 'Vui lòng chọn thuốc cần xóa');
		return;
	}

	// Hiển thị modal xác nhận xóa nhiều thuốc
	$('#bulkDeleteCount').text(selectedIds.length);
	$('#confirmBulkDeleteModal').modal('show');

	// Xử lý khi click xác nhận
	$('#confirmBulkDeleteBtn').off('click').on('click', function () {
		$('#confirmBulkDeleteModal').modal('hide');

		const hasSession = window.QLPKApiTransport.hasSession();
		if (!hasSession) {
			showCustomToast('error', 'Vui lòng đăng nhập lại!');
			return;
		}

		// Delete each medicine
		let deletedCount = 0;
		selectedIds.forEach(id => {
			$.ajax({
				url: `/api/medicines/${id}`,
				method: 'DELETE',
				success: function () {
					deletedCount++;
					if (deletedCount === selectedIds.length) {
						showCustomToast('success', `Đã xóa ${deletedCount} thuốc thành công`);
						loadMedicines();
						updateDashboard();
					}
				},
				error: function () {
					showCustomToast('error', 'Có lỗi xảy ra khi xóa thuốc');
				}
			});
		});
	});
}

// Get category display name
function getCategoryDisplay(category) {
	const categories = {
		'antibiotic': 'Kháng sinh',
		'painkiller': 'Giảm đau',
		'vitamin': 'Vitamin',
	};
	return categories[category] || category;
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

// Get unit value from display name (giữ backward compatibility, nhưng mặc định return trực tiếp)
function getUnitValue(displayName) {
	if (!displayName) return '';

	// Nếu đã là tiếng Việt, return trực tiếp
	const displayLower = displayName.toLowerCase().trim();
	const vietnameseUnits = ['viên', 'chai', 'gói', 'tuýp', 'ống', 'vỉ', 'hộp', 'lọ', 'giọt', 'viên nang', 'miếng dán', 'bơm tiêm', 'liều', 'túi', 'dụng cụ', 'lít', 'miếng', 'bút tiêm', 'ml', 'g', 'mg', 'mcg'];
	if (vietnameseUnits.includes(displayLower)) {
		return displayName;
	}

	// Backward compatibility: convert từ tiếng Anh sang tiếng Việt (cho dữ liệu cũ)
	const reverseMap = {
		'tablet': 'viên',
		'tablets': 'viên',
		'pill': 'viên',
		'pills': 'viên',
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
		'drop': 'giọt',
		'drops': 'giọt',
		'liter': 'lít',
		'litre': 'lít',
		'l': 'lít'
	};
	return reverseMap[displayLower] || displayName;
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

	// Dùng window.formatDateDisplay nếu có
	if (typeof window.formatDateDisplay === 'function') {
		return window.formatDateDisplay(dateString);
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
	const start = totalItems ? (currentPage - 1) * medicinePageSize + 1 : 0;
	const end = Math.min(currentPage * medicinePageSize, totalItems);
	$('#tableInfo').text(`${start}–${end} / ${totalItems} mục`);
}

// Render pagination
function renderPagination() {
	const pagination = $('#pagination');
	pagination.empty();

	if (totalPages <= 1) return;

	// Previous button
	const prevBtn = `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <button type="button" class="page-link" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Trước</button>
        </li>
    `;
	pagination.append(prevBtn);

	// Page numbers
	for (let i = 1; i <= totalPages; i++) {
		if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
			const pageBtn = `
                <li class="page-item ${i === currentPage ? 'active' : ''}">
                    <button type="button" class="page-link" data-page="${i}" ${i === currentPage ? 'aria-current="page"' : ''}>${i}</button>
                </li>
            `;
			pagination.append(pageBtn);
		} else if (i === currentPage - 3 || i === currentPage + 3) {
			pagination.append('<li class="page-item disabled"><span class="page-link">...</span></li>');
		}
	}

	// Next button
	const nextBtn = `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <button type="button" class="page-link" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Sau</button>
        </li>
    `;
	pagination.append(nextBtn);
}

// Change page
function changePage(page) {
	if (page < 1 || page > totalPages) return;
	currentPage = page;
	loadMedicines(); // Load dữ liệu trang mới từ server
}

// Helpers


// Edit medicine
let medicineEditRevision = 0;
let medicineSaving = false;
function editMedicine(id) {
    if (window.MedicinePriceEditor?.isSaving()) return;
    if (medicineSaving) return;
    const hasSession = window.QLPKApiTransport.hasSession();
    if (!hasSession) { showCustomToast('error', 'Vui lòng đăng nhập lại!'); return; }
    resetForm();
    const requestId = ++medicineEditRevision;
    $.ajax({
        url: `/api/medicines/${id}`, method: 'GET',
        success(data) {
            if (requestId === medicineEditRevision) {
                populateMedicineForm(data, id);
            }
        },
        error(xhr) {
            if (requestId !== medicineEditRevision) return;
            showCustomToast('error', xhr.status === 401 ? 'Phiên đăng nhập đã hết hạn' : 'Không tải được thông tin thuốc mới nhất. Vui lòng thử lại.');
        }
    });
}

// Populate medicine form with data
function populateMedicineForm(medicine, id) {
	if (!medicine) {
		showCustomToast('error', 'Không tìm thấy thuốc');
		return;
	}

	// Fill form with medicine data
	$('#medicineModalLabel').text('CHỈNH SỬA THUỐC');
	$('#medicineForm').data('medicine-id', id);

	$('input[name="name"]').val(medicine.name);
	$('#genericNameInput').val(medicine.generic_name || '');
	$('#genericNameValue').val(medicine.generic_name || '');
	$('input[name="internal_code"]').val(medicine.internal_code || '');
	$('input[name="national_code"]').val(medicine.national_code || '');
	// Set category type autocomplete


	// Set prescription type autocomplete
	const prescriptionTypeMap = { 'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N' };
	$('#prescriptionType').val(prescriptionTypeMap[medicine.prescription_type] || 'Cơ bản');
	$('#prescriptionTypeValue').val(medicine.prescription_type || 'BASIC');

	$('select[name="unit"]').val(medicine.unit);

	$('input[name="strength"]').val(medicine.strength);
	$('#stockQuantitySummaryDisplay').val(medicine.stock_quantity ?? 0);
	$('input[name="low_stock_threshold"]').val(medicine.low_stock_threshold ?? '');
	$('input[name="expiry_warning_days"]').val(medicine.expiry_warning_days ?? '');
	$('input[name="description"], textarea[name="description"]').val(medicine.description || '');
	$('input[name="packaging"]').val(medicine.packaging || '');
	$('input[name="origin"]').val(medicine.origin || '');

	// Set imported type autocomplete
	$('#importedType').val(medicine.is_imported == null ? '' : medicine.is_imported ? 'Ngoại' : 'Nội');
	$('#importedTypeValue').val(medicine.is_imported == null ? '' : String(medicine.is_imported));

	// Set administration method autocomplete
	$('#administrationMethod').val(medicine.administration_method || '');
	$('#administrationMethodValue').val(medicine.administration_method || '');
	// set sale unit - hiển thị và lưu trực tiếp tiếng Việt
	const unitDisplay = getUnitDisplay(medicine.unit); // Backward compatibility cho dữ liệu cũ
	$('#saleUnit').val(unitDisplay);
	$('#saleUnitValue').val(unitDisplay); // Lưu tiếng Việt vào hidden input


	// Cập nhật quy cách đóng gói
	// Nếu có packaging_unit và units_per_box từ database, dùng trực tiếp
	if (medicine.packaging_unit) {
		// Normalize để khớp với option value (chữ thường)
		const packagingUnitValue = (medicine.packaging_unit || '').toLowerCase().trim();
		$('#packagingUnit').val(packagingUnitValue);
	}
	if (medicine.units_per_box !== undefined && medicine.units_per_box !== null) {
		$('#unitsPerBox').val(medicine.units_per_box ?? '');
	} else if (medicine.packaging) {
		// Parse từ packaging string nếu không có units_per_box
		// Format: "Hộp 20 lọ" hoặc "Hộp 10 vỉ x 10 viên"
		// Sử dụng regex để match ký tự tiếng Việt có dấu
		const packagingMatch = medicine.packaging.match(/Hộp\s+(\d+)\s+([^\sx]+)/i);
		if (packagingMatch) {
			const unitsPerBox = parseInt(packagingMatch[1]) || 0;
			const packagingUnit = (packagingMatch[2] || '').toLowerCase().trim();
			if (unitsPerBox > 0 && packagingUnit) {
				$('#unitsPerBox').val(unitsPerBox);
				if (!medicine.packaging_unit) {
					$('#packagingUnit').val(packagingUnit);
				}
			}
		}
	}
	$('#pillsPerUnit').val(0);

	// Cập nhật thông tin quy cách và hint trước
	const totalStock = medicine.stock_quantity || 0;
	const populatedRevision = medicineEditRevision;
	setTimeout(() => {
		if (populatedRevision !== medicineEditRevision) return;
		updatePackagingInfo();
		updateStockQuantityLabels();

		// Populate "Tổng (viên)" trực tiếp từ database (bao gồm cả khi = 0)
		const stockQuantitySummaryDisplay = document.getElementById('stockQuantitySummaryDisplay');
		const stockQuantityInput = document.getElementById('stockQuantityInput');

		// Sau đó tính lại số hộp và viên tồn kho từ tổng số lượng
		if (totalStock > 0) {
			// Hàm updateBoxesInputFromStockQuantity đã tính đúng cả "Lọ tồn" và "Viên tồn" từ "Tổng (viên)"
			// Không cần gọi updateStockQuantityFromBoxes() vì nó sẽ reset "Viên tồn" về 0
			updateBoxesInputFromStockQuantity(totalStock);

			// Set lại "Tổng (viên)" sau khi tính toán (đảm bảo giá trị chính xác)
			if (stockQuantitySummaryDisplay) {
				stockQuantitySummaryDisplay.value = totalStock;
			}
			if (stockQuantityInput) {
				stockQuantityInput.value = totalStock;
			}
		} else {
			// Nếu stock_quantity = 0, reset các input nhưng giữ "Tổng (viên)" = 0
			const boxesInput = document.getElementById('stockQuantityBoxes');
			const remainingInput = document.getElementById('stockQuantityRemaining');
			if (boxesInput) boxesInput.value = '0';
			if (remainingInput) remainingInput.value = '0';

			// Đảm bảo "Tổng (viên)" vẫn hiển thị 0 (dùng string "0" để đảm bảo hiển thị)
			if (stockQuantitySummaryDisplay) {
				stockQuantitySummaryDisplay.value = '0';
			}
			if (stockQuantityInput) {
				stockQuantityInput.value = '0';
			}
		}

		// Cuối cùng cập nhật hint (sau khi đã set tất cả giá trị)
		updateStockQuantityHint();

		// Đảm bảo "Tổng (viên)" vẫn được set lại sau khi hint được cập nhật
		if (stockQuantitySummaryDisplay) {
			stockQuantitySummaryDisplay.value = totalStock === 0 ? '0' : String(totalStock);
		}
		if (stockQuantityInput) {
			stockQuantityInput.value = totalStock === 0 ? '0' : String(totalStock);
		}
	}, 150);

	window.ClinicMedicineCatalog.setExisting(medicine);
	$('#medicineModal').modal('show');
}

// Save medicine
function saveMedicine() {
    if (window.MedicinePriceEditor?.isOpen()) return;
	if (medicineSaving) return;
	const formData = new FormData($('#medicineForm')[0]);
	const medicineData = Object.fromEntries(formData.entries());
	const medicineId = $('#medicineForm').data('medicine-id');

	// Nội/ngoại - từ autocomplete
	medicineData.is_imported = $('#importedTypeValue').val() === '' ? null : $('#importedTypeValue').val() === 'true';
	// Loại đơn thuốc - từ autocomplete
	medicineData.prescription_type = $('#prescriptionTypeValue').val();


	// Purchase costs belong to receipt lines, never to the catalog form.

	// Xử lý quy cách đóng gói (chỉ có đơn vị và số đơn vị trong hộp)
	const unitsPerBox = $('#unitsPerBox').val() === '' ? null : Number($('#unitsPerBox').val());
	const packagingUnit = $('#packagingUnit').val() || '';

	medicineData.units_per_box = unitsPerBox;
	medicineData.pills_per_unit = 0; // Không còn sử dụng
	medicineData.packaging_unit = packagingUnit;

	// The backend builds the conversion description from the numeric fields.
	delete medicineData.packaging;

	// Tồn kho là aggregate read-only trên form danh mục.  Không gửi field này
	// để API không thể bị dùng như một đường sửa tồn trực tiếp.
	delete medicineData.stock_quantity;
	delete medicineData.import_price;
	delete medicineData.unit_price;
	delete medicineData.expiry_date;

	// Ép kiểu số - xử lý chuỗi rỗng thành null
	const numericFields = ['low_stock_threshold', 'expiry_warning_days', 'units_per_box', 'pills_per_unit'];
	numericFields.forEach(f => {
		if (medicineData[f] !== undefined && medicineData[f] !== '') {
			medicineData[f] = Number(medicineData[f]);
		} else {
			// Nếu field trống, set thành null thay vì chuỗi rỗng
			medicineData[f] = null;
		}
	});

	// Validation
	// Lấy đơn vị tính từ hidden value hoặc từ input hiển thị (đã là tiếng Việt)
	let selectedSaleUnit = $('#saleUnitValue').val();
	if (!selectedSaleUnit) {
		// Nếu không có giá trị trong hidden input, lấy từ input hiển thị
		const displayUnit = $('#saleUnit').val();
		if (displayUnit) {
			selectedSaleUnit = displayUnit; // Lưu trực tiếp tiếng Việt
			$('#saleUnitValue').val(selectedSaleUnit); // Cập nhật hidden input
		}
	}
	if (selectedSaleUnit) {
		medicineData.unit = selectedSaleUnit; // Lưu trực tiếp tiếng Việt vào database
	}

	// Validate prescription_type
	const validPrescriptionTypes = ['BASIC', 'H', 'N'];
	if (!medicineData.prescription_type || !validPrescriptionTypes.includes(medicineData.prescription_type)) {
		showCustomToast('error', 'Vui lòng chọn "Loại đơn thuốc" (Cơ bản, Thuốc H, Thuốc N)');
		$('#prescriptionType').focus();
		return;
	}

	// Validate các trường bắt buộc khác
	// Cho phép đơn giá vốn nhập = 0 và tồn kho = 0
	if (!medicineData.name || !medicineData.unit) {
		showCustomToast('error', 'Hãy chọn thuốc DAV và đơn vị quản lý trước khi lưu.');
		return;
	}
	// Mã thuốc duy nhất (khuyến nghị có) - đã bỏ validation bắt buộc

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	const selectionError = window.ClinicMedicineCatalog.payload(medicineData);
	if (selectionError) {
		$('#medicineFormError').removeClass('d-none').text(selectionError);
		return;
	}
	const url = medicineId ? `/api/medicines/${medicineId}` : '/api/medicines/';
	const method = medicineId ? 'PUT' : 'POST';
	const saveRevision = medicineEditRevision;
	medicineSaving = true;
	$('#medicineSaveButton').prop('disabled', true);

	$.ajax({
		url: url,
		method: method,
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify(medicineData),
		success: function (response) {
			if (saveRevision !== medicineEditRevision) return;
			medicineSaving = false;
			showCustomToast('success', medicineId ? 'Cập nhật thuốc thành công' : 'Thêm thuốc thành công');
			$('#medicineModal').modal('hide');
			loadMedicines();
		},
		error: function (xhr, status, error) {
			if (saveRevision !== medicineEditRevision) return;
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				const message = getUserFacingResponseMessage(xhr, [400, 409], 'Không lưu được thông tin thuốc. Hãy thử lại.');
				$('#medicineFormError').removeClass('d-none').text(message);
				showCustomToast('error', message);
			}
		},
		complete: function () {
			medicineSaving = false;
			if (saveRevision === medicineEditRevision) $('#medicineSaveButton').prop('disabled', false);
		}
	});
}

// Confirm delete
function confirmDelete(id) {
	$('#confirmDeleteBtn').data('medicine-id', id);
	$('#confirmDeleteModal').modal('show');
}

// Delete medicine
function deleteMedicine() {
	const medicineId = $('#confirmDeleteBtn').data('medicine-id');

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	$.ajax({
		url: `/api/medicines/${medicineId}`,
		method: 'DELETE',
		success: function (response) {
			showCustomToast('success', 'Xóa thuốc thành công');
			$('#confirmDeleteModal').modal('hide');
			loadMedicines();
		},
		error: function (xhr, status, error) {
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				showCustomToast('error', getUserFacingResponseMessage(xhr, [409], 'Không xóa được thuốc. Hãy thử lại.'));
			}
		}
	});
}

// Reset form
function resetForm() {
	medicineEditRevision += 1;
	$('#medicineForm')[0].reset();
	window.ClinicMedicineCatalog.reset();
	$('#medicineForm').removeData('medicine-id');
	$('#medicineModalLabel').text('THÊM THUỐC MỚI');
	$('#medicineFormError').addClass('d-none');

	// Reset new autocomplete fields

	$('#prescriptionType').val('');
	$('#prescriptionTypeValue').val('');
	$('#administrationMethod').val('');
	$('#administrationMethodValue').val('');
	$('#importedType').val('');
	$('#importedTypeValue').val('');
	$('#genericNameInput').val('');
	$('#genericNameValue').val('');

	// Reset quy cách đóng gói và số lượng tồn kho
	$('#unitsPerBox').val('');
	$('#pillsPerUnit').val(0);
	$('#packagingUnit').val('');
	$('#packagingDisplay').val('');

	// Reset input số hộp và viên lẻ cho số lượng tồn kho
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');
	if (boxesInput) boxesInput.value = '';
	if (remainingInput) remainingInput.value = '';
	const hiddenInput = document.getElementById('stockQuantityInput');
	if (hiddenInput) hiddenInput.value = '';
	const summaryInput = document.getElementById('stockQuantitySummaryDisplay');
	if (summaryInput) summaryInput.value = '0';

	// Reset hint
	const convertElement = document.getElementById('stockQuantityConvert');
	setElementVisible(convertElement, false);

	// Reset quy cách hiển thị
	const packagingInfoText = document.getElementById('packagingInfoText');
	if (packagingInfoText) {
		packagingInfoText.textContent = 'Nhập đơn vị đóng gói và số đơn vị';
		setPackagingInfoActive(packagingInfoText, false);
	}

	// Cập nhật label động
	updateStockQuantityLabels();
}

// Show toast notification
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message, { duration: 5000 });
}

// Autocomplete functions for new fields
function initializePrescriptionTypeAutocomplete() {
	const input = document.getElementById('prescriptionType');
	const dropdown = document.getElementById('prescriptionTypeDropdown');
	const hiddenInput = document.getElementById('prescriptionTypeValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'H', label: 'Thuốc H' },
		{ value: 'N', label: 'Thuốc N' },
		{ value: 'BASIC', label: 'Cơ bản' }
	];

	input.addEventListener('input', function () {
		hiddenInput.value = '';
		const query = normalizeSearchText(this.value);
		const filtered = options.filter(option =>
			normalizeSearchText(option.label).includes(query)
		);
		showDropdown(dropdown, filtered, input, hiddenInput);
	});

	input.addEventListener('focus', function () {
		showDropdown(dropdown, options, input, hiddenInput);
	});

	// Hide dropdown when clicking outside
	document.addEventListener('click', function (e) {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			setElementVisible(dropdown, false);
		}
	});
}

function initializeAdministrationMethodAutocomplete() {
	const input = document.getElementById('administrationMethod');
	const dropdown = document.getElementById('administrationMethodDropdown');
	const hiddenInput = document.getElementById('administrationMethodValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'Uống', label: 'Uống' },
		{ value: 'Tiêm', label: 'Tiêm' },
		{ value: 'Truyền', label: 'Truyền' },
		{ value: 'Bôi', label: 'Bôi' },
		{ value: 'Nhỏ', label: 'Nhỏ' },
		{ value: 'Hít', label: 'Hít' },
		{ value: 'Ngậm', label: 'Ngậm' },
		{ value: 'Đặt', label: 'Đặt' },
		{ value: 'Súc', label: 'Súc' },
		{ value: 'Rửa', label: 'Rửa' },
		{ value: 'Xịt', label: 'Xịt' }
	];

	input.addEventListener('input', function () {
		hiddenInput.value = this.value;
		const query = normalizeSearchText(this.value);
		const filtered = options.filter(option =>
			normalizeSearchText(option.label).includes(query)
		);
		showDropdown(dropdown, filtered, input, hiddenInput);
	});

	input.addEventListener('focus', function () {
		showDropdown(dropdown, options, input, hiddenInput);
	});

	document.addEventListener('click', function (e) {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			setElementVisible(dropdown, false);
		}
	});
}

function initializeImportedTypeAutocomplete() {
	const input = document.getElementById('importedType');
	const dropdown = document.getElementById('importedTypeDropdown');
	const hiddenInput = document.getElementById('importedTypeValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'false', label: 'Nội' },
		{ value: 'true', label: 'Ngoại' }
	];

	input.addEventListener('input', function () {
		hiddenInput.value = '';
		const query = normalizeSearchText(this.value);
		const filtered = options.filter(option =>
			normalizeSearchText(option.label).includes(query)
		);
		showDropdown(dropdown, filtered, input, hiddenInput);
	});

	input.addEventListener('focus', function () {
		showDropdown(dropdown, options, input, hiddenInput);
	});

	document.addEventListener('click', function (e) {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			setElementVisible(dropdown, false);
		}
	});
}

function showDropdown(dropdown, options, input, hiddenInput) {
	dropdown.innerHTML = '';

	if (options.length === 0) {
		setElementVisible(dropdown, false);
		return;
	}

	options.forEach(option => {
		const item = document.createElement('div');
		item.className = 'occupation-item';
		item.textContent = option.label;
		item.addEventListener('click', function () {
			input.value = option.label;
			hiddenInput.value = option.value;
			setElementVisible(dropdown, false);
		});
		dropdown.appendChild(item);
	});

	setElementVisible(dropdown, true);
}

// ========== PHASE 1: QUẢN LÝ QUY CÁCH ĐÓNG GÓI VÀ SỐ LƯỢNG TỒN KHO ==========

// Format số lượng tồn kho theo viên (hiển thị số thập phân với dấu phẩy)
function formatStockQuantity(quantity, unit = 'viên') {
	const num = Number(quantity || 0);
	return (Number.isFinite(num) ? num : 0).toLocaleString('vi-VN', {maximumFractionDigits:2}) + ' ' + escapeHtml(unit || 'đơn vị');
}

// Cập nhật thông tin quy cách đóng gói
function updatePackagingInfo() {
	const packagingUnit = document.getElementById('packagingUnit')?.value || '';
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);
	const packagingDisplay = document.getElementById('packagingDisplay');
	const packagingInfoText = document.getElementById('packagingInfoText');
	const saleUnit = document.getElementById('saleUnit')?.value || '';

	if (!packagingDisplay) return;

	// Cập nhật hidden field để lưu vào database
	if (packagingUnit) {
		if (unitsPerBox > 0 && saleUnit) {
			packagingDisplay.value = `1 ${packagingUnit} = ${unitsPerBox} ${saleUnit}`;
		} else {
			packagingDisplay.value = `1 ${packagingUnit}`;
		}
	} else {
		packagingDisplay.value = '';
	}

	// Cập nhật text hiển thị quy cách: "1 [Đơn vị đóng gói] = [Số đơn vị] [Đơn vị dùng]"
	if (packagingInfoText) {
		if (packagingUnit && unitsPerBox > 0 && saleUnit) {
			// Ví dụ: "1 Lọ = 20 Gói" thay vì hard code "1 Hộp = 20 Gói"
			packagingInfoText.textContent = `1 ${packagingUnit.charAt(0).toUpperCase() + packagingUnit.slice(1)} = ${unitsPerBox} ${saleUnit.charAt(0).toUpperCase() + saleUnit.slice(1)}`;
			setPackagingInfoActive(packagingInfoText, true);
		} else if (packagingUnit && saleUnit) {
			packagingInfoText.textContent = `Chưa xác định số ${saleUnit} trong 1 ${packagingUnit}`;
			setPackagingInfoActive(packagingInfoText, true);
		} else {
			packagingInfoText.textContent = 'Nhập đơn vị đóng gói và số đơn vị';
			setPackagingInfoActive(packagingInfoText, false);
		}
	}

	// Cập nhật hint cho số lượng tồn
	updateStockQuantityHint();

	// Cập nhật label động cho số lượng tồn kho
	updateStockQuantityLabels();

	// Nếu đã có số lượng tồn kho, tính lại số hộp và viên lẻ theo quy cách mới
	const hiddenInput = document.getElementById('stockQuantityInput');
	if (hiddenInput && hiddenInput.value) {
		updateBoxesInputFromStockQuantity(hiddenInput.value);
	}
}

// Cập nhật label động cho số lượng tồn kho
function updateStockQuantityLabels() {
	const packagingUnit = document.getElementById('packagingUnit')?.value || 'hộp';
	const saleUnit = document.getElementById('saleUnit')?.value || 'viên';

	const boxesLabel = document.getElementById('stockQuantityBoxesLabel');
	const remainingLabel = document.getElementById('stockQuantityRemainingLabel');

	if (boxesLabel) {
		boxesLabel.textContent = `${packagingUnit.charAt(0).toUpperCase() + packagingUnit.slice(1)} tồn`;
	}
	if (remainingLabel) {
		remainingLabel.textContent = `${saleUnit.charAt(0).toUpperCase() + saleUnit.slice(1)} tồn`;
	}
}

// Cập nhật số lượng từ số hộp và viên lẻ
function updateStockQuantityFromBoxes() {
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');
	const hiddenInput = document.getElementById('stockQuantityInput');

	if (!boxesInput || !remainingInput || !hiddenInput) return;

	const boxes = parseFloat(boxesInput.value) || 0;

	// Tính số đơn vị mỗi hộp từ quy cách đóng gói
	// Ví dụ: 1 viên = 1 lọ, thì unitsPerBox = 1
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);

	if (unitsPerBox > 0 && boxes > 0) {
		// Khi user nhập số lọ, số lẻ = 0 (vì đã đóng gói đầy)
		// Ví dụ: 200,000 lọ → số lẻ = 0
		remainingInput.value = '0';

		// Tổng số lượng = (số lọ × số đơn vị mỗi lọ) + số lẻ
		// Ví dụ: (200,000 lọ × 1 viên/lọ) + 0 = 200,000 viên
		const total = (boxes * unitsPerBox) + 0;
		hiddenInput.value = total > 0 ? total.toFixed(3).replace(/\.?0+$/, '') : '';
	} else {
		// Nếu chưa có quy cách hoặc số lọ = 0, giữ nguyên số lẻ hiện tại
		const remaining = parseFloat(remainingInput.value) || 0;
		const total = remaining;
		hiddenInput.value = total > 0 ? total.toFixed(3).replace(/\.?0+$/, '') : '';
	}

	// Cập nhật hint quy đổi
	updateStockQuantityHint();
}

// Cập nhật tổng số lượng từ số lẻ (khi user nhập số lẻ)
function updateBoxesFromRemaining() {
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');
	const hiddenInput = document.getElementById('stockQuantityInput');

	if (!boxesInput || !remainingInput || !hiddenInput) return;

	const remaining = parseFloat(remainingInput.value) || 0; // Số lẻ (phần còn lại)
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);

	if (unitsPerBox > 0) {
		// Giữ nguyên số lọ hiện tại (không tự động tính lại)
		// Khi user nhập số lẻ, chỉ cần tính lại tổng số lượng
		const boxes = parseFloat(boxesInput.value) || 0;

		// Tổng số lượng = (số lọ × số đơn vị mỗi lọ) + số lẻ
		// Ví dụ: (10 vỉ × 100 viên/vỉ) + 5 viên = 1000 + 5 = 1005 viên
		const total = (boxes * unitsPerBox) + remaining;
		hiddenInput.value = total > 0 ? total.toFixed(3).replace(/\.?0+$/, '') : '';
	} else {
		// Nếu chưa có quy cách, tổng = số lẻ
		hiddenInput.value = remaining > 0 ? remaining.toFixed(3).replace(/\.?0+$/, '') : '';
	}

	// Cập nhật hint quy đổi
	updateStockQuantityHint();
}

// Cập nhật input số hộp và viên từ giá trị tổng số lượng (dùng khi edit thuốc)
function updateBoxesInputFromStockQuantity(value) {
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');

	if (!boxesInput || !remainingInput) return;

	const totalUnits = parseFloat(value) || 0;

	// Tính số đơn vị mỗi hộp từ quy cách đóng gói
	// Ví dụ: 1 viên = 1 lọ, thì unitsPerBox = 1
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);

	if (unitsPerBox > 0 && totalUnits > 0) {
		// Tính số đơn vị đóng gói từ tổng số đơn vị (làm tròn xuống)
		// Ví dụ: 200,000 viên ÷ 1 viên/lọ = 200,000 lọ
		const boxes = Math.floor(totalUnits / unitsPerBox);

		boxesInput.value = boxes > 0 ? boxes : '';

		// Tính số lẻ (phần còn lại sau khi chia cho unitsPerBox)
		// Ví dụ: 200,000 viên - (200,000 lọ × 1 viên/lọ) = 0 viên
		// Ví dụ: 199,999 viên - (199,999 lọ × 1 viên/lọ) = 1 viên
		const remaining = totalUnits - (boxes * unitsPerBox);
		remainingInput.value = remaining > 0 ? remaining.toFixed(3).replace(/\.?0+$/, '') : '0';

		// Cập nhật hidden input
		const hiddenInput = document.getElementById('stockQuantityInput');
		if (hiddenInput) {
			hiddenInput.value = totalUnits > 0 ? totalUnits.toFixed(3).replace(/\.?0+$/, '') : '';
		}
	} else {
		// Nếu chưa có quy cách, để trống
		boxesInput.value = '';
		remainingInput.value = '';
	}

	// Cập nhật hint quy đổi
	updateStockQuantityHint();
}

// Cập nhật hint tóm tắt tồn kho và ô tổng (đơn vị cơ bản: saleUnit)
// Tính từ 2 field: stockQuantityBoxes (đơn vị đóng gói đầy) và stockQuantityRemaining (đơn vị lẻ)
function updateStockQuantityHint() {
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);
	const packagingUnit = document.getElementById('packagingUnit')?.value || 'vỉ';
	const saleUnit = document.getElementById('saleUnit')?.value || 'viên';
	const convertElement = document.getElementById('stockQuantityConvert');
	const convertTextElement = document.getElementById('stockQuantityConvertText');

	if (!convertElement || !convertTextElement) return;

	const boxes = parseFloat(boxesInput?.value || 0);
	const remaining = parseFloat(remainingInput?.value || 0);

	// Helpers format
	const formatNum = (num) => num.toLocaleString('vi-VN');
	const formatDecimal = (num) => {
		if (Number.isNaN(num)) return '';
		if (num % 1 === 0) return formatNum(num);
		return num.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
	};

	if (unitsPerBox > 0 && (boxes > 0 || remaining > 0)) {
		const boxesInUnits = boxes * unitsPerBox;
		const total = boxesInUnits + remaining;

		let convertText = '';
		if (boxes > 0 && remaining > 0) {
			// Ví dụ: "9 vỉ + 70 viên = 970 viên tồn"
			convertText = `<strong>${formatNum(boxes)} ${packagingUnit}</strong> + <strong>${formatDecimal(remaining)} ${saleUnit}</strong> = <strong>${formatDecimal(total)} ${saleUnit} tồn</strong>`;
		} else if (boxes > 0 && remaining === 0) {
			convertText = `<strong>${formatNum(boxes)} ${packagingUnit}</strong> = <strong>${formatDecimal(total)} ${saleUnit} tồn</strong>`;
		} else if (boxes === 0 && remaining > 0) {
			convertText = `<strong>${formatDecimal(remaining)} ${saleUnit} tồn</strong>`;
		}

		if (convertText) {
			convertTextElement.innerHTML = `<i class="bi bi-calculator"></i> ${convertText}`;
			setElementVisible(convertElement, true);
			convertElement.classList.remove('alert-info');
			convertElement.classList.add('alert-success');
		} else {
			setElementVisible(convertElement, false);
		}

		// Cập nhật tóm tắt tồn kho quy đổi
		updateStockQuantitySummaryDisplay({
			total,
			boxes,
			remaining,
			packagingUnit,
			saleUnit,
			formatDecimalFn: formatDecimal,
			formatNumFn: formatNum
		});
	} else {
		setElementVisible(convertElement, false);
		updateStockQuantitySummaryDisplay({
			total: '',
			boxes: 0,
			remaining: 0,
			packagingUnit,
			saleUnit,
			formatDecimalFn: formatDecimal,
			formatNumFn: formatNum
		});
	}
}

// Khi người dùng nhập tổng (viên), tự động tách vỉ + viên lẻ
function updateBoxesFromTotal() {
	const totalInput = document.getElementById('stockQuantitySummaryDisplay');
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');
	const hiddenInput = document.getElementById('stockQuantityInput');

	if (!totalInput || !boxesInput || !remainingInput || !hiddenInput) return;

	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);
	const total = parseFloat(totalInput.value) || 0;

	if (unitsPerBox > 0 && total >= 0) {
		const boxes = Math.floor(total / unitsPerBox);
		const remaining = total - (boxes * unitsPerBox);

		boxesInput.value = boxes > 0 ? boxes : '0';
		remainingInput.value = remaining > 0 ? remaining.toFixed(3).replace(/\.?0+$/, '') : '0';
		hiddenInput.value = total > 0 ? total.toFixed(3).replace(/\.?0+$/, '') : '';
	} else {
		// Nếu chưa có quy cách, chỉ set tổng và reset ô khác
		boxesInput.value = '';
		remainingInput.value = '';
		hiddenInput.value = total > 0 ? total.toFixed(3).replace(/\.?0+$/, '') : '';
	}

	// Cập nhật hint và tóm tắt
	updateStockQuantityHint();
}

// Hiển thị tồn kho quy đổi (ô tổng read-only) dùng giá trị thô, không định dạng thousands
function updateStockQuantitySummaryDisplay({ total, boxes, remaining, packagingUnit, saleUnit, formatDecimalFn, formatNumFn }) {
	const summaryInput = document.getElementById('stockQuantitySummaryDisplay');
	if (!summaryInput) return;

	if (total === '' || Number.isNaN(total)) {
		summaryInput.value = '';
		return;
	}

	// Không định dạng nhóm nghìn trong input number; chỉ cắt bớt phần thập phân thừa
	// Đảm bảo hiển thị "0" khi total = 0
	const rawTotal = Number.isFinite(total)
		? (total === 0 ? '0' : total.toFixed(3).replace(/\.?0+$/, ''))
		: '';
	summaryInput.value = rawTotal;
}

function formatStockDisplay(medicine) {
	if (!medicine) return '-';
	return formatStockQuantity(medicine.stock_quantity, getUnitDisplay(medicine.unit || 'tablet'));
}

// Format quy cách hiển thị: "1 [Đơn vị đóng gói] = [Số đơn vị] [Đơn vị dùng]"
// (Giữ lại hàm này để sử dụng trong form chỉnh sửa)
function formatPackagingDisplay(medicine) {
	if (!medicine) return '-';

	const unitsPerBox = medicine.units_per_box || 0;
	const packagingUnit = medicine.packaging_unit || '';
	const unit = medicine.unit || 'tablet';

	// Chuyển đổi đơn vị từ tiếng Anh sang tiếng Việt
	const unitDisplay = getUnitDisplay(unit);
	const packagingUnitDisplay = packagingUnit ? getUnitDisplay(packagingUnit) : '';

	// Nếu có đầy đủ thông tin: units_per_box, packaging_unit, và unit
	if (packagingUnit && unitsPerBox > 0 && unit) {
		// Ví dụ: "1 Hộp = 10 Viên"
		const packagingUnitCapitalized = packagingUnitDisplay.charAt(0).toUpperCase() + packagingUnitDisplay.slice(1);
		const unitCapitalized = unitDisplay.charAt(0).toUpperCase() + unitDisplay.slice(1);
		return `1 ${packagingUnitCapitalized} = ${unitsPerBox} ${unitCapitalized}`;
	} else if (packagingUnit && unit) {
		const packagingUnitCapitalized = packagingUnitDisplay.charAt(0).toUpperCase() + packagingUnitDisplay.slice(1);
		const unitCapitalized = unitDisplay.charAt(0).toUpperCase() + unitDisplay.slice(1);
		return `1 ${packagingUnitCapitalized} = 1 ${unitCapitalized}`;
	} else if (medicine.packaging) {
		// Nếu không có units_per_box và packaging_unit, thử parse từ packaging string
		// Format có thể là: "Hộp 10 hộp", "Hộp 10 vỉ", "Hộp 20 chai", "Hộp 10 vỉ x 10 viên"
		const packagingMatch = medicine.packaging.match(/Hộp\s+(\d+)\s+([^\sx]+)/i);
		if (packagingMatch) {
			const parsedUnitsPerBox = parseInt(packagingMatch[1]) || 0;
			const parsedPackagingUnit = packagingMatch[2].trim() || '';
			if (parsedUnitsPerBox > 0 && parsedPackagingUnit && unit) {
				const parsedPackagingUnitDisplay = getUnitDisplay(parsedPackagingUnit);
				const parsedPackagingUnitCapitalized = parsedPackagingUnitDisplay.charAt(0).toUpperCase() + parsedPackagingUnitDisplay.slice(1);
				const unitCapitalized = unitDisplay.charAt(0).toUpperCase() + unitDisplay.slice(1);
				return `1 ${parsedPackagingUnitCapitalized} = ${parsedUnitsPerBox} ${unitCapitalized}`;
			}
		}
		// Nếu không parse được, trả về packaging gốc
		return medicine.packaging;
	}

	return '-';
}

let stockDetailRequestVersion = 0;

// Keep the editing context visible while reusing the existing inventory dialogs.
function showInventoryOverlay(element) {
    if (element.classList.contains('show')) return;
    const parent = [...document.querySelectorAll('.modal.show')].reverse().find(node =>
        node !== element && !node.inert && ['medicineModal', 'importBatchModal'].includes(node.id));
    const modal = bootstrap.Modal.getOrCreateInstance(element);
    if (!parent) { modal.show(); return; }
    const parentModal = bootstrap.Modal.getOrCreateInstance(parent);
    const trigger = document.activeElement;
    const parentHidden = parent.getAttribute('aria-hidden');
    const parentModalAttribute = parent.getAttribute('aria-modal');
    const bodyOverflow = document.body.style.overflow;
    const bodyPadding = document.body.style.paddingRight;
    const scrollbarAttributes = ['data-bs-overflow', 'data-bs-padding-right'].map(name => [name, document.body.getAttribute(name)]);
    const level = Number(parent.dataset.inventoryModalLayer || 0) + 1;
    const existingBackdrops = new Set(document.querySelectorAll('.modal-backdrop'));
    element.dataset.inventoryModalLayer = String(level);
    // Bootstrap 5.3.2 shares focus-trap listeners across modal instances.
    // Deactivate the parent before opening, then reactivate it after dismissal.
    parentModal._focustrap.deactivate();
    parent.inert = true;
    $(element).one('shown.bs.modal.inventoryOverlay', () => {
        parent.setAttribute('aria-hidden', 'true');
        parent.removeAttribute('aria-modal');
    });
    $(element).one('hidden.bs.modal.inventoryOverlay', () => {
        delete element.dataset.inventoryModalLayer;
        parent.inert = false;
        if (!parent.classList.contains('show')) return;
        if (parentHidden == null) parent.removeAttribute('aria-hidden');
        else parent.setAttribute('aria-hidden', parentHidden);
        if (parentModalAttribute == null) parent.removeAttribute('aria-modal');
        else parent.setAttribute('aria-modal', parentModalAttribute);
        document.body.classList.add('modal-open');
        document.body.style.overflow = bodyOverflow;
        document.body.style.paddingRight = bodyPadding;
        scrollbarAttributes.forEach(([name, value]) => {
            if (value == null) document.body.removeAttribute(name);
            else document.body.setAttribute(name, value);
        });
        parentModal._focustrap.activate();
        if (trigger?.isConnected && parent.contains(trigger)) trigger.focus();
    });
    modal.show();
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        if (!existingBackdrops.has(backdrop)) backdrop.dataset.inventoryModalLayer = String(level);
    });
}

function showMedicineExpiry() {
    const trigger = document.getElementById('medicine-expiry_date');
    const medicineId = $('#medicineForm').data('medicine-id');
    if (medicineSaving || trigger.disabled || !medicineId) return;
    const element = document.getElementById('importBatchModal');
    if (element.classList.contains('show') || element.dataset.inventoryModalLayer) return;
    showStockDetail(medicineId);
}

// Mở màn "Nhập kho theo đơn hàng" đã gộp mục Lịch sử nhập & lô, lọc theo
// đúng thuốc đang xem. Không mở modal riêng cho chi tiết tồn kho nữa.
function showStockDetail(medicineId) {
    const element = document.getElementById('importBatchModal');
    if (!element.classList.contains('show') && !element.dataset.inventoryModalLayer) {
        showImportBatchModal();
    }
    const medicineName = medicines.find(item => item.id === medicineId)?.name
        || allMedicines.find(item => item.id === medicineId)?.name || '';
    openImportLedger({medicineId, search: medicineName});
}

// ========== FUNCTIONS CHO NHẬP KHO THEO ĐƠN HÀNG ==========
let batchRowCounter = 0;

let importFormMedicineId = null;

function showImportFromMedicineForm() {
	const medicineId = $('#medicineForm').data('medicine-id');
	if (medicineSaving || !medicineId) return;
	const element = document.getElementById('importBatchModal');
	if (element.classList.contains('show') || element.dataset.inventoryModalLayer) return;
	showImportBatchModal(medicineId);
}

function showImportBatchModal(preselectMedicineId = null) {
	importFormMedicineId = preselectMedicineId ?? null;
	// Reset form
	document.getElementById('batchSupplier').value = '';
	const batchSupplierIdInput = document.getElementById('batchSupplierId');
	if (batchSupplierIdInput) batchSupplierIdInput.value = '';
	document.getElementById('batchInvoiceNumber').value = '';
	const batchImportDate = document.getElementById('batchImportDate');
	if (batchImportDate) {
		const today = new Date();
		if (batchImportDate._flatpickr) batchImportDate._flatpickr.setDate(today, true);
		else batchImportDate.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
	}
	const actor = window.QLPKApiTransport.userSnapshot();
	document.getElementById('batchImportUser').value = actor.full_name || actor.username || '';
	document.getElementById('batchNote').value = '';

	// Xóa tất cả dòng trong bảng
	const tbody = document.getElementById('batchImportTableBody');
	if (tbody) tbody.innerHTML = '';

	// Thêm dòng đầu tiên
	batchRowCounter = 0;
	addBatchImportRow();

	if (preselectMedicineId != null) {
		const preselect = allMedicines.find(item => item.id === preselectMedicineId)
			|| medicines.find(item => item.id === preselectMedicineId);
		const row = tbody?.lastElementChild;
		if (preselect && row) {
			row.querySelector('.batch-medicine-input').value = preselect.name;
			row.querySelector('.batch-medicine-id').value = preselect.id;
			onBatchMedicineSelect(preselect.id, row.id);
		}
	}

	// Reset tổng giá trị
	document.getElementById('batchTotalValue').textContent = '0 ₫';
	document.getElementById('batchLotBreakdown').textContent = 'Chưa có dữ liệu lô';

	// Về tab Nhập kho khi mở lại form; openImportLedger() sẽ tự chuyển sang
	// tab Lịch sử nhập nếu người gọi (showStockDetail/showMedicineExpiry) cần xem ngay.
	switchImportTab('order');
	document.getElementById('importLedgerSearch').value = '';
	document.getElementById('importLedgerStatus').value = '';
	importLedgerMedicineId = null;
	importLedgerSort = '';

	showInventoryOverlay(document.getElementById('importBatchModal'));
}

function addBatchImportRow() {
	const tbody = document.getElementById('batchImportTableBody');
	if (!tbody) return;

	batchRowCounter++;
	const rowId = `batchRow_${batchRowCounter}`;

	const row = document.createElement('tr');
	row.id = rowId;

	row.innerHTML = `
      <td>
        <div class="position-relative">
          <input type="text" class="form-control form-control-sm batch-medicine-input" 
                 placeholder="Tìm và chọn thuốc" aria-label="Tên thuốc" required autocomplete="off"
                 data-row-id="${rowId}">
	          <div class="occupation-dropdown batch-medicine-dropdown mm-hidden"></div>
          <input type="hidden" class="batch-medicine-id" value="">
        </div>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm batch-number-display" 
               value="" 
	               placeholder="Số lô trên bao bì" aria-label="Số lô" required maxlength="50"
               onblur="validateBatchNumber(this)">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm batch-expiry-date js-datepicker" placeholder="dd/mm/yyyy" aria-label="Hạn dùng" autocomplete="off" required>
      </td>
      <td>
        <div class="mm-import-qty">
          <input type="number" class="form-control form-control-sm batch-quantity" min="0" step="0.01" required
                 placeholder="0" aria-label="Số lượng"
                 oninput="calculateBatchRowTotal('${rowId}'); updateBatchTotal()">
          <small class="batch-unit"></small>
        </div>
      </td>
      <td>
        <input type="number" class="form-control form-control-sm batch-price" min="0" step="0.01" placeholder="0" aria-label="Đơn giá nhập trên một đơn vị" required
               oninput="calculateBatchRowTotal('${rowId}'); updateBatchTotal(); updatePriceComparison('${rowId}')">
      </td>
      <td>
	        <div class="batch-price-comparison">
	          <div class="batch-last-price text-muted mm-hidden"></div>
	          <div class="batch-price-diff mm-hidden"></div>
	        </div>
	      </td>
	      <td>
	        <span class="batch-row-total fw-bold">0 ₫</span>
      </td>
      <td>
        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" class="btn btn-sm btn-outline-danger mm-import-remove" aria-label="Xóa dòng thuốc" title="Xóa dòng thuốc" onclick="removeBatchRow('${rowId}'); updateBatchTotal()">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </td>
    `;

	tbody.appendChild(row);

	// Khởi tạo autocomplete cho input thuốc vừa tạo
	const medicineInput = row.querySelector('.batch-medicine-input');
	const dropdown = row.querySelector('.batch-medicine-dropdown');
	const hiddenId = row.querySelector('.batch-medicine-id');

	if (medicineInput && dropdown && hiddenId) {
		initializeBatchMedicineAutocomplete(medicineInput, dropdown, hiddenId, rowId);
	}

	// Khởi tạo Flatpickr cho input ngày hết hạn vừa tạo
	const expiryDateInput = row.querySelector('.batch-expiry-date');
	if (expiryDateInput && typeof window.initDatepickers === 'function') {
		window.initDatepickers(expiryDateInput);
	}
}

// Hàm validate và chuẩn hóa số lô (tùy chọn, không bắt buộc)
function validateBatchNumber(input) {
	if (!input || !input.value) return;

	const value = input.value.trim().toUpperCase();
	// Nếu người dùng nhập format LOT-XX thì giữ nguyên, nếu không thì có thể chuẩn hóa
	if (value && !value.match(/^LOT-\d+$/i)) {
		// Có thể tự động chuẩn hóa hoặc để người dùng tự nhập
		// Ở đây chỉ đảm bảo format khi tự động gen, còn người dùng có thể nhập tự do
	}
}

// Hàm autocomplete cho tên thuốc trong nhập kho
function initializeBatchMedicineAutocomplete(input, dropdown, hiddenId, rowId) {
	input.addEventListener('focus', () => {
		showBatchMedicineDropdown(input, dropdown, hiddenId, rowId);
	});

	input.addEventListener('input', () => {
		hiddenId.value = '';
		rowResetPurchasePrice(rowId);
		showBatchMedicineDropdown(input, dropdown, hiddenId, rowId);
	});

	// Đóng dropdown khi click ra ngoài
	document.addEventListener('click', (e) => {
		if (!dropdown.contains(e.target) && e.target !== input) {
			setElementVisible(dropdown, false);
		}
	});
}

function positionBatchMedicineDropdown(input, dropdown) {
	const inputRect = input.getBoundingClientRect();
	const modalContent = input.closest('.modal-content');
	if (!modalContent) {
		dropdown.classList.remove('batch-medicine-dropdown--floating');
		dropdown.removeAttribute('style');
		return;
	}

	dropdown.classList.add('batch-medicine-dropdown--floating');
	dropdown.style.cssText = `--mm-batch-dropdown-top: ${inputRect.bottom}px; --mm-batch-dropdown-left: ${inputRect.left}px; --mm-batch-dropdown-width: ${inputRect.width}px;`;
}

function showBatchMedicineDropdown(input, dropdown, hiddenId, rowId) {
	const keyword = normalizeSearchText(input.value);

	let filtered;
	if (!keyword) {
		// Nếu chưa nhập từ khóa: hiển thị danh sách đầy đủ (giới hạn 5000 thuốc để tránh quá tải UI)
		filtered = allMedicines.slice(0, 5000);
	} else {
		// Lọc theo tên thuốc khi có từ khóa
		filtered = allMedicines.filter(m => normalizeSearchText(m.name).includes(keyword));
	}

	// Hiển thị dropdown
	dropdown.innerHTML = '';
	if (filtered.length === 0) {
		setElementVisible(dropdown, false);
		return;
	}

	filtered.forEach(medicine => {
		const div = document.createElement('div');
		div.className = 'occupation-item';
		div.textContent = medicine.name;
		div.onclick = () => {
			input.value = medicine.name;
			hiddenId.value = medicine.id;
			setElementVisible(dropdown, false);
			// Gọi hàm cập nhật thông tin thuốc (bao gồm giá nhập lần trước)
			onBatchMedicineSelect(medicine.id, rowId);
		};
		dropdown.appendChild(div);
	});

	setElementVisible(dropdown, true);

	// Cập nhật vị trí dropdown
	positionBatchMedicineDropdown(input, dropdown);
}

function removeBatchRow(rowId) {
	const row = document.getElementById(rowId);
	if (row) {
		row.remove();
	}
}

// Tính thành tiền từng dòng trong bảng nhập kho
function calculateBatchRowTotal(rowId) {
	const row = document.getElementById(rowId);
	if (!row) return;
	const quantity = parseFloat(row.querySelector('.batch-quantity')?.value || 0);
	const price = parseFloat(row.querySelector('.batch-price')?.value || 0);
	const total = quantity * price;
	const totalElement = row.querySelector('.batch-row-total');
	if (totalElement) {
		totalElement.textContent = formatCurrency(total);
	}
}

// Tính tổng giá trị đơn hàng và hiển thị theo từng lô
function updateBatchTotal() {
	const rows = document.querySelectorAll('#batchImportTableBody tr');
	let total = 0;
	const lotTotals = {}; // Object để lưu tổng giá tiền theo từng lô

	rows.forEach(row => {
		const quantity = parseFloat(row.querySelector('.batch-quantity')?.value || 0);
		const price = parseFloat(row.querySelector('.batch-price')?.value || 0);
		const rowTotal = quantity * price;
		total += rowTotal;

		// Lấy số lô
		const batchNumber = row.querySelector('.batch-number-display')?.value?.trim() || 'Chưa có';

		// Tính tổng theo từng lô
		if (!lotTotals[batchNumber]) {
			lotTotals[batchNumber] = 0;
		}
		lotTotals[batchNumber] += rowTotal;
	});

	// Hiển thị tổng giá trị đơn hàng
	const totalElement = document.getElementById('batchTotalValue');
	if (totalElement) {
		totalElement.textContent = formatCurrency(total);
	}

	// Hiển thị breakdown theo từng lô
	const breakdownElement = document.getElementById('batchLotBreakdown');
	if (breakdownElement) {
		if (Object.keys(lotTotals).length === 0) {
			breakdownElement.innerHTML = '<span class="text-muted">Chưa có dữ liệu</span>';
		} else {
			const breakdownHtml = Object.entries(lotTotals)
				.sort((a, b) => a[0].localeCompare(b[0])) // Sắp xếp theo tên lô
				.map(([lot, lotTotal]) => {
						return `<div class="lot-item">
	                      <span class="lot-name">Lô ${lot}:</span>
	                      <span class="lot-value fw-bold">${formatCurrency(lotTotal)}</span>
	                    </div>`;
				})
				.join('');
			breakdownElement.innerHTML = breakdownHtml;
		}
	}
}

function rowResetPurchasePrice(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.removeAttribute('data-last-price');
    row.querySelector('.batch-price').value = '';
    row.querySelector('.batch-unit').textContent = '';
    row.querySelector('.batch-last-price').textContent = '';
    setElementVisible(row.querySelector('.batch-price-diff'), false);
    calculateBatchRowTotal(rowId);
    updateBatchTotal();
}

async function onBatchMedicineSelect(medicineId, rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    rowResetPurchasePrice(rowId);
    row.querySelector('.batch-unit').textContent = (allMedicines.find(m => String(m.id) === String(medicineId)) || {}).unit || '';
    try {
        const response = await $.ajax({
            url: `/api/medicines/${medicineId}/batches`,
        });
        if (!row.isConnected || row.querySelector('.batch-medicine-id').value !== String(medicineId)) return;
        const latest = [...(response.batches || [])].sort((a,b) => b.import_date.localeCompare(a.import_date) || b.id - a.id)[0];
        const label = row.querySelector('.batch-last-price');
        label.textContent = latest?.import_price != null ? `Lần trước (${formatDate(latest.import_date)}): ${formatCurrency(latest.import_price)}` : 'Chưa có giá nhập trước';
        setElementVisible(label, true);
        if (latest?.import_price != null) row.dataset.lastPrice = latest.import_price;
    } catch (_) {
        if (row.isConnected && row.querySelector('.batch-medicine-id').value === String(medicineId)) {
            const label = row.querySelector('.batch-last-price');
            label.textContent = 'Không tải được giá tham khảo';
            setElementVisible(label, true);
        }
    }
}

function updatePriceComparison(rowId) {
	const row = document.getElementById(rowId);
	if (!row) return;

	const lastPrice = parseFloat(row.getAttribute('data-last-price') || 0);
	const priceInput = row.querySelector('.batch-price');
	const priceDiffElement = row.querySelector('.batch-price-diff');

	if (!lastPrice || !priceInput || !priceDiffElement) {
		setElementVisible(priceDiffElement, false);
		return;
	}

	const currentPrice = parseFloat(priceInput.value || 0);
	if (!currentPrice) {
		setElementVisible(priceDiffElement, false);
		return;
	}

	const diff = currentPrice - lastPrice;
	const diffPercent = lastPrice > 0 ? ((diff / lastPrice) * 100).toFixed(1) : 0;

	if (diff === 0) {
		setElementVisible(priceDiffElement, false);
		return;
	}

	setElementVisible(priceDiffElement, true);
	if (diff > 0) {
		priceDiffElement.className = 'batch-price-diff text-danger fw-bold';
		priceDiffElement.textContent = `↑ +${formatCurrency(diff)} (${diffPercent}%)`;
	} else {
		priceDiffElement.className = 'batch-price-diff text-success fw-bold';
		priceDiffElement.textContent = `↓ ${formatCurrency(diff)} (${diffPercent}%)`;
	}
}

// Xác nhận nhập kho theo đơn hàng
let isImportingBatch = false;
async function confirmBatchImport() {
	if (isImportingBatch) return;
	const supplierIdValue = document.getElementById('batchSupplierId')?.value || '';
	const supplierId = supplierIdValue ? parseInt(supplierIdValue) : null;
	const supplierName = document.getElementById('batchSupplier').value.trim();
	const invoiceNumber = document.getElementById('batchInvoiceNumber').value.trim();
	const importDate = document.getElementById('batchImportDate').value;
	const importUser = document.getElementById('batchImportUser').value.trim();
	const note = document.getElementById('batchNote').value.trim();

	// Chỉ bắt buộc Nhà cung cấp và Ngày nhập kho; Người thực hiện là tùy chọn
	if (!supplierId || !importDate) {
		showCustomToast('error', 'Vui lòng chọn Nhà cung cấp từ danh sách và điền Ngày nhập kho');
		return;
	}

	const tbody = document.getElementById('batchImportTableBody');
	if (!tbody) return;

	const rows = tbody.querySelectorAll('tr');
	if (rows.length === 0) {
		showCustomToast('error', 'Vui lòng thêm ít nhất một thuốc vào danh sách');
		return;
	}

	const items = [];
	let hasError = false;

	rows.forEach((row) => {
		const medicineId = row.querySelector('.batch-medicine-id')?.value;
		const batchNumber = row.querySelector('.batch-number-display')?.value?.trim();
		const expiryDate = row.querySelector('.batch-expiry-date')?.value;
		const quantity = parseFloat(row.querySelector('.batch-quantity')?.value || 0);
		const importPriceRaw = row.querySelector('.batch-price')?.value;

        const importPrice = Number(importPriceRaw);
        const controlsValid = Array.from(row.querySelectorAll('input')).every(input => input.checkValidity());
        if (!controlsValid || !medicineId || !batchNumber || !expiryDate || !Number.isFinite(quantity) || quantity <= 0 || !importPriceRaw?.trim() || !Number.isFinite(importPrice) || importPrice < 0) {
            hasError = true;
            return;
        }

		items.push({
			medicine_id: parseInt(medicineId),
			batch_number: batchNumber || null,
			expiry_date: expiryDate,
			quantity: quantity,
			import_price: importPrice,
			notes: note
		});
	});

	if (hasError || items.length === 0) {
		showCustomToast('error', 'Vui lòng điền đầy đủ thông tin cho tất cả các thuốc (Tên thuốc, Số lô, Hạn sử dụng, Số lượng, Đơn giá nhập)');
		return;
	}

	// Gọi API nhập kho
	isImportingBatch = true;
	$('#confirmImportBatchBtn').prop('disabled', true);
	try {
		const response = await $.ajax({
			url: '/api/medicine-batches/import-order',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			dataType: 'json',
			data: JSON.stringify({
				supplier_id: supplierId,
				invoice_number: invoiceNumber || null,
				import_date: importDate,
				items: items,
				notes: note
			})
		});

		// Đóng modal
		const modal = bootstrap.Modal.getInstance(document.getElementById('importBatchModal'));
		if (modal) modal.hide();

		// Reload danh sách thuốc
		loadMedicines();
		updateDashboard();

		if (importFormMedicineId && $('#medicineForm').data('medicine-id') === importFormMedicineId
			&& document.getElementById('medicineModal').classList.contains('show')) {
			editMedicine(importFormMedicineId);
		}

		// Hiển thị thông báo thành công
		showCustomToast('success', `Nhập kho thành công! Đã lưu ${response.total_batches} dòng nhập và đơn giá riêng.`);
	} catch (error) {
		console.error('Lỗi khi nhập kho:', error);
		window.QLPKUserFeedback.reportError(error, {fallback: 'Không thể nhập kho. Vui lòng kiểm tra dữ liệu và thử lại.'});
	} finally {
		isImportingBatch = false;
		$('#confirmImportBatchBtn').prop('disabled', false);
	}
}

// ========== QUẢN LÝ NHÀ CUNG CẤP ==========
let suppliers = [];
let editingSupplierId = null;

// Hàm hiển thị modal quản lý nhà cung cấp
function showSupplierManagement() {
	showInventoryOverlay(document.getElementById('supplierManagementModal'));
	loadSuppliers();
	resetSupplierForm();
}

// Hàm load danh sách nhà cung cấp
function loadSuppliers() {
	const tbody = document.getElementById('supplierTableBody');
	if (!tbody) return;

	tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Đang tải dữ liệu...</td></tr>';

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	const search = document.getElementById('supplierSearchInput')?.value || '';
	const statusFilter = document.getElementById('supplierStatusFilter')?.value || '';

	$.ajax({
		url: '/api/suppliers/',
		method: 'GET',
		data: {
			search: search,
			is_active: statusFilter || undefined
		},
		dataType: 'json',
		success: function (response) {
			suppliers = response.suppliers || [];
			renderSuppliersTable(suppliers);
		},
		error: function (xhr, status, error) {
			console.error('Error loading suppliers:', error);
			tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Lỗi khi tải dữ liệu</td></tr>';
			showCustomToast('error', 'Lỗi khi tải danh sách nhà cung cấp');
		}
	});
}

// Hàm render bảng nhà cung cấp
function renderSuppliersTable(suppliersList) {
	const tbody = document.getElementById('supplierTableBody');
	if (!tbody) return;

	if (!suppliersList || suppliersList.length === 0) {
		tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Chưa có nhà cung cấp nào</td></tr>';
		return;
	}

	tbody.innerHTML = suppliersList.map(supplier => `
        <tr>
            <td>${escapeHtml(supplier.name || '')}</td>
            <td>${escapeHtml(supplier.phone || '-')}</td>
            <td>${escapeHtml(supplier.email || '-')}</td>
            <td>${escapeHtml(supplier.tax_code || '-')}</td>
            <td>${escapeHtml(supplier.contact_person || '-')}</td>
            <td>${escapeHtml(supplier.address || '-')}</td>
            <td class="mm-supplier-status-cell">
                <span class="badge ${supplier.is_active === 1 ? 'bg-success' : 'bg-secondary'}">
                    ${supplier.is_active === 1 ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                </span>
            </td>
            <td class="mm-supplier-actions-cell">
                <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-sm btn-success me-1" onclick="selectSupplierForBatch(${supplier.id})" title="Chọn cho đơn nhập kho">
                    <i class="bi bi-check-circle"></i>
                </button>
                <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-primary me-1" onclick="editSupplier(${supplier.id})" title="Sửa">
                    <i class="bi bi-pencil"></i>
                </button>
                <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-danger" onclick="deleteSupplier(${supplier.id})" title="Xóa">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Chọn nhà cung cấp cho đơn nhập kho
function selectSupplierForBatch(supplierId) {
	const supplier = suppliers.find(s => s.id === supplierId);
	if (!supplier) {
		showCustomToast('error', 'Không tìm thấy nhà cung cấp để chọn');
		return;
	}

	const nameInput = document.getElementById('batchSupplier');
	const idInput = document.getElementById('batchSupplierId');
	if (!nameInput || !idInput) {
		showCustomToast('error', 'Không tìm thấy ô Nhà cung cấp trong đơn nhập kho');
		return;
	}

	nameInput.value = supplier.name || '';
	idInput.value = supplier.id;

	// Đóng modal quản lý nhà cung cấp sau khi chọn
	const modalEl = document.getElementById('supplierManagementModal');
	if (modalEl) {
		const modalInstance = bootstrap.Modal.getInstance(modalEl);
		if (modalInstance) {
			modalInstance.hide();
		}
	}

	showCustomToast('success', 'Đã chọn nhà cung cấp cho đơn nhập kho');
}

// Hàm reset form nhà cung cấp
function resetSupplierForm() {
	editingSupplierId = null;
	document.getElementById('supplierForm').reset();
	document.getElementById('supplierId').value = '';
	document.getElementById('supplierFormTitle').textContent = 'Thêm nhà cung cấp mới';
	document.getElementById('supplierSubmitText').textContent = 'Thêm mới';
	document.getElementById('supplierIsActive').checked = true;
}

// Hàm sửa nhà cung cấp
function editSupplier(supplierId) {
	const supplier = suppliers.find(s => s.id === supplierId);
	if (!supplier) {
		showCustomToast('error', 'Không tìm thấy nhà cung cấp');
		return;
	}

	editingSupplierId = supplierId;
	document.getElementById('supplierId').value = supplier.id;
	document.getElementById('supplierName').value = supplier.name || '';
	document.getElementById('supplierPhone').value = supplier.phone || '';
	document.getElementById('supplierEmail').value = supplier.email || '';
	document.getElementById('supplierTaxCode').value = supplier.tax_code || '';
	document.getElementById('supplierContactPerson').value = supplier.contact_person || '';
	document.getElementById('supplierAddress').value = supplier.address || '';
	document.getElementById('supplierNotes').value = supplier.notes || '';
	document.getElementById('supplierIsActive').checked = supplier.is_active === 1;

	document.getElementById('supplierFormTitle').textContent = 'Sửa nhà cung cấp';
	document.getElementById('supplierSubmitText').textContent = 'Cập nhật';

	// Scroll to form
	document.querySelector('#supplierManagementModal .card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Hàm xóa nhà cung cấp
function deleteSupplier(supplierId) {
	if (!confirm('Bạn có chắc chắn muốn xóa nhà cung cấp này?')) {
		return;
	}

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	$.ajax({
		url: `/api/suppliers/${supplierId}`,
		method: 'DELETE',
		dataType: 'json',
		success: function (response) {
			showCustomToast('success', 'Đã xóa nhà cung cấp thành công');
			loadSuppliers();
			if (editingSupplierId === supplierId) {
				resetSupplierForm();
			}
		},
		error: function (xhr, status, error) {
			showCustomToast('error', 'Không thể xóa nhà cung cấp. Vui lòng thử lại.');
		}
	});
}

// Bind events cho form nhà cung cấp
$(document).ready(function () {
	// Form submit
	$('#supplierForm').on('submit', function (e) {
		e.preventDefault();
		saveSupplier();
	});

	// Reset button
	$('#supplierResetBtn').on('click', function () {
		resetSupplierForm();
	});

	// Search và filter
	$('#supplierSearchInput').on('input', debounce(function () {
		loadSuppliers();
	}, 500));

	$('#supplierStatusFilter').on('change', function () {
		loadSuppliers();
	});
});

// Hàm lưu nhà cung cấp
function saveSupplier() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	const formData = {
		name: document.getElementById('supplierName').value.trim(),
		phone: document.getElementById('supplierPhone').value.trim() || null,
		email: document.getElementById('supplierEmail').value.trim() || null,
		tax_code: document.getElementById('supplierTaxCode').value.trim() || null,
		contact_person: document.getElementById('supplierContactPerson').value.trim() || null,
		address: document.getElementById('supplierAddress').value.trim() || null,
		notes: document.getElementById('supplierNotes').value.trim() || null,
		is_active: document.getElementById('supplierIsActive').checked ? 1 : 0
	};

	if (!formData.name) {
		showCustomToast('error', 'Vui lòng nhập tên nhà cung cấp');
		return;
	}

	const isEdit = editingSupplierId !== null;
	const url = isEdit ? `/api/suppliers/${editingSupplierId}` : '/api/suppliers/';
	const method = isEdit ? 'PUT' : 'POST';

	$.ajax({
		url: url,
		method: method,
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify(formData),
		dataType: 'json',
		success: function (response) {
			showCustomToast('success', isEdit ? 'Đã cập nhật nhà cung cấp thành công' : 'Đã thêm nhà cung cấp thành công');
			loadSuppliers();
			resetSupplierForm();
		},
		error: function (xhr, status, error) {
			showCustomToast('error', isEdit
				? 'Không thể cập nhật nhà cung cấp. Vui lòng kiểm tra lại.'
				: 'Không thể thêm nhà cung cấp. Vui lòng kiểm tra lại.');
		}
	});
}

// ========== DASHBOARD TỔNG QUAN ==========
function updateDashboard() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		return;
	}

	// Tạo AbortController cho timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 giây timeout

	fetch('/api/medicines/dashboard', {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		},
		signal: controller.signal
	}).then(response => {
		clearTimeout(timeoutId);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		return response.json();
	}).then(response => {
		// Cập nhật tổng số thuốc
		const totalMedicinesEl = document.getElementById('dashboardTotalMedicines');
		if (totalMedicinesEl) {
			totalMedicinesEl.textContent = response.total_medicines || 0;
		}

		// Cập nhật tổng giá trị tồn kho
		const totalValueEl = document.getElementById('dashboardTotalValue');
		if (totalValueEl) {
			const totalValue = response.total_value || 0;
			try {
				totalValueEl.textContent = formatCurrency(totalValue);
			} catch (e) {
				totalValueEl.textContent = '0 ₫';
			}
		}

		// Cập nhật số cảnh báo
		const warningsEl = document.getElementById('dashboardWarnings');
		if (warningsEl) {
			warningsEl.textContent = response.warning_count || 0;
		}

		// Cập nhật tổng số lô
		const totalBatchesEl = document.getElementById('dashboardMissingImportPrice');
		if (totalBatchesEl) {
			totalBatchesEl.textContent = response.missing_import_price_count || 0;
		}
	}).catch(error => {
		clearTimeout(timeoutId);
		console.error('Error loading dashboard:', error);

		// Hiển thị giá trị mặc định nếu có lỗi
		const totalMedicinesEl = document.getElementById('dashboardTotalMedicines');
		const totalValueEl = document.getElementById('dashboardTotalValue');
		const warningsEl = document.getElementById('dashboardWarnings');
		const totalBatchesEl = document.getElementById('dashboardMissingImportPrice');

		if (totalMedicinesEl) totalMedicinesEl.textContent = '0';
		if (totalValueEl) totalValueEl.textContent = '0 ₫';
		if (warningsEl) warningsEl.textContent = '0';
		if (totalBatchesEl) totalBatchesEl.textContent = '0';
	});
}


// ========== XUẤT DỮ LIỆU ==========
// Xuất danh sách thuốc ra Excel
async function exportMedicineListExcel() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		// Gọi API để xuất Excel
		const response = await fetch('/api/medicines/export/excel', {
			method: 'GET',
		});

		if (!response.ok) {
			throw new Error('Lỗi khi xuất dữ liệu');
		}

		// Lấy blob từ response
		const blob = await response.blob();

		// Tạo URL tạm thời và tải file
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
		a.download = `danh_sach_thuoc_${dateStr}.xlsx`;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);

		showCustomToast('success', 'Đã xuất file Excel thành công!');

	} catch (error) {
		console.error('Error exporting to Excel:', error);
		showCustomToast('error', 'Không thể xuất dữ liệu thuốc. Vui lòng thử lại.');
	}
}

// ========== LỊCH SỬ NHẬP & LÔ (gộp vào modal Nhập kho) ==========
let importLedgerRequestVersion = 0;
let importLedgerPage = 1;
let importLedgerTotalPages = 1;
let importLedgerSort = '';

function switchImportTab(tab) {
    const isLedger = tab === 'ledger';
    document.getElementById('importOrderPane').hidden = isLedger;
    document.getElementById('importLedgerPane').hidden = !isLedger;
    document.getElementById('importTabOrder').classList.toggle('is-active', !isLedger);
    document.getElementById('importTabOrder').setAttribute('aria-selected', String(!isLedger));
    document.getElementById('importTabLedger').classList.toggle('is-active', isLedger);
    document.getElementById('importTabLedger').setAttribute('aria-selected', String(isLedger));
    if (isLedger) loadImportLedger(1);
}

// Chuyển sang tab Lịch sử nhập và lọc theo thuốc. Dùng khi xem tồn của một thuốc cụ thể
// (từ bảng danh mục hoặc nút "Xem hạn dùng" trong form thuốc) hoặc sau khi
// vừa nhập kho xong (sort=recent để thấy ngay lần nhập mới nhất).
function openImportLedger({medicineId = null, search = '', sort = ''} = {}) {
    importLedgerMedicineId = medicineId;
    importLedgerSort = sort;
    document.getElementById('importLedgerSearch').value = search;
    document.getElementById('importLedgerStatus').value = '';
    switchImportTab('ledger');
}

let importLedgerMedicineId = null;

async function loadImportLedger(page = 1) {
    const version = ++importLedgerRequestVersion;
    importLedgerPage = page;
    const tbody = $('#importLedgerTableBody').empty();
    tbody.html('<tr><td colspan="9" class="text-center py-3">Đang tải dữ liệu...</td></tr>');
    $('#importLedgerPrev, #importLedgerNext').prop('disabled', true);
    try {
        const params = new URLSearchParams({page, per_page: 10});
        const search = document.getElementById('importLedgerSearch').value.trim();
        const status = document.getElementById('importLedgerStatus').value;
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        if (importLedgerMedicineId) params.set('medicine_id', importLedgerMedicineId);
        if (importLedgerSort) params.set('sort', importLedgerSort);
        const response = await $.ajax({
            url: `/api/medicine-batches/?${params}`,
        });
        if (version !== importLedgerRequestVersion) return;
        importLedgerTotalPages = Math.max(1, response.total_pages || 1);
        renderImportLedgerRows(response.batches || []);
        $('#importLedgerPageInfo').text(`${response.total} lô · Trang ${response.page}/${importLedgerTotalPages}`);
        $('#importLedgerPrev').prop('disabled', response.page <= 1).off('click').on('click', () => loadImportLedger(response.page - 1));
        $('#importLedgerNext').prop('disabled', response.page >= importLedgerTotalPages).off('click').on('click', () => loadImportLedger(response.page + 1));
    } catch (_) {
        if (version === importLedgerRequestVersion) tbody.html('<tr><td colspan="9" class="text-center text-danger py-3">Không tải được lịch sử nhập &amp; lô. Hãy đổi bộ lọc hoặc mở lại để thử.</td></tr>');
    }
}

function renderImportLedgerRows(batches) {
    const tbody = document.getElementById('importLedgerTableBody');
    tbody.replaceChildren();
    if (!batches.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.className = 'text-center py-3';
        cell.textContent = 'Chưa có lần nhập / tồn đầu phù hợp.';
        row.append(cell);
        tbody.append(row);
        return;
    }
    batches.forEach(batch => tbody.append(buildImportLedgerRow(batch)));
}

function buildImportLedgerRow(batch) {
    const row = document.createElement('tr');
    row.dataset.batchId = batch.id;

    const textCell = (text, className) => {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = text;
        return cell;
    };

    row.append(
        textCell(batch.medicine_name || '—', 'text-start'),
        textCell(batch.batch_number, 'text-start'),
        textCell(formatDate(batch.expiry_date), 'text-center text-nowrap'),
        textCell(formatStockQuantity(batch.quantity, batch.unit), 'text-center text-nowrap'),
        textCell(formatStockQuantity(batch.remaining_quantity, batch.unit), 'text-center text-nowrap'),
        textCell(batch.import_price == null ? 'Thiếu giá' : formatCurrency(batch.import_price), 'text-center text-nowrap'),
        textCell(batch.invoice_number?.trim() || '—', 'text-center'),
        textCell(formatDate(batch.import_date), 'text-center text-nowrap')
    );
    if (batch.import_price == null && batch.can_supply_import_price === true) {
        const priceCell = row.children[5];
        const supplement = document.createElement('button');
        supplement.type = 'button';
        supplement.className = 'badge mm-missing-price-badge';
        supplement.dataset.qlpkButton = 'edit';
        supplement.dataset.qlpkButtonVariant = 'solid';
        supplement.textContent = 'Bổ sung giá';
        supplement.addEventListener('click', () => showMissingImportPriceForm(batch, priceCell));
        priceCell.replaceChildren(supplement);
    }
    const actionCell = textCell('', 'text-center');
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-sm btn-outline-primary mm-receipt-history-button';
    action.dataset.qlpkButton = 'view';
    action.dataset.qlpkButtonVariant = 'soft';
    action.textContent = 'Lịch sử kê đơn';
    action.addEventListener('click', () => openReceiptDispensing(batch));
    actionCell.append(action);
    row.append(actionCell);
    return row;
}

function showMissingImportPriceForm(batch, cell) {
    const form = document.createElement('form');
    form.className = 'mm-missing-price-form';
    const label = document.createElement('label');
    label.textContent = 'Giá nhập (đ)';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '99999999.99';
    input.step = '0.01';
    input.required = true;
    input.className = 'form-control form-control-sm';
    label.append(input);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-sm btn-primary';
    save.dataset.qlpkButton = 'execute';
    save.textContent = 'Lưu giá';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-sm btn-outline-secondary';
    cancel.dataset.qlpkButton = 'neutral';
    cancel.dataset.qlpkButtonVariant = 'soft';
    cancel.textContent = 'Hủy';
    cancel.onclick = () => cell.closest('tr').replaceWith(buildImportLedgerRow(batch));
    const error = document.createElement('small');
    error.className = 'text-danger';
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-1';
    actions.append(save, cancel);
    form.append(label, actions, error);
    let saving = false;
    form.onsubmit = async event => {
        event.preventDefault();
        if (saving || !form.reportValidity()) return;
        saving = true;
        input.disabled = save.disabled = cancel.disabled = true;
        error.textContent = '';
        try {
            await $.ajax({url: `/api/medicine-batches/${batch.id}/import-price`, method: 'POST',
                contentType: 'application/json', data: JSON.stringify({import_price: input.value})});
            showCustomToast('success', 'Đã bổ sung giá nhập. Tồn và giá vốn giao dịch cũ giữ nguyên.');
            currentPage = 1;
            loadMedicines();
            loadAllMedicines();
            if (cell.isConnected) loadImportLedger(importLedgerPage);
        } catch (failure) {
            error.textContent = getUserFacingResponseMessage(failure, [403, 404, 409], 'Không lưu được. Hãy tải lại lịch sử nhập để kiểm tra.', 'detail');
            input.disabled = save.disabled = cancel.disabled = false;
        } finally {
            saving = false;
        }
    };
    cell.replaceChildren(form);
    input.focus();
}

let receiptDispensingBatch = null;
let receiptDispensingVersion = 0;
let receiptDispensingFilters = {};

function openReceiptDispensing(batch) {
    receiptDispensingBatch = batch;
    const search = document.getElementById('receiptDispensingSearch');
    const type = document.getElementById('receiptDispensingType');
    search.value = type.value = '';
    receiptDispensingFilters = {};
    const applyFilters = () => {
        receiptDispensingFilters = {patient_search: search.value.trim(), movement_type: type.value};
        loadReceiptDispensing(1);
    };
    document.getElementById('receiptDispensingFilters').onsubmit = event => {
        event.preventDefault();
        applyFilters();
    };
    type.onchange = applyFilters;
    document.getElementById('receiptDispensingReset').onclick = () => {
        search.value = type.value = '';
        applyFilters();
    };
    const modal = document.getElementById('receiptDispensingModal');
    $(modal).off('hide.bs.modal.receiptDispensing').on('hide.bs.modal.receiptDispensing', () => {
        receiptDispensingBatch = null;
        receiptDispensingVersion++;
        document.getElementById('receiptDispensingRows').replaceChildren();
    });
    loadReceiptDispensing(1);
    showInventoryOverlay(modal);
}

function receiptDispensingMessage(message) {
    const body = document.getElementById('receiptDispensingRows');
    body.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-center py-3';
    cell.textContent = message;
    row.append(cell);
    body.append(row);
}

function formatDispensingTime(value) {
    if (!value) return 'Chưa ghi nhận';
    const stamp = new Date(value);
    if (!Number.isFinite(stamp.getTime())) return 'Chưa ghi nhận';
    return stamp.toLocaleString('vi-VN', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

function renderReceiptDispensingRows(rows) {
    if (!rows.length) {
        receiptDispensingMessage(receiptDispensingFilters.patient_search || receiptDispensingFilters.movement_type
            ? 'Không có giao dịch phù hợp với bộ lọc.' : 'Chưa có lịch sử kê đơn / cấp hoàn cho lần nhập này.');
        return;
    }
    const body = document.getElementById('receiptDispensingRows');
    body.replaceChildren();
    const labels = {export: 'Cấp thuốc', return: 'Hoàn thuốc', import: 'Hoàn thuốc (cũ)', price_adjustment: 'Điều chỉnh giá'};
    rows.forEach(item => {
        const row = document.createElement('tr');
        const quantity = value => value == null ? 'Chưa ghi nhận' : formatStockQuantity(value, item.unit);
        const change = item.quantity == null ? 'Chưa ghi nhận'
            : item.quantity === 0 ? 'Không đổi'
                : `${item.quantity > 0 ? '+' : '−'}${quantity(Math.abs(item.quantity))}`;
        const values = [
            [formatDispensingTime(item.created_at)],
            [labels[item.type] || 'Loại chưa xác định'],
            [item.patient_name || (item.appointment_id ? 'Chưa ghi nhận bệnh nhân' : 'Chưa liên kết lượt khám'),
                item.appointment_id ? `Ngày khám: ${formatDispensingTime(item.appointment_date)}` : 'Giao dịch cũ thiếu liên kết'],
            [change],
            [quantity(item.balance_after)],
            [quantity(item.stock_balance_after), item.stock_balance_inconsistent ? 'Cần đối soát: tồn lô lớn hơn tồn tổng' : ''],
            [item.created_by_name || 'Chưa ghi nhận']
        ];
        values.forEach((value, index) => {
            const cell = document.createElement('td');
            const primary = document.createElement('span');
            primary.className = 'mm-dispensing-value';
            primary.textContent = value[0];
            if (index === 1) {
                primary.className = 'mm-dispensing-type';
                if (['export', 'return', 'import', 'price_adjustment'].includes(item.type)) primary.classList.add(`mm-dispensing-type--${item.type}`);
            }
            cell.append(primary);
            if (value[1]) {
                const secondary = document.createElement('span');
                secondary.className = index === 5 ? 'mm-dispensing-warning' : 'mm-dispensing-secondary';
                secondary.textContent = value[1];
                cell.append(secondary);
            }
            row.append(cell);
        });
        body.append(row);
    });
}

async function loadReceiptDispensing(page = 1) {
    if (!receiptDispensingBatch) return;
    const version = ++receiptDispensingVersion;
    const batchId = receiptDispensingBatch.id;
    receiptDispensingMessage('Đang tải lịch sử kê đơn...');
    const info = document.getElementById('receiptDispensingPage');
    const previous = document.getElementById('receiptDispensingPrev');
    const next = document.getElementById('receiptDispensingNext');
    info.textContent = '';
    const pagination = document.getElementById('receiptDispensingPagination');
    pagination.hidden = true;
    previous.disabled = next.disabled = true;
    try {
        const params = new URLSearchParams({batch_id: batchId, page, per_page: 20});
        Object.entries(receiptDispensingFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
        const response = await $.ajax({url: `/api/medicine/statistics/ledger?${params}`});
        if (version !== receiptDispensingVersion) return;
        renderReceiptDispensingRows(response.transactions || []);
        info.textContent = `${response.total} giao dịch${response.total_pages > 1 ? ` · Trang ${response.page}/${response.total_pages}` : ''}`;
        pagination.hidden = response.total_pages <= 1;
        previous.disabled = response.page <= 1;
        next.disabled = response.page >= response.total_pages;
        previous.onclick = () => loadReceiptDispensing(response.page - 1);
        next.onclick = () => loadReceiptDispensing(response.page + 1);
    } catch (_) {
        if (version === receiptDispensingVersion) receiptDispensingMessage('Không tải được lịch sử. Đóng và mở lại để thử.');
    }
}
