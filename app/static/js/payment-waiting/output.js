import { state } from './state.js';
import { byId, setVisible } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { openInvoiceWindow, showCustomToast } from '../payment-waiting.js';

// Export payment data
async function exportPaymentData() {
	if (state.selectedItems.length === 0) {
		showCustomToast('warning', 'Vui lòng chọn ít nhất một bản ghi trên trang hiện tại để xuất');
		return;
	}

	try {
		const response = await requestJson('/api/payment-waiting/export', { method: 'POST', json: { payment_ids: state.selectedItems } });
		const link = document.createElement('a');
		link.href = response.download_url;
		link.download = `payment_data_${new Date().toISOString().split('T')[0]}.xlsx`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		showCustomToast('success', 'Xuất dữ liệu thành công');
	} catch {
		showCustomToast('error', 'Có lỗi xảy ra khi xuất dữ liệu');
	}
}

// Print invoices
function printInvoices() {
	if (state.selectedItems.length === 0) {
		showCustomToast('warning', 'Vui lòng chọn ít nhất một hóa đơn trên trang hiện tại để in');
		return;
	}
	state.selectedItems.forEach((id) => {
		openInvoiceWindow(id);
	});
	showCustomToast('info', 'Đang mở hóa đơn trong tab mới');
}

// Show/hide loading spinner
function showLoading(show) {
	setVisible(byId('loadingSpinner'), show);
	setVisible(byId('paymentTable'), !show);
}

// Hàm hiển thị ngày giờ (dd/mm/yyyy HH:mm:ss)
function formatDateTime(dateString) {
	if (!dateString) return '';
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return '';

	const fallbackDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
	const dateFormatted = typeof window.formatDateDisplay === 'function'
		? window.formatDateDisplay(date)
		: fallbackDate;

	// Thêm phần giờ
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return `${hours}:${minutes}:${seconds} ${dateFormatted}`;
}

// Format currency
function formatCurrency(amount) {
	const numeric = Number(amount) || 0;
	return new Intl.NumberFormat('vi-VN', {
		style: 'currency',
		currency: 'VND'
	}).format(numeric);
}

// Print invoice function
function printInvoice() {
	try {
		let examinationId = byId('examinationDetailModal')?.dataset.examinationId;
		if (!examinationId) {
			const urlParams = new URLSearchParams(window.location.search);
			examinationId = urlParams.get('examination_id');
		}
		if (!examinationId) {
			const apiUrl = window.location.href;
			const match = apiUrl.match(/\/examination-detail\/(\d+)/);
			if (match) {
				examinationId = match[1];
			}
		}
		if (!examinationId) {
			showCustomToast('error', 'Không tìm thấy thông tin hóa đơn');
			return;
		}
		openInvoiceWindow(examinationId);
	} catch (error) {
		showCustomToast('error', 'Không thể tạo hóa đơn. Vui lòng thử lại.');
	}
}

// Helper function to parse currency input
function parseCurrencyInput(input) {
	if (!input) return 0;
	// Remove all non-digit characters (including dots used as thousand separators)
	const cleaned = input.replace(/[^\d]/g, '');
	return parseInt(cleaned) || 0;
}

// Helper function to format currency input
function formatCurrencyInput(input) {
	if (!input) return '';
	// Remove all non-digit characters
	const cleaned = input.replace(/[^\d]/g, '');
	if (!cleaned) return '';
	const value = parseInt(cleaned);
	if (value === 0) return '';
	return new Intl.NumberFormat('vi-VN').format(value);
}

// Helper function to handle smart money input
function handleSmartMoneyInput(input) {
	if (input === null || input === undefined) return 0;
	const value = String(input).trim();
	if (!value) return 0;

	const lower = value.toLowerCase();
	if (lower.endsWith('k') || lower.endsWith('m') || lower.endsWith('t')) {
		const suffix = lower.slice(-1);
		const numericPart = lower.slice(0, -1).replace(/,/g, '.').replace(/\s+/g, '');
		const parsed = parseFloat(numericPart);
		if (!Number.isFinite(parsed)) return 0;
		if (suffix === 'k') return parsed * 1000;
		if (suffix === 'm') return parsed * 1000000;
		if (suffix === 't') return parsed * 1000000000;
	}

	const parsedCurrency = parseCurrencyInput(value);
	return Number.isFinite(parsedCurrency) ? parsedCurrency : 0;
}

export { exportPaymentData, formatCurrency, formatCurrencyInput, formatDateTime, handleSmartMoneyInput, printInvoice, printInvoices, showLoading };
