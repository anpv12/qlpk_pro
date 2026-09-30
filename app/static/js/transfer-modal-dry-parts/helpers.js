// transfer-modal-dry.js: captureAuthContext, mapRoleToDatabase, escapeHtml, openWithErrorHandling (nạp trước transfer-modal-dry.js; dùng chung qua QLPKModuleParts).
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})["transfer-modal-dry"] || (window.QLPKModuleParts["transfer-modal-dry"] = { state: {} });

	function captureAuthContext() {
		const binding = window.QLPKApiTransport.session;
		if (binding) {
			const snapshot = binding.owner.snapshot();
			return () => window.QLPKApiTransport.session === binding
				&& snapshot.status === 'authenticated'
				&& binding.owner.snapshot().status === 'authenticated'
				&& binding.owner.snapshot().revision === snapshot.revision;
		}
		const credential = window.QLPKApiTransport.getAuthHeader();
		return () => !window.QLPKApiTransport.session && Boolean(credential)
			&& window.QLPKApiTransport.getAuthHeader() === credential;
	}

	/**
 * Map role từ frontend sang database enum
 * Frontend: doctor, psychologist, receptionist (lowercase)
 * Database: doctor, PSYCHOLOGIST, staff (mixed case, không có receptionist)
 */
	function mapRoleToDatabase(role) {
		const roleMap = {
			'doctor': 'doctor',
			'psychologist': 'PSYCHOLOGIST',
			'receptionist': 'staff'  // Lễ tân = staff trong database
		};
		return roleMap[role.toLowerCase()] || role;
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Helper function để mở modal với error handling thống nhất
	 * @param {Array|Number} appointmentIds - Mảng ID hoặc một ID đơn
	 * @param {String} fromRole - Role hiện tại
	 * @param {Function} onSuccess - Callback khi thành công
	 * @returns {Boolean} - true nếu thành công, false nếu có lỗi
	 */
	function openWithErrorHandling(appointmentIds, fromRole, onSuccess) {
		if (!window.TransferModal || !window.TransferModal.open) {
			console.error('TransferModal module chưa được load. Vui lòng đảm bảo transfer-modal-dry.js được load trước.');
			window.QLPKUserFeedback.show('error', 'Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
			return false;
		}
		window.TransferModal.open(appointmentIds, fromRole, onSuccess);
		return true;
	}

	Object.assign(moduleParts, { captureAuthContext, mapRoleToDatabase, escapeHtml, openWithErrorHandling });
})();
