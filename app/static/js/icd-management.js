// ICD Management JavaScript
let currentPage = 1;
let totalPages = 1;
let currentSearch = '';
let currentDiseaseGroup = '';
let currentICDId = null;
let pageSize = 10;
let listPagination;
let listRevision = 0;

let isEditMode = false;
let isSavingICD = false;

// Initialize page
$(document).ready(function () {
    listPagination = window.QLPKPagination.create({ onChange(page, size) {
        pageSize = size;
        loadICDList(page);
    } });
	loadICDList();
	loadDiseaseGroups();
	setupEventListeners();
	registerRealtimeHooks();
});

// Setup event listeners
function setupEventListeners() {
	$('#icdSearchForm').on('submit', function (event) {
		event.preventDefault();
		searchICD();
	});
	$('#icdTableBody').on('click', '#retryICDList', function () {
		loadICDList(currentPage);
	});

	// Disease group filter change
	$('#diseaseGroupFilter').on('change', function () {
		searchICD();
	});

	// Form validation
	$('#addICDForm input, #addICDForm textarea, #editICDForm input, #editICDForm textarea').on('blur', function () {
		validateField($(this));
	});

	// Modal events
	$('#addICDModal').on('hidden.bs.modal', function () {
		resetForm();
	});

	$('#editICDModal').on('hidden.bs.modal', function () {
		resetForm();
	});

	// Form submit events
	$('#addICDForm').on('submit', function (e) {
		e.preventDefault();
		saveICD();
	});

	$('#editICDForm').on('submit', function (e) {
		e.preventDefault();
		saveICD();
	});
}

// Authentication is supplied by the shared fetch wrapper in utils.js.
function renderICDState(message, retry = false) {
	$('#icdTableBody').html(`<tr><td colspan="6" class="text-center py-4">
		<div role="status">${window.QLPKSharedUtils.escapeHtml(message)}</div>
		${retry ? '<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" id="retryICDList" class="btn btn-outline-primary mt-2">Thử lại</button>' : ''}
	</td></tr>`);
}

async function loadICDList(page = 1) {
	const revision = ++listRevision;
	currentPage = page;
	showLoading(true);
	$('#clinicPagination').hide();
	renderICDState('Đang tải danh sách ICD…');
	try {
		const params = new URLSearchParams({ skip: (page - 1) * pageSize, limit: pageSize });
		if (currentSearch) params.set('search', currentSearch);
		if (currentDiseaseGroup) params.set('disease_group', currentDiseaseGroup);
		const response = await fetch(`/api/icd/?${params}`);
		if (revision !== listRevision) return;
		if (!response.ok) {
			const message = response.status === 401
				? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
				: response.status === 403 ? 'Bạn không có quyền xem danh mục ICD.'
				: 'Không tải được danh sách ICD. Vui lòng thử lại.';
			renderICDState(message, response.status !== 401 && response.status !== 403);
			return;
		}
		const data = await response.json();
		if (revision !== listRevision) return;
		if (!Array.isArray(data.data) || !data.pagination) throw new Error('Invalid ICD list response');
		const lastPage = Math.max(1, Number(data.pagination.total_pages) || 1);
		if (page > lastPage) return loadICDList(lastPage);
		renderICDList(data.data);
		updatePagination(data.pagination);
		$('#clinicPagination').show();
	} catch (error) {
		if (revision === listRevision) renderICDState('Không tải được danh sách ICD. Vui lòng thử lại.', true);
	} finally {
		if (revision === listRevision) showLoading(false);
	}
}

