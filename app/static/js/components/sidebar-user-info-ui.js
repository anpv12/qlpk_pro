(function (window) {
	'use strict';

	function resolveDocument(options = {}) {
		return options.document || window.document;
	}

	function setTextIfExists(doc, elementId, text) {
		const element = doc.getElementById(elementId);
		if (element) element.textContent = text;
		return Boolean(element);
	}

	async function loadSidebarUserInfo(options = {}) {
		const doc = resolveDocument(options);
		try {
			setTextIfExists(doc, options.nameElementId || 'sidebarUserName', options.nameText || 'Lễ tân');
			setTextIfExists(doc, options.roleElementId || 'sidebarUserRole', options.roleText || 'RECEPTIONIST');
			return { status: 'success' };
		} catch (error) {
			console.error(options.errorLogMessage || 'Error loading sidebar user info:', error);
			setTextIfExists(doc, options.nameElementId || 'sidebarUserName', options.fallbackNameText || 'User');
			setTextIfExists(doc, options.roleElementId || 'sidebarUserRole', options.fallbackRoleText || 'User');
			return { status: 'error', error };
		}
	}

	window.SidebarUserInfoUi = {
		loadSidebarUserInfo
	};
})(window);
