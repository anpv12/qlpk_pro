(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getSessionStorage(options) {
		return options && options.sessionStorage ? options.sessionStorage : window.sessionStorage;
	}

	function getLocalStorage(options) {
		return options && options.localStorage ? options.localStorage : window.localStorage;
	}

	function resetDraftSession(options) {
		const opts = options || {};
		try {
			const storage = getSessionStorage(opts);
			storage.setItem(opts.pageLoadIdKey, String(Date.now()));
			(opts.draftKeys || []).forEach(key => storage.removeItem(key));

			try {
				const local = getLocalStorage(opts);
				(opts.staleLocalKeys || []).forEach(key => local.removeItem(key));
			} catch (e) { }
		} catch (e) { }
	}

	function createDatalist(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const datalistId = opts.datalistId;
		if (!datalistId || doc.getElementById(datalistId)) return;

		const datalist = doc.createElement('datalist');
		datalist.id = datalistId;
		(opts.options || []).forEach(value => {
			const optionElement = doc.createElement('option');
			optionElement.value = value;
			datalist.appendChild(optionElement);
		});
		doc.body.appendChild(datalist);
	}

	function bootstrapPageSession(options) {
		const opts = options || {};
		resetDraftSession(opts);
		createDatalist({
			document: getDocument(opts),
			datalistId: opts.kinshipDatalistId || 'joint-exam-kinship-list',
			options: opts.kinshipOptions || []
		});
	}

	async function loadSidebarUserInfo(options = {}) {
		const doc = getDocument(options);
		try {
			const userNameEl = doc.getElementById(options.userNameId || 'sidebarUserName');
			const userRoleEl = doc.getElementById(options.userRoleId || 'sidebarUserRole');

			if (userNameEl) {
				userNameEl.textContent = options.defaultName || 'Lễ tân';
			}
			if (userRoleEl) {
				userRoleEl.textContent = options.defaultRole || 'RECEPTIONIST';
			}
		} catch (error) {
			console.error('Error loading sidebar user info:', error);
			const userNameEl = doc.getElementById(options.userNameId || 'sidebarUserName');
			const userRoleEl = doc.getElementById(options.userRoleId || 'sidebarUserRole');

			if (userNameEl) {
				userNameEl.textContent = options.fallbackName || 'User';
			}
			if (userRoleEl) {
				userRoleEl.textContent = options.fallbackRole || 'User';
			}
		}
	}

	window.ReceptionistPageSessionBootstrap = {
		resetDraftSession,
		createDatalist,
		bootstrapPageSession,
		loadSidebarUserInfo
	};
})(window);
