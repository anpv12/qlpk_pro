import { state } from './state.js';
import { byId, el, icon, replace } from '../shared/dom.js';
import { HttpError, requestJson } from '../shared/http-json.js';
import { getSafeApiErrorMessage, isExaminationConfirmed, toVietnameseGender } from '../payment-waiting.js';
import { calculateFinancials, loadFinancialSummaryFromDB } from './services-parts/financials.js';
import { formatCurrency, formatCurrencyInput } from './output.js';
import { confirmInvoice, disableInvoiceForm, toggleAllPrescriptions } from './invoice.js';
import { renderPrescriptionsTable, renderServicesTable, showAddServiceModal } from './services.js';

const modal = () => window.bootstrap.Modal.getOrCreateInstance(byId('examinationDetailModal'));
const content = (...nodes) => replace(byId('examinationDetailContent'), ...nodes);
const loginButton = (label, extra = '') => el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', type: 'button', class: `btn ${extra} js-go-login`.replace(/\s+/g, ' ') },
	icon('bi-box-arrow-in-right', 'me-2'), label);

function errorState(title, message, ...actions) {
	return el('div', { class: 'text-center py-5' }, icon('bi-exclamation-triangle', 'text-danger pw-error-icon'),
		el('h5', { class: 'mt-3 text-danger' }, title), el('p', { class: 'text-muted' }, message), ...actions);
}

// Edit payment - mở modal chi tiết hóa đơn (payment ID là examination ID)
function editPayment(paymentId) {
	loadExaminationDetailModal(paymentId);
}

async function loadExaminationDetailModal(paymentId) {
	state.financialSummaryCache = null;
	if (!window.QLPKApiTransport.hasSession()) {
		content(errorState('Lỗi xác thực', 'Vui lòng đăng nhập lại để tiếp tục', loginButton('Đăng nhập', 'btn-primary')));
		modal().show();
		return;
	}
	content(el('div', { class: 'text-center py-5' }, el('div', { class: 'spinner-border text-primary', role: 'status' }, el('span', { class: 'visually-hidden' }, 'Đang tải...')),
		el('p', { class: 'mt-3 text-muted' }, 'Đang tải thông tin hóa đơn...')));
	const exportButton = byId('exportInvoiceBtn');
	exportButton.textContent = 'Xác nhận hoá đơn';
	exportButton.disabled = false;
	modal().show();
	try {
		const data = await requestJson(`/api/examination-detail/${paymentId}`);
		byId('examinationDetailModal').dataset.examinationId = paymentId;
		renderExaminationDetailContent(data, paymentId);
	} catch (error) {
		let message = 'Không thể tải thông tin hóa đơn';
		if (error instanceof HttpError && error.status === 401) message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
		else if (error instanceof HttpError && error.data?.detail) message = getSafeApiErrorMessage(error, message);
		content(errorState('Lỗi khi tải thông tin', message, el('div', { class: 'mt-3' },
			el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn btn-primary me-2 js-retry-load-invoice', 'data-payment-id': Number(paymentId) || 0 },
				icon('bi-arrow-clockwise', 'me-2'), 'Thử lại'), ' ', loginButton('Đăng nhập lại'))));
	}
}

// Clones the invoice form from templates/partials/payment-invoice-form-template.html and fills it.
function buildInvoiceForm(data) {
	const form = byId('invoiceDetailFormTemplate').content.firstElementChild.cloneNode(true);
	const patient = data.patient || {};
	const values = {
		examinationDate: data.examination_date?.split('T')[0] || '', doctorName: data.doctor?.full_name || '', examinationTime: data.examination_time || '',
		examinationType: data.examination_type || '', patientName: patient.full_name || '', patientGender: toVietnameseGender(patient.gender) || '',
		patientPhone: patient.phone_number || '', patientBirthDate: patient.date_of_birth?.split('T')[0] || '',
	};
	Object.entries(values).forEach(([id, value]) => {
		const field = form.querySelector(`#${id}`);
		if (field) field.value = value;
	});
	return form;
}

