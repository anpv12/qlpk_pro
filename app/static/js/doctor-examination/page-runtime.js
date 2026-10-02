import { QLPKUserFeedback } from '../shared/user-feedback.js';
import { setPageDateFormatter } from '../shared/page-date-format.js';

function getAuthHeader() {
	return window.QLPKApiTransport.getAuthHeader();
}

function redirectToLogin() {
	window.location.href = '/login';
}

function ensureSession() {
	return window.QLPKApiTransport.ensureSession();
}

function apiCall(url, options = {}) {
	const headers = new Headers(options.headers || {});

	return window.fetch(url, { ...options, headers }).then(response => {
		if (response.status === 401) redirectToLogin();
		return response;
	});
}

function formatDateDisplay(value) {
	if (!value) return '';
	const raw = String(value);
	const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (dateMatch) return `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
	const parsedDate = new Date(raw);
	if (Number.isNaN(parsedDate.getTime())) return raw;
	return parsedDate.toLocaleDateString('vi-VN');
}

function showCustomToast(type, message) {
	return QLPKUserFeedback?.show(type, message);
}

const runtime = {
	apiCall,
	ensureSession,
	formatDateDisplay,
	getAuthHeader,
	showCustomToast
};

window.QLPKDoctorModuleRegistry?.register?.('pageRuntime', runtime, {
	owner: 'doctor/base',
	version: 2
});
// Shared components format dates through the page formatter.
setPageDateFormatter(formatDateDisplay);

export { runtime as QLPKDoctorPageRuntime };
