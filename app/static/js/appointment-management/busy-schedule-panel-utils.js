(function (window) {
	'use strict';

	function formatDateTime(value) {
		return new Date(value).toLocaleString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function escapeHtmlAttribute(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function buildBusyScheduleItemHtml(schedule) {
		const startTime = formatDateTime(schedule.start_datetime);
		const endTime = formatDateTime(schedule.end_datetime);
		const createdAt = schedule.created_at ? formatDateTime(schedule.created_at) : 'Không có thông tin';

		return `
          <div class="busy-schedule-item appointment-busy-schedule-card mb-3 p-3 border rounded">
            <div class="row">
              <div class="col-4"><strong>Thời gian:</strong></div>
              <div class="col-8">${startTime} - ${endTime}</div>
            </div>
            <div class="row">
              <div class="col-4"><strong>Lý do:</strong></div>
              <div class="col-8">${escapeHtmlAttribute(schedule.reason)}</div>
            </div>
            <div class="row">
              <div class="col-4"><strong>Ngày tạo:</strong></div>
              <div class="col-8">${createdAt}</div>
            </div>
          </div>
        `;
	}

	function buildDoctorBusyPopupHtml(doctorId, doctorName, busySchedules) {
		const doctorSchedules = (busySchedules || []).filter(schedule => schedule.doctor_id === doctorId);
		let html = `
      <div class="doctor-busy-popup">
        <div class="popup-header">
          <h6 class="appointment-popup-title"><i class="bi bi-person-circle me-2"></i>Lịch bận của ${escapeHtmlAttribute(doctorName)}</h6>
          <button type="button" class="btn-close" data-doctor-busy-action="close"></button>
        </div>
        <div class="popup-body">
    `;

		if (doctorSchedules.length === 0) {
			html += `
        <div class="text-center text-muted py-4">
          <i class="bi bi-check-circle appointment-doctor-free-icon"></i>
          <h5 class="mt-3 mb-2 appointment-subsection-title">Bác sĩ rảnh</h5>
          <p class="mb-0">${escapeHtmlAttribute(doctorName)} hiện tại không có lịch bận nào</p>
        </div>
      `;
		} else {
			doctorSchedules.forEach(schedule => {
				html += buildBusyScheduleItemHtml(schedule);
			});
		}

		html += `
        </div>
        <div class="popup-footer">
		  <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn appointment-button appointment-button--neutral appointment-button--sm" data-doctor-busy-action="close">Đóng</button>
        </div>
      </div>
    `;

		return html;
	}

	window.AppointmentManagementBusySchedulePanelUtils = {
		buildBusyScheduleItemHtml,
		buildDoctorBusyPopupHtml,
		escapeHtmlAttribute,
		formatDateTime
	};
})(window);
