import { el, icon } from '../shared/dom.js';

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

const DUPLICATE_APPOINTMENT_STATUS_TEXT = { CONFIRMED: 'Đã xác nhận', NO_SHOW: 'Không đến', CANCELLED: 'Đã hủy' };

function getDuplicateAppointmentStatusText(status) {
	return DUPLICATE_APPOINTMENT_STATUS_TEXT[status] || 'Chờ xác nhận';
}

function formatAppointmentDate(apt) {
	if (apt.appointment_date_formatted) return apt.appointment_date_formatted;
	return apt.appointment_date
		? new Date(apt.appointment_date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
		: 'N/A';
}

function buildExistingAppointments(existingPatient) {
	const appointments = existingPatient.existing_appointments || [];
	return el('div', { class: 'patient-duplicate-appointments' },
		el('strong', {}, 'Số lịch hẹn hiện có: ', el('span', { class: 'patient-duplicate-appointments__count' }, existingPatient.existing_appointments_count || 0)),
		appointments.length ? el('div', { class: 'patient-duplicate-appointments__list' }, appointments.map((apt, index) => el('div', { class: 'patient-duplicate-appointment' },
			`${index + 1}. `, el('strong', {}, formatAppointmentDate(apt)), ` - ${apt.doctor_name || apt.psychologist_name || 'N/A'} `,
			el('span', { class: 'patient-duplicate-appointment__status' }, `(${getDuplicateAppointmentStatusText(apt.status)})`)))) : null);
}

// Current vs incoming patient values; changed non-empty values are highlighted
function buildPatientDuplicateDetails(response, options = {}) {
	const existingPatient = response.existing_patient;
	const allChanges = response.all_changes || {};
	const rows = COMPARISON_FIELDS.map(field => {
		const oldValue = existingPatient[field.key];
		const change = Object.prototype.hasOwnProperty.call(allChanges, field.key) ? allChanges[field.key].new : undefined;
		const shouldHighlight = Boolean(change);
		const newValue = shouldHighlight ? change : oldValue;
		return el('tr', {},
			el('td', { class: 'patient-duplicate-table__cell' }, formatExistingValue(oldValue, field, options.formatDateDisplay)),
			el('td', { class: shouldHighlight ? 'patient-duplicate-table__cell patient-duplicate-table__value--changed' : 'patient-duplicate-table__cell' },
				formatNewValue(newValue, field, options.formatDateDisplay)));
	});
	const header = label => el('th', { class: 'patient-duplicate-table__header' }, el('strong', {}, label));
	return el('div', { class: 'mt-3 patient-duplicate-details' },
		el('table', { class: 'patient-duplicate-table' },
			el('thead', {}, el('tr', { class: 'patient-duplicate-table__header-row' }, header('Hiện tại'), header('Thông tin mới'))),
			el('tbody', {}, rows)),
		buildExistingAppointments(existingPatient));
}

function buildPatientDuplicateWarning(response, options = {}) {
	const button = (variant, className, id, iconName, label) => el('button', { 'data-qlpk-button': variant, 'data-qlpk-button-variant': variant === 'execute' ? 'solid' : 'soft', type: 'button', class: `btn appointment-button ${className} appointment-button--sm${id === 'patientDuplicateCancelBtn' ? ' me-2' : ''}`, id },
		icon(iconName, 'me-1'), label);
	return el('div', { class: 'conflict-popup-overlay', id: 'patientDuplicateWarningOverlay' },
		el('div', { class: 'conflict-popup conflict-popup--patient-duplicate' }, el('div', { class: 'conflict-popup-content' },
			el('div', { class: 'patient-duplicate-summary' },
				el('div', { class: 'conflict-popup-icon patient-duplicate-summary-icon' }, icon('bi-exclamation-triangle-fill')),
				el('div', { class: 'conflict-popup-message patient-duplicate-summary-message' }, response.message || 'Phát hiện bệnh nhân trùng với thông tin khác.')),
			buildPatientDuplicateDetails(response, options),
			el('div', { class: 'patient-duplicate-note' }, icon('bi-info-circle'), ' ', el('strong', {}, 'Lưu ý:'),
				' Nếu xác nhận, thông tin bệnh nhân sẽ được cập nhật và tất cả các lịch hẹn cũ sẽ hiển thị thông tin mới.'),
			el('div', { class: 'conflict-popup-buttons patient-duplicate-buttons' },
				button('neutral', 'appointment-button--neutral', 'patientDuplicateCancelBtn', 'bi-x-circle', 'Hủy'), ' ',
				button('execute', 'appointment-button--primary', 'patientDuplicateConfirmBtn', 'bi-check-circle', 'Xác nhận cập nhật')))));
}

function showPatientDuplicateWarning(options) {
	document.getElementById('patientDuplicateWarningOverlay')?.remove();
	const overlay = buildPatientDuplicateWarning(options.response, { formatDateDisplay: options.formatDateDisplay });
	document.body.append(overlay);
	overlay.querySelector('#patientDuplicateCancelBtn').addEventListener('click', () => overlay.remove());
	overlay.querySelector('#patientDuplicateConfirmBtn').addEventListener('click', () => {
		overlay.remove();
		if (typeof options.onConfirm === 'function') options.onConfirm(options.appointmentData);
	});
}

const AppointmentManagementPatientDuplicateWarningUtils = {
	buildExistingAppointments,
	buildPatientDuplicateDetails,
	buildPatientDuplicateWarning,
	formatExistingValue,
	formatNewValue,
	getDuplicateAppointmentStatusText,
	showPatientDuplicateWarning
};

export { AppointmentManagementPatientDuplicateWarningUtils };