// Render ICD list
function renderICDList(icdList) {
	const tbody = $('#icdTableBody');
	tbody.empty();

	if (icdList.length === 0) {
		renderICDState('Không tìm thấy mã ICD phù hợp.');
		return;
	}


	icdList.forEach(icd => {
		const row = `
            <tr>
                <td>
                    <span class="text-primary fw-bold">${icd.icd_code}</span>
                </td>
                <td>
                    <div class="fw-semibold">${icd.disease_name}</div>
                </td>
                <td>
                    <div class="text-muted">
                        ${icd.description || 'Không có mô tả'}
                    </div>
                </td>
                <td>
                    <div class="text-muted">
                        ${icd.disease_group || 'Chưa phân nhóm'}
                    </div>
                </td>
                <td>
                    <span class="text-muted">${formatDate(icd.created_at)}</span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-outline-primary" data-qlpk-call="editICD" data-qlpk-args='[${icd.id}]' title="Chỉnh sửa">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-outline-danger" data-qlpk-call="deleteICD" data-qlpk-args='[${icd.id}, "${icd.icd_code}"]' title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
		tbody.append(row);
	});
}

// Groups populate the existing API-backed filter.
async function loadDiseaseGroups() {
	const select = $('#diseaseGroupFilter');
	try {
		const response = await fetch('/api/icd/groups/list');
		if (!response.ok) return;
		const groups = await response.json();
		const selectedValue = select.val();
		select.find('option').not('[value=""]').remove();
		groups.forEach(group => {
			select.append($('<option>').val(group).text(group));
		});
		if (selectedValue) select.val(selectedValue);
	} catch (error) {
		// The list remains usable if optional group choices are unavailable.
	}
}

function registerRealtimeHooks() {
	if (!window.QLPKRealtimePageHooks) return;
	window.QLPKRealtimePageHooks.register({
		types: ['catalog.changed'],
		filter: function (event) {
			return event && event.payload && event.payload.entity === 'icd';
		},
		handler: function () {
			loadICDList(currentPage);
			loadDiseaseGroups();
		},
		debounceMs: 350,
	});
}

// Search ICD
function searchICD() {
	currentSearch = $('#searchInput').val().trim();
	currentDiseaseGroup = $('#diseaseGroupFilter').val();
	currentPage = 1;
	loadICDList(currentPage);
}

// Clear search
function clearSearch() {
	$('#searchInput').val('');
	$('#diseaseGroupFilter').val('');
	currentSearch = '';
	currentDiseaseGroup = '';
	currentPage = 1;
	loadICDList(currentPage);
}

// Open add modal
function openAddModal() {
	isEditMode = false;
	currentICDId = null;
	$('#addICDModal').modal('show');
}

// Edit ICD
async function editICD(icdId) {
	try {
		showLoading(true);

		const response = await fetch(`/api/icd/${icdId}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error('Lỗi khi tải thông tin ICD');
		}

		const icd = await response.json();

		// Fill form
		$('#editICDId').val(icd.id);
		$('#editICDCode').val(icd.icd_code);
		$('#editDiseaseName').val(icd.disease_name);
		$('#editDescription').val(icd.description || '');
		$('#editDiseaseGroup').val(icd.disease_group || '');

		// Set edit mode
		isEditMode = true;
		currentICDId = icdId;

		$('#editICDModal').modal('show');

	} catch (error) {
		showToast('Lỗi khi tải thông tin ICD', 'error');
	} finally {
		showLoading(false);
	}
}

// Save ICD
async function saveICD() {
	if (isSavingICD || !validateForm()) {
		return;
	}
	const editing = isEditMode;
	const recordId = currentICDId;
	isSavingICD = true;

	try {
		showSaveLoading(true);

		const formData = {
			icd_code: editing ? $('#editICDCode').val().trim() : $('#icdCode').val().trim(),
			disease_name: editing ? $('#editDiseaseName').val().trim() : $('#diseaseName').val().trim(),
			description: editing ? $('#editDescription').val().trim() : $('#description').val().trim(),
			disease_group: editing ? $('#editDiseaseGroup').val().trim() : $('#diseaseGroup').val().trim()
		};

		const url = editing ? `/api/icd/${recordId}` : '/api/icd/';
		const method = editing ? 'PUT' : 'POST';

		const response = await fetch(url, {
			method: method,
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formData)
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.detail || 'Lỗi khi lưu mã ICD');
		}

		const result = await response.json();

		showToast(
			editing ? 'Cập nhật mã ICD thành công' : 'Thêm mã ICD thành công',
			'success'
		);

		if (editing) {
			$('#editICDModal').modal('hide');
		} else {
			$('#addICDModal').modal('hide');
		}
		loadICDList(currentPage);

	} catch (error) {
		showToast('Không thể lưu mã ICD. Vui lòng kiểm tra thông tin và thử lại.', 'error');
	} finally {
		isSavingICD = false;
		showSaveLoading(false);
	}
}

