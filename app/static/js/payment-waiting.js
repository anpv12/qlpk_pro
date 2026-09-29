/* global applyFilters, changePage, deletePayment, deleteService, editPayment, editService, exportPaymentData, loadExaminationDetailModal, loadPaymentData, performSearch, printInvoice, printInvoices, returnToAppointment, returnToDoctor, returnToPsychologist, returnToReceptionist, saveEditService, saveNewService, updateSelectedItems */
/* exported buildPaymentConfirmOptions, currentPage, escapeAttr, filteredData, financialSummaryCache, getSafeApiErrorMessage, isConfirmInvoiceSubmitting, isExaminationConfirmed, isInvoiceLocked, isPaymentPaid, openInvoiceWindow, paymentData, perPage, selectedItems, toVietnameseGender, totalItems, totalPages */

// Payment Waiting Management JavaScript
let currentPage = 1;
let perPage = 10;
let totalItems = 0;
let totalPages = 0;
let paymentData = [];
let filteredData = [];
let selectedItems = [];
let isConfirmInvoiceSubmitting = false;
let financialSummaryCache = null;

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
	return $('#examinationDetailContent').hasClass('invoice-confirmed');
}

function escapeHtml(value) {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeAttr(value) {
	return escapeHtml(value).replace(/`/g, '&#96;');
}

function getSafeApiErrorMessage(xhr, fallback = 'Không thể xử lý lúc này. Vui lòng thử lại.') {
	return window.QLPKUserFeedback?.resolveError(xhr, { fallback }) || fallback;
}

async function openInvoiceWindow(examinationId) {
	const invoiceWindow = window.open('', '_blank');
	if (!invoiceWindow) {
		showCustomToast('warning', 'Trình duyệt đã chặn tab hóa đơn');
		return;
	}

	invoiceWindow.document.open();
	invoiceWindow.document.write('<!doctype html><html><head><title>Đang tải hóa đơn</title></head><body>Đang tải hóa đơn...</body></html>');
	invoiceWindow.document.close();

	try {
		const response = await fetch(`/payment-waiting/invoice/${encodeURIComponent(examinationId)}`);

		if (!response.ok) {
			throw new Error('Không thể tải hóa đơn');
		}

		const html = await response.text();
		await window.QLPKPdfPreview.render(invoiceWindow, html);
	} catch (error) {
		showCustomToast('error', 'Không thể mở hóa đơn. Vui lòng thử lại.');
	}
}

function buildPaymentConfirmOptions({ title, text, icon = 'warning', confirmText = 'Xác nhận', cancelText = 'Hủy', variant = 'primary' }) {
	const allowedVariants = new Set(['danger', 'warning', 'primary', 'success']);
	const confirmVariant = allowedVariants.has(variant) ? variant : 'primary';
	return {
		title,
		text,
		icon,
		showCancelButton: true,
		confirmButtonText: confirmText,
		cancelButtonText: cancelText,
		buttonsStyling: false,
		reverseButtons: true,
		focusCancel: true,
		customClass: {
			container: 'qlpk-confirm-container',
			popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${confirmVariant}`,
			icon: 'qlpk-confirm-dialog__icon',
			title: 'qlpk-confirm-dialog__title',
			htmlContainer: 'qlpk-confirm-dialog__text',
			actions: 'qlpk-confirm-dialog__actions',
			confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${confirmVariant}`,
			cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
		}
	};
}

// Document ready
$(document).ready(function () {
	const { startDateDefault, endDateDefault } = getDefaultDateRange();

	// Set giá trị mặc định
	$('#startDate').val(startDateDefault);
	$('#endDate').val(endDateDefault);

	// Trigger Flatpickr to update display
	if ($('#startDate')[0] && $('#startDate')[0]._flatpickr) {
		$('#startDate')[0]._flatpickr.setDate(startDateDefault, true);
	}
	if ($('#endDate')[0] && $('#endDate')[0]._flatpickr) {
		$('#endDate')[0]._flatpickr.setDate(endDateDefault, true);
	}

	// Reset checkbox state (browser giữ sau F5)
	$('#selectAll').prop('checked', false);
	$('.payment-checkbox').prop('checked', false);
	selectedItems = [];

	// Clear other filters
	$('#searchInput').val('');
	$('#statusFilter').val('UNPAID');

	// Load initial data with default date range
	loadPaymentData();
	bindEvents();

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed'],
			debounceMs: 500,
			handler: function () {
				loadPaymentData();
			}
		});
	}
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

// Bind all event handlers
function runPaymentWaitingEvents1() {
	// Debounce timer for search input
	let searchDebounceTimer;
	// Realtime search on input (debounced 300ms)
	$('#searchInput').on('input', function () {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(function () {
			performSearch();
		}, 300);
	});
	// Also support Enter key for immediate search
	$('#searchInput').on('keypress', function (e) {
		if (e.which === 13) {
			clearTimeout(searchDebounceTimer);
			performSearch();
		}
	});
	// Filter functionality
	$('#statusFilter').on('change', function () {
		applyFilters();
	});
	$('#startDate').on('change', function () {
		applyFilters();
	});
	$('#endDate').on('change', function () {
		applyFilters();
	});
	// Refresh button
	$('#refreshListBtn').on('click', function () {
		const { startDateDefault, endDateDefault } = getDefaultDateRange();

		// Clear search và trả status về mặc định
		$('#searchInput').val('');
		$('#statusFilter').val('UNPAID');

		// Set lại date range mặc định
		$('#startDate').val(startDateDefault);
		$('#endDate').val(endDateDefault);

		// Trigger Flatpickr to update display
		if ($('#startDate')[0] && $('#startDate')[0]._flatpickr) {
			$('#startDate')[0]._flatpickr.setDate(startDateDefault, true);
		}
		if ($('#endDate')[0] && $('#endDate')[0]._flatpickr) {
			$('#endDate')[0]._flatpickr.setDate(endDateDefault, true);
		}

		// Reset về trang đầu tiên
		currentPage = 1;

		// Load lại data
		loadPaymentData();
	});
	// Export button
	$('#exportTableBtn').on('click', function () {
		exportPaymentData();
	});
	// Delegated handlers for dynamically rendered modal controls
	$(document).off('change', '#serviceSelect').on('change', '#serviceSelect', function () {
		const selectedOption = $(this).find('option:selected');
		const price = selectedOption.data('price') || 0;
		$('#servicePrice').val(price);
	});
	$(document).off('click', '#saveServiceBtn').on('click', '#saveServiceBtn', function () {
		saveNewService();
	});
	$(document).off('click', '.js-edit-payment').on('click', '.js-edit-payment', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		if (paymentId) editPayment(paymentId);
	});
	$(document).off('click', '.js-delete-payment').on('click', '.js-delete-payment', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		if (paymentId) deletePayment(paymentId);
	});
	$(document).off('click', '.js-change-page').on('click', '.js-change-page', function (e) {
		e.preventDefault();
		const page = Number($(this).data('page')) || 0;
		if (page) changePage(page);
	});
	$(document).off('click', '.js-retry-load-invoice').on('click', '.js-retry-load-invoice', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		if (paymentId) loadExaminationDetailModal(paymentId);
	});
}

function runPaymentWaitingEvents2() {
	$(document).off('click', '.js-edit-service').on('click', '.js-edit-service', function () {
		const serviceId = Number($(this).data('service-id')) || 0;
		if (serviceId) editService(serviceId);
	});
	$(document).off('click', '.js-delete-service').on('click', '.js-delete-service', function () {
		const serviceId = Number($(this).data('service-id')) || 0;
		if (serviceId) deleteService(serviceId);
	});
	$(document).off('click', '.js-save-edit-service').on('click', '.js-save-edit-service', function () {
		const serviceId = Number($(this).data('service-id')) || 0;
		if (serviceId) saveEditService(serviceId);
	});
	$(document).off('click', '.js-return-action').on('click', '.js-return-action', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		const action = $(this).data('return-action');
		if (!paymentId || !action) return;

		if (action === 'receptionist') returnToReceptionist(paymentId);
		if (action === 'doctor') returnToDoctor(paymentId);
		if (action === 'psychologist') returnToPsychologist(paymentId);
		if (action === 'appointment') returnToAppointment(paymentId);
	});
	$(document).off('click', '.js-go-login').on('click', '.js-go-login', function () {
		window.location.href = '/login.html';
	});
	// Print button
	$('#printBtn').on('click', function () {
		printInvoices();
	});
	// Select all checkbox
	$('#selectAll').on('change', function () {
		const isChecked = $(this).is(':checked');
		$('.payment-checkbox').prop('checked', isChecked);
		updateSelectedItems();
	});
	// Per page selector
	$('#perPageSelect').on('change', function () {
		perPage = parseInt($(this).val());
		currentPage = 1;
		loadPaymentData();
	});
	// Print invoice button (always active)
	$('#printInvoiceBtn').on('click', function () {
		printInvoice();
	});
	// Reload danh sách hóa đơn khi modal đóng (bind 1 lần)
	$('#examinationDetailModal').off('hidden.bs.modal').on('hidden.bs.modal', function () {
		loadPaymentData();
	});
}

function bindEvents() {
	runPaymentWaitingEvents1();
	runPaymentWaitingEvents2();
}

// Show custom toast
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}
