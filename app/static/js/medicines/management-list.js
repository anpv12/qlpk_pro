/* global allMedicines: writable, canReviewMedicineReference: writable, currentPage: writable, escapeHtml, formatStockDisplay, medicineListRequest: writable, medicinePageSize, medicines: writable, setElementVisible, showCustomToast, totalItems: writable, totalPages: writable, updateDashboard */
/* exported allMedicines, changePage, deleteSelectedMedicines, filterMedicines, getUnitDisplay, loadAllMedicines, resetFilters, toggleMissingImportPriceFilter */

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
			error: function (xhr) {
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
                    <span class="medicine-link" data-qlpk-call="editMedicine" data-qlpk-args='[${medicine.id}]'>${escapeHtml(medicine.name)}</span>
                    ${warningBadges}
                </td>
                <td>${medicine.nearest_expiry_date ? formatDate(medicine.nearest_expiry_date) : '-'}</td>
                <td>${latestImportPrice != null ? formatCurrency(latestImportPrice) : '-'}</td>
                <td>${formatCurrency(medicine.unit_price)}</td>
                <td>
                    <button type="button" class="badge stock-detail-badge" data-qlpk-call="showStockDetail" data-qlpk-args='[${medicine.id}]' title="Xem chi tiết tồn kho" aria-label="Xem chi tiết ${batchCount} lần nhập">
                        ${batchCount} lần
                    </button>
                </td>
                <td>
                    <div class="medicine-stock-display ${stockDisplayClass}">${formatStockDisplay(medicine)}</div>
                </td>
                <td class="mm-reference-column">
                    ${canReviewMedicineReference ? `<button type="button" class="stock-detail-badge mm-reference-button ${medicine.reference_review_status === 'confirmed' ? 'text-success' : ''}" title="Xem hoặc đổi liên kết DAV" data-qlpk-call="openMedicineReferenceReview" data-qlpk-args='[${medicine.id}]'>${medicine.reference_review_status === 'confirmed' ? 'Đã xác nhận DAV' : medicine.reference_review_status === 'unlinked' ? 'Chọn thuốc từ DAV' : 'Cần xác nhận DAV'}</button>` : '—'}
                </td>
                <td>
                    <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="action-btn" data-qlpk-call="editMedicine" data-qlpk-args='[${medicine.id}]' title="Sửa">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="action-btn delete" data-qlpk-call="confirmDelete" data-qlpk-args='[${medicine.id}]' title="Xóa">
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
	setElementVisible(document.getElementById('deleteSelectedBtn'), $('.medicine-checkbox:checked').length > 0);
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
