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

	function normalizeTimeRange(timeRange) {
		const normalized = timeRange || 'thời gian không xác định';
		if (!normalized.includes(' - ')) return normalized;

		const parts = normalized.split(' - ');
		if (parts.length !== 2) return normalized;

		const startPart = parts[0].trim();
		const endPart = parts[1].trim();
		const startMatch = startPart.match(/(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})/);
		const endMatch = endPart.match(/(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})/);

		if (!startMatch || !endMatch) return normalized;

		const startTime = startMatch[1];
		const startDate = startMatch[2];
		const endTime = endMatch[1];
		const endDate = endMatch[2];
		return `${startTime} ${startDate} - ${endTime} ${endDate}`;
	}

	function resolveDoctorName(appointmentData, options = {}) {
		const target$ = options.$ || window.jQuery || window.$;
		let doctorName = findAppointmentDoctorName(appointmentData.doctor_id, options.appointments || []);

		if (!isUsableDoctorName(doctorName)) {
			if (target$) {
				doctorName = target$(options.isEdit ? '#editDoctor option:selected' : '#addDoctor option:selected').text();
			}
			if (!isUsableDoctorName(doctorName)) doctorName = 'Bác sĩ được chọn';
		}

		return doctorName;
	}

	function findAppointmentDoctorName(doctorId, appointments) {
		if (!doctorId || appointments.length === 0) return '';
		const appointment = appointments.find(item => String(item.doctor_id) === String(doctorId));
		return (appointment && appointment.doctor_name) || '';
	}

	function isUsableDoctorName(name) {
		return Boolean(name) && name.trim() !== '' && !name.includes('Chọn');
	}

	function buildConflictMessage(conflictInfo, appointmentData = {}, options = {}) {
		const doctorName = resolveDoctorName(appointmentData, options);
		if (conflictInfo && conflictInfo.conflict_type === 'busy_schedule') {
			return `${doctorName} đang bận vào thời gian ${normalizeTimeRange(conflictInfo.time_range)}`;
		}

		if (conflictInfo && conflictInfo.conflict_type === 'appointment') {
			return `${doctorName} đang có lịch khám cho ${conflictInfo.patient_name} vào ${conflictInfo.appointment_date}`;
		}

		const timeRange = conflictInfo && conflictInfo.time_range ? conflictInfo.time_range : 'thời gian được chọn';
		return `${doctorName} đang bận vào thời gian ${timeRange}`;
	}

	function buildConflictPopupHtml(message) {
		return `
      <div class="conflict-popup-overlay">
        <div class="conflict-popup">
          <div class="conflict-popup-content">
            <div class="conflict-popup-icon">
              <i class="bi bi-exclamation-triangle"></i>
            </div>
            <div class="conflict-popup-message">
              ${escapeHtml(message) || 'Có xung đột lịch hẹn'}
            </div>
            <div class="conflict-popup-buttons">
				<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn appointment-button appointment-button--neutral appointment-button--sm" id="conflictCancelBtn">
                <i class="bi bi-x-circle me-1"></i>Hủy
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
	}

	function showConflictWarning(conflictInfo, appointmentData = {}, options = {}) {
		const target$ = options.$ || window.jQuery || window.$;
		if (!target$) return;

		const message = buildConflictMessage(conflictInfo, appointmentData, options);
		const popupHtml = buildConflictPopupHtml(message);

		target$('.conflict-popup-overlay').remove();
		target$('body').append(popupHtml);
		target$('#conflictCancelBtn').on('click', function () {
			target$('.conflict-popup-overlay').remove();
		});
		target$('.conflict-popup-overlay').on('click', function (event) {
			if (event.target === this) {
				target$(this).remove();
			}
		});
	}

	window.AppointmentManagementConflictWarningUtils = {
		buildConflictMessage,
		buildConflictPopupHtml,
		normalizeTimeRange,
		resolveDoctorName,
		showConflictWarning
	};
})(window);
