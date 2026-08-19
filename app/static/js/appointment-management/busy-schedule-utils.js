(function (window) {
	'use strict';

	const REASON_TEXT = {
		meeting: 'Họp',
		leave: 'Nghỉ phép',
		external: 'Khám ngoài',
		training: 'Đào tạo',
		other: 'Khác'
	};

	function getReasonText(reason) {
		return REASON_TEXT[reason] || reason;
	}

	function isDoctorCurrentlyBusy(busySchedules, now = new Date()) {
		if (!busySchedules || busySchedules.length === 0) return false;

		return busySchedules.some(schedule => {
			const startTime = new Date(schedule.start_datetime);
			const endTime = new Date(schedule.end_datetime);
			return now >= startTime && now <= endTime;
		});
	}

	function isDoctorFutureBusy(busySchedules, now = new Date()) {
		if (!busySchedules || busySchedules.length === 0) return false;

		return busySchedules.some(schedule => {
			const startTime = new Date(schedule.start_datetime);
			const endTime = new Date(schedule.end_datetime);
			return startTime > now && endTime >= now;
		});
	}

	function filterActiveBusySchedules(busySchedules, now = new Date()) {
		if (!busySchedules || busySchedules.length === 0) return [];

		return busySchedules.filter(schedule => {
			const endTime = new Date(schedule.end_datetime);
			return endTime >= now;
		});
	}

	window.AppointmentManagementBusyScheduleUtils = {
		filterActiveBusySchedules,
		getReasonText,
		isDoctorCurrentlyBusy,
		isDoctorFutureBusy
	};
})(window);
