(function (window) {
	'use strict';

	const FALLBACK_COLORS = ['#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#0099C6', '#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99'];

	function getDoctorLegendColor(doctor, index) {
		return (doctor && doctor.calendar_color) || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
	}

	function createLegendItem(doc, doctor, index) {
		const color = getDoctorLegendColor(doctor, index);
		const item = doc.createElement('div');
		item.className = 'appt-doctor-legend-item';

		const dot = doc.createElement('span');
		dot.className = 'appt-doctor-legend-dot';
		dot.style.backgroundColor = color;

		const name = doc.createElement('span');
		name.className = 'appt-doctor-legend-name';
		name.textContent = doctor.name || '';

		item.append(dot, name);
		return item;
	}

	function clearContainer(container) {
		if (container) container.innerHTML = '';
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
		const target$ = options.$ || window.jQuery || window.$;
		if (target$) {
			target$('#doctorFilter').val('');
			return;
		}

		const doc = options.document || window.document;
		const doctorFilter = doc && doc.getElementById('doctorFilter');
		if (doctorFilter) doctorFilter.value = '';
	}

	function bindRoleSection(section, role, currentLabel, otherLabel, options) {
		if (!section) return;

		section.style.cursor = 'pointer';

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

	window.AppointmentManagementDoctorLegendUtils = {
		buildDoctorLegend,
		createLegendItem,
		getDoctorLegendColor,
		renderLegendItems
	};
})(window);
