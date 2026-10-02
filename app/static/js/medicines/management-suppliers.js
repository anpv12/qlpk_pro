import { showInventoryOverlay } from './inventory-overlay.js';
import { getUserFacingResponseMessage, showCustomToast } from '../medicine-management.js';
import { byId, debounce, el, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';

// ========== QUẢN LÝ NHÀ CUNG CẤP ==========
let suppliers = [];
let editingSupplierId = null;

// Hàm hiển thị modal quản lý nhà cung cấp
function showSupplierManagement() {
	showInventoryOverlay(document.getElementById('supplierManagementModal'));
	loadSuppliers();
	resetSupplierForm();
}

const messageRow = (text, className) => el('tr', {}, el('td', { colspan: 8, class: `text-center ${className} py-4` }, text));

// Hàm load danh sách nhà cung cấp
async function loadSuppliers() {
	const tbody = byId('supplierTableBody');
	if (!tbody) return;
	replace(tbody, messageRow('Đang tải dữ liệu...', 'text-muted'));
	if (!window.QLPKApiTransport.hasSession()) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}
	// search is always sent (possibly empty); is_active only when a status is chosen.
	const params = new URLSearchParams({ search: byId('supplierSearchInput')?.value || '' });
	const status = byId('supplierStatusFilter')?.value;
	if (status) params.set('is_active', status);
	try {
		const response = await requestJson(`/api/suppliers/?${params}`);
		suppliers = response.suppliers || [];
		renderSuppliersTable(suppliers);
	} catch (error) {
		console.error('Error loading suppliers:', error);
		replace(tbody, messageRow('Lỗi khi tải dữ liệu', 'text-danger'));
		showCustomToast('error', 'Lỗi khi tải danh sách nhà cung cấp');
	}
}

function supplierAction(variant, className, title, iconName, handler) {
	const button = el('button', { 'data-qlpk-button': variant, 'data-qlpk-button-variant': variant === 'execute' ? 'solid' : 'soft', class: `btn btn-sm ${className}`, title }, el('i', { class: `bi ${iconName}` }));
	button.addEventListener('click', handler);
	return button;
}

// Hàm render bảng nhà cung cấp
function renderSuppliersTable(suppliersList) {
	const tbody = byId('supplierTableBody');
	if (!tbody) return;
	if (!suppliersList || suppliersList.length === 0) {
		replace(tbody, messageRow('Chưa có nhà cung cấp nào', 'text-muted'));
		return;
	}
	replace(tbody, suppliersList.map(supplier => {
		const active = supplier.is_active === 1;
		return el('tr', {},
			['name', 'phone', 'email', 'tax_code', 'contact_person', 'address'].map(field => el('td', {}, supplier[field] || (field === 'name' ? '' : '-'))),
			el('td', { class: 'mm-supplier-status-cell' },
				el('span', { class: `badge ${active ? 'qlpk-status--success' : 'qlpk-status--neutral'}` }, active ? 'Đang hoạt động' : 'Ngừng hoạt động')),
			el('td', { class: 'mm-supplier-actions-cell' },
				supplierAction('execute', 'me-1', 'Chọn cho đơn nhập kho', 'bi-check-circle', () => selectSupplierForBatch(supplier.id)), ' ',
				supplierAction('edit', 'btn-primary me-1', 'Sửa', 'bi-pencil', () => editSupplier(supplier.id)), ' ',
				supplierAction('danger', 'btn-danger', 'Xóa', 'bi-trash', () => deleteSupplier(supplier.id))));
	}));
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
		const modalInstance = window.bootstrap.Modal.getInstance(modalEl);
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
	if (!await QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa nhà cung cấp này?')) {
		return;
	}

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		return;
	}

	try {
		await requestJson(`/api/suppliers/${supplierId}`, { method: 'DELETE' });
		showCustomToast('success', 'Đã xóa nhà cung cấp thành công');
		loadSuppliers();
		if (editingSupplierId === supplierId) resetSupplierForm();
	} catch (error) {
		// 400 = nhà cung cấp đang có lô thuốc; backend trả lý do trong `detail`.
		showCustomToast('error', getUserFacingResponseMessage(error, [400], 'Không thể xóa nhà cung cấp. Vui lòng thử lại.', 'detail'));
	}
}

// Bind events cho form nhà cung cấp
document.addEventListener('DOMContentLoaded', () => {
	byId('supplierForm').addEventListener('submit', event => {
		event.preventDefault();
		saveSupplier();
	});
	byId('supplierResetBtn').addEventListener('click', () => resetSupplierForm());
	byId('supplierSearchInput').addEventListener('input', debounce(() => loadSuppliers(), 500));
	byId('supplierStatusFilter').addEventListener('change', () => loadSuppliers());
});

// Hàm lưu nhà cung cấp
async function saveSupplier() {
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

	try {
		await requestJson(url, { method, json: formData });
		showCustomToast('success', isEdit ? 'Đã cập nhật nhà cung cấp thành công' : 'Đã thêm nhà cung cấp thành công');
		loadSuppliers();
		resetSupplierForm();
	} catch {
		showCustomToast('error', isEdit
			? 'Không thể cập nhật nhà cung cấp. Vui lòng kiểm tra lại.'
			: 'Không thể thêm nhà cung cấp. Vui lòng kiểm tra lại.');
	}
}

export { renderSuppliersTable, showSupplierManagement };
