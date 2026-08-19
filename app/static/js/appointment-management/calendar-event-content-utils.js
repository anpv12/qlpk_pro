(function (window) {
	'use strict';

	const FALLBACK_COLORS = ['#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#0099C6', '#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99'];

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function resolveDoctorDotColor(doctorId, doctors) {
		let dotColor = '';
		if (doctorId && doctors && doctors.length) {
			const doctor = doctors.find(item => item.id === doctorId);
			if (doctor && doctor.calendar_color) dotColor = doctor.calendar_color;
		}

		if (!dotColor) {
			const doctorIndex = doctors ? doctors.findIndex(item => item.id === doctorId) : -1;
			dotColor = doctorIndex >= 0 ? FALLBACK_COLORS[doctorIndex % FALLBACK_COLORS.length] : FALLBACK_COLORS[0];
		}

		return dotColor;
	}

	function buildHolidayEventContent(event) {
		const holidayName = event.title;
		return {
			html: `
              <div class="holiday-date">
                <div class="holiday-content">
                  <div class="holiday-icon"></div>
                  <div class="holiday-text">${escapeHtml(holidayName)}</div>
                </div>
              </div>
            `
		};
	}

	function buildAppointmentEventContent(arg, options = {}) {
		const doc = options.document || window.document;
		const doctors = options.doctors || [];
		const patientName = arg.event.extendedProps.patientName || arg.event.title;
		const doctorName = arg.event.extendedProps.doctorName || '';
		const doctorId = arg.event.extendedProps.doctorId;

		const eventContent = doc.createElement('div');
		eventContent.className = 'fc-event-compact';

		if (doctorName) {
			const dotColor = resolveDoctorDotColor(doctorId, doctors);
			const dot = doc.createElement('span');
			dot.className = 'fc-doc-dot';
			dot.title = doctorName;
			dot.style.backgroundColor = dotColor;
			eventContent.appendChild(dot);
		}

		if (arg.timeText) {
			const time = doc.createElement('span');
			time.className = 'fc-event-compact-time';
			time.textContent = arg.timeText;
			eventContent.appendChild(time);
		}

		const title = doc.createElement('span');
		title.className = 'fc-event-compact-title';
		title.textContent = patientName;
		eventContent.appendChild(title);

		return {
			domNodes: [eventContent]
		};
	}

	function buildEventContent(arg, options = {}) {
		if (arg.event.extendedProps.type === 'holiday') {
			return buildHolidayEventContent(arg.event);
		}

		return buildAppointmentEventContent(arg, options);
	}

	window.AppointmentManagementCalendarEventContentUtils = {
		buildAppointmentEventContent,
		buildEventContent,
		buildHolidayEventContent,
		resolveDoctorDotColor
	};
})(window);