// Delete ICD
function deleteICD(icdId, icdCode) {
	currentICDId = icdId;
	$('#deleteICDCode').text(icdCode);
	$('#deleteModal').modal('show');
}

// Confirm delete
async function confirmDelete() {
	try {
		showDeleteLoading(true);

		const response = await fetch(`/api/icd/${currentICDId}`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.detail || 'Lỗi khi xóa mã ICD');
		}

		showToast('Xóa mã ICD thành công', 'success');
		$('#deleteModal').modal('hide');
		loadICDList(currentPage);

	} catch (error) {
		showToast('Không thể xóa mã ICD. Vui lòng thử lại.', 'error');
	} finally {
		showDeleteLoading(false);
	}
}

// Export ICD
async function exportICD() {
	try {
		showToast('Đang xuất dữ liệu...', 'info');

		const params = new URLSearchParams();
		if (currentSearch) {
			params.append('search', currentSearch);
		}
		if (currentDiseaseGroup) {
			params.append('disease_group', currentDiseaseGroup);
		}

		const response = await fetch(`/api/icd/export?${params}`);

		if (!response.ok) {
			throw new Error('Lỗi khi xuất dữ liệu');
		}

		const blob = await response.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `icd_export_${new Date().toISOString().split('T')[0]}.xlsx`;
		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);

		showToast('Xuất dữ liệu thành công', 'success');

	} catch (error) {
		showToast('Lỗi khi xuất dữ liệu', 'error');
	}
}

// Form validation
function validateForm() {
	let isValid = true;

	// Validate required fields based on current mode
	const requiredFields = isEditMode ? ['#editICDCode', '#editDiseaseName'] : ['#icdCode', '#diseaseName'];
	requiredFields.forEach(selector => {
		if (!validateField($(selector))) {
			isValid = false;
		}
	});

	return isValid;
}

// Validate individual field
function validateField(field) {
	const value = field.val().trim();
	const fieldName = field.attr('name');
	let isValid = true;
	let errorMessage = '';

	// Clear previous validation
	field.removeClass('is-invalid is-valid');
	field.siblings('.invalid-feedback').text('');

	// Required field validation
	if (field.prop('required') && !value) {
		isValid = false;
		errorMessage = 'Trường này là bắt buộc';
	}

	// Length validation
	if (value && field.attr('maxlength')) {
		const maxLength = parseInt(field.attr('maxlength'));
		if (value.length > maxLength) {
			isValid = false;
			errorMessage = `Không được vượt quá ${maxLength} ký tự`;
		}
	}

	// Specific field validation
	if (fieldName === 'icd_code' && value) {
		// ICD code format validation (alphanumeric, dashes, dots)
		const icdCodeRegex = /^[A-Z0-9.-]+$/i;
		if (!icdCodeRegex.test(value)) {
			isValid = false;
			errorMessage = 'Mã ICD chỉ được chứa chữ cái, số, dấu gạch ngang và dấu chấm';
		}
	}

	// Apply validation result
	if (!isValid) {
		field.addClass('is-invalid');
		field.siblings('.invalid-feedback').text(errorMessage);
	} else if (value) {
		field.addClass('is-valid');
	}

	return isValid;
}

// Reset form
function resetForm() {
	$('#addICDForm')[0].reset();
	$('#editICDForm')[0].reset();
	$('#addICDForm input, #addICDForm textarea, #editICDForm input, #editICDForm textarea').removeClass('is-invalid is-valid');
	$('#addICDForm .invalid-feedback, #editICDForm .invalid-feedback').text('');
	isEditMode = false;
	currentICDId = null;
}

// Update pagination
function updatePagination(paginationInfo) {
    if (!paginationInfo) return;
    currentPage = paginationInfo.current_page;
    totalPages = paginationInfo.total_pages;
    listPagination.update({ page: currentPage, pageSize: paginationInfo.per_page, total: paginationInfo.total_count });
}

