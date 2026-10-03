// Shared page runtime (formerly classic script tags), in page order.
import './sidebar-dry-loader.js';
import './shared/confirmation-dialog.js';
import './utils.js';
import './datepicker-init.js';
import './custom-modal.js';
import './realtime-page-hooks.js';
import { state } from './payment-waiting/state.js';
import { byId, debounce, delegate, on, writeWindowDocument } from './shared/dom.js';
import { HttpError } from './shared/http-json.js';
import { applyFilters, changePage, loadPaymentData, performSearch, updateSelectedItems } from './payment-waiting/list.js';
import { exportPaymentData, printInvoice, printInvoices } from './payment-waiting/output.js';
import { deleteService, editService, saveEditService, saveNewService } from './payment-waiting/services.js';
import { editPayment, loadExaminationDetailModal } from './payment-waiting/detail.js';
import { deletePayment, returnToAppointment, returnToDoctor, returnToPsychologist, returnToReceptionist } from './payment-waiting/invoice.js';
import { QLPKPdfPreview } from './shared/pdf-preview.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';
import { QLPKUserFeedback } from './shared/user-feedback.js';

// Payment Waiting Management JavaScript
state.currentPage = 1;
let perPage = 10;
state.totalItems = 0;
state.totalPages = 0;
state.paymentData = [];
state.filteredData = [];
state.selectedItems = [];
state.isConfirmInvoiceSubmitting = false;
state.financialSummaryCache = null;

function getDefaultDateRange() {
	const today = new Date();
	const currentYear = today.getFullYear();
	return {
		startDateDefault: `${currentYear - 1}-01-01`,
		endDateDefault: `${currentYear}-12-31`
	};
}

function normalizeStatus(value) {
	return String(value || '').trim().toUpperCase();
}

function isPaymentPaid(payment) {
	return normalizeStatus(payment?.payment_status) === 'PAID';
}

function isExaminationConfirmed(data) {
	const examStatus = normalizeStatus(data?.status);
	const paymentStatus = normalizeStatus(data?.payment_status);
	return paymentStatus === 'PAID' || examStatus === 'COMPLETED' || examStatus === 'CONFIRMED';
}

function isInvoiceLocked() {
	return Boolean(byId('examinationDetailContent')?.classList.contains('invoice-confirmed'));
}

// HttpError (status + parsed body) or a network failure, mapped to the user-feedback error contract.
function getSafeApiErrorMessage(error, fallback = 'Không thể xử lý lúc này. Vui lòng thử lại.') {
	let normalized = { status: 0 };
	if (error instanceof HttpError) normalized = { status: error.status, responseJSON: error.data };
	else if (error?.status !== undefined) normalized = error;
	return QLPKUserFeedback?.resolveError(normalized, { fallback }) || fallback;
}

async function openInvoiceWindow(examinationId) {
	const invoiceWindow = window.open('', '_blank');
	if (!invoiceWindow) {
		showCustomToast('warning', 'Trình duyệt đã chặn tab hóa đơn');
		return;
	}

	writeWindowDocument(invoiceWindow, '<!doctype html><html><head><title>Đang tải hóa đơn</title></head><body>Đang tải hóa đơn...</body></html>');

	try {
		const response = await window.fetch(`/payment-waiting/invoice/${encodeURIComponent(examinationId)}`);

		if (!response.ok) {
			throw new Error('Không thể tải hóa đơn');
		}

		const html = await response.text();
		await QLPKPdfPreview.render(invoiceWindow, html);
	} catch (error) {
		showCustomToast('error', 'Không thể mở hóa đơn. Vui lòng thử lại.');
	}
}

function setDefaultFilters() {
	const { startDateDefault, endDateDefault } = getDefaultDateRange();
	byId('searchInput').value = '';
	byId('statusFilter').value = 'UNPAID';
	byId('startDate').value = startDateDefault;
	byId('endDate').value = endDateDefault;
	byId('startDate')._flatpickr?.setDate(startDateDefault, true);
	byId('endDate')._flatpickr?.setDate(endDateDefault, true);
}

// Started after DOMContentLoaded so datepicker-init has attached Flatpickr to the date inputs.
document.addEventListener('DOMContentLoaded', () => {
	setDefaultFilters();
	// Reset checkbox state (the browser keeps it across reloads)
	byId('selectAll').checked = false;
	document.querySelectorAll('.payment-checkbox').forEach(box => { box.checked = false; });
	state.selectedItems = [];
	loadPaymentData();
	bindEvents();
	QLPKRealtimePageHooks?.register({
		types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed'],
		debounceMs: 500,
		handler: () => loadPaymentData(),
	});
});

