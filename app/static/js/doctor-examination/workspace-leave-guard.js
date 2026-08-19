(function (window, document) {
	'use strict';

	const STATE = {
		options: {},
		bound: false,
		allowNativeUnload: false,
		keyboardReloadPending: false,
		userInteracted: false
	};

	function getWorkspace() {
		return window.QLPKDoctorModuleRegistry.get('clinicalWorkspace');
	}

	function showToast(type, message) {
		if (typeof STATE.options.showToast === 'function') STATE.options.showToast(type, message);
	}

	function getLeaveMessage(reason) {
		if (reason === 'patient-switch') {
			return 'Bạn sắp chuyển sang ca khám khác. Hãy lưu dữ liệu trước để tránh mất thông tin.';
		}
		if (reason === 'close-workspace-tab') {
			return 'Bạn sắp đóng tab Khám bác sĩ. Hãy lưu dữ liệu trước để tránh mất thông tin.';
		}
		return 'Bạn sắp chuyển sang màn hình khác. Hãy lưu dữ liệu trước để tránh mất thông tin.';
	}

	async function reloadCurrentAppointment() {
		if (typeof STATE.options.reloadCurrentAppointment !== 'function') return true;
		return STATE.options.reloadCurrentAppointment();
	}

	async function requestLeave(options = {}) {
		const workspace = getWorkspace();
		if (!workspace || typeof workspace.resolveUnsavedChanges !== 'function') return true;
		const reason = options.reason || 'workspace-tab';
		return workspace.resolveUnsavedChanges({
			document,
			message: getLeaveMessage(reason),
			onDiscard: async () => {
				const draftRecovery = window.QLPKDoctorModuleRegistry.get('draftRecovery');
				if (draftRecovery && typeof draftRecovery.discardCurrent === 'function') {
					const discarded = await draftRecovery.discardCurrent({ document, reload: false });
					if (!discarded) return false;
				}
				if (reason === 'patient-switch') return true;
				return reloadCurrentAppointment();
			}
		});
	}

	function isKeyboardReload(event) {
		if (!event || event.defaultPrevented) return false;
		if (event.key === 'F5') return true;
		return Boolean(event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'r';
	}

	async function keepDraftBeforeReload() {
		const draftRecovery = window.QLPKDoctorModuleRegistry.get('draftRecovery');
		if (!draftRecovery || typeof draftRecovery.captureNow !== 'function') {
			showToast('error', 'Không thể giữ bản nháp trước khi tải lại. Vui lòng lưu hoặc ở lại ca khám.');
			return false;
		}
		const captured = await draftRecovery.captureNow();
		if (!captured) {
			showToast('error', 'Không thể giữ bản nháp trước khi tải lại. Vui lòng lưu hoặc ở lại ca khám.');
			return false;
		}
		return true;
	}

	function reloadBrowserPage() {
		STATE.allowNativeUnload = true;
		window.location.reload();
	}

	async function requestKeyboardReload() {
		if (STATE.keyboardReloadPending) return false;
		const workspace = getWorkspace();
		if (!workspace || typeof workspace.hasUnsavedChanges !== 'function' || !workspace.hasUnsavedChanges()) {
			reloadBrowserPage();
			return true;
		}

		STATE.keyboardReloadPending = true;
		try {
			const canReload = await workspace.resolveUnsavedChanges({
				document,
				title: 'Tải lại ca khám?',
				message: 'Dữ liệu vừa khôi phục hoặc chỉnh sửa chưa được lưu chính thức. Bạn muốn xử lý thế nào trước khi tải lại?',
				confirmButtonText: 'Lưu và tải lại',
				denyButtonText: 'Tải lại trang',
				showCancelButton: false,
				allowEscapeKey: false,
				onDeny: keepDraftBeforeReload
			});
			if (!canReload) return false;
			reloadBrowserPage();
			return true;
		} finally {
			STATE.keyboardReloadPending = false;
		}
	}

	function bind() {
		if (STATE.bound) return;
		const markUserInteraction = () => {
			STATE.userInteracted = true;
		};
		window.addEventListener('pointerdown', markUserInteraction, { passive: true });
		window.addEventListener('keydown', markUserInteraction, { passive: true });
		window.addEventListener('touchstart', markUserInteraction, { passive: true });
		window.addEventListener('beforeunload', event => {
			if (STATE.allowNativeUnload || !STATE.userInteracted) return;
			const workspace = getWorkspace();
			if (!workspace || typeof workspace.hasUnsavedChanges !== 'function' || !workspace.hasUnsavedChanges()) return;
			event.preventDefault();
			event.returnValue = '';
		});
		window.addEventListener('keydown', event => {
			if (!isKeyboardReload(event)) return;
			const workspace = getWorkspace();
			const hasUnsavedChanges = workspace
				&& typeof workspace.hasUnsavedChanges === 'function'
				&& workspace.hasUnsavedChanges();
			if (!hasUnsavedChanges && !STATE.keyboardReloadPending) return;
			event.preventDefault();
			if (STATE.keyboardReloadPending) return;
			requestKeyboardReload().catch(() => {
				showToast('error', 'Không thể chuẩn bị tải lại ca khám. Vui lòng ở lại và thử lại.');
			});
		});
		STATE.bound = true;
	}

	function initialize(options = {}) {
		STATE.options = { ...STATE.options, ...options };
		bind();
		return true;
	}

	const api = { initialize, requestLeave };
	window.QLPKDoctorModuleRegistry.register('workspaceLeaveGuard', api, {
		dependencies: ['clinicalWorkspace'],
		owner: 'doctor/workspace'
	});
	window.QLPKDoctorWorkspaceLeaveGuard = api;
})(window, document);
