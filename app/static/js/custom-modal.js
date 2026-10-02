// Custom confirm/alert modal: built as nodes (title and message are text, or a caller-built Node), resolved through a
// closure; no inline handlers, no HTML parsing and no per-modal window globals.
const openModals = new Map();

function node(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function content(className, value) {
	const element = node('div', className);
	if (value && typeof value === 'object' && typeof value.nodeType === 'number') element.append(value);
	else element.textContent = value == null ? '' : String(value);
	return element;
}

function button(role, variant, className, label, onClick) {
	const element = node('button', className, label);
	element.dataset.qlpkButton = role;
	element.dataset.qlpkButtonVariant = variant;
	element.addEventListener('click', onClick);
	return element;
}

function open({ idPrefix, message, title, type, iconText, buttons, dismissResult }) {
	return new Promise(resolve => {
		const modalId = `${idPrefix}-${Date.now()}`;
			const overlay = node('div', 'custom-modal-overlay');
		overlay.id = modalId;
		const close = result => closeModal(modalId, result);
		const actions = node('div', 'custom-modal-buttons');
		actions.append(...buttons.map(spec => button(spec.role, spec.variant, spec.className, spec.label, () => close(spec.result))));
		const dialog = node('div', 'custom-modal');
		dialog.append(node('div', `custom-modal-icon ${type}`, iconText), content('custom-modal-title', title), content('custom-modal-message', message), actions);
		overlay.append(dialog);
		overlay.addEventListener('click', event => { if (event.target === overlay) close(dismissResult); });
		const escHandler = event => { if (event.key === 'Escape') close(dismissResult); };
		document.addEventListener('keydown', escHandler);
		openModals.set(modalId, { resolve, escHandler });
		document.body.append(overlay);
	});
}

function closeModal(modalId, result) {
	const modal = document.getElementById(modalId);
	const entry = openModals.get(modalId);
	if (!modal || !entry) return;
	openModals.delete(modalId);
	document.removeEventListener('keydown', entry.escHandler);
	modal.classList.add('is-closing');
	setTimeout(() => {
		modal.remove();
		entry.resolve(result);
	}, 200);
}

export const CustomModal = {
	confirm(message, title = 'Xác nhận', type = 'warning', buttonRole = 'execute') {
		return open({
			idPrefix: 'custom-confirm-modal', message, title, type, iconText: '!', dismissResult: false,
			buttons: [
				{ role: 'neutral', variant: 'soft', className: 'custom-modal-btn cancel', label: 'Hủy bỏ', result: false },
				{ role: buttonRole === 'danger' ? 'danger' : 'execute', variant: 'solid', className: 'custom-modal-btn confirm', label: 'Xác nhận', result: true }
			]
		});
	},
	alert(message, title = 'Thông báo', type = 'success') {
		return open({
			idPrefix: 'custom-alert-modal', message, title, type, iconText: '✓', dismissResult: true,
			buttons: [{ role: 'neutral', variant: 'soft', className: 'custom-modal-btn success', label: 'OK', result: true }]
		});
	},
	closeModal
};
