/* global debounce, escapeHtml, getUserFacingResponseMessage, showCustomToast, showInventoryOverlay */
/* exported deleteSupplier, editSupplier, selectSupplierForBatch, showSupplierManagement */

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
                <span class="badge ${supplier.is_active === 1 ? 'qlpk-status--success' : 'qlpk-status--neutral'}">
                    ${supplier.is_active === 1 ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                </span>
            </td>
            <td class="mm-supplier-actions-cell">
                <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-sm btn-success me-1" data-qlpk-call="selectSupplierForBatch" data-qlpk-args='[${supplier.id}]' title="Chọn cho đơn nhập kho">
                    <i class="bi bi-check-circle"></i>
                </button>
                <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-primary me-1" data-qlpk-call="editSupplier" data-qlpk-args='[${supplier.id}]' title="Sửa">
                    <i class="bi bi-pencil"></i>
                </button>
                <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-danger" data-qlpk-call="deleteSupplier" data-qlpk-args='[${supplier.id}]' title="Xóa">
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
async function deleteSupplier(supplierId) {
	if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa nhà cung cấp này?')) {
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
		success: function () {
			showCustomToast('success', 'Đã xóa nhà cung cấp thành công');
			loadSuppliers();
			if (editingSupplierId === supplierId) {
				resetSupplierForm();
			}
		},
		error: function (xhr) {
			// 400 = nhà cung cấp đang có lô thuốc; backend trả lý do trong `detail`.
			showCustomToast('error', getUserFacingResponseMessage(xhr, [400], 'Không thể xóa nhà cung cấp. Vui lòng thử lại.', 'detail'));
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
		success: function () {
			showCustomToast('success', isEdit ? 'Đã cập nhật nhà cung cấp thành công' : 'Đã thêm nhà cung cấp thành công');
			loadSuppliers();
			resetSupplierForm();
		},
		error: function () {
			showCustomToast('error', isEdit
				? 'Không thể cập nhật nhà cung cấp. Vui lòng kiểm tra lại.'
				: 'Không thể thêm nhà cung cấp. Vui lòng kiểm tra lại.');
		}
	});
}
