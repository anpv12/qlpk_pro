import { getPageDateFormatter } from '../shared/page-date-format.js';
const STATUS_TEXT = {
	SCHEDULED: 'Chờ xác nhận',
	CONFIRMED: 'Đã xác nhận',
	CANCELLED: 'Hủy',
	NO_SHOW: 'Không đến'
};

const STATUS_ICON = {
	SCHEDULED: 'bi-clock',
	CONFIRMED: 'bi-check-circle',
	CANCELLED: 'bi-x-circle',
	NO_SHOW: 'bi-exclamation-circle'
};

function formatDate(dateStr) {
	if (!dateStr) return '';
	const date = new Date(dateStr);
	return getPageDateFormatter()(date);
}

function formatTime(dateTimeStr) {
	if (!dateTimeStr) return '';
	const date = new Date(dateTimeStr);
	return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function getStatusText(status) {
	return STATUS_TEXT[status] || status;
}

function getStatusIcon(status) {
	return STATUS_ICON[status] || 'bi-question-circle';
}

const AppointmentManagementStatusFormatUtils = {
	formatDate,
	formatTime,
	getStatusIcon,
	getStatusText
};

export { AppointmentManagementStatusFormatUtils };
