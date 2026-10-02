import { removeClass, setText } from '../shared/dom-query.js';

// Field error state: .is-invalid on the control and the message in its sibling .invalid-feedback.
function fieldNodes(target) {
	return typeof target === 'string' ? [...document.querySelectorAll(target)] : [target].filter(Boolean);
}

function setFeedback(node, message) {
	[...(node.parentElement?.children || [])].filter(sibling => sibling !== node && sibling.matches('.invalid-feedback'))
		.forEach(feedback => { feedback.textContent = message; });
}

function showFieldError(target, message) {
	fieldNodes(target).forEach(node => {
		node.classList.add('is-invalid');
		setFeedback(node, message);
	});
}

function clearFieldError(target) {
	fieldNodes(target).forEach(node => {
		node.classList.remove('is-invalid');
		setFeedback(node, '');
	});
}

function clearAllFieldErrors() {
	removeClass('.is-invalid', 'is-invalid');
	setText('.invalid-feedback', '');
}

export { clearAllFieldErrors, clearFieldError, showFieldError };
