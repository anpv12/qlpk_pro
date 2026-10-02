import { QLPKUserFeedback } from '../shared/user-feedback.js';

function normalizeToastType(type) {
	return QLPKUserFeedback.normalizeType(type);
}

function renderWorkspaceToast(type, message, options = {}) {
	return QLPKUserFeedback.render(type, message, options);
}

function showToast(options = {}) {
	return QLPKUserFeedback.show(options.type, options.message || '', options);
}

const AppointmentManagementFeedbackUtils = {
	normalizeToastType,
	renderWorkspaceToast,
	showToast
};

export { AppointmentManagementFeedbackUtils };
