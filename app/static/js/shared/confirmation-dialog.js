(function (window) {
	'use strict';

	function resolveVariant(options = {}) {
		if (options.variant) return options.variant;
		const buttonClass = String(options.confirmButtonClass || '');
		if (buttonClass.includes('danger')) return 'danger';
		if (buttonClass.includes('warning')) return 'warning';
		if (buttonClass.includes('success')) return 'success';
		return 'primary';
	}

	async function confirm(options = {}) {
		const swal = window.Swal;
		if (!swal || typeof swal.fire !== 'function') {
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không thể mở hộp thoại xác nhận. Thao tác đã được hủy.');
			}
			return false;
		}

		const variant = resolveVariant(options);
		try {
			const result = await swal.fire({
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
				customClass: {
					container: 'qlpk-confirm-container',
					popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${variant}`,
					icon: 'qlpk-confirm-dialog__icon',
					title: 'qlpk-confirm-dialog__title',
					htmlContainer: 'qlpk-confirm-dialog__text',
					actions: 'qlpk-confirm-dialog__actions',
					confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${variant}`,
					cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
				}
			});
			return result.isConfirmed === true;
		} catch (error) {
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không thể mở hộp thoại xác nhận. Thao tác đã được hủy.');
			}
			return false;
		}
	}

	window.QLPKConfirmationDialog = Object.freeze({ confirm });
	window.QLPKDoctorModuleRegistry?.register?.('confirmationDialog', window.QLPKConfirmationDialog, {
		owner: 'shared/feedback',
		version: 2
	});
})(window);
