// Page state, number formats and filter parameters shared by the medicine statistics modules.
import { QLPKUserFeedback } from '../shared/user-feedback.js';

export const state = { currentTab: 'prescriptions', expandedDoctors: new Set(), ledgerPage: 1, ledgerRequest: 0, ledgerMedicinePage: 1, ledgerMedicineRequest: 0, ledgerMedicineId: null, historyMedicines: [] };

export const formatNumber = num => (num || 0).toLocaleString('vi-VN');
export const formatMoney = amount => (amount || 0).toLocaleString('vi-VN') + ' đ';
export const showToast = (message, type = 'info') => QLPKUserFeedback?.show(type, message);
export const authHeaders = () => ({ 'Content-Type': 'application/json' });
export const showLoading = id => document.getElementById(id)?.classList.add('medicine-stats-loading');
export const hideLoading = id => document.getElementById(id)?.classList.remove('medicine-stats-loading');

function convertDateFormat(dateStr) {
	if (!dateStr) return '';
	const parts = dateStr.split('/');
	return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
}

export function getFilterParams() {
	const params = new URLSearchParams();
	const value = id => document.getElementById(id)?.value;
	if (value('dateFrom')) params.set('from_date', convertDateFormat(value('dateFrom')));
	if (value('dateTo')) params.set('to_date', convertDateFormat(value('dateTo')));
	if (value('doctorFilter')) params.set('doctor_id', value('doctorFilter'));
	if (value('medicineTypeFilter')) params.set('medicine_type', value('medicineTypeFilter'));
	if (value('searchInput')) params.set('search', value('searchInput'));
	return params.toString();
}
