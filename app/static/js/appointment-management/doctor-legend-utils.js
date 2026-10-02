function getDoctorLegendColor(doctor) {
	return window.QLPKAppointmentCalendar.resolveDoctorDotColor(doctor?.id, doctor ? [doctor] : []);
}

function createLegendItem(doc, doctor, index) {
	const color = getDoctorLegendColor(doctor, index);
	const item = doc.createElement('div');
	item.className = 'appt-doctor-legend-item';

	const dot = doc.createElement('span');
	dot.className = 'appt-doctor-legend-dot';
	dot.style.setProperty('background-color', color);

	const name = doc.createElement('span');
	name.className = 'appt-doctor-legend-name';
	name.textContent = doctor.name || '';

	item.append(dot, name);
	return item;
}

function clearContainer(container) {
	container?.replaceChildren();
}

function renderLegendItems(doc, doctors, doctorContainer, psychContainer) {
	(doctors || []).forEach((doctor, index) => {
		const item = createLegendItem(doc, doctor, index);
		const role = (doctor.role || '').toUpperCase();
		if (role === 'PSYCHOLOGIST' && psychContainer) {
			psychContainer.appendChild(item);
		} else if (doctorContainer) {
			doctorContainer.appendChild(item);
		}
	});
}

function clearDoctorDropdown(options) {
	const doctorFilter = (options.document || window.document).getElementById('doctorFilter');
	if (doctorFilter) doctorFilter.value = '';
}

function bindRoleSection(section, role, currentLabel, otherLabel, options) {
	if (!section) return;

	section.style.setProperty('cursor', 'pointer');

	// Gỡ handler click cũ trước khi gắn lại để tránh chồng listener qua nhiều lần render
	// (thay cho cách clone-replace node vốn gây reflow và mất focus).
	if (section._apptLegendClickHandler) {
		section.removeEventListener('click', section._apptLegendClickHandler);
	}

	const handler = function () {
		const currentRoleFilter = options.getSelectedRoleFilter ? options.getSelectedRoleFilter() : '';
		if (currentRoleFilter === role) {
			if (options.setSelectedRoleFilter) options.setSelectedRoleFilter('');
			if (currentLabel) currentLabel.classList.remove('active');
		} else {
			if (options.setSelectedRoleFilter) options.setSelectedRoleFilter(role);
			if (currentLabel) currentLabel.classList.add('active');
			if (otherLabel) otherLabel.classList.remove('active');
		}

		clearDoctorDropdown(options);
		if (options.setSelectedDoctor) options.setSelectedDoctor('');
		if (options.refreshView) options.refreshView();
	};
	section._apptLegendClickHandler = handler;
	section.addEventListener('click', handler);
}

function buildDoctorLegend(options = {}) {
	const doc = options.document || window.document;
	const doctors = options.doctors || [];
	const doctorContainer = doc.getElementById('doctorLegendDoctor');
	const psychContainer = doc.getElementById('doctorLegendPsychologist');

	clearContainer(doctorContainer);
	clearContainer(psychContainer);
	if (!doctors.length) return null;

	renderLegendItems(doc, doctors, doctorContainer, psychContainer);

	const doctorSection = doctorContainer ? doctorContainer.closest('.appt-panel-section') : null;
	const psychSection = psychContainer ? psychContainer.closest('.appt-panel-section') : null;

	const doctorLabel = doctorSection ? doctorSection.querySelector('.appt-panel-label') : null;
	const psychLabel = psychSection ? psychSection.querySelector('.appt-panel-label') : null;

	bindRoleSection(doctorSection, 'DOCTOR', doctorLabel, psychLabel, options);
	bindRoleSection(psychSection, 'PSYCHOLOGIST', psychLabel, doctorLabel, options);

	return {
		doctorSection,
		psychSection
	};
}

const AppointmentManagementDoctorLegendUtils = {
	buildDoctorLegend,
	createLegendItem,
	getDoctorLegendColor,
	renderLegendItems
};

export { AppointmentManagementDoctorLegendUtils };
