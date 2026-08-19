(function () {
	'use strict';

	function toNumber(value, fallback = 0) {
		const num = Number(value);
		return Number.isFinite(num) ? num : fallback;
	}

	function parseFractionalQuantity(value) {
		if (value === null || value === undefined || value === '') return null;
		if (typeof value === 'number') return isNaN(value) ? null : value;

		const str = String(value).trim();
		if (!str) return null;

		if (str.includes('/')) {
			const parts = str.split('/').map(p => p.trim());
			if (parts.length === 2) {
				const num = parseFloat(parts[0]);
				const den = parseFloat(parts[1]);
				if (!isNaN(num) && !isNaN(den) && den !== 0) {
					return num / den;
				}
			}
			return null;
		}

		const normalized = str.replace(',', '.');
		const decimal = parseFloat(normalized);
		return isNaN(decimal) ? null : decimal;
	}

	function formatFractionalQuantity(value) {
		if (value === null || value === undefined || value === '') return '';

		const num = parseFloat(value);
		if (isNaN(num)) return '';
		if (num === Math.floor(num)) return num.toString();

		const commonFractions = [
			{ decimal: 0.5, fraction: '1/2' },
			{ decimal: 0.25, fraction: '1/4' },
			{ decimal: 0.75, fraction: '3/4' },
			{ decimal: 0.2, fraction: '1/5' },
			{ decimal: 0.4, fraction: '2/5' },
			{ decimal: 0.6, fraction: '3/5' },
			{ decimal: 0.8, fraction: '4/5' },
			{ decimal: 0.33, fraction: '1/3' },
			{ decimal: 0.67, fraction: '2/3' },
			{ decimal: 0.333, fraction: '1/3' },
			{ decimal: 0.667, fraction: '2/3' },
			{ decimal: 0.125, fraction: '1/8' },
			{ decimal: 0.375, fraction: '3/8' },
			{ decimal: 0.625, fraction: '5/8' },
			{ decimal: 0.875, fraction: '7/8' }
		];

		for (const frac of commonFractions) {
			if (Math.abs(num - frac.decimal) < 0.01) {
				return frac.fraction;
			}
		}

		return num.toFixed(3).replace(/\.?0+$/, '');
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
		if (typeof window.formatDateDisplay === 'function') {
			return window.formatDateDisplay(value);
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

	window.PsychologistExaminationCoreUtils = {
		toNumber,
		parseFractionalQuantity,
		formatFractionalQuantity,
		normalizeKey,
		escapeHtml,
		formatDateInput,
		formatDisplayDate,
		getExaminationStatusText,
		getExaminationStatusBadgeClass
	};
})();
