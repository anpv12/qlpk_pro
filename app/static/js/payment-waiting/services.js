import { state } from './state.js';
import { byId, el, icon, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { getSafeApiErrorMessage, isInvoiceLocked, showCustomToast } from '../payment-waiting.js';
import { formatCurrency } from './output.js';
import { loadServicesForModal } from './detail.js';

const LOCKED_MESSAGE = 'Hóa đơn đã xác nhận, không thể chỉnh sửa';
const modalOf = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));

function emptyRow(colspan, message) {
	return el('tr', {}, el('td', { colspan, class: 'text-center text-muted py-4' }, icon('bi-inbox', 'pw-empty-icon'), el('p', { class: 'mt-2' }, message)));
}

// Thành tiền = (đơn giá sau chiết khấu) + thuế
function serviceAmounts(unitPrice, discountPercent, taxPercent) {
	const preTaxAmount = unitPrice * (1 - (discountPercent / 100));
	const taxAmount = preTaxAmount * (taxPercent / 100);
	return { preTaxAmount, taxAmount, totalAmount: preTaxAmount + taxAmount };
}

// Lấy examination id của hóa đơn đang mở; báo lỗi nếu hóa đơn đã khóa hoặc chưa mở
function editableExaminationId() {
	if (isInvoiceLocked()) {
		showCustomToast('warning', LOCKED_MESSAGE);
		return null;
	}
	const examinationId = byId('examinationDetailModal')?.dataset.examinationId;
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin khám');
		return null;
	}
	return examinationId;
}

function serviceActionButton(variant, className, title, iconName, serviceId) {
	return el('button', { 'data-qlpk-button': variant, 'data-qlpk-button-variant': 'soft', class: `btn btn-sm ${className}`, 'data-service-id': serviceId, title }, icon(iconName));
}

// Render services table
function renderServicesTable(services) {
	const tbody = byId('servicesTableBody');
	if (!services.length) {
		replace(tbody, emptyRow(7, 'Chưa có dịch vụ nào'));
		return;
	}
	replace(tbody, services.map((service, index) => {
		const serviceId = Number(service.id) || 0;
		const unitPrice = parseFloat(service.unit_price) || 0;
		const discountPercent = parseFloat(service.discount_percent) || 0;
		const taxPercent = parseFloat(service.tax_percent) || 0;
		const { preTaxAmount, taxAmount, totalAmount } = serviceAmounts(unitPrice, discountPercent, taxPercent);
		return el('tr', { 'data-pre-tax': preTaxAmount, 'data-tax': taxAmount, 'data-total-amount': totalAmount, 'data-service-id': serviceId },
			el('td', { class: 'text-center pw-invoice-col-stt' }, index + 1),
			el('td', { class: 'pw-invoice-col-name' }, service.service_name || ''),
			el('td', { class: 'pw-invoice-col-price' }, formatCurrency(unitPrice)),
			el('td', { class: 'text-center pw-invoice-col-percent' }, `${discountPercent}%`),
			el('td', { class: 'text-center pw-invoice-col-percent' }, `${taxPercent}%`),
			el('td', { class: 'text-end pw-invoice-col-price' }, formatCurrency(totalAmount)),
			el('td', { class: 'text-center pw-invoice-col-actions' }, el('div', { class: 'd-flex gap-1 justify-content-center' },
				serviceActionButton('edit', 'js-edit-service', 'Chỉnh sửa', 'bi-pencil', serviceId), ' ',
				serviceActionButton('danger', 'btn-danger js-delete-service', 'Xóa dịch vụ', 'bi-trash', serviceId))));
	}));
}

// Render prescriptions table
function renderPrescriptionsTable(prescriptions) {
	const tbody = byId('prescriptionsTableBody');
	if (!prescriptions.length) {
		replace(tbody, emptyRow(6, 'Chưa có đơn thuốc nào'));
		return;
	}
	replace(tbody, prescriptions.map((prescription, index) => el('tr', {},
		el('td', { class: 'text-center pw-invoice-col-stt' }, index + 1),
		el('td', { class: 'pw-invoice-col-name' }, prescription.medicine_name || ''),
		el('td', { class: 'pw-invoice-col-price' }, prescription.unit || ''),
		el('td', { class: 'pw-invoice-col-percent' }, prescription.quantity || ''),
		el('td', { class: 'pw-invoice-col-percent' }, prescription.usage_instructions || ''),
		el('td', { class: 'pw-invoice-col-price' }))));
}

