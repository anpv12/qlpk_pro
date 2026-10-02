import { el, replace } from '../shared/dom.js';

function populateDoctorSelect(selector, doctors, placeholder) {
	document.querySelectorAll(selector).forEach(select => replace(select,
		el('option', { value: '' }, placeholder),
		(doctors || []).map(doctor => el('option', { value: doctor.id }, doctor.name || ''))));
}

function populateMainDoctorControls(doctors) {
	populateDoctorSelect('#doctorFilter', doctors, 'Tất cả bác sĩ');
	populateDoctorSelect("select[name='doctor_id']", doctors, 'Chọn bác sĩ');
}

// Doctors and psychologists see only their own appointments: the filter is locked to them.
function applyDoctorFilterSettings(options) {
	const currentUser = options.currentUser;
	const filterSelect = document.getElementById('doctorFilter');
	if (!currentUser || !filterSelect) return;
	const userRole = (currentUser.role || '').toUpperCase();
	const locked = userRole === 'DOCTOR' || userRole === 'PSYCHOLOGIST';
	filterSelect.disabled = locked;
	filterSelect.classList.toggle('appointment-doctor-filter-locked', locked);
	if (!locked) return;
	filterSelect.value = String(currentUser.id);
	if (typeof options.setSelectedDoctor === 'function') options.setSelectedDoctor(currentUser.id.toString());
	filterSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

const AppointmentManagementDoctorControlsUtils = {
	applyDoctorFilterSettings,
	populateDoctorSelect,
	populateMainDoctorControls
};

export { AppointmentManagementDoctorControlsUtils };
