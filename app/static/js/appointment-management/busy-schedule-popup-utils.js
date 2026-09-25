(function (window) {
	'use strict';

	function formatDateTime(value) {
		if (!value) return 'Không có thông tin';
		return new Date(value).toLocaleString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function buildBusySchedulePopupHtml(event) {
		const props = event.extendedProps || {};
		return `
			<div class="busy-schedule-popup">
				<div class="popup-header">
					<h6 class="appointment-popup-title"><i class="bi bi-calendar-x me-2"></i>Lịch bận của bác sĩ</h6>
					<button type="button" class="btn-close" data-busy-schedule-action="close"></button>
				</div>
				<div class="popup-body">
					<div class="row mb-2">
						<div class="col-4"><strong>Bác sĩ:</strong></div>
						<div class="col-8">${escapeHtml(props.doctorName)}</div>
					</div>
					<div class="row mb-2">
						<div class="col-4"><strong>Thời gian:</strong></div>
						<div class="col-8">${formatDateTime(event.start)} - ${formatDateTime(event.end)}</div>
					</div>
					<div class="row mb-2">
						<div class="col-4"><strong>Lý do:</strong></div>
						<div class="col-8">${escapeHtml(props.reason)}</div>
					</div>
					<div class="row mb-2">
						<div class="col-4"><strong>Ngày tạo:</strong></div>
						<div class="col-8">${formatDateTime(props.created_at)}</div>
					</div>
				</div>
				<div class="popup-footer">
					<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn appointment-button appointment-button--neutral appointment-button--sm" data-busy-schedule-action="close">Đóng</button>
				</div>
			</div>
		`;
	}

	function showOverlay($, className, html) {
		const overlay = $(`<div class="${className}"></div>`);
		overlay.html(html);
		$('body').append(overlay);
		setTimeout(() => overlay.addClass('show'), 10);
	}

	function closeOverlay($, selector) {
		$(selector).removeClass('show');
		setTimeout(() => $(selector).remove(), 300);
	}

	function showBusySchedulePopup($, event) {
		showOverlay($, 'busy-schedule-overlay', buildBusySchedulePopupHtml(event));
	}

	function closeBusySchedulePopup($) {
		closeOverlay($, '.busy-schedule-overlay');
	}

	function showDoctorBusySchedules($, panelUtils, doctorId, doctorName, currentBusySchedules) {
		const html = panelUtils.buildDoctorBusyPopupHtml(doctorId, doctorName, currentBusySchedules);
		showOverlay($, 'doctor-busy-overlay', html);
	}

	function closeDoctorBusyPopup($) {
		closeOverlay($, '.doctor-busy-overlay');
	}

	window.AppointmentManagementBusySchedulePopupUtils = {
		buildBusySchedulePopupHtml,
		closeBusySchedulePopup,
		closeDoctorBusyPopup,
		formatDateTime,
		showBusySchedulePopup,
		showDoctorBusySchedules
	};
})(window);
