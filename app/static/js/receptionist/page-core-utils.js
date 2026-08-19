(function (window) {
	'use strict';

	function getLocalStorage(options) {
		return options && options.localStorage ? options.localStorage : window.localStorage;
	}

	function getSessionStorage(options) {
		return options && options.sessionStorage ? options.sessionStorage : window.sessionStorage;
	}

	function getFetch(options) {
		return options && options.fetch ? options.fetch : window.fetch.bind(window);
	}

	function ensureToken(options = {}) {
		const token = getLocalStorage(options).getItem('qlpk_token');
		if (!token) {
			(options.window || window).location.href = '/login';
			return false;
		}
		return true;
	}

	function getAuthHeader(options = {}) {
		try {
			let raw = getLocalStorage(options).getItem('qlpk_token') || getLocalStorage(options).getItem('token') || getSessionStorage(options).getItem('qlpk_token');
			if (!raw) return null;
			if (raw.trim().startsWith('{')) {
				const obj = JSON.parse(raw);
				const token = obj.access_token || obj.token || obj.Authorization || obj.authorization;
				return token ? `Bearer ${token.replace(/^Bearer\s+/i, '')}` : null;
			}
			return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
		} catch (e) {
			return null;
		}
	}

	function apiCall(url, options = {}, coreOptions = {}) {
		const auth = getAuthHeader(coreOptions);
		const defaultOptions = {
			headers: {
				'Content-Type': 'application/json',
				...(auth ? { 'Authorization': auth } : {})
			}
		};

		const finalOptions = {
			...defaultOptions,
			...options,
			headers: {
				...defaultOptions.headers,
				...(options.headers || {})
			}
		};

		return getFetch(coreOptions)(url, finalOptions);
	}

	function alignToastToWorkspaceTabs(toast, options = {}) {
		const targetWindow = options.window || window;
		const doc = options.document || targetWindow.document;
		const tabs = doc.getElementById('qlpkWorkspaceTabs');
		const container = toast && toast.closest ? toast.closest('.swal2-container') : null;
		if (!tabs || !container || typeof tabs.getBoundingClientRect !== 'function') return;

		targetWindow.requestAnimationFrame(() => {
			const tabsRect = tabs.getBoundingClientRect();
			if (!tabsRect.width || !tabsRect.height) return;

			const inlineOffset = Math.max(8, targetWindow.innerWidth - tabsRect.right + 8);
			const topOffset = Math.max(0, tabsRect.top + 2);
			container.style.setProperty('--qlpk-toast-topbar-offset', `${topOffset}px`);
			container.style.setProperty('--qlpk-toast-inline-offset', `${inlineOffset}px`);
			container.classList.add('qlpk-toast-container--workspace-tabs');
		});
	}

	function showCustomToast(type, message, options = {}) {
		return window.QLPKUserFeedback?.show(type, message, options);
	}

	window.ReceptionistPageCoreUtils = {
		ensureToken,
		getAuthHeader,
		apiCall,
		alignToastToWorkspaceTabs,
		showCustomToast
	};
})(window);
