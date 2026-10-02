import { setPageDateFormatter } from '../shared/page-date-format.js';
function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function formatDateDisplay(value) {
	if (!value) return '';

	try {
		let dateObj;

		if (typeof value === 'string' && value.includes('/')) {
			const parts = value.split('/');
			if (parts.length === 3) {
				const day = parseInt(parts[0], 10);
				const month = parseInt(parts[1], 10);
				const year = parseInt(parts[2], 10);
				dateObj = new Date(year, month - 1, day);
			} else {
				return value;
			}
		} else if (typeof value === 'string' && value.includes('-')) {
			dateObj = new Date(value);
		} else if (value instanceof Date) {
			dateObj = value;
		} else {
			return value;
		}

		if (!dateObj || Number.isNaN(dateObj.getTime())) {
			console.warn('formatDateDisplay: Invalid date', value, dateObj);
			return value;
		}

		const day = String(dateObj.getDate()).padStart(2, '0');
		const month = String(dateObj.getMonth() + 1).padStart(2, '0');
		const year = dateObj.getFullYear();

		return `${day}/${month}/${year}`;
		} catch (error) {
		console.error('formatDateDisplay error:', error, value);
		return value;
	}
}

function toInputDate(value) {
	if (!value) return '';
	try {
		const [day, month, year] = value.split('/');
		if (year && month && day) {
			return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
			}
			const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toISOString().slice(0, 10);
	} catch {
		return '';
	}
}

export const ReceptionistFormatters = Object.freeze({
	escapeHtml,
	formatDateDisplay,
	toInputDate
});

setPageDateFormatter(formatDateDisplay);
