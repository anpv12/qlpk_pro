(function (window) {
	'use strict';

	function getAppointmentTitle(appointment) {
		const appointmentCategory = appointment.appointment_category || 'NEW';
		const categoryText = appointmentCategory === 'RE_EXAMINATION' ? '(Tái khám)' : '';
		const patientName = appointment.patient_full_name || appointment.full_name;
		return categoryText ? `${window.QLPKHtml.escape(patientName)}<br>${window.QLPKHtml.escape(categoryText)}` : `${window.QLPKHtml.escape(patientName)}`;
	}

	function getAppointmentTimeRange(appointment) {
		const startDate = new Date(appointment.appointment_date);
		const endDate = new Date(startDate.getTime() + (appointment.duration_minutes || 60) * 60000);
		const startTime = startDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
		const endTime = endDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
		return { startDate, endDate, startTime, endTime };
	}

	function buildCurrentAppointmentEvent(appointment) {
		const { startDate, endDate, startTime, endTime } = getAppointmentTimeRange(appointment);
		const appointmentCategory = appointment.appointment_category || 'NEW';

		return {
			id: `appt-${appointment.id}`,
			title: getAppointmentTitle(appointment),
			start: startDate.toISOString(),
			end: endDate.toISOString(),
			display: 'block',
			allDay: false,
			classNames: ['appointment-event', `status-${appointment.status.toLowerCase()}`],
			extendedProps: {
				type: 'appointment',
				appointmentId: appointment.id,
				patientName: appointment.patient_full_name || appointment.full_name,
				doctorName: appointment.doctor_name,
				doctorId: appointment.doctor_id,
				doctorAvatar: appointment.doctor_avatar,
				status: appointment.status,
				category: appointmentCategory,
				startTime,
				endTime,
				phone: appointment.patient_phone || appointment.phone,
				email: appointment.patient_email || appointment.email,
				notes: appointment.notes || '',
				mainReason: appointment.main_reason || '',
				mainSymptoms: appointment.main_symptoms || ''
			}
		};
	}

	function buildCurrentHolidayEvent(holiday) {
		const holidayDate = new Date(holiday.date);
		holidayDate.setHours(8, 0, 0, 0);
		return {
			id: `holiday-${holiday.id}`,
			title: `🎉 ${holiday.name}`,
			start: holidayDate,
			end: new Date(holidayDate.getTime() + 60 * 60 * 1000),
			color: '#ff6b6b',
			textColor: '#fff',
			display: 'block',
			classNames: ['holiday-calendar', 'holiday-info'],
			extendedProps: {
				type: 'holiday',
				holidayId: holiday.id,
				holidayName: holiday.name
			}
		};
	}

	function buildCurrentAppointmentEvents(appointments) {
		return (appointments || []).map(buildCurrentAppointmentEvent);
	}

	function buildCurrentHolidayEvents(holidays) {
		return (holidays || []).map(buildCurrentHolidayEvent);
	}

	window.AppointmentManagementCalendarEventSourceUtils = {
		buildCurrentAppointmentEvent,
		buildCurrentAppointmentEvents,
		buildCurrentHolidayEvent,
		buildCurrentHolidayEvents,
		getAppointmentTitle,
		getAppointmentTimeRange
	};
})(window);
