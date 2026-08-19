(function (window) {
	'use strict';

	function toLocalDateString(date) {
		if (!date) return '';

		const localDate = new Date(date);
		const year = localDate.getFullYear();
		const month = String(localDate.getMonth() + 1).padStart(2, '0');
		const day = String(localDate.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function getWeekDates(date) {
		const sourceDate = new Date(date);
		const monday = new Date(sourceDate.setDate(sourceDate.getDate() - sourceDate.getDay() + 1));
		const days = [];
		for (let index = 0; index < 7; index += 1) {
			const day = new Date(monday);
			day.setDate(monday.getDate() + index);
			days.push(toLocalDateString(day));
		}
		return days;
	}

	function getCalendarDateRange(calendar) {
		if (!calendar) return { dateFrom: null, dateTo: null };

		const view = calendar.view;
		const start = view.activeStart || view.currentStart;
		const end = view.activeEnd || view.currentEnd;
		const dateFrom = toLocalDateString(start);
		const dateTo = toLocalDateString(end);
		return { dateFrom, dateTo };
	}

	function toLocalISOString(date) {
		if (!date) return '';

		const localDate = new Date(date);
		const year = localDate.getFullYear();
		const month = String(localDate.getMonth() + 1).padStart(2, '0');
		const day = String(localDate.getDate()).padStart(2, '0');
		const hours = String(localDate.getHours()).padStart(2, '0');
		const minutes = String(localDate.getMinutes()).padStart(2, '0');
		const seconds = String(localDate.getSeconds()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
	}

	window.AppointmentManagementCalendarDateUtils = {
		getCalendarDateRange,
		getWeekDates,
		toLocalDateString,
		toLocalISOString
	};
})(window);
