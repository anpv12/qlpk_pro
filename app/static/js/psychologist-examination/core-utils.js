import { getPageDateFormatter } from '../shared/page-date-format.js';
function toNumber(value, fallback = 0) {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

function normalizeKey(value) {
	return (value || '')
		.toString()
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value = '') {
	return value
		.toString()
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatDateInput(value) {
	if (!value) return '';
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const dateObj = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(dateObj.getTime())) return '';
	const year = dateObj.getFullYear();
	const month = String(dateObj.getMonth() + 1).padStart(2, '0');
	const day = String(dateObj.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
	if (!value) return '';
	if (typeof getPageDateFormatter() === 'function') {
		return getPageDateFormatter()(value);
	}
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [year, month, day] = value.split('-');
		return `${day}/${month}/${year}`;
	}
	const dateObj = new Date(value);
	if (Number.isNaN(dateObj.getTime())) return '';
	const day = String(dateObj.getDate()).padStart(2, '0');
	const month = String(dateObj.getMonth() + 1).padStart(2, '0');
	const year = dateObj.getFullYear();
	return `${day}/${month}/${year}`;
}

function getExaminationStatusText(status) {
	const statusMap = {
		WAITING_TRANSFER: 'Chờ chuyển khám',
		DOCTOR_EXAM: 'Bác sĩ khám',
		PSYCHOLOGIST_EXAM: 'Tâm lý gia khám',
		CONCLUSION: 'Kết luận',
		WAITING_PAYMENT: 'Chờ thanh toán',
		PAID: 'Đã thanh toán',
		COMPLETED: 'Hoàn thành'
	};
	return statusMap[status] || status || 'Chưa xác định';
}

function getExaminationStatusBadgeClass(status) {
	const classMap = {
		WAITING_TRANSFER: 'bg-secondary',
		DOCTOR_EXAM: 'bg-info',
		PSYCHOLOGIST_EXAM: 'bg-primary',
		CONCLUSION: 'bg-success',
		WAITING_PAYMENT: 'bg-warning',
		PAID: 'bg-success',
		COMPLETED: 'bg-success'
	};
	return classMap[status] || 'bg-secondary';
}

export const PsychologistExaminationCoreUtils = {
	toNumber,
	normalizeKey,
	escapeHtml,
	formatDateInput,
	formatDisplayDate,
	getExaminationStatusText,
	getExaminationStatusBadgeClass
};
