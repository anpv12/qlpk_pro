/* exported confirmDelete, currentPage, deleteICD, editICD, loadICDList, openImportModal, showToast, totalPages */

// Continued in (nạp ngay sau file này, cùng scope trang): icd-management/icd-management-2.js
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

// Open add modal

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