// Utility functions
function formatDate(dateString) {
	const date = new Date(dateString);
	return date.toLocaleDateString('vi-VN');
}

function showLoading(show) {
	$('#icdTableBody').attr('aria-busy', String(show));
}

function showSaveLoading(show) {
	$('#addICDForm button[type="submit"], #editICDForm button[type="submit"]')
		.prop('disabled', show).attr('aria-busy', String(show));
}

function showDeleteLoading(show) {
	const spinner = $('#deleteSpinner');
	const icon = $('#deleteIcon');

	if (show) {
		spinner.removeClass('d-none');
		icon.addClass('d-none');
		$('#confirmDeleteBtn').prop('disabled', true);
	} else {
		spinner.addClass('d-none');
		icon.removeClass('d-none');
		$('#confirmDeleteBtn').prop('disabled', false);
	}
}

function showToast(message, type = 'success') {
	return window.QLPKUserFeedback?.show(type, message);
}

// Open import modal
function openImportModal() {
	$('#importModal').modal('show');
}

// Export template
function exportTemplate() {
	// Tạo template Excel
	const template = [
		['Mã ICD', 'Tên bệnh', 'Mô tả', 'Nhóm bệnh'],
		['A00', 'Tả', 'Bệnh tả', 'Bệnh truyền nhiễm'],
		['A01', 'Thương hàn', 'Bệnh thương hàn', 'Bệnh truyền nhiễm'],
		['A02', 'Nhiễm khuẩn Salmonella khác', 'Nhiễm khuẩn Salmonella', 'Bệnh truyền nhiễm'],
		['B00', 'Nhiễm virus herpes simplex', 'Nhiễm virus herpes', 'Bệnh do virus'],
		['B01', 'Thủy đậu', 'Bệnh thủy đậu', 'Bệnh do virus']
	];

	// Tạo workbook
	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.aoa_to_sheet(template);

	// Set column widths
	ws['!cols'] = [
		{ width: 15 }, // Mã ICD
		{ width: 30 }, // Tên bệnh
		{ width: 40 }, // Mô tả
		{ width: 25 }  // Nhóm bệnh
	];

	XLSX.utils.book_append_sheet(wb, ws, 'Mẫu ICD');

	// Xuất file
	XLSX.writeFile(wb, 'mau_icd.xlsx');
}

// Import ICD data
function importICD() {
	const fileInput = document.getElementById('importFile');
	const file = fileInput.files[0];

	if (!file) {
		showToast('Vui lòng chọn file để import', 'error');
		return;
	}

	if (!file.name.match(/\.(xlsx|xls)$/)) {
		showToast('Vui lòng chọn file Excel (.xlsx hoặc .xls)', 'error');
		return;
	}

	// Hiển thị modal import progress
	showImportProgressModal();

	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			updateImportProgress('Đang đọc file Excel...', 10);

			const data = new Uint8Array(e.target.result);
			const workbook = XLSX.read(data, { type: 'array' });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

			updateImportProgress('Đang xử lý dữ liệu...', 30);

			// Bỏ qua header row
			const rows = jsonData.slice(1);

			if (rows.length === 0) {
				hideImportProgressModal();
				showToast('File không có dữ liệu', 'error');
				return;
			}

			updateImportProgress(`Đã đọc ${rows.length} dòng dữ liệu. Đang validate...`, 50);

			// Validate và import data
			importICDData(rows);

		} catch (error) {
			hideImportProgressModal();
			showToast('Lỗi khi đọc file Excel', 'error');
		}
	};

	reader.readAsArrayBuffer(file);
}