// Show add service modal
function showAddServiceModal() {
	loadServiceOptions();
	modalOf('addServiceModal').show();
}

async function loadServiceOptions() {
	try {
		const services = (await requestJson('/services/')) || [];
		replace(byId('serviceSelect'), el('option', { value: '' }, 'Chọn dịch vụ'), services.map(service => {
			const price = service.default_price || 0;
			return el('option', { value: service.id ?? '', 'data-price': price, 'data-service-name': service.name || '' }, `${service.name || ''} - ${formatCurrency(price)}`);
		}));
	} catch {
		showCustomToast('error', 'Không thể tải danh sách dịch vụ');
	}
}

const numberValue = id => parseFloat(byId(id)?.value) || 0;

function newServiceError(serviceIdRaw, serviceId, price, discount, taxPercent) {
	if (!serviceIdRaw || !Number.isFinite(serviceId) || serviceId <= 0) return 'Vui lòng chọn dịch vụ hợp lệ';
	if (price <= 0) return 'Đơn giá phải lớn hơn 0';
	if (discount < 0 || discount > 100) return 'Chiết khấu phải trong khoảng 0-100%';
	if (taxPercent < 0) return 'Thuế GTGT không được âm';
	return '';
}

// Save new service
async function saveNewService() {
	if (isInvoiceLocked()) {
		showCustomToast('warning', LOCKED_MESSAGE);
		return;
	}
	const select = byId('serviceSelect');
	const serviceIdRaw = select.value;
	const serviceId = Number(serviceIdRaw);
	const price = numberValue('servicePrice');
	const discount = numberValue('serviceDiscount');
	const taxPercent = numberValue('serviceTax');

	const invalid = newServiceError(serviceIdRaw, serviceId, price, discount, taxPercent);
	if (invalid) return showCustomToast('error', invalid);

	const examinationId = byId('examinationDetailModal')?.dataset.examinationId;
	if (!examinationId) return showCustomToast('error', 'Không tìm thấy thông tin khám');

	const selected = select.selectedOptions[0];
	try {
		await requestJson(`/api/examination-detail/${examinationId}/services`, { method: 'POST', json: {
			service_id: serviceId,
			service_name: selected?.dataset.serviceName || selected?.textContent || '',
			unit_price: price,
			discount_percent: discount,
			tax_percent: taxPercent,
			total_amount: serviceAmounts(price, discount, taxPercent).totalAmount,
			patient_id: null // Sẽ được lấy từ examination
		} });
		showCustomToast('success', 'Thêm dịch vụ thành công');
		modalOf('addServiceModal').hide();
		state.financialSummaryCache = null;
		loadServicesForModal(examinationId);
	} catch (error) {
		showCustomToast('error', getSafeApiErrorMessage(error, 'Không thể thêm dịch vụ. Vui lòng kiểm tra lại.'));
	}
}

// Edit service: đọc giá trị hiện tại từ dòng trong bảng
function editService(serviceId) {
	if (!editableExaminationId()) return;
	const serviceRow = document.querySelector(`tr[data-service-id="${Number(serviceId) || 0}"]`);
	if (!serviceRow) {
		showCustomToast('error', 'Không tìm thấy thông tin dịch vụ');
		return;
	}
	const cellText = column => serviceRow.querySelector(`td:nth-child(${column})`)?.textContent || '';
	showEditServiceModal(serviceId, cellText(2), cellText(3).replace(/[^\d]/g, ''), cellText(4).replace('%', ''), cellText(5).replace('%', ''));
}

function editField(label, input) {
	return el('div', { class: 'mb-3' }, el('label', { class: 'form-label fw-bold' }, label), input);
}

