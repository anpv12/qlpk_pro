(function (window) {
	'use strict';

	function normalizeToastType(type) {
		return window.QLPKUserFeedback.normalizeType(type);
	}

	function renderWorkspaceToast(type, message, options = {}) {
		return window.QLPKUserFeedback.render(type, message, options);
	}

	function showToast(options = {}) {
		return window.QLPKUserFeedback.show(options.type, options.message || '', options);
	}

	window.AppointmentManagementFeedbackUtils = {
		normalizeToastType,
		renderWorkspaceToast,
		showToast
	};
})(window);
