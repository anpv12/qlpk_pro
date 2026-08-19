(function (window) {
	'use strict';

	function ensureXlsxLibrary(documentRef) {
		if (!window.XLSX) {
			const script = documentRef.createElement('script');
			script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
			documentRef.head.appendChild(script);
		}
	}

	function exportToExcel(options) {
		const payload = {};
		if (options.selectedDoctor) payload.doctor_id = options.selectedDoctor;
		if (options.selectedRoleFilter) payload.role_filter = options.selectedRoleFilter;

		options.$.ajax({
			url: '/api/export',
			method: 'POST',
			contentType: 'application/json',
			data: JSON.stringify(payload),
			headers: {
				'Authorization': `Bearer ${options.getToken()}`
			},
			xhrFields: { responseType: 'blob' },
			success: function (blob) {
				const url = window.URL.createObjectURL(blob);
				const anchor = options.document.createElement('a');
				anchor.href = url;
				const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
				anchor.download = `lich_hen_${today}.xlsx`;
				options.document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
				window.URL.revokeObjectURL(url);
				options.showCustomToast('success', 'Xuất Excel thành công!');
			},
			error: function (xhr) {
				options.showCustomToast('error', 'Không thể xuất dữ liệu. Vui lòng thử lại.');
			}
		});
	}

	function updateBreadcrumb($, thirdLevel = null) {
		let breadcrumbHtml = `
			<li class="breadcrumb-item"><a href="index.html">TRANG CHỦ</a></li>
			<li class="breadcrumb-item active" aria-current="page">KHÁM BỆNH</li>
		`;

		if (thirdLevel) {
			breadcrumbHtml = `
				<li class="breadcrumb-item"><a href="index.html">TRANG CHỦ</a></li>
				<li class="breadcrumb-item"><a href="javascript:void(0)" data-appointment-action="close-edit-modal">KHÁM BỆNH</a></li>
				<li class="breadcrumb-item active" aria-current="page">${thirdLevel}</li>
			`;
		}

		$('#mainBreadcrumb').html(breadcrumbHtml);
	}

	function closeModalAndResetBreadcrumb(options) {
		options.$('#editAppointmentModal').modal('hide');
		options.updateBreadcrumb();
	}

	function getCurrentAppointmentId($, showCustomToast) {
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (!appointmentId) {
			showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
			return null;
		}
		return appointmentId;
	}

	function createReminder(options, appointmentId, notificationType, reminderHours, callbacks = {}) {
		options.$.ajax({
			url: `/notifications/create-reminder/${appointmentId}`,
			method: 'POST',
			contentType: 'application/json',
			data: JSON.stringify({
				reminder_hours: reminderHours,
				notification_type: notificationType
			}),
			timeout: callbacks.timeout,
			success: callbacks.success,
			error: callbacks.error,
			complete: callbacks.complete
		});
	}

	function sendEmailReminder(options) {
		const $ = options.$;
		const appointmentId = getCurrentAppointmentId($, options.showCustomToast);
		if (!appointmentId) return;

		const patientEmail = $('#editPatientEmail').val();
		if (!patientEmail || !patientEmail.trim()) {
			options.showCustomToast('warning', 'Bệnh nhân chưa có email. Vui lòng cập nhật thông tin email trước khi gửi nhắc lịch.');
			return;
		}

		options.CustomModal.confirm('Bạn có chắc muốn gửi Email nhắc lịch cho bệnh nhân này?', 'Xác nhận gửi email').then((confirmed) => {
			if (confirmed) {
				const $btn = $('#sendEmailReminderBtn');
				const originalText = $btn.html();
				$btn.html('<i class="bi bi-hourglass-split me-1"></i>Đang gửi...').prop('disabled', true);

				createReminder(options, appointmentId, 'email', 24, {
					timeout: 5000,
					success: function (response) {
						options.showCustomToast('success', 'Đã gửi email nhắc lịch.');
					},
					error: function (xhr) {
						options.showCustomToast('error', 'Không thể gửi Email nhắc lịch. Vui lòng thử lại.');
					},
					complete: function () {
						$btn.html(originalText).prop('disabled', false);
					}
				});
			}
		});
	}

	window.AppointmentManagementPageActionsUtils = {
		closeModalAndResetBreadcrumb,
		ensureXlsxLibrary,
		exportToExcel,
		sendEmailReminder,
		updateBreadcrumb
	};
})(window);