// Import ICD data to server
async function importICDData(rows) {
	try {
		const icdData = [];
		let validRows = 0;
		let invalidRows = 0;
		const errors = [];

		updateImportProgress('Đang validate dữ liệu...', 60);

		// Validate từng dòng
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const rowNumber = i + 2; // +2 vì bỏ qua header và index bắt đầu từ 0

			if (row.length >= 2 && row[0] && row[1]) { // Ít nhất có mã ICD và tên bệnh
				const icdCode = row[0]?.toString().trim() || '';
				const diseaseName = row[1]?.toString().trim() || '';

				// Validate mã ICD (cho phép chữ, số, dấu chấm, dấu gạch ngang, ký tự đặc biệt ICD)
				if (!/^[A-Z0-9.†*+-]+$/i.test(icdCode)) {
					invalidRows++;
					errors.push(`Dòng ${rowNumber}: Mã ICD không hợp lệ "${icdCode}"`);
					continue;
				}

				// Validate tên bệnh không được rỗng
				if (diseaseName.length < 2) {
					invalidRows++;
					errors.push(`Dòng ${rowNumber}: Tên bệnh quá ngắn "${diseaseName}"`);
					continue;
				}

				icdData.push({
					icd_code: icdCode,
					disease_name: diseaseName,
					description: row[2]?.toString().trim() || '',
					disease_group: row[3]?.toString().trim() || ''
				});
				validRows++;
			} else {
				invalidRows++;
				errors.push(`Dòng ${rowNumber}: Thiếu mã ICD hoặc tên bệnh`);
			}

			// Update progress mỗi 100 dòng
			if (i % 100 === 0) {
				updateImportProgress(`Đang validate... ${i + 1}/${rows.length} dòng`, 60 + (i / rows.length) * 10);
			}
		}

		updateImportProgress(`Validation hoàn tất: ${validRows} hợp lệ, ${invalidRows} lỗi`, 70);

		if (icdData.length === 0) {
			hideImportProgressModal();
			showImportResult(0, invalidRows, errors);
			return;
		}

		updateImportProgress(`Đang gửi ${icdData.length} dòng dữ liệu lên server...`, 80);

		// Gửi dữ liệu lên server
		const response = await fetch('/api/icd/import', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ icd_list: icdData })
		});

		if (!response.ok) throw new Error('ICD import failed');
		const result = await response.json();
		hideImportProgressModal();
		showImportResult(result.success_count ?? icdData.length, invalidRows, errors, result.errors || []);

		// Đóng modal import và reload data
		$('#importModal').modal('hide');
		$('#importFile').val('');
		loadICDList(currentPage);

	} catch (error) {
		hideImportProgressModal();
		showToast('Không thể nhập dữ liệu ICD. Vui lòng kiểm tra tệp và thử lại.', 'error');
	}
}