function buildEditServiceModal({ serviceId, serviceName, unitPrice, discountPercent, taxPercent }) {
	const half = child => el('div', { class: 'col-md-6' }, child);
	return el('div', { class: 'modal fade qlpk-edit-service-modal', id: 'editServiceModal', tabindex: '-1', 'data-bs-backdrop': 'static', 'data-bs-keyboard': 'false' },
		el('div', { class: 'modal-dialog modal-lg' }, el('div', { class: 'modal-content' },
			el('div', { class: 'modal-header' }, el('h5', { class: 'modal-title' }, 'Chỉnh sửa dịch vụ'), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })),
			el('div', { class: 'modal-body' },
				editField('TÊN DỊCH VỤ', el('input', { type: 'text', class: 'form-control', id: 'editServiceName', value: serviceName, readonly: true })),
				el('div', { class: 'row' },
					half(editField('ĐƠN GIÁ', el('input', { type: 'number', class: 'form-control', id: 'editServicePrice', value: unitPrice, min: '0', step: '1000' }))),
					half(editField('CHIẾT KHẤU (%)', el('input', { type: 'number', class: 'form-control', id: 'editServiceDiscount', value: discountPercent, min: '0', max: '100', step: '1' })))),
				el('div', { class: 'row' },
					half(editField('THUẾ GTGT', el('input', { type: 'number', class: 'form-control', id: 'editServiceTax', value: taxPercent, min: '0', step: '1' }))),
					half(editField('THÀNH TIỀN', el('input', { type: 'text', class: 'form-control pw-readonly-input', id: 'editServiceTotal', readonly: true }))))),
			el('div', { class: 'modal-footer' },
				el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Hủy'),
				el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', type: 'button', class: 'btn btn-primary js-save-edit-service', 'data-service-id': serviceId }, 'Lưu thay đổi')))));
}

// Show edit service modal (tạo mới mỗi lần, xóa khỏi DOM khi đóng)
function showEditServiceModal(serviceId, serviceName, unitPrice, discountPercent, taxPercent) {
	byId('editServiceModal')?.remove();
	const modalNode = buildEditServiceModal({ serviceId: Number(serviceId) || 0, serviceName, unitPrice, discountPercent, taxPercent });
	document.body.append(modalNode);
	new window.bootstrap.Modal(modalNode).show();
	['editServicePrice', 'editServiceDiscount', 'editServiceTax'].forEach(id => byId(id).addEventListener('input', calculateEditServiceTotal));
	calculateEditServiceTotal();
	modalNode.addEventListener('hidden.bs.modal', () => modalNode.remove());
}

function calculateEditServiceTotal() {
	const { totalAmount } = serviceAmounts(numberValue('editServicePrice'), numberValue('editServiceDiscount'), numberValue('editServiceTax'));
	byId('editServiceTotal').value = formatCurrency(totalAmount);
}

// Save edited service
async function saveEditService(serviceId) {
	const examinationId = editableExaminationId();
	if (!examinationId) return;
	const price = numberValue('editServicePrice');
	if (price <= 0) {
		showCustomToast('error', 'Đơn giá phải lớn hơn 0');
		return;
	}
	try {
		await requestJson(`/api/examination-detail/${examinationId}/services/${serviceId}`, { method: 'PUT', json: {
			service_name: byId('editServiceName')?.value,
			unit_price: price,
			discount_percent: numberValue('editServiceDiscount'),
			tax_percent: numberValue('editServiceTax')
		} });
		showCustomToast('success', 'Cập nhật dịch vụ thành công');
		const editModal = byId('editServiceModal');
		if (editModal) modalOf('editServiceModal').hide();
		state.financialSummaryCache = null;
		// Reload services table với delay nhỏ để đảm bảo database đã được cập nhật
		setTimeout(() => loadServicesForModal(examinationId), 500);
	} catch {
		showCustomToast('error', 'Không thể cập nhật dịch vụ. Vui lòng kiểm tra lại.');
	}
}

// Delete service
async function deleteService(serviceId) {
	const examinationId = editableExaminationId();
	if (!examinationId) return;
	const confirmed = await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa dịch vụ này?', { title: 'Xác nhận xóa?', showToast: (type, message) => showCustomToast(type, message) });
	if (!confirmed) return;
	try {
		await requestJson(`/api/examination-detail/${examinationId}/services/${serviceId}`, { method: 'DELETE' });
		showCustomToast('success', 'Xóa dịch vụ thành công');
		state.financialSummaryCache = null;
		loadServicesForModal(examinationId);
	} catch {
		showCustomToast('error', 'Không thể xóa dịch vụ. Vui lòng thử lại.');
	}
}

export { deleteService, editService, renderPrescriptionsTable, renderServicesTable, saveEditService, saveNewService, showAddServiceModal };
