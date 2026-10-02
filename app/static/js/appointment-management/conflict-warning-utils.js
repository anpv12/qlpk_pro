import { el, icon } from '../shared/dom.js';
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
	let doctorName = findAppointmentDoctorName(appointmentData.doctor_id, options.appointments || []);

	if (!isUsableDoctorName(doctorName)) {
		doctorName = document.getElementById(options.isEdit ? 'editDoctor' : 'addDoctor')?.selectedOptions[0]?.textContent || '';
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

function buildConflictPopup(message) {
	const cancel = el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn appointment-button appointment-button--neutral appointment-button--sm', id: 'conflictCancelBtn' },
		icon('bi-x-circle', 'me-1'), 'Hủy');
	const overlay = el('div', { class: 'conflict-popup-overlay' }, el('div', { class: 'conflict-popup' }, el('div', { class: 'conflict-popup-content' },
		el('div', { class: 'conflict-popup-icon' }, icon('bi-exclamation-triangle')),
		el('div', { class: 'conflict-popup-message' }, message || 'Có xung đột lịch hẹn'),
		el('div', { class: 'conflict-popup-buttons' }, cancel))));
	cancel.addEventListener('click', () => overlay.remove());
	// Click on the backdrop itself closes the popup
	overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
	return overlay;
}

function showConflictWarning(conflictInfo, appointmentData = {}, options = {}) {
	document.querySelectorAll('.conflict-popup-overlay').forEach(node => node.remove());
	document.body.append(buildConflictPopup(buildConflictMessage(conflictInfo, appointmentData, options)));
}

const AppointmentManagementConflictWarningUtils = {
	buildConflictMessage,
	buildConflictPopup,
	normalizeTimeRange,
	resolveDoctorName,
	showConflictWarning
};

export { AppointmentManagementConflictWarningUtils };
