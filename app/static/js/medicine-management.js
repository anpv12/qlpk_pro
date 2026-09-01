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
let totalPages = 1;
let totalItems = 0;
let medicines = [];
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
	if (!localStorage.getItem('qlpk_token')) {
		window.location.href = '/login.html';
		return;
	}

	$('#logoutBtn').on('click', function () {
		localStorage.removeItem('qlpk_token');
		window.location.href = '/login.html';
	});

	$('#importBtn').on('click', function () {
		$('#importModal').modal('show');
	});

	$('#confirmImportBtn').on('click', function () {
		importMedicines();
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
	initializeCategoryTypeAutocomplete();
	initializePrescriptionTypeAutocomplete();
	initializeAdministrationMethodAutocomplete();
	initializeImportedTypeAutocomplete();
	initializeGenericNameAutocomplete();
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
		{ value: 'dụng cụ', label: 'dụng cụ' },
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
		if (displayValue) {
			document.getElementById('saleUnitValue').value = displayValue;
		}
	});
	document.addEventListener('click', (e) => {
		if (!dropdown.contains(e.target) && e.target !== input) {
			setElementVisible(dropdown, false);
		}
	});
}

// Bind all events
function bindEvents() {
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

	// Nút báo cáo
	$('#reportBtn').on('click', function () {
		showReportsModal();
	});

	// Nút tạo báo cáo
	$('#generateReportBtn').on('click', function () {
		generateReport();
	});

	// Nút xuất báo cáo Excel
	$('#exportReportBtn').on('click', function () {
		exportReportToExcel();
	});

	// Nút lịch sử giao dịch
	$('#transactionHistoryBtn').on('click', function () {
		showTransactionHistoryModal();
	});

	// Filter lịch sử giao dịch
	$('#filterTransactionType, #filterFromDate, #filterToDate, #filterSearch').on('change input', function () {
		loadTransactionHistory();
	});

	$('#importWarehouseBtn').on('click', function () {
		showImportBatchModal();
	});

	// Thêm dòng thuốc vào bảng nhập kho
	$('#addBatchRowBtn').on('click', function () {
		addBatchImportRow();
	});

	// Xử lý xác nhận nhập kho theo đơn hàng
	$('#confirmImportBatchBtn').on('click', function () {
		confirmBatchImport();
	});

	// Nút kiểm kê kho
	$('#inventoryCountBtn').on('click', function () {
		showInventoryCountModal();
	});

	// Nút xuất dữ liệu
	$('#exportDataBtn').on('click', function () {
		showExportDataModal();
	});

	// Xác nhận điều chỉnh kiểm kê
	$('#confirmInventoryCountBtn').on('click', function () {
		confirmInventoryCount();
	});

	// Modal events
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
function loadMedicines() {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	// Lấy tham số tìm kiếm hiện tại
	const searchTerm = $('#searchInput').val();
	const categoryType = $('#categoryTypeFilter').val();
	const sortBy = $('#sortByFilter').val() || 'updated_at'; // Mặc định sort theo updated_at

	// Tạo URL với tham số phân trang và tìm kiếm
	let url = `/api/medicines/?page=${currentPage}&per_page=10`;
	if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
	if (categoryType) url += `&category_type=${encodeURIComponent(categoryType)}`;
	url += `&sort_by=${encodeURIComponent(sortBy)}`; // Luôn gửi sort_by

	$.ajax({
		url: url,
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		},
		success: function (data) {
			medicines = data.medicines || [];
			totalPages = data.total_pages || 1;
			totalItems = data.total || 0;
			renderMedicineTable();
			updateDashboard();
			updateTableInfo();
			renderPagination();
		},
			error: function (xhr, status, error) {
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
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		return;
	}

	$.ajax({
		url: `/api/medicines/?page=1&per_page=5000`,
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		},
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
	$('#searchInput').val('');
	$('#categoryTypeFilter').val('');
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
	return warnings.map(w =>
		`<span class="badge bg-${w.color} ms-1 medicine-warning-badge" title="${w.text}">
            <i class="bi ${w.icon}"></i>
        </span>`
	).join('');
}

// Render medicine table
function renderMedicineTable() {
	const tbody = $('#medicineTable tbody');
	tbody.empty();

	if (medicines.length === 0) {
		tbody.html('<tr><td colspan="11" class="text-center text-muted py-4">Không có dữ liệu. Thêm thuốc mới vào kho</td></tr>');
		return;
	}

	medicines.forEach((medicine, index) => {
		const rowNumber = (currentPage - 1) * 10 + index + 1;
		const batchCount = medicine.batch_count || 0;

		// Kiểm tra cảnh báo
		const warnings = getMedicineWarnings(medicine);
		const warningBadges = renderWarningBadges(warnings);
		const hasWarning = warnings.length > 0;
		const rowClass = hasWarning ? 'table-warning' : '';

		// Highlight màu đỏ nếu tồn kho = 0
		const stockQuantity = parseFloat(medicine.stock_quantity) || 0;
		const stockDisplayClass = stockQuantity === 0 ? 'text-danger fw-bold medicine-stock-empty' : 'medicine-stock-normal';

		const row = `
            <tr class="${rowClass}">
                <td><input type="checkbox" class="form-check-input medicine-checkbox" value="${medicine.id}"></td>
                <td>${rowNumber}</td>
                <td>
                    <span class="medicine-link" onclick="editMedicine(${medicine.id})">${medicine.name}</span>
                    ${warningBadges}
                </td>
                <td>${medicine.expiry_date ? formatDate(medicine.expiry_date) : '-'}</td>
                <td>${formatCurrency(medicine.import_price || 0)}</td>
                <td>${formatCurrency(medicine.unit_price)}</td>
                <td>
                    <span class="badge bg-info stock-detail-badge" onclick="showStockDetail(${medicine.id}, '${medicine.name.replace(/'/g, "\\'")}')" title="Xem chi tiết tồn kho">
                        ${batchCount} lô
                    </span>
                </td>
                <td>
                    <div class="medicine-stock-display ${stockDisplayClass}">${formatStockDisplay(medicine)}</div>
                </td>
                <td>${formatCategoryType(medicine.category_type)}</td>
                <td>
                    <button class="action-btn" onclick="editMedicine(${medicine.id})" title="Sửa">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="action-btn delete" onclick="confirmDelete(${medicine.id})" title="Xóa">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
		tbody.append(row);
	});

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

		const token = localStorage.getItem('qlpk_token');
		if (!token) {
			showCustomToast('error', 'Vui lòng đăng nhập lại!');
			return;
		}

		// Delete each medicine
		let deletedCount = 0;
		selectedIds.forEach(id => {
			$.ajax({
				url: `/api/medicines/${id}`,
				method: 'DELETE',
				headers: {
					'Authorization': 'Bearer ' + token
				},
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
		'supplement': 'Thực phẩm chức năng'
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
	const start = (currentPage - 1) * 10 + 1;
	const end = Math.min(currentPage * 10, totalItems);
	$('#tableInfo').text(`${start}-${end} of ${totalItems} items`);
}

// Render pagination
function renderPagination() {
	const pagination = $('#pagination');
	pagination.empty();

	if (totalPages <= 1) return;

	// Previous button
	const prevBtn = `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Trước</a>
        </li>
    `;
	pagination.append(prevBtn);

	// Page numbers
	for (let i = 1; i <= totalPages; i++) {
		if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
			const pageBtn = `
                <li class="page-item ${i === currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
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
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Sau</a>
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
function formatCategoryType(type) {
	const map = { DRUG: 'Thuốc', SUPPLEMENT: 'TPCN', EQUIPMENT: 'Y dụng cụ' };
	return map[type] || type || '-';
}

// Edit medicine
function editMedicine(id) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	// Luôn fetch dữ liệu mới từ API để đảm bảo có dữ liệu mới nhất (đặc biệt sau khi import)
	$.ajax({
		url: `/api/medicines/${id}`,
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		},
		success: function (data) {
			populateMedicineForm(data, id);
		},
		error: function (xhr, status, error) {
			// Nếu API lỗi, thử dùng dữ liệu từ mảng medicines (fallback)
			const medicine = medicines.find(m => m.id === id);
			if (medicine) {
				populateMedicineForm(medicine, id);
			} else {
				if (xhr.status === 401) {
					showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
				} else if (xhr.status === 404) {
					showCustomToast('error', 'Không tìm thấy thuốc');
				} else {
					showCustomToast('error', 'Lỗi tải thông tin thuốc');
				}
			}
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
	const categoryTypeMap = { 'DRUG': 'Thuốc', 'SUPPLEMENT': 'TPCN', 'EQUIPMENT': 'Y dụng cụ' };
	$('#categoryType').val(categoryTypeMap[medicine.category_type] || 'Thuốc');
	$('#categoryTypeValue').val(medicine.category_type || 'DRUG');

	// Set prescription type autocomplete
	const prescriptionTypeMap = { 'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N' };
	$('#prescriptionType').val(prescriptionTypeMap[medicine.prescription_type] || 'Cơ bản');
	$('#prescriptionTypeValue').val(medicine.prescription_type || 'BASIC');

	$('input[name="unit_price"]').val(medicine.unit_price);
	$('select[name="unit"]').val(medicine.unit);

	$('input[name="strength"]').val(medicine.strength);
	$('#stockQuantitySummaryDisplay').val(medicine.stock_quantity ?? 0);
	$('input[name="low_stock_threshold"]').val(medicine.low_stock_threshold || 0);
	$('input[name="expiry_date"]').val(medicine.expiry_date);
	// Set giá trị cho Flatpickr nếu đã khởi tạo
	if (typeof window.setDatepickerValue === 'function') {
		const expiryInput = document.querySelector('input[name="expiry_date"]');
		if (expiryInput) {
			window.setDatepickerValue(expiryInput, medicine.expiry_date, false);
		}
	}
	$('input[name="expiry_warning_days"]').val(medicine.expiry_warning_days || 0);
	$('input[name="description"], textarea[name="description"]').val(medicine.description || '');
	$('input[name="packaging"]').val(medicine.packaging || '');
	$('input[name="origin"]').val(medicine.origin || '');

	// Set imported type autocomplete
	$('#importedType').val(medicine.is_imported ? 'Ngoại' : 'Nội');
	$('#importedTypeValue').val(String(!!medicine.is_imported));

	// Set administration method autocomplete
	$('#administrationMethod').val(medicine.administration_method || '');
	$('#administrationMethodValue').val(medicine.administration_method || '');
	// set sale unit - hiển thị và lưu trực tiếp tiếng Việt
	const unitDisplay = getUnitDisplay(medicine.unit); // Backward compatibility cho dữ liệu cũ
	$('#saleUnit').val(unitDisplay);
	$('#saleUnitValue').val(unitDisplay); // Lưu tiếng Việt vào hidden input

	$('input[name="import_price"]').val(medicine.import_price || '');

	// Cập nhật quy cách đóng gói
	// Nếu có packaging_unit và units_per_box từ database, dùng trực tiếp
	if (medicine.packaging_unit) {
		// Normalize để khớp với option value (chữ thường)
		const packagingUnitValue = (medicine.packaging_unit || '').toLowerCase().trim();
		$('#packagingUnit').val(packagingUnitValue);
	}
	if (medicine.units_per_box !== undefined && medicine.units_per_box !== null) {
		$('#unitsPerBox').val(medicine.units_per_box || 0);
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
	setTimeout(() => {
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
			if (boxesInput) boxesInput.value = '';
			if (remainingInput) remainingInput.value = '';

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

	$('#medicineModal').modal('show');
}

// Save medicine
function saveMedicine() {
	const formData = new FormData($('#medicineForm')[0]);
	const medicineData = Object.fromEntries(formData.entries());
	const medicineId = $('#medicineForm').data('medicine-id');

	// Nội/ngoại - từ autocomplete
	medicineData.is_imported = $('#importedTypeValue').val() === 'true';
	// Loại đơn thuốc - từ autocomplete
	medicineData.prescription_type = $('#prescriptionTypeValue').val() || 'BASIC';


	// import_price đã có trong formData

	// Xử lý quy cách đóng gói (chỉ có đơn vị và số đơn vị trong hộp)
	const unitsPerBox = parseFloat($('#unitsPerBox').val() || 0);
	const packagingUnit = $('#packagingUnit').val() || '';

	medicineData.units_per_box = unitsPerBox;
	medicineData.pills_per_unit = 0; // Không còn sử dụng
	medicineData.packaging_unit = packagingUnit;

	// Tạo text hiển thị từ số liệu
	if (packagingUnit) {
		if (unitsPerBox > 0) {
			medicineData.packaging = `Hộp ${unitsPerBox} ${packagingUnit}`;
		} else {
			medicineData.packaging = `1 ${packagingUnit}`;
		}
	} else {
		medicineData.packaging = medicineData.packaging || '';
	}

	// Tồn kho là aggregate read-only trên form danh mục.  Không gửi field này
	// để API không thể bị dùng như một đường sửa tồn trực tiếp.
	delete medicineData.stock_quantity;

	// Ép kiểu số - xử lý chuỗi rỗng thành null
	const numericFields = ['unit_price', 'low_stock_threshold', 'expiry_warning_days', 'import_price', 'units_per_box', 'pills_per_unit'];
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
	const validPrescriptionTypes = ['BASIC', 'H', 'N', 'TOXIC'];
	if (!medicineData.prescription_type || !validPrescriptionTypes.includes(medicineData.prescription_type)) {
		showCustomToast('error', 'Vui lòng chọn "Loại đơn thuốc" (Cơ bản, Thuốc H, Thuốc N)');
		$('#prescriptionType').focus();
		return;
	}

	// Validate các trường bắt buộc khác
	// Cho phép đơn giá vốn nhập = 0 và tồn kho = 0
	if (!medicineData.name || !medicineData.unit || !medicineData.category_type) {
		showCustomToast('error', 'Vui lòng điền đầy đủ thông tin bắt buộc (Tên thuốc, Đơn vị dùng, Nhóm/Thể loại...)');
		return;
	}
	// Mã thuốc duy nhất (khuyến nghị có) - đã bỏ validation bắt buộc

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	const url = medicineId ? `/api/medicines/${medicineId}` : '/api/medicines/';
	const method = medicineId ? 'PUT' : 'POST';

	$.ajax({
		url: url,
		method: method,
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify(medicineData),
		success: function (response) {
			showCustomToast('success', medicineId ? 'Cập nhật thuốc thành công' : 'Thêm thuốc thành công');
			$('#medicineModal').modal('hide');
			loadMedicines();
		},
		error: function (xhr, status, error) {
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				showCustomToast('error', 'Lỗi lưu thông tin thuốc');
			}
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

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	$.ajax({
		url: `/api/medicines/${medicineId}`,
		method: 'DELETE',
		headers: {
			'Authorization': 'Bearer ' + token
		},
		success: function (response) {
			showCustomToast('success', 'Xóa thuốc thành công');
			$('#confirmDeleteModal').modal('hide');
			loadMedicines();
		},
		error: function (xhr, status, error) {
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				showCustomToast('error', 'Lỗi xóa thuốc');
			}
		}
	});
}

// Reset form
function resetForm() {
	$('#medicineForm')[0].reset();
	$('#medicineForm').removeData('medicine-id');
	$('#medicineModalLabel').text('THÊM THUỐC MỚI');
	$('#medicineFormError').addClass('d-none');

	// Reset new autocomplete fields
	$('#categoryType').val('');
	$('#categoryTypeValue').val('');
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

// Export template - Download file template có sẵn với màu đỏ
function exportTemplate() {
	// Tải file template Excel đã được tạo sẵn với màu đỏ
	const link = document.createElement('a');
	link.href = '/static/templates/mau_import_thuoc.xlsx';
	link.download = 'mau_import_thuoc.xlsx';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	showCustomToast('success', 'Đã tải file mẫu thành công!');
}

// Import medicines
function importMedicines() {
	const fileInput = document.getElementById('importFile');
	const file = fileInput.files[0];

	if (!file) {
		showCustomToast('error', 'Vui lòng chọn file để import!');
		return;
	}

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	const formData = new FormData();
	formData.append('file', file);

	// Hiển thị loading
	$('#confirmImportBtn').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Đang import...');

	$.ajax({
		url: '/api/medicines/import',
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + token
		},
		data: formData,
		processData: false,
		contentType: false,
		success: function (response) {
			// Hiển thị modal kết quả chi tiết
			showMedicineImportResult(
				response.imported_count || 0,
				response.total_rows || 0,
				response.skipped_count || 0,
				response.errors || []
			);

			// Đóng modal import
			$('#importModal').modal('hide');
			$('#importFile').val('');
			loadMedicines(); // Reload danh sách
		},
		error: function (xhr, status, error) {
			const errorMessage = 'Không thể nhập dữ liệu thuốc. Vui lòng kiểm tra tệp và thử lại.';
			$('#importError').removeClass('d-none').text(errorMessage);
			showCustomToast('error', errorMessage);
		},
		complete: function () {
			$('#confirmImportBtn').prop('disabled', false).html('Import');
		}
	});
}

// Hiển thị kết quả import thuốc
function showMedicineImportResult(importedCount, totalRows, skippedCount, errors = []) {
	const totalErrors = skippedCount;

	// Tạo modal kết quả nếu chưa có
	if (!$('#medicineImportResultModal').length) {
		$('body').append(`
            <div class="modal fade" id="medicineImportResultModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-check-circle-fill text-success me-2"></i>Kết quả import thuốc
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <div class="card text-center border-success">
                                        <div class="card-body">
                                            <h3 class="text-success" id="importSuccessCount">${importedCount}</h3>
                                            <p class="mb-0">Thành công</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center border-warning">
                                        <div class="card-body">
                                            <h3 class="text-warning" id="importSkippedCount">${skippedCount}</h3>
                                            <p class="mb-0">Bị bỏ qua</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center border-info">
                                        <div class="card-body">
                                            <h3 class="text-info" id="importTotalRows">${totalRows}</h3>
                                            <p class="mb-0">Tổng số dòng</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            ${errors.length > 0 ? `
                                <div class="alert alert-warning">
                                    <h6><i class="bi bi-exclamation-triangle me-2"></i>Chi tiết các dòng bị bỏ qua:</h6>
	                                    <div id="medicineImportErrorList" class="medicine-import-error-list">
                                        ${errors.map(error => `<div class="mb-1"><small>• ${error}</small></div>`).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle me-2"></i>
                                <strong>Tổng kết:</strong> 
                                Import thành công <strong>${importedCount}</strong>/${totalRows} thuốc, 
                                có <strong>${skippedCount}</strong> dòng bị bỏ qua.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                            ${errors.length > 0 ? `
                                <button type="button" class="btn btn-warning" onclick="exportMedicineImportErrors()">
                                    <i class="bi bi-download me-2"></i>Xuất danh sách lỗi
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `);
	} else {
		// Cập nhật nội dung modal
		$('#importSuccessCount').text(importedCount);
		$('#importSkippedCount').text(skippedCount);
		$('#importTotalRows').text(totalRows);

		if (errors.length > 0) {
			$('#medicineImportErrorList').html(errors.map(error => `<div class="mb-1"><small>• ${error}</small></div>`).join(''));
			$('#medicineImportResultModal .alert-warning').show();
		} else {
			$('#medicineImportResultModal .alert-warning').hide();
		}

		$('#medicineImportResultModal .alert-info').html(`
            <i class="bi bi-info-circle me-2"></i>
            <strong>Tổng kết:</strong> 
            Import thành công <strong>${importedCount}</strong>/${totalRows} thuốc, 
            có <strong>${skippedCount}</strong> dòng bị bỏ qua.
        `);
	}

	// Hiển thị modal
	$('#medicineImportResultModal').modal('show');

	// Hiển thị toast thông báo
	if (importedCount > 0) {
		showCustomToast('success', `Import thành công ${importedCount} thuốc!`);
	}
	if (skippedCount > 0) {
		showCustomToast('warning', `Có ${skippedCount} dòng bị bỏ qua. Vui lòng xem chi tiết trong modal.`);
	}
}

// Xuất danh sách lỗi import thuốc
function exportMedicineImportErrors() {
	try {
		const errors = [];
		$('#medicineImportErrorList small').each(function () {
			errors.push($(this).text().replace('• ', ''));
		});

		if (errors.length === 0) {
			showCustomToast('info', 'Không có lỗi để xuất');
			return;
		}

		const content = errors.join('\n');
		const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `danh_sach_loi_import_thuoc_${new Date().getTime()}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		showCustomToast('success', 'Đã xuất danh sách lỗi!');
	} catch (error) {
		console.error('Lỗi khi xuất danh sách lỗi:', error);
		showCustomToast('error', 'Lỗi khi xuất danh sách lỗi');
	}
}

// Autocomplete functions for new fields
function initializeCategoryTypeAutocomplete() {
	const input = document.getElementById('categoryType');
	const dropdown = document.getElementById('categoryTypeDropdown');
	const hiddenInput = document.getElementById('categoryTypeValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'DRUG', label: 'Thuốc' },
		{ value: 'SUPPLEMENT', label: 'TPCN' },
		{ value: 'EQUIPMENT', label: 'Y dụng cụ' }
	];

	input.addEventListener('input', function () {
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

function initializeGenericNameAutocomplete() {
	const input = document.getElementById('genericNameInput');
	const dropdown = document.getElementById('genericNameDropdown');
	const hiddenInput = document.getElementById('genericNameValue');
	if (!input || !dropdown || !hiddenInput) return;

	let activeIngredients = [];
	let isLoaded = false;

	// Hàm load danh sách hoạt chất từ API
	function loadActiveIngredients() {
		if (isLoaded) return;
		const token = localStorage.getItem('qlpk_token');
		if (!token) return;

		$.ajax({
			url: '/api/medicines/active-ingredients',
			method: 'GET',
			headers: { 'Authorization': 'Bearer ' + token },
			success: function(response) {
				if (response.success && response.data) {
					activeIngredients = response.data.map(item => ({ value: item, label: item }));
					isLoaded = true;
				}
			}
		});
	}

	// Gọi API để load sẵn khi form mở
	$('#medicineModal').on('show.bs.modal', function() {
		loadActiveIngredients();
	});

	input.addEventListener('input', function () {
		const query = this.value.trim();
		hiddenInput.value = query; // Luôn cập nhật giá trị thực tế
		
		if (!query) {
			showDropdown(dropdown, activeIngredients.slice(0, 30), input, hiddenInput);
			return;
		}

			const queryLower = normalizeSearchText(query);
			const filtered = activeIngredients.filter(option =>
				normalizeSearchText(option.label).includes(queryLower)
			).slice(0, 30);

			// Kiểm tra xem đã có exact match chưa
			const exactMatch = activeIngredients.find(opt => normalizeSearchText(opt.label) === queryLower);
		
		// Nếu chưa có exact match, thêm 1 lựa chọn "Tạo mới" lên đầu
		if (!exactMatch) {
			filtered.unshift({
				value: query,
				label: `+ Thêm hoạt chất mới: "${query}"`,
				isNew: true // Đánh dấu đây là option tạo mới
			});
		}

		// Tuỳ biến hiển thị nếu cần (vì showDropdown chuẩn chỉ set textContent)
		// Ta sẽ sửa trực tiếp DOM của dropdown
		dropdown.innerHTML = '';
		if (filtered.length === 0) {
			setElementVisible(dropdown, false);
			return;
		}

		filtered.forEach(option => {
			const item = document.createElement('div');
			item.className = 'occupation-item';
			
			if (option.isNew) {
				item.classList.add('occupation-item--new');
				item.innerHTML = `<span class="occupation-item-label--new"><i class="bi bi-plus-circle me-1"></i> ${option.label}</span>`;
			} else {
				item.textContent = option.label;
			}
			
			item.addEventListener('click', function () {
				// Khi click, điền giá trị gốc (query) chứ không phải chữ "Thêm hoạt chất mới"
				input.value = option.value;
				hiddenInput.value = option.value;
				setElementVisible(dropdown, false);
			});
			dropdown.appendChild(item);
		});

		setElementVisible(dropdown, true);
	});

	input.addEventListener('focus', function () {
		if (!isLoaded) loadActiveIngredients();
		// Trigger lại sự kiện input để hiện dropdown có (hoặc không có) mục Thêm mới
		const event = new Event('input', { bubbles: true });
		input.dispatchEvent(event);
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
function formatStockQuantity(quantity) {
	if (quantity === null || quantity === undefined || quantity === '') return '0 viên';

	const num = parseFloat(quantity);
	if (isNaN(num)) return '0 viên';

	// Kiểm tra nếu là số nguyên thì không hiển thị phần thập phân
	if (num % 1 === 0) {
		return num.toLocaleString('vi-VN') + ' viên';
	}

	// Hiển thị số thập phân với dấu phẩy (định dạng Việt Nam)
	// Ví dụ: 200.75 -> "200,75 viên"
	const formatted = num.toFixed(2).replace(/\./g, ',').replace(/,?0+$/, '');
	return formatted + ' viên';
}

// Cập nhật thông tin quy cách đóng gói
function updatePackagingInfo() {
	const packagingUnit = document.getElementById('packagingUnit')?.value || '';
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);
	const packagingDisplay = document.getElementById('packagingDisplay');
	const packagingInfoText = document.getElementById('packagingInfoText');
	const saleUnit = document.getElementById('saleUnit')?.value || 'viên';

	if (!packagingDisplay) return;

	// Cập nhật hidden field để lưu vào database
	if (packagingUnit) {
		if (unitsPerBox > 0) {
			// Format: "Hộp 20 lọ" hoặc "Lọ 20 gói" tùy theo packagingUnit
			packagingDisplay.value = `Hộp ${unitsPerBox} ${packagingUnit}`;
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
			packagingInfoText.textContent = `1 ${packagingUnit.charAt(0).toUpperCase() + packagingUnit.slice(1)} = 1 ${saleUnit.charAt(0).toUpperCase() + saleUnit.slice(1)}`;
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

// Format tồn kho hiển thị: "[số] [đơn vị đóng gói] và [số lẻ] [đơn vị tồn kho] tồn"
// Ví dụ: "10 hộp và 10.75 viên tồn"
function formatStockDisplay(medicine) {
	if (!medicine) return '-';

	const stockQuantity = medicine.stock_quantity || 0;
	const unitsPerBox = medicine.units_per_box || 0;
	const packagingUnit = medicine.packaging_unit || '';
	const unit = medicine.unit || 'tablet';

	// Format số với dấu phẩy ngăn cách hàng nghìn
	const formatNumber = (num) => {
		return num.toLocaleString('vi-VN');
	};

	// Format số thập phân (cho số lẻ)
	const formatDecimal = (num) => {
		// Nếu là số nguyên, không hiển thị phần thập phân
		if (num % 1 === 0) {
			return formatNumber(num);
		}
		// Nếu có phần thập phân, hiển thị tối đa 2 chữ số sau dấu phẩy
		return num.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
	};

	// Chuyển đổi đơn vị từ tiếng Anh sang tiếng Việt
	const unitDisplay = getUnitDisplay(unit);
	const packagingUnitDisplay = packagingUnit ? getUnitDisplay(packagingUnit) : '';

	// Nếu không có tồn kho
	if (stockQuantity === 0 || stockQuantity === null) {
		return `0 ${unitDisplay}`;
	}

	// Nếu không có packaging_unit và units_per_box, thử parse từ field packaging
	if (!packagingUnit || !unitsPerBox || unitsPerBox === 0) {
		const packaging = medicine.packaging || '';
		if (packaging) {
			// Thử parse từ format: "Hộp 6 vỉ x 10 viên" hoặc "Hộp 20 lọ" hoặc "Hộp 1 lọ 30 viên"
			// Format 1: "Hộp X vỉ x Y viên" -> units_per_box = X * Y, packaging_unit = "vỉ"
			let parsedUnitsPerBox = 0;
			let parsedPackagingUnit = '';

			// Format: "Hộp 6 vỉ x 10 viên" -> 6 vỉ x 10 viên = 60 viên/hộp, packaging_unit = "vỉ"
			const match1 = packaging.match(/Hộp\s+(\d+)\s+([^\sx]+)\s*x\s*(\d+)\s+([^\s;]+)/i);
			if (match1) {
				const soVi = parseInt(match1[1]) || 0;
				const donViVi = match1[2].trim();
				const soVienMoiVi = parseInt(match1[3]) || 0;
				parsedUnitsPerBox = soVi * soVienMoiVi; // Tổng số viên trong 1 hộp
				parsedPackagingUnit = donViVi; // Đơn vị đóng gói là "vỉ"
			} else {
				// Format: "Hộp 20 lọ" -> units_per_box = 20, packaging_unit = "lọ"
				const match2 = packaging.match(/Hộp\s+(\d+)\s+([^\s;]+)/i);
				if (match2) {
					parsedUnitsPerBox = parseInt(match2[1]) || 0;
					parsedPackagingUnit = match2[2].trim();
				} else {
					// Format: "Hộp 1 lọ 30 viên" -> units_per_box = 30, packaging_unit = "lọ"
					const match3 = packaging.match(/Hộp\s+\d+\s+([^\s]+)\s+(\d+)\s+([^\s;]+)/i);
					if (match3) {
						parsedUnitsPerBox = parseInt(match3[2]) || 0;
						parsedPackagingUnit = match3[1].trim();
					}
				}
			}

			if (parsedUnitsPerBox > 0 && parsedPackagingUnit) {
				// Sử dụng giá trị đã parse
				const parsedPackagingUnitDisplay = getUnitDisplay(parsedPackagingUnit);
				const packagingQuantity = Math.floor(stockQuantity / parsedUnitsPerBox);
				const remainingQuantity = stockQuantity - (packagingQuantity * parsedUnitsPerBox);

				if (packagingQuantity > 0 && remainingQuantity > 0) {
					return `${formatNumber(packagingQuantity)} ${parsedPackagingUnitDisplay} và ${formatDecimal(remainingQuantity)} ${unitDisplay} tồn`;
				} else if (packagingQuantity > 0 && remainingQuantity === 0) {
					return `${formatNumber(packagingQuantity)} ${parsedPackagingUnitDisplay} và 0 ${unitDisplay} tồn`;
				} else {
					return `${formatDecimal(remainingQuantity)} ${unitDisplay} tồn`;
				}
			}
		}
		// Nếu không parse được, chỉ hiển thị số lượng theo đơn vị dùng
		return `${formatNumber(stockQuantity)} ${unitDisplay} tồn`;
	}

	// Nếu có đầy đủ thông tin về quy cách đóng gói
	// stock_quantity trong database phải là số lượng theo đơn vị tồn kho (viên), không phải số hộp
	// Tính số lượng theo đơn vị đóng gói (làm tròn xuống)
	const packagingQuantity = Math.floor(stockQuantity / unitsPerBox);

	// Tính số lẻ (phần còn lại sau khi chia cho unitsPerBox)
	const remainingQuantity = stockQuantity - (packagingQuantity * unitsPerBox);

	// Hiển thị: "[số] [đơn vị đóng gói] và [số lẻ] [đơn vị tồn kho] tồn"
	// Ví dụ: "10 hộp và 10.75 viên tồn"
	if (packagingQuantity > 0 && remainingQuantity > 0) {
		// Có cả hộp và số lẻ
		return `${formatNumber(packagingQuantity)} ${packagingUnitDisplay} và ${formatDecimal(remainingQuantity)} ${unitDisplay} tồn`;
	} else if (packagingQuantity > 0 && remainingQuantity === 0) {
		// Chỉ có hộp, không có số lẻ - chỉ hiển thị số hộp, không cần "và 0 viên"
		return `${formatNumber(packagingQuantity)} ${packagingUnitDisplay} và 0 ${unitDisplay} tồn`;
	} else if (packagingQuantity === 0 && remainingQuantity > 0) {
		// Không có hộp nào, chỉ có số lẻ
		return `${formatDecimal(remainingQuantity)} ${unitDisplay} tồn`;
	} else {
		// Trường hợp đặc biệt: stockQuantity = 0 hoặc không có gì
		return `0 ${unitDisplay}`;
	}
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

// Show stock detail modal
function showStockDetail(medicineId, medicineName) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	// Set medicine name
	$('#detailMedicineName').text(medicineName);

	// Show loading state
	$('#batchDetailTableBody').html('<tr><td colspan="8" class="text-center text-muted py-4">Đang tải dữ liệu...</td></tr>');
	$('#totalStockQuantity').text('-');
	$('#totalBatches').text('-');
	$('#averageImportPrice').text('-');
	$('#totalStockValue').text('-');

	// Open modal
	const modal = new bootstrap.Modal(document.getElementById('stockDetailModal'));
	modal.show();

	// Load batch data from API
	$.ajax({
		url: `/api/medicines/${medicineId}/batches`,
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		},
		success: function (data) {
			renderStockDetail(data, medicineName);
		},
		error: function (xhr) {
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				showCustomToast('error', 'Lỗi tải dữ liệu chi tiết tồn kho');
				$('#batchDetailTableBody').html('<tr><td colspan="8" class="text-center text-danger py-4">Lỗi tải dữ liệu</td></tr>');
			}
		}
	});
}

// Render stock detail data
function renderStockDetail(data, medicineName) {
	const batches = data.batches || [];
	const totalBatches = data.total_batches || 0;
	const totalQuantity = data.total_quantity || 0;
	const avgImportPrice = data.avg_import_price || 0;
	const stockValue = data.stock_value || 0;

	// Update summary
	$('#totalStockQuantity').text(formatStockQuantity(totalQuantity));
	$('#totalBatches').text(`${totalBatches} lô`);
	$('#averageImportPrice').text(avgImportPrice > 0 ? formatCurrency(avgImportPrice) : '-');
	$('#totalStockValue').text(stockValue > 0 ? formatCurrency(stockValue) : '-');

	// Render batch table
	const tbody = $('#batchDetailTableBody');
	tbody.empty();

	if (batches.length === 0) {
		tbody.html('<tr><td colspan="8" class="text-center text-muted py-4">Chưa có lô thuốc nào</td></tr>');
		return;
	}

	// Sort by expiry_date (FEFO - First Expired First Out)
	const sortedBatches = [...batches].sort((a, b) => {
		const dateA = new Date(a.expiry_date);
		const dateB = new Date(b.expiry_date);
		return dateA - dateB;
	});

	sortedBatches.forEach(batch => {
		const status = batch.status || 'Bình thường';
		const daysToExpiry = batch.days_to_expiry;

		// Determine row color based on status
		let rowClass = '';
		let statusBadgeClass = 'bg-secondary';

		if (status === 'Đã hết hạn' || (daysToExpiry !== null && daysToExpiry < 0)) {
			rowClass = 'table-danger';
			statusBadgeClass = 'bg-danger';
		} else if (status === 'Sắp hết hạn' || (daysToExpiry !== null && daysToExpiry <= 30)) {
			rowClass = 'table-warning';
			statusBadgeClass = 'bg-warning text-dark';
		} else if (status === 'Sắp hết' || (batch.remaining_quantity && batch.quantity &&
			parseFloat(batch.remaining_quantity) <= parseFloat(batch.quantity) * 0.1)) {
			rowClass = 'table-info';
			statusBadgeClass = 'bg-info';
		} else {
			rowClass = '';
			statusBadgeClass = 'bg-success';
		}

		const row = `
            <tr class="${rowClass}">
                <td class="batch-number-cell">${batch.batch_number || '-'}</td>
                <td>${formatDate(batch.import_date)}</td>
                <td>${formatDate(batch.expiry_date)}</td>
                <td>${formatStockQuantity(batch.quantity || 0)}</td>
                <td>${formatStockQuantity(batch.remaining_quantity || 0)}</td>
                <td>${batch.import_price ? formatCurrency(batch.import_price) : '-'}</td>
                <td>${batch.supplier_name || '-'}</td>
                <td>
                    <span class="badge ${statusBadgeClass}">${status}</span>
                    ${daysToExpiry !== null && daysToExpiry >= 0 ? `<small class="text-muted d-block">(${daysToExpiry} ngày)</small>` : ''}
                </td>
            </tr>
        `;
		tbody.append(row);
	});
}

// ========== FUNCTIONS CHO NHẬP KHO THEO ĐƠN HÀNG ==========
let batchRowCounter = 0;

// Hàm tìm số lô tiếp theo (LOT-01, LOT-02, ...)
function getNextBatchNumber() {
	const tbody = document.getElementById('batchImportTableBody');
	if (!tbody) return 'LOT-01';

	const rows = tbody.querySelectorAll('tr');
	const batchNumbers = new Set();

	// Lấy tất cả số lô đã có
	rows.forEach(row => {
		const batchInput = row.querySelector('.batch-number-display');
		if (batchInput && batchInput.value) {
			const batchNum = batchInput.value.trim().toUpperCase();
			// Chỉ lấy các số lô có format LOT-XX
			if (batchNum.startsWith('LOT-')) {
				batchNumbers.add(batchNum);
			}
		}
	});

	// Tìm số lớn nhất (HÀM NÀY HIỆN KHÔNG DÙNG ĐỂ GÁN SỐ LÔ THỰC TẾ,
	// backend sẽ tự sinh số lô bằng generate_batch_number)
	let maxNum = 0;
	batchNumbers.forEach(batchNum => {
		const match = batchNum.match(/^LOT-(\d+)$/);
		if (match) {
			const num = parseInt(match[1]);
			if (num > maxNum) {
				maxNum = num;
			}
		}
	});

	// Trả về số lô tiếp theo
	const nextNum = maxNum + 1;
	return `LOT-${String(nextNum).padStart(2, '0')}`;
}

function showImportBatchModal() {
	// Reset form
	document.getElementById('batchSupplier').value = '';
	const batchSupplierIdInput = document.getElementById('batchSupplierId');
	if (batchSupplierIdInput) batchSupplierIdInput.value = '';
	document.getElementById('batchInvoiceNumber').value = '';
	const batchImportDate = document.getElementById('batchImportDate');
	if (batchImportDate) {
		const today = new Date();
		batchImportDate.value = today.toISOString().split('T')[0];
	}
	document.getElementById('batchImportUser').value = '';
	document.getElementById('batchNote').value = '';

	// Xóa tất cả dòng trong bảng
	const tbody = document.getElementById('batchImportTableBody');
	if (tbody) tbody.innerHTML = '';

	// Thêm dòng đầu tiên
	batchRowCounter = 0;
	addBatchImportRow();

	// Reset tổng giá trị
	document.getElementById('batchTotalValue').textContent = '0 ₫';
	document.getElementById('batchLotBreakdown').innerHTML = '';

	const modal = new bootstrap.Modal(document.getElementById('importBatchModal'));
	modal.show();
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
                 placeholder="Tên thuốc" required autocomplete="off"
                 data-row-id="${rowId}">
	          <div class="occupation-dropdown batch-medicine-dropdown mm-hidden"></div>
          <input type="hidden" class="batch-medicine-id" value="">
        </div>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm batch-number-display" 
               value="" 
	               placeholder="Để trống để hệ thống tự tạo (LOT-01, LOT-02...)"
               onblur="validateBatchNumber(this)">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm batch-expiry-date js-datepicker" placeholder="dd/mm/yyyy" autocomplete="off" required>
      </td>
      <td>
        <input type="number" class="form-control form-control-sm batch-quantity" min="0" step="0.01" required 
               placeholder="Số lượng" 
               oninput="calculateBatchRowTotal('${rowId}'); updateBatchTotal()">
      </td>
      <td>
        <input type="number" class="form-control form-control-sm batch-price" min="0" step="0.01" placeholder="Giá" 
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
        <button type="button" class="btn btn-sm btn-danger" onclick="removeBatchRow('${rowId}'); updateBatchTotal()">
          <i class="bi bi-trash"></i>
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

// Tự động điền thông tin khi chọn thuốc trong nhập kho đơn hàng
async function onBatchMedicineSelect(medicineId, rowId) {
	if (!medicineId) return;

	const medicine = medicines.find(m => m.id === medicineId);
	if (!medicine) return;

	const row = document.getElementById(rowId);
	if (!row) return;

	// Lấy giá nhập lần trước từ API
	try {
		const token = localStorage.getItem('qlpk_token');
		const response = await $.ajax({
			url: `/api/medicines/${medicineId}/batches`,
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			},
			dataType: 'json'
		});

		const batches = Array.isArray(response) ? response : (response.items || []);

		// Lấy lô mới nhất (chỉ để gợi ý giá nhập); SỐ LÔ sẽ do backend tự sinh nếu để trống
		if (batches.length > 0) {
			const latestBatch = batches[batches.length - 1];
			const lastPrice = latestBatch.import_price;

			// Lưu giá cũ vào data attribute
			row.setAttribute('data-last-price', lastPrice || '0');

			// Hiển thị giá nhập lần trước
			const lastPriceElement = row.querySelector('.batch-last-price');
			if (lastPriceElement && lastPrice) {
				lastPriceElement.textContent = `Giá lần trước: ${formatCurrency(lastPrice)}`;
				setElementVisible(lastPriceElement, true);
			}

			// Tự động điền giá nhập từ lần nhập gần nhất (nếu chưa có giá)
			const priceInput = row.querySelector('.batch-price');
			if (priceInput && !priceInput.value && lastPrice) {
				priceInput.value = lastPrice;
				calculateBatchRowTotal(rowId);
				updateBatchTotal();
			}

			// Tính chênh lệch nếu đã có giá mới
			if (priceInput && priceInput.value) {
				updatePriceComparison(rowId);
			}
		}

		// KHÔNG tự sinh số lô trên FE nữa; để trống để backend tự tạo (generate_batch_number)

		if (batches.length === 0) {
			// Không có lần nhập trước
			const lastPriceElement = row.querySelector('.batch-last-price');
			const priceDiffElement = row.querySelector('.batch-price-diff');
			if (lastPriceElement) {
				setElementVisible(lastPriceElement, false);
			}
			if (priceDiffElement) {
				setElementVisible(priceDiffElement, false);
			}
			row.removeAttribute('data-last-price');
		}
	} catch (error) {
		console.error('Lỗi khi lấy thông tin lô thuốc:', error);
	}
}

// Hàm tính và hiển thị chênh lệch giá nhập
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
async function confirmBatchImport() {
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

		// Xử lý giá nhập: không bắt buộc, cho phép 0 hoặc để trống
		let importPrice = 0;
		if (importPriceRaw !== '' && importPriceRaw !== null && importPriceRaw !== undefined) {
			const parsedPrice = parseFloat(importPriceRaw);
			// Nếu parse được số hợp lệ và >= 0 thì dùng, nếu không thì để 0
			if (!isNaN(parsedPrice) && parsedPrice >= 0) {
				importPrice = parsedPrice;
			}
		}

		// Bắt buộc: có thuốc, hạn dùng, số lượng > 0; Giá nhập không bắt buộc (có thể = 0 hoặc trống)
		if (!medicineId || !expiryDate || !quantity || quantity <= 0) {
			hasError = true;
			return;
		}

		items.push({
			medicine_id: parseInt(medicineId),
			batch_number: batchNumber || null,
			expiry_date: expiryDate,
			quantity: quantity,
			remaining_quantity: quantity,
			import_price: importPrice,
			notes: note
		});
	});

	if (hasError || items.length === 0) {
		showCustomToast('error', 'Vui lòng điền đầy đủ thông tin cho tất cả các thuốc (Tên thuốc, Hạn sử dụng, Số lượng)');
		return;
	}

	// Gọi API nhập kho
	try {
		const token = localStorage.getItem('qlpk_token');
		const response = await $.ajax({
			url: '/api/medicine-batches/import-order',
			method: 'POST',
			headers: {
				'Authorization': 'Bearer ' + token,
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

		// Hiển thị thông báo thành công
		showCustomToast('success', `Nhập kho thành công! Đã nhập ${response.total_batches} lô thuốc.`);
	} catch (error) {
		console.error('Lỗi khi nhập kho:', error);
		showCustomToast('error', 'Không thể nhập kho. Vui lòng kiểm tra dữ liệu và thử lại.');
	}
}

// ========== QUẢN LÝ NHÀ CUNG CẤP ==========
let suppliers = [];
let editingSupplierId = null;

// Hàm hiển thị modal quản lý nhà cung cấp
function showSupplierManagement() {
	const modal = new bootstrap.Modal(document.getElementById('supplierManagementModal'));
	modal.show();
	loadSuppliers();
	resetSupplierForm();
}

// Hàm load danh sách nhà cung cấp
function loadSuppliers() {
	const tbody = document.getElementById('supplierTableBody');
	if (!tbody) return;

	tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Đang tải dữ liệu...</td></tr>';

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	const search = document.getElementById('supplierSearchInput')?.value || '';
	const statusFilter = document.getElementById('supplierStatusFilter')?.value || '';

	$.ajax({
		url: '/api/suppliers/',
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		},
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
            <td>
                <span class="badge ${supplier.is_active === 1 ? 'bg-success' : 'bg-secondary'}">
                    ${supplier.is_active === 1 ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-success me-1" onclick="selectSupplierForBatch(${supplier.id})" title="Chọn cho đơn nhập kho">
                    <i class="bi bi-check-circle"></i>
                </button>
                <button class="btn btn-sm btn-primary me-1" onclick="editSupplier(${supplier.id})" title="Sửa">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteSupplier(${supplier.id})" title="Xóa">
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

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	$.ajax({
		url: `/api/suppliers/${supplierId}`,
		method: 'DELETE',
		headers: {
			'Authorization': 'Bearer ' + token
		},
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
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
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
			'Authorization': 'Bearer ' + token,
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
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		return;
	}

	// Tạo AbortController cho timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 giây timeout

	fetch('/api/medicines/dashboard', {
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token,
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
		const totalBatchesEl = document.getElementById('dashboardTotalBatches');
		if (totalBatchesEl) {
			totalBatchesEl.textContent = response.total_batches || 0;
		}
	}).catch(error => {
		clearTimeout(timeoutId);
		console.error('Error loading dashboard:', error);

		// Hiển thị giá trị mặc định nếu có lỗi
		const totalMedicinesEl = document.getElementById('dashboardTotalMedicines');
		const totalValueEl = document.getElementById('dashboardTotalValue');
		const warningsEl = document.getElementById('dashboardWarnings');
		const totalBatchesEl = document.getElementById('dashboardTotalBatches');

		if (totalMedicinesEl) totalMedicinesEl.textContent = '0';
		if (totalValueEl) totalValueEl.textContent = '0 ₫';
		if (warningsEl) warningsEl.textContent = '0';
		if (totalBatchesEl) totalBatchesEl.textContent = '0';
	});
}


// ========== KIỂM KÊ KHO ==========
// Hàm hiển thị modal kiểm kê kho
// Biến lưu dữ liệu gốc để filter
let inventoryCountOriginalData = [];

function showInventoryCountModal() {
	const modal = new bootstrap.Modal(document.getElementById('inventoryCountModal'));
	modal.show();
	loadInventoryCountData();

	// Bind event listener cho thanh tìm kiếm (chỉ bind một lần)
	const searchInput = document.getElementById('inventoryCountSearchInput');
	if (searchInput) {
		searchInput.value = ''; // Reset search khi mở modal
		// Remove event listener cũ nếu có để tránh bind nhiều lần
		searchInput.removeEventListener('input', filterInventoryCountTable);
		searchInput.addEventListener('input', filterInventoryCountTable);
	}
}

// Hàm load dữ liệu kiểm kê kho
async function loadInventoryCountData() {
	const tbody = document.getElementById('inventoryCountTableBody');
	if (!tbody) return;

	tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Đang tải dữ liệu...</td></tr>';

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	try {
		// Load tất cả thuốc để kiểm kê
		const response = await $.ajax({
			url: '/api/medicine-batches/?page=1&per_page=5000',
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			},
				dataType: 'json'
			});

		const batches = response.batches || [];

		// Lưu dữ liệu gốc để filter
		inventoryCountOriginalData = batches;

		// Render bảng với dữ liệu gốc
		renderInventoryCountTable(batches);

	} catch (error) {
		console.error('Error loading inventory count data:', error);
		showCustomToast('error', 'Lỗi khi tải dữ liệu kiểm kê kho');
		const tbody = document.getElementById('inventoryCountTableBody');
		if (tbody) {
			tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Không thể tải dữ liệu</td></tr>';
		}
	}
}

// Hàm lưu các giá trị đã nhập trước khi filter
function saveInventoryCountInputValues() {
	const rows = document.querySelectorAll('#inventoryCountTableBody tr');
	const savedValues = {};

	rows.forEach(row => {
			const batchId = row.querySelector('.actual-quantity')?.getAttribute('data-batch-id');
			if (batchId) {
				const actualQty = row.querySelector('.actual-quantity')?.value || '';
				const note = row.querySelector('.inventory-note')?.value || '';
				savedValues[batchId] = {
				actualQty: actualQty,
				note: note
			};
		}
	});

	return savedValues;
}

// Hàm render bảng kiểm kê kho
function renderInventoryCountTable(medicines) {
	const tbody = document.getElementById('inventoryCountTableBody');
	if (!tbody) return;

	// Lưu các giá trị đã nhập trước khi render lại
	const savedValues = saveInventoryCountInputValues();

	tbody.innerHTML = '';

	if (medicines.length === 0) {
			tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Không tìm thấy lô thuốc nào</td></tr>';
		return;
	}

	medicines.forEach(batch => {
		const row = document.createElement('tr');
		const systemQty = parseFloat(batch.remaining_quantity) || 0;

		// Khôi phục giá trị đã nhập nếu có
		const savedValue = savedValues[batch.id];
		const actualQtyValue = savedValue?.actualQty || systemQty;
		const noteValue = savedValue?.note || '';

		row.innerHTML = `
				<td>${batch.medicine_name || 'N/A'}</td>
				<td><span class="badge bg-light text-dark">${batch.batch_number || '-'}</span></td>
				<td><strong>${formatStockQuantity(systemQty)}</strong></td>
				<td>
					<input type="number" class="form-control form-control-sm actual-quantity"
						   value="${actualQtyValue}" min="0" step="0.01"
						   data-batch-id="${batch.id}"
						   data-medicine-id="${batch.medicine_id}"
						   data-system-qty="${systemQty}">
                </td>
                <td>
                    <span class="badge bg-secondary difference-badge">0</span>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm inventory-note" 
                           placeholder="Ghi chú" value="${noteValue}">
                </td>
            `;

		// Tính chênh lệch khi nhập SL thực tế
		const actualInput = row.querySelector('.actual-quantity');
		const differenceBadge = row.querySelector('.difference-badge');

		// Tính chênh lệch ban đầu nếu có giá trị đã lưu
		if (savedValue && parseFloat(actualQtyValue) !== systemQty) {
			const diff = parseFloat(actualQtyValue) - systemQty;
			if (diff === 0) {
				differenceBadge.className = 'badge bg-secondary difference-badge';
				differenceBadge.textContent = '0';
			} else if (diff > 0) {
				differenceBadge.className = 'badge bg-success difference-badge';
				differenceBadge.textContent = `+${diff.toFixed(2)}`;
			} else {
				differenceBadge.className = 'badge bg-danger difference-badge';
				differenceBadge.textContent = diff.toFixed(2);
			}
		}

		actualInput.addEventListener('input', function () {
			const systemQty = parseFloat(this.getAttribute('data-system-qty')) || 0;
			const actualQty = parseFloat(this.value) || 0;
			const diff = actualQty - systemQty;

			if (diff === 0) {
				differenceBadge.className = 'badge bg-secondary difference-badge';
				differenceBadge.textContent = '0';
			} else if (diff > 0) {
				differenceBadge.className = 'badge bg-success difference-badge';
				differenceBadge.textContent = `+${diff.toFixed(2)}`;
			} else {
				differenceBadge.className = 'badge bg-danger difference-badge';
				differenceBadge.textContent = diff.toFixed(2);
			}
		});

		tbody.appendChild(row);
	});
}

// Hàm filter bảng kiểm kê kho theo tên thuốc
function filterInventoryCountTable() {
	const searchInput = document.getElementById('inventoryCountSearchInput');
	if (!searchInput) return;

	const searchTerm = normalizeSearchText(searchInput.value);

	if (!searchTerm) {
		// Nếu không có từ khóa, hiển thị tất cả
		renderInventoryCountTable(inventoryCountOriginalData);
		return;
	}

	// Filter dữ liệu theo tên thuốc hoặc số lô
	const filteredData = inventoryCountOriginalData.filter(batch => {
		const medicineName = normalizeSearchText(batch.medicine_name);
		const batchNumber = normalizeSearchText(batch.batch_number);
		return medicineName.includes(searchTerm) || batchNumber.includes(searchTerm);
	});

	// Render lại bảng với dữ liệu đã filter
	renderInventoryCountTable(filteredData);
}

// Hàm xác nhận điều chỉnh kiểm kê
async function confirmInventoryCount() {
	const rows = document.querySelectorAll('#inventoryCountTableBody tr');
	const adjustments = [];
	let hasMissingInventoryNote = false;

	rows.forEach(row => {
		const batchIdInput = row.querySelector('.actual-quantity');
		if (!batchIdInput) return;

		const batchId = parseInt(batchIdInput.getAttribute('data-batch-id'));
		const systemQty = parseFloat(batchIdInput.getAttribute('data-system-qty')) || 0;
		const actualQty = parseFloat(batchIdInput.value) || 0;
		const noteInput = row.querySelector('.inventory-note');
		const note = noteInput ? noteInput.value.trim() : '';

		if (actualQty !== systemQty) {
			if (!note) {
				row.classList.add('table-warning');
				hasMissingInventoryNote = true;
				return;
			}
			adjustments.push({
				batch_id: batchId,
				system_quantity: systemQty,
				actual_quantity: actualQty,
				difference: actualQty - systemQty,
				note: note
			});
		}
	});

	if (hasMissingInventoryNote) {
		showCustomToast('warning', 'Vui lòng ghi lý do cho từng lô có chênh lệch.');
		return;
	}

	if (adjustments.length === 0) {
		showCustomToast('info', 'Không có chênh lệch nào cần điều chỉnh!');
		return;
	}

	if (!confirm(`Xác nhận điều chỉnh ${adjustments.length} lô thuốc có chênh lệch?`)) {
		return;
	}

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	try {
		const response = await $.ajax({
			url: '/api/medicine-batches/inventory-count',
			method: 'POST',
			headers: {
				'Authorization': 'Bearer ' + token,
				'Content-Type': 'application/json'
			},
			dataType: 'json',
			data: JSON.stringify({
				adjustments: adjustments
			})
		});

		// Đóng modal
		const modal = bootstrap.Modal.getInstance(document.getElementById('inventoryCountModal'));
		if (modal) modal.hide();

		// Reload danh sách thuốc và cập nhật dashboard
		loadMedicines();
		updateDashboard();

		// Hiển thị thông báo thành công
		showCustomToast('success', `Điều chỉnh thành công ${adjustments.length} lô thuốc!`);

	} catch (error) {
		console.error('Error confirming inventory count:', error);
		showCustomToast('error', 'Không thể điều chỉnh tồn kho. Vui lòng kiểm tra lại.');
	}
}

// ========== XUẤT DỮ LIỆU ==========
// Hàm hiển thị modal xuất dữ liệu
function showExportDataModal() {
	const modal = new bootstrap.Modal(document.getElementById('exportDataModal'));
	modal.show();
}

// Hàm xuất dữ liệu ra Excel
async function exportToExcel(type) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		// Gọi API để xuất Excel
		const response = await fetch(`/api/medicines/export/excel?type=${type}`, {
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			}
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

		// Đặt tên file dựa trên type
		const fileName = getExportFileName(type, 'xlsx');
		a.download = fileName;

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

// Hàm xuất dữ liệu ra PDF
async function exportToPDF(type) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		// Gọi API để xuất PDF
		const response = await fetch(`/api/medicines/export/pdf?type=${type}`, {
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			}
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

		// Đặt tên file dựa trên type
		const fileName = getExportFileName(type, 'pdf');
		a.download = fileName;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);

		showCustomToast('success', 'Đã xuất file PDF thành công!');

	} catch (error) {
		console.error('Error exporting to PDF:', error);
		showCustomToast('error', 'Không thể xuất dữ liệu thuốc. Vui lòng thử lại.');
	}
}

// Hàm lấy tên file xuất dựa trên type
function getExportFileName(type, extension) {
	const date = new Date();
	const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

	const fileNames = {
		'medicines': `danh_sach_thuoc_${dateStr}.${extension}`,
		'stock_report': `bao_cao_ton_kho_${dateStr}.${extension}`,
		'transactions': `lich_su_giao_dich_${dateStr}.${extension}`,
		'suppliers': `bao_cao_nha_cung_cap_${dateStr}.${extension}`
	};

	return fileNames[type] || `export_${dateStr}.${extension}`;
}

// ========== BÁO CÁO ==========
// Hàm hiển thị modal báo cáo
function showReportsModal() {
	const modal = new bootstrap.Modal(document.getElementById('reportsModal'));
	modal.show();

	// Set default dates (tháng hiện tại)
	const today = new Date();
	const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
	const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

	$('#reportFromDate').val(firstDay.toISOString().split('T')[0]);
	$('#reportToDate').val(lastDay.toISOString().split('T')[0]);

	// Reset
	$('#reportContent').hide();
	$('#exportReportBtn').hide();
	$('#reportTableHeader').empty();
	$('#reportTableBody').empty();
}

// Hàm tạo báo cáo
async function generateReport() {
	const reportType = $('#reportType').val();
	const fromDate = $('#reportFromDate').val();
	const toDate = $('#reportToDate').val();

	if (!reportType) {
		showCustomToast('error', 'Vui lòng chọn loại báo cáo!');
		return;
	}

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		showCustomToast('info', 'Đang tạo báo cáo...');

		const params = new URLSearchParams();
		if (fromDate) params.append('from_date', fromDate);
		if (toDate) params.append('to_date', toDate);

		const response = await $.ajax({
			url: `/api/medicines/reports/${reportType}?${params.toString()}`,
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			},
			dataType: 'json'
		});

		renderReport(reportType, response.data || []);
		$('#reportContent').show();
		$('#exportReportBtn').show();
		$('#exportReportBtn').data('report-type', reportType);
		$('#exportReportBtn').data('report-data', response.data || []);

		showCustomToast('success', 'Tạo báo cáo thành công!');

	} catch (error) {
		console.error('Error generating report:', error);
		showCustomToast('error', 'Không thể tạo báo cáo. Vui lòng thử lại.');
	}
}

// Hàm render báo cáo
function renderReport(reportType, data) {
	const header = $('#reportTableHeader');
	const body = $('#reportTableBody');

	header.empty();
	body.empty();

	if (!data || data.length === 0) {
		body.append('<tr><td colspan="10" class="text-center text-muted py-4">Không có dữ liệu</td></tr>');
		return;
	}

	// Render header và body dựa trên loại báo cáo
	switch (reportType) {
		case 'nxt':
			renderNXTReport(header, body, data);
			break;
		case 'expiry':
			renderExpiryReport(header, body, data);
			break;
		case 'stock_value':
			renderStockValueReport(header, body, data);
			break;
		case 'low_stock':
			renderLowStockReport(header, body, data);
			break;
	}
}

// Render báo cáo Nhập - Xuất - Tồn
function renderNXTReport(header, body, data) {
	header.html(`
        <th>STT</th>
        <th>Tên thuốc</th>
        <th>Tồn đầu kỳ</th>
        <th>Nhập trong kỳ</th>
        <th>Xuất trong kỳ</th>
        <th>Tồn cuối kỳ</th>
        <th>Đơn vị</th>
    `);

	data.forEach((item, index) => {
		body.append(`
            <tr>
                <td>${index + 1}</td>
                <td>${item.medicine_name || '-'}</td>
                <td>${formatStockQuantity(item.opening_stock || 0)}</td>
                <td class="text-success">${formatStockQuantity(item.import_quantity || 0)}</td>
                <td class="text-danger">${formatStockQuantity(item.export_quantity || 0)}</td>
                <td class="fw-bold">${formatStockQuantity(item.closing_stock || 0)}</td>
                <td>${item.unit || 'viên'}</td>
            </tr>
        `);
	});
}

// Render báo cáo thuốc sắp hết hạn
function renderExpiryReport(header, body, data) {
	header.html(`
        <th>STT</th>
        <th>Tên thuốc</th>
        <th>Số lô</th>
        <th>Số lượng tồn</th>
        <th>Ngày hết hạn</th>
        <th>Số ngày còn lại</th>
        <th>Trạng thái</th>
    `);

	data.forEach((item, index) => {
		const daysLeft = item.days_to_expiry || 0;
		let statusClass = 'bg-success';
		let statusText = 'Bình thường';

		if (daysLeft < 0) {
			statusClass = 'bg-danger';
			statusText = 'Đã hết hạn';
		} else if (daysLeft <= 30) {
			statusClass = 'bg-warning';
			statusText = 'Sắp hết hạn';
		}

		body.append(`
            <tr>
                <td>${index + 1}</td>
                <td>${item.medicine_name || '-'}</td>
                <td>${item.batch_number || '-'}</td>
                <td>${formatStockQuantity(item.remaining_quantity || 0)}</td>
                <td>${formatDate(item.expiry_date)}</td>
                <td>${daysLeft} ngày</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
            </tr>
        `);
	});
}

// Render báo cáo giá trị tồn kho
function renderStockValueReport(header, body, data) {
	header.html(`
        <th>STT</th>
        <th>Tên thuốc</th>
        <th>Số lượng tồn</th>
        <th>Giá vốn</th>
        <th>Giá trị tồn kho</th>
        <th>Đơn vị</th>
    `);

	let totalValue = 0;
	data.forEach((item, index) => {
		const value = (item.stock_quantity || 0) * (item.import_price || 0);
		totalValue += value;

		body.append(`
            <tr>
                <td>${index + 1}</td>
                <td>${item.medicine_name || '-'}</td>
                <td>${formatStockQuantity(item.stock_quantity || 0)}</td>
                <td>${formatCurrency(item.import_price || 0)}</td>
                <td class="fw-bold">${formatCurrency(value)}</td>
                <td>${item.unit || 'viên'}</td>
            </tr>
        `);
	});

	// Thêm tổng
	body.append(`
        <tr class="table-info">
            <td colspan="4" class="text-end fw-bold">Tổng giá trị tồn kho:</td>
            <td class="fw-bold">${formatCurrency(totalValue)}</td>
            <td></td>
        </tr>
    `);
}

// Render báo cáo thuốc sắp hết
function renderLowStockReport(header, body, data) {
	header.html(`
        <th>STT</th>
        <th>Tên thuốc</th>
        <th>Số lượng tồn</th>
        <th>Ngưỡng cảnh báo</th>
        <th>Chênh lệch</th>
        <th>Đơn vị</th>
    `);

	data.forEach((item, index) => {
		const diff = (item.stock_quantity || 0) - (item.low_stock_threshold || 0);
		const diffClass = diff < 0 ? 'text-danger' : 'text-success';

		body.append(`
            <tr>
                <td>${index + 1}</td>
                <td>${item.medicine_name || '-'}</td>
                <td class="fw-bold">${formatStockQuantity(item.stock_quantity || 0)}</td>
                <td>${formatStockQuantity(item.low_stock_threshold || 0)}</td>
                <td class="${diffClass} fw-bold">${formatStockQuantity(diff)}</td>
                <td>${item.unit || 'viên'}</td>
            </tr>
        `);
	});
}

// Hàm xuất báo cáo ra Excel
async function exportReportToExcel() {
	const reportType = $('#exportReportBtn').data('report-type');
	const fromDate = $('#reportFromDate').val();
	const toDate = $('#reportToDate').val();

	if (!reportType) {
		showCustomToast('error', 'Vui lòng tạo báo cáo trước!');
		return;
	}

	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		const params = new URLSearchParams();
		params.append('type', reportType);
		if (fromDate) params.append('from_date', fromDate);
		if (toDate) params.append('to_date', toDate);

		window.location.href = `/api/medicines/reports/${reportType}/export/excel?${params.toString()}`;

		showCustomToast('success', 'Đang xuất báo cáo...');

	} catch (error) {
		console.error('Error exporting report:', error);
		showCustomToast('error', 'Không thể xuất báo cáo. Vui lòng thử lại.');
	}
}

// ========== LỊCH SỬ GIAO DỊCH ==========
// Hàm hiển thị modal lịch sử giao dịch
function showTransactionHistoryModal() {
	const modal = new bootstrap.Modal(document.getElementById('transactionHistoryModal'));
	modal.show();
	loadTransactionHistory();
}

// Hàm tải lịch sử giao dịch
async function loadTransactionHistory() {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	const tbody = $('#transactionHistoryTableBody');
	tbody.empty();
	tbody.append('<tr><td colspan="8" class="text-center text-muted py-4">Đang tải dữ liệu...</td></tr>');

	try {
		const params = new URLSearchParams();
		const transactionType = $('#filterTransactionType').val();
		const fromDate = $('#filterFromDate').val();
		const toDate = $('#filterToDate').val();
		const search = $('#filterSearch').val();

		if (transactionType) params.append('type', transactionType);
		if (fromDate) params.append('from_date', fromDate);
		if (toDate) params.append('to_date', toDate);
		if (search) params.append('search', search);

		const response = await $.ajax({
			url: `/api/medicine-transactions/?${params.toString()}`,
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			},
			dataType: 'json'
		});

		const transactions = response.transactions || response.data || [];

		if (transactions.length === 0) {
			tbody.html('<tr><td colspan="8" class="text-center text-muted py-4">Chưa có giao dịch nào</td></tr>');
			return;
		}

		// Replace the loading row before appending the loaded ledger rows.
		tbody.empty();

		transactions.forEach(transaction => {
			const typeClass = transaction.type === 'import' ? 'text-success' : 'text-danger';
			const typeLabel = transaction.type === 'import' ? 'Nhập kho' : transaction.type === 'adjustment' ? 'Điều chỉnh' : 'Xuất kho';
			const quantityDisplay = transaction.quantity > 0 ? `+${formatStockQuantity(transaction.quantity)}` : formatStockQuantity(transaction.quantity);

			tbody.append(`
                <tr>
                    <td>${formatDate(transaction.created_at || transaction.date)}</td>
                    <td><span class="${typeClass} fw-bold">${typeLabel}</span></td>
                    <td>${transaction.medicine_name || '-'}</td>
                    <td>${transaction.batch_number || '-'}</td>
                    <td class="${transaction.quantity > 0 ? 'text-success' : 'text-danger'} fw-bold">${quantityDisplay}</td>
                    <td>${formatCurrency(transaction.price || transaction.import_price || 0)}</td>
                    <td>${transaction.created_by_name || transaction.user || '-'}</td>
                    <td>${transaction.note || '-'}</td>
                </tr>
            `);
		});

	} catch (error) {
		console.error('Error loading transaction history:', error);
		showCustomToast('error', 'Không thể tải lịch sử giao dịch. Vui lòng thử lại.');
		tbody.html('<tr><td colspan="8" class="text-center text-danger py-4">Không thể tải lịch sử giao dịch.</td></tr>');
	}
} 
