import { QLPKUserFeedback } from './user-feedback.js';

function resolveVariant(options = {}) {
	if (options.variant) return options.variant;
	const buttonClass = String(options.confirmButtonClass || '');
	if (buttonClass.includes('danger')) return 'danger';
	if (buttonClass.includes('warning')) return 'warning';
	if (buttonClass.includes('success')) return 'success';
	return 'primary';
}

const DEFAULT_FAILURE_MESSAGE = 'Không thể mở hộp thoại xác nhận. Thao tác đã được hủy.';
const GHOST_BUTTON_CLASS = 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost';

function buildDialogOptions(options, variant, extra) {
	return {
		title: options.title || 'Xác nhận',
		text: options.text || '',
		icon: options.icon || 'warning',
		showCancelButton: true,
		confirmButtonText: options.confirmText || 'Xác nhận',
		cancelButtonText: options.cancelText || 'Hủy',
		buttonsStyling: false,
		reverseButtons: true,
		focusCancel: true,
		allowOutsideClick: false,
		allowEscapeKey: true,
		...extra,
		customClass: {
			container: 'qlpk-confirm-container',
			popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${variant}`,
				icon: 'qlpk-confirm-dialog__icon',
			title: 'qlpk-confirm-dialog__title',
			htmlContainer: 'qlpk-confirm-dialog__text',
			actions: 'qlpk-confirm-dialog__actions',
			confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${variant}`,
				cancelButton: GHOST_BUTTON_CLASS,
			...(extra.showDenyButton ? { denyButton: GHOST_BUTTON_CLASS } : {})
		}
	};
}

async function openDialog(options, extra) {
	const failureMessage = options.failureMessage || DEFAULT_FAILURE_MESSAGE;
	const reportFailure = () => {
		if (typeof options.showToast === 'function') options.showToast('error', failureMessage);
		return null;
	};
	const swal = window.Swal;
	if (!swal || typeof swal.fire !== 'function') return reportFailure();
	try {
		return await swal.fire(buildDialogOptions(options, resolveVariant(options), extra));
	} catch (error) {
		return reportFailure();
	}
}

async function confirm(options = {}) {
	const result = await openDialog(options, {});
	return result?.isConfirmed === true;
}

async function choose(options = {}) {
	const result = await openDialog(options, {
		showCancelButton: options.showCancelButton !== false,
		showDenyButton: true,
		denyButtonText: options.denyText || 'Không',
		allowEscapeKey: options.allowEscapeKey !== false
	});
	if (result?.isConfirmed === true) return 'confirm';
	if (result?.isDenied === true) return 'deny';
	return 'cancel';
}

// Xác nhận thao tác xóa (fail-closed: không mở được hộp thoại thì báo lỗi và trả false).
function confirmDelete(text, options = {}) {
	return confirm({
		text,
		confirmText: 'Xóa',
		variant: 'danger',
		showToast: (type, message) => QLPKUserFeedback?.show(type, message),
		...options
	});
}

export const QLPKConfirmationDialog = Object.freeze({ confirm, choose, confirmDelete });
window.QLPKDoctorModuleRegistry?.register?.('confirmationDialog', QLPKConfirmationDialog, {
	owner: 'shared/feedback',
	version: 2
});
