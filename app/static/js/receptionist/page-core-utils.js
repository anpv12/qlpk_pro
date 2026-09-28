(function (window) {
	'use strict';

	function getFetch(options) {
		return options && options.fetch ? options.fetch : window.fetch.bind(window);
	}

	function ensureSession() {
		return window.QLPKApiTransport.ensureSession();
	}

	function getAuthHeader() {
		return window.QLPKApiTransport.getAuthHeader();
	}

	function apiCall(url, options = {}, coreOptions = {}) {
		const defaultOptions = {
			headers: {
				'Content-Type': 'application/json'
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
		ensureSession,
		getAuthHeader,
		apiCall,
		alignToastToWorkspaceTabs,
		showCustomToast
	};
})(window);