function renderExaminationDetailContent(data, examinationId) {
	const isConfirmed = isExaminationConfirmed(data);
	content(buildInvoiceForm(data));
	loadServicesForModal(examinationId);
	loadPrescriptionsForModal(examinationId);
	bindExaminationDetailEvents(examinationId);
	setTimeout(() => {
		document.querySelectorAll('.financial-summary').forEach(node => { node.style.display = ''; });
		loadFinancialSummaryFromDB(examinationId);
	}, 100);
	if (data.advance_payment) byId('advancePayment').value = formatCurrency(data.advance_payment);
	if (data.amount_paid) byId('amountPaid').value = formatCurrency(data.amount_paid);
	if (isConfirmed) {
		disableInvoiceForm();
		const exportButton = byId('exportInvoiceBtn');
		exportButton.textContent = 'Đã xác nhận';
		exportButton.disabled = true;
	}
	setTimeout(initDetailBirthDatePicker, 150);
}

function initDetailBirthDatePicker() {
	const birthDateInput = document.getElementById('patientBirthDate');
	if (!birthDateInput) return;

	// Destroy Flatpickr cũ nếu có
	if (birthDateInput._flatpickr) {
		birthDateInput._flatpickr.destroy();
	}

	// Lưu giá trị hiện tại
	const currentValue = birthDateInput.value;

	// Khởi tạo Flatpickr mới
	window.flatpickr(birthDateInput, {
		dateFormat: 'Y-m-d',
		altInput: true,
		altFormat: 'd/m/Y',
		locale: 'vi',
		allowInput: true
	});

	// Set lại giá trị sau khi khởi tạo
	if (currentValue && birthDateInput._flatpickr) {
		birthDateInput._flatpickr.setDate(currentValue, true);
	}
}

async function loadServicesForModal(examinationId) {
	if (!window.QLPKApiTransport.hasSession()) return;
	try {
		renderServicesTable(await requestJson(`/api/examination-detail/${examinationId}/services`));
		loadFinancialSummaryFromDB(examinationId);
	} catch { /* bảng dịch vụ giữ trạng thái trống khi lỗi */ }
}

async function loadPrescriptionsForModal(examinationId) {
	if (!window.QLPKApiTransport.hasSession()) return;
	try {
		const data = await requestJson(`/api/prescription/appointment/${examinationId}`);
		renderPrescriptionsTable((data?.medicines || []).map(medicine => ({ medicine_name: medicine.name || '', unit: medicine.unit || '',
			quantity: medicine.quantity ?? '', usage_instructions: medicine.usage || data.usage_instructions || '' })));
	} catch { /* bảng đơn thuốc giữ trạng thái trống khi lỗi */ }
}

// Keeps the caret on the same digit after reformatting a money input.
function formatMoneyInput(input) {
	const digitsBefore = input.value.substring(0, input.selectionStart).replace(/[^\d]/g, '').length;
	const formatted = formatCurrencyInput(input.value);
	input.value = formatted;
	if (formatted) {
		let position = 0;
		let digits = 0;
		for (let i = 0; i < formatted.length; i++) {
			if (/^\d$/.test(formatted[i]) && ++digits === digitsBefore) {
				position = i + 1;
				break;
			}
		}
		input.setSelectionRange(position, position);
	}
	calculateFinancials();
}

function bindExaminationDetailEvents(examinationId) {
	byId('addServiceBtn')?.addEventListener('click', () => showAddServiceModal());
	const selectNonZero = event => { if (event.target.value && event.target.value !== '0') event.target.select(); };
	document.querySelectorAll('#examinationDetailContent .money-input').forEach(input => {
		input.addEventListener('input', () => formatMoneyInput(input));
		input.addEventListener('focus', selectNonZero);
		input.addEventListener('click', selectNonZero);
		input.addEventListener('blur', () => {
			if (!input.value || input.value === '0') {
				input.value = '0';
				calculateFinancials();
			}
		});
	});
	document.querySelectorAll('#examinationDetailContent .quick-btn').forEach(button => button.addEventListener('click', () => {
		const input = button.closest('.financial-value')?.querySelector('.money-input');
		if (input) input.value = formatCurrencyInput(String(button.dataset.value));
		calculateFinancials();
	}));
	document.querySelectorAll('#examinationDetailContent .clear-btn').forEach(button => button.addEventListener('click', () => {
		const input = button.closest('.financial-value')?.querySelector('.money-input');
		if (input) {
			input.value = '0';
			input.focus();
		}
		calculateFinancials();
	}));
	byId('exportInvoiceBtn').onclick = () => confirmInvoice(examinationId);
	byId('selectAllPrescriptions')?.addEventListener('change', () => toggleAllPrescriptions());
}

export { editPayment, loadExaminationDetailModal, loadServicesForModal };