// Chuyển đổi giới tính sang tiếng Việt để hiển thị
function toVietnameseGender(gender) {
	if (!gender) return '';
	const g = String(gender).trim().toLowerCase();
	if (g === 'male' || g === 'm' || g === 'nam') return 'Nam';
	if (g === 'female' || g === 'f' || g === 'nu' || g === 'nữ') return 'Nữ';
	if (g === 'other' || g === 'khac' || g === 'khác') return 'Khác';
	// Trường hợp đã là tiếng Việt hoặc giá trị khác
	return gender;
}

const RETURN_ACTIONS = { receptionist: returnToReceptionist, doctor: returnToDoctor, psychologist: returnToPsychologist, appointment: returnToAppointment };

// Delegated handlers for the list and for controls rendered inside the invoice modal.
function bindDelegatedActions() {
	const numberAttr = (node, name) => Number(node.getAttribute(name)) || 0;
	const byClass = {
		'.js-edit-payment': node => numberAttr(node, 'data-payment-id') && editPayment(numberAttr(node, 'data-payment-id')),
		'.js-delete-payment': node => numberAttr(node, 'data-payment-id') && deletePayment(numberAttr(node, 'data-payment-id')),
		'.js-retry-load-invoice': node => numberAttr(node, 'data-payment-id') && loadExaminationDetailModal(numberAttr(node, 'data-payment-id')),
		'.js-edit-service': node => numberAttr(node, 'data-service-id') && editService(numberAttr(node, 'data-service-id')),
		'.js-delete-service': node => numberAttr(node, 'data-service-id') && deleteService(numberAttr(node, 'data-service-id')),
		'.js-save-edit-service': node => numberAttr(node, 'data-service-id') && saveEditService(numberAttr(node, 'data-service-id')),
		'.js-go-login': () => { window.location.href = '/login.html'; },
		'#saveServiceBtn': () => saveNewService(),
		'.js-return-action': node => {
			const id = numberAttr(node, 'data-payment-id');
			const action = RETURN_ACTIONS[node.getAttribute('data-return-action')];
			if (id && action) action(id);
		},
	};
	Object.entries(byClass).forEach(([selector, handler]) => delegate(document, 'click', selector, (event, node) => handler(node)));
	delegate(document, 'click', '.js-change-page', (event, node) => {
		event.preventDefault();
		const page = numberAttr(node, 'data-page');
		if (page) changePage(page);
	});
	delegate(document, 'change', '#serviceSelect', (event, select) => {
		byId('servicePrice').value = select.selectedOptions[0]?.dataset.price || 0;
	});
	delegate(byId('paymentTableBody'), 'change', '.payment-checkbox', () => updateSelectedItems());
}

function bindEvents() {
	const search = debounce(performSearch, 300);
	on(byId('searchInput'), 'input', search);
	on(byId('searchInput'), 'keypress', event => { if (event.key === 'Enter') performSearch(); });
	['statusFilter', 'startDate', 'endDate'].forEach(id => on(byId(id), 'change', applyFilters));
	on(byId('refreshListBtn'), 'click', () => {
		setDefaultFilters();
		state.currentPage = 1;
		loadPaymentData();
	});
	on(byId('exportTableBtn'), 'click', exportPaymentData);
	on(byId('printBtn'), 'click', printInvoices);
	on(byId('selectAll'), 'change', event => {
		document.querySelectorAll('.payment-checkbox').forEach(box => { box.checked = event.target.checked; });
		updateSelectedItems();
	});
	on(byId('perPageSelect'), 'change', event => {
		perPage = parseInt(event.target.value, 10);
		state.currentPage = 1;
		loadPaymentData();
	});
	on(byId('printInvoiceBtn'), 'click', printInvoice);
	on(byId('examinationDetailModal'), 'hidden.bs.modal', () => loadPaymentData());
	bindDelegatedActions();
}

// Show custom toast
function showCustomToast(type, message) {
	return QLPKUserFeedback?.show(type, message);
}

export { getSafeApiErrorMessage, isExaminationConfirmed, isInvoiceLocked, isPaymentPaid, openInvoiceWindow, perPage, showCustomToast, toVietnameseGender };
