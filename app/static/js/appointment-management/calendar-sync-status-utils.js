(function (window) {
	'use strict';

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function buildVerifySyncStatusBadge(result) {
		switch (result.sync_status) {
			case 'full':
				return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--success"><i class="bi bi-check-circle-fill"></i> Đã đồng bộ</span>';
			case 'partial':
				return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--warning"><i class="bi bi-exclamation-triangle"></i> Thiếu</span>';
			default:
				return '';
		}
	}

	function buildVerifyDoctorBadge(result) {
		const doctorLabel = escapeHtml(result.doctor_role || 'Bác sĩ');
		const doctorTitleName = escapeHtml(result.doctor_name) || doctorLabel;
		if (result.doctor_verified === true) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--success" title="${doctorTitleName}: Đã xác nhận trên GCal">
									<i class="bi bi-check-circle-fill"></i> ${doctorLabel}
								</span>`;
		}
		if (result.doctor_verified === false) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--danger" title="${doctorTitleName}: Không tìm thấy event trên GCal">
									<i class="bi bi-x-circle-fill"></i> ${doctorLabel}
								</span>`;
		}
		return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--neutral" title="${doctorLabel}: Chưa có event">
									<i class="bi bi-dash-circle"></i> ${doctorLabel}
								</span>`;
	}

	function buildVerifyReceptionistBadge(result) {
		if (result.receptionist_verified === true) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--success" title="${escapeHtml(result.receptionist_name) || 'Lễ tân'}: Đã xác nhận trên GCal">
									<i class="bi bi-check-circle-fill"></i> Lễ tân
								</span>`;
		}
		if (result.receptionist_verified === false) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--danger" title="${escapeHtml(result.receptionist_name) || 'Lễ tân'}: Không tìm thấy event trên GCal">
									<i class="bi bi-x-circle-fill"></i> Lễ tân
								</span>`;
		}
		return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--neutral" title="Lễ tân: Chưa có event">
								<i class="bi bi-dash-circle"></i> Lễ tân
							</span>`;
	}

	function buildVerifyEventsIconsHtml(result) {
		return buildVerifySyncStatusBadge(result) + buildVerifyDoctorBadge(result) + buildVerifyReceptionistBadge(result);
	}

	function getVerifyRowStatus(result) {
		return result.sync_status === 'full' ? 'synced' : 'missing';
	}

	function getVerifyButtonState(result) {
		if (result.sync_status === 'full') {
			return {
				addClass: 'appointment-button--success',
				disabled: true,
				html: '<i class="bi bi-check-circle"></i> Đã đồng bộ',
				removeClass: 'appointment-button--neutral appointment-button--primary appointment-button--warning sync-single-btn'
			};
		}

		return {
			addClass: 'appointment-button--primary sync-single-btn',
			disabled: false,
			html: '<i class="bi bi-arrow-repeat"></i> Đồng bộ',
			removeClass: 'appointment-button--neutral appointment-button--success appointment-button--warning'
		};
	}

	function buildSyncResultStatusBadge(result) {
		if (result.sync_status === 'full') {
			return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--success"><i class="bi bi-check-circle-fill"></i> Đã đồng bộ</span>';
		}
		if (result.sync_status === 'partial') {
			return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--warning"><i class="bi bi-exclamation-triangle"></i> Thiếu</span>';
		}
		return '';
	}

	function buildSyncResultDoctorBadge(result) {
		const doctorLabel = escapeHtml(result.doctor_role || 'Bác sĩ');
		if (result.doctor_verified === true) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--success" title="${doctorLabel}"><i class="bi bi-check-circle-fill"></i> ${doctorLabel}</span>`;
		}
		if (result.doctor_verified === false) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--danger" title="${doctorLabel} - Lỗi"><i class="bi bi-x-circle-fill"></i> ${doctorLabel}</span>`;
		}
		if (result.doctor_verified === null) {
			return `<span class="qlpk-status appointment-sync-badge appointment-sync-badge--neutral" title="${doctorLabel} chưa kết nối"><i class="bi bi-dash-circle"></i> ${doctorLabel}</span>`;
		}
		return '';
	}

	function buildSyncResultReceptionistBadge(result) {
		if (result.receptionist_verified === true) {
			return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--success" title="Lễ tân"><i class="bi bi-check-circle-fill"></i> Lễ tân</span>';
		}
		if (result.receptionist_verified === false) {
			return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--danger" title="Lễ tân - Lỗi"><i class="bi bi-x-circle-fill"></i> Lễ tân</span>';
		}
		if (result.receptionist_verified === null) {
			return '<span class="qlpk-status appointment-sync-badge appointment-sync-badge--neutral" title="Lễ tân chưa kết nối"><i class="bi bi-dash-circle"></i> Lễ tân</span>';
		}
		return '';
	}

	function buildSyncResultIconsHtml(result) {
		return buildSyncResultStatusBadge(result) + buildSyncResultDoctorBadge(result) + buildSyncResultReceptionistBadge(result);
	}

	function getSyncResultRowStatus(result) {
		if (result.sync_status === 'full') return 'synced';
		if (result.sync_status === 'partial') return 'partial';
		return 'error';
	}

	function getSyncResultButtonState(result) {
		if (result.sync_status === 'full') {
			return {
				addClass: 'appointment-button--success',
				disabled: true,
				html: '<i class="bi bi-check-circle"></i> Đã đồng bộ',
				removeClass: 'appointment-button--primary appointment-button--warning sync-single-btn'
			};
		}
		if (result.sync_status === 'partial') {
			return {
				addClass: 'appointment-button--warning',
				disabled: true,
				html: '<i class="bi bi-exclamation-circle"></i> Một phần',
				removeClass: 'appointment-button--primary appointment-button--success sync-single-btn'
			};
		}

		return {
			addClass: 'appointment-button--primary sync-single-btn',
			disabled: false,
			html: '<i class="bi bi-arrow-repeat"></i> Đồng bộ',
			removeClass: 'appointment-button--success appointment-button--warning'
		};
	}

	window.AppointmentManagementCalendarSyncStatusUtils = {
		buildSyncResultIconsHtml,
		buildVerifyEventsIconsHtml,
		getSyncResultButtonState,
		getSyncResultRowStatus,
		getVerifyButtonState,
		getVerifyRowStatus
	};
})(window);