// Hiển thị modal import progress
function showImportProgressModal() {
	// Tạo modal nếu chưa có
	if (!$('#importProgressModal').length) {
		$('body').append(`
            <div class="modal fade qlpk-import-progress-modal" id="importProgressModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-upload me-2"></i>Đang import dữ liệu ICD
                            </h5>
                        </div>
                        <div class="modal-body text-center">
                            <div class="mb-3">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                            <div id="importProgressText" class="mb-3">Đang bắt đầu...</div>
                            <div class="progress mb-3 icd-import-progress">
                                <div id="importProgressBar" class="progress-bar progress-bar-striped progress-bar-animated" 
                                     role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                                    <span id="importProgressPercent">0%</span>
                                </div>
                            </div>
                            <div id="importProgressDetails" class="text-muted small"></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
	}

	// Reset progress
	setImportProgressBar(0);
	$('#importProgressPercent').text('0%');
	$('#importProgressText').text('Đang bắt đầu...');
	$('#importProgressDetails').text('');

	// Hiển thị modal
	$('#importProgressModal').modal('show');
}

function setImportProgressBar(percent) {
	const progressBar = document.getElementById('importProgressBar');
	if (!progressBar) {
		return;
	}
	progressBar.style.width = `${percent}%`;
	progressBar.setAttribute('aria-valuenow', percent);
}

// Cập nhật progress
function updateImportProgress(text, percent, details = '') {
	$('#importProgressText').text(text);
	setImportProgressBar(percent);
	$('#importProgressPercent').text(`${Math.round(percent)}%`);
	if (details) {
		$('#importProgressDetails').text(details);
	}
}

// Ẩn modal progress
function hideImportProgressModal() {
	$('#importProgressModal').modal('hide');
}

// Hiển thị kết quả import
function showImportResult(successCount, validationErrors, validationErrorList = [], serverErrors = []) {
	const totalErrors = validationErrors + serverErrors.length;
	const allErrors = [...validationErrorList, ...serverErrors];

	// Tạo modal kết quả nếu chưa có
	if (!$('#importResultModal').length) {
		$('body').append(`
            <div class="modal fade" id="importResultModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-check-circle-fill text-success me-2"></i>Kết quả import
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <div class="card text-center border-success">
                                        <div class="card-body">
                                            <h3 class="text-success">${successCount}</h3>
                                            <p class="mb-0">Thành công</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center border-warning">
                                        <div class="card-body">
                                            <h3 class="text-warning">${validationErrors}</h3>
                                            <p class="mb-0">Lỗi validation</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center border-danger">
                                        <div class="card-body">
                                            <h3 class="text-danger">${serverErrors.length}</h3>
                                            <p class="mb-0">Lỗi server</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            ${allErrors.length > 0 ? `
                                <div class="alert alert-warning">
                                    <h6><i class="bi bi-exclamation-triangle me-2"></i>Chi tiết lỗi:</h6>
                                    <div id="importErrorList" class="qlpk-import-error-list">
                                        ${allErrors.map(error => `<div class="mb-1"><small>• ${error}</small></div>`).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle me-2"></i>
                                <strong>Tổng kết:</strong> 
                                Import thành công <strong>${successCount}</strong> dòng, 
                                có <strong>${totalErrors}</strong> dòng lỗi.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                            ${allErrors.length > 0 ? `
                                <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-warning" data-qlpk-call="exportImportErrors">
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
		$('#importResultModal .text-success').text(successCount);
		$('#importResultModal .text-warning').text(validationErrors);
		$('#importResultModal .text-danger').text(serverErrors.length);

		if (allErrors.length > 0) {
			$('#importErrorList').html(allErrors.map(error => `<div class="mb-1"><small>• ${error}</small></div>`).join(''));
			$('#importResultModal .alert-warning').show();
		} else {
			$('#importResultModal .alert-warning').hide();
		}

		$('#importResultModal .alert-info').html(`
            <i class="bi bi-info-circle me-2"></i>
            <strong>Tổng kết:</strong> 
            Import thành công <strong>${successCount}</strong> dòng, 
            có <strong>${totalErrors}</strong> dòng lỗi.
        `);
	}

	// Hiển thị modal
	$('#importResultModal').modal('show');

	// Hiển thị toast thông báo
	if (successCount > 0) {
		showToast(`Import thành công ${successCount} mã ICD`, 'success');
	}
	if (totalErrors > 0) {
		showToast(`Có ${totalErrors} dòng lỗi trong quá trình import`, 'warning');
	}
}

// Xuất danh sách lỗi
function exportImportErrors() {
	try {
		// Lấy danh sách lỗi từ modal
		const errorList = $('#importErrorList').find('small').map(function () {
			return $(this).text().replace('• ', '');
		}).get();

		if (errorList.length === 0) {
			showToast('Không có lỗi để xuất', 'warning');
			return;
		}

		// Tạo workbook
		const wb = XLSX.utils.book_new();

		// Tạo worksheet với dữ liệu lỗi
		const wsData = [
			['STT', 'Chi tiết lỗi'],
			...errorList.map((error, index) => [index + 1, error])
		];

		const ws = XLSX.utils.aoa_to_sheet(wsData);

		// Định dạng header
		ws['!cols'] = [
			{ width: 10 }, // STT
			{ width: 80 }  // Chi tiết lỗi
		];

		// Thêm worksheet vào workbook
		XLSX.utils.book_append_sheet(wb, ws, 'Danh sách lỗi import');

		// Xuất file
		const fileName = `icd_import_errors_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
		XLSX.writeFile(wb, fileName);

		showToast('Đã xuất danh sách lỗi thành công', 'success');

	} catch (error) {
		showToast('Lỗi khi xuất danh sách lỗi', 'error');
	}
}
