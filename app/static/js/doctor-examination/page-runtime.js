(function (window, document) {
	'use strict';

	function getStorageToken(storage) {
		if (!storage) return null;
		return storage.getItem('qlpk_token') || storage.getItem('token');
	}

	function normalizeAuthHeader(rawToken) {
		if (!rawToken) return null;
		try {
			const trimmed = String(rawToken).trim();
			if (!trimmed) return null;
			if (trimmed.startsWith('{')) {
				const tokenObject = JSON.parse(trimmed);
				const token = tokenObject.access_token || tokenObject.token || tokenObject.Authorization || tokenObject.authorization;
				return token ? `Bearer ${String(token).replace(/^Bearer\s+/i, '')}` : null;
			}
			return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
		} catch (error) {
			return null;
		}
	}

	function getAuthHeader() {
		return normalizeAuthHeader(getStorageToken(window.localStorage) || getStorageToken(window.sessionStorage));
	}

	function redirectToLogin() {
		window.location.href = '/login';
	}

	function ensureToken() {
		if (getAuthHeader()) return true;
		redirectToLogin();
		return false;
	}

	function apiCall(url, options = {}) {
		const headers = new Headers(options.headers || {});
		const authHeader = getAuthHeader();
		if (authHeader && !headers.has('Authorization')) {
			headers.set('Authorization', authHeader);
		}

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
		return window.QLPKUserFeedback?.show(type, message);
	}

	const runtime = {
		apiCall,
		ensureToken,
		formatDateDisplay,
		getAuthHeader,
		showCustomToast
	};

	window.QLPKDoctorPageRuntime = runtime;
	window.QLPKDoctorModuleRegistry?.register?.('pageRuntime', runtime, {
		owner: 'doctor/base',
		version: 2
	});
	// These aliases keep shared legacy components on the same canonical Doctor runtime.
	window.getAuthHeader = getAuthHeader;
	window.formatDateDisplay = formatDateDisplay;
	window.showCustomToast = showCustomToast;
})(window, document);
