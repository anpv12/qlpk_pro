import { AppointmentManagementCalendarDateUtils } from './calendar-date-utils.js';
import { QLPKSearchNormalization } from '../shared/search-normalization.js';
function getAppointmentDate(appointment) {
	// Dùng ngày theo giờ địa phương để khớp với calendar (timeZone: 'local')
	// và với fromDate/toDate lấy từ input ngày (cũng là ngày local).
	return AppointmentManagementCalendarDateUtils.toLocalDateString(appointment.appointment_date);
}

function matchesDoctorFilter(appointment, selectedDoctor, userRole) {
	if (!selectedDoctor) return true;

	if (userRole === 'PSYCHOLOGIST') {
		const matchesPsychologist = String(appointment.psychologist_id) === String(selectedDoctor);
		const matchesDoctor = String(appointment.doctor_id) === String(selectedDoctor);
		return matchesPsychologist || matchesDoctor;
	}

	return String(appointment.doctor_id) === String(selectedDoctor);
}

function matchesRoleFilter(appointment, selectedRoleFilter, doctors) {
	if (!selectedRoleFilter) return true;

	const doctorIds = (doctors || [])
		.filter(doctor => (doctor.role || '').toUpperCase() === selectedRoleFilter)
		.map(doctor => String(doctor.id));
	const matchesDoctor = doctorIds.includes(String(appointment.doctor_id));
	const matchesPsychologist = doctorIds.includes(String(appointment.psychologist_id));
	return matchesDoctor || matchesPsychologist;
}

function matchesSearch(appointment, searchKeyword) {
	if (!searchKeyword) return true;

	const normalizeSearchText = value => QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
	const searchLower = normalizeSearchText(searchKeyword);
	const nameMatch = normalizeSearchText(appointment.patient_full_name || appointment.full_name).includes(searchLower);
	const phoneMatch = normalizeSearchText(appointment.phone).includes(searchLower);
	return nameMatch || phoneMatch;
}

function matchesDateRange(appointment, fromDate, toDate) {
	if (!fromDate && !toDate) return true;

	const appointmentDate = getAppointmentDate(appointment);
	if (fromDate && appointmentDate < fromDate) return false;
	if (toDate && appointmentDate > toDate) return false;
	return true;
}

function filterAppointments(appointments, filters = {}, options = {}) {
	return (appointments || []).filter(appointment => {
		if (!matchesDoctorFilter(appointment, filters.selectedDoctor, filters.userRole)) return false;
		if (options.includeRoleFilter && !matchesRoleFilter(appointment, filters.selectedRoleFilter, filters.doctors)) return false;
		if (options.includeStatusFilter !== false && filters.statusFilter && appointment.status !== filters.statusFilter) return false;
		if (filters.typeFilter && appointment.appointment_type !== filters.typeFilter) return false;
		if (!matchesDateRange(appointment, filters.fromDate, filters.toDate)) return false;
		if (!matchesSearch(appointment, filters.searchKeyword)) return false;
		return true;
	});
}

function countByStatus(appointments) {
	const counts = {
		SCHEDULED: 0,
		CONFIRMED: 0,
		NO_SHOW: 0,
		CANCELLED: 0
	};

	(appointments || []).forEach(appointment => {
		if (Object.prototype.hasOwnProperty.call(counts, appointment.status)) {
			counts[appointment.status] += 1;
		}
	});

	return counts;
}

const AppointmentManagementFilterUtils = {
	countByStatus,
	filterAppointments,
	matchesDateRange,
	matchesDoctorFilter,
	matchesRoleFilter,
	matchesSearch
};

export { AppointmentManagementFilterUtils };
