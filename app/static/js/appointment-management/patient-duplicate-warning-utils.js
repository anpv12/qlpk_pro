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

	const COMPARISON_FIELDS = [
		{ key: 'full_name', label: 'Tên', isDate: false },
		{ key: 'phone', label: 'SĐT', isDate: false },
		{ key: 'id_number', label: 'CCCD', isDate: false },
		{ key: 'date_of_birth', label: 'Ngày sinh', isDate: true },
		{ key: 'email', label: 'Email', isDate: false },
		{ key: 'address', label: 'Địa chỉ', isDate: false }
	];

	function getFormatDateDisplay(formatDateDisplay) {
		if (typeof formatDateDisplay === 'function') return formatDateDisplay;
		if (typeof window.formatDateDisplay === 'function') return window.formatDateDisplay;
		return value => value || 'N/A';
	}

	function formatExistingValue(value, field, formatDateDisplay) {
		if (!value) return 'N/A';
		if (!field.isDate) return value || 'N/A';

		try {
			const dob = new Date(value);
			return getFormatDateDisplay(formatDateDisplay)(dob);
		} catch (e) {
			return value;
		}
	}

	function formatNewValue(value, field, formatDateDisplay) {
		if (!value) return 'N/A';
		if (!field.isDate) return value || 'N/A';

		try {
			if (typeof value === 'string' && value.includes('-')) {
				const dob = new Date(value);
				return getFormatDateDisplay(formatDateDisplay)(dob);
			}
			return value;
		} catch (e) {
			return value;
		}
	}

	function getDuplicateAppointmentStatusText(status) {
		return status === 'CONFIRMED' ? 'Đã xác nhận' :
			status === 'NO_SHOW' ? 'Không đến' :
				status === 'CANCELLED' ? 'Đã hủy' : 'Chờ xác nhận';
	}

	function buildExistingAppointmentsHtml(existingPatient) {
		let html = '<div class="patient-duplicate-appointments">';
		html += `<strong>Số lịch hẹn hiện có: <span class="patient-duplicate-appointments__count">${existingPatient.existing_appointments_count || 0}</span></strong>`;

		if (existingPatient.existing_appointments && existingPatient.existing_appointments.length > 0) {
			html += '<div class="patient-duplicate-appointments__list">';
			existingPatient.existing_appointments.forEach((apt, index) => {
				const aptDate = apt.appointment_date_formatted || (apt.appointment_date ? new Date(apt.appointment_date).toLocaleString('vi-VN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				}) : 'N/A');
				const doctorName = apt.doctor_name || apt.psychologist_name || 'N/A';
				const statusText = getDuplicateAppointmentStatusText(apt.status);
				html += '<div class="patient-duplicate-appointment">';
				html += `${index + 1}. <strong>${escapeHtml(aptDate)}</strong> - ${escapeHtml(doctorName)} <span class="patient-duplicate-appointment__status">(${statusText})</span>`;
				html += `</div>`;
			});
			html += '</div>';
		}
		html += '</div>';
		return html;
	}

	function buildPatientDuplicateDetailsHtml(response, options = {}) {
		const existingPatient = response.existing_patient;
		const allChanges = response.all_changes || {};
		const formatDateDisplay = options.formatDateDisplay;

		let html = '<div class="mt-3 patient-duplicate-details">';
		html += '<table class="patient-duplicate-table">';
		html += '<thead>';
		html += '<tr class="patient-duplicate-table__header-row">';
		html += '<th class="patient-duplicate-table__header"><strong>Hiện tại</strong></th>';
		html += '<th class="patient-duplicate-table__header"><strong>Thông tin mới</strong></th>';
		html += '</tr>';
		html += '</thead>';
		html += '<tbody>';

		COMPARISON_FIELDS.forEach(field => {
			const oldValue = existingPatient[field.key];
			const hasChange = Object.prototype.hasOwnProperty.call(allChanges, field.key);
			let newValue = hasChange ? allChanges[field.key].new : oldValue;
			let shouldHighlight = false;

			if (hasChange) {
				if (newValue && newValue !== '') {
					shouldHighlight = true;
				} else {
					newValue = oldValue;
					shouldHighlight = false;
				}
			}

			const oldValueFormatted = formatExistingValue(oldValue, field, formatDateDisplay);
			const newValueFormatted = formatNewValue(newValue, field, formatDateDisplay);
			const newValueClass = shouldHighlight ? ' patient-duplicate-table__value--changed' : '';

			html += '<tr>';
			html += `<td class="patient-duplicate-table__cell">${escapeHtml(oldValueFormatted)}</td>`;
			html += `<td class="patient-duplicate-table__cell${newValueClass}">${escapeHtml(newValueFormatted)}</td>`;
			html += '</tr>';
		});

		html += '</tbody>';
		html += '</table>';
		html += buildExistingAppointmentsHtml(existingPatient);
		html += '</div>';

		return html;
	}

	function buildPatientDuplicateWarningHtml(response, options = {}) {
		const message = response.message || 'Phát hiện bệnh nhân trùng với thông tin khác.';
		const detailsHtml = buildPatientDuplicateDetailsHtml(response, options);

		return `
			<div class="conflict-popup-overlay" id="patientDuplicateWarningOverlay">
				<div class="conflict-popup conflict-popup--patient-duplicate">
					<div class="conflict-popup-content">
						<div class="patient-duplicate-summary">
							<div class="conflict-popup-icon patient-duplicate-summary-icon">
								<i class="bi bi-exclamation-triangle-fill"></i>
							</div>
							<div class="conflict-popup-message patient-duplicate-summary-message">
								${escapeHtml(message)}
							</div>
						</div>
						${detailsHtml}
						<div class="patient-duplicate-note">
							<i class="bi bi-info-circle"></i> <strong>Lưu ý:</strong> Nếu xác nhận, thông tin bệnh nhân sẽ được cập nhật và tất cả các lịch hẹn cũ sẽ hiển thị thông tin mới.
						</div>
						<div class="conflict-popup-buttons patient-duplicate-buttons">
							<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn appointment-button appointment-button--neutral appointment-button--sm me-2" id="patientDuplicateCancelBtn">
								<i class="bi bi-x-circle me-1"></i>Hủy
							</button>
							<button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="btn appointment-button appointment-button--primary appointment-button--sm" id="patientDuplicateConfirmBtn">
								<i class="bi bi-check-circle me-1"></i>Xác nhận cập nhật
							</button>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	function showPatientDuplicateWarning(options) {
		const target$ = options.$;
		const popupHtml = buildPatientDuplicateWarningHtml(options.response, {
			formatDateDisplay: options.formatDateDisplay
		});

		target$('#patientDuplicateWarningOverlay').remove();
		target$('body').append(popupHtml);

		target$('#patientDuplicateCancelBtn').on('click', function () {
			target$('#patientDuplicateWarningOverlay').remove();
		});

		target$('#patientDuplicateConfirmBtn').on('click', function () {
			target$('#patientDuplicateWarningOverlay').remove();
			if (typeof options.onConfirm === 'function') {
				options.onConfirm(options.appointmentData);
			}
		});
	}

	window.AppointmentManagementPatientDuplicateWarningUtils = {
		buildExistingAppointmentsHtml,
		buildPatientDuplicateDetailsHtml,
		buildPatientDuplicateWarningHtml,
		formatExistingValue,
		formatNewValue,
		getDuplicateAppointmentStatusText,
		showPatientDuplicateWarning
	};
})(window);
