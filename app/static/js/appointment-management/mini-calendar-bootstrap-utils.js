import { openAddAppointmentWithDate } from './page-open-add.js';
import { state } from './page-state.js';
const VIEW_CHANGED_EVENT = 'qlpk:appointments-view-changed';

function navigateCalendar(date) {
	state.calendar?.gotoDate(date);
}

function dateKey(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Ngày có lịch hẹn theo danh sách đang hiển thị (đã áp bộ lọc bác sĩ/tìm kiếm).
function appointmentDays() {
	const appointments = state.viewAppointments || [];
	const days = new Set();
	appointments.forEach(appointment => {
		const value = String(appointment?.appointment_date || '');
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) days.add(value.slice(0, 10));
	});
	return days;
}

// Tiêu đề "Tháng 9, 2026" giữa hai mũi tên (thay dropdown tháng/năm của flatpickr).
function renderTitle(instance) {
	const host = instance.calendarContainer?.querySelector('.flatpickr-current-month');
	if (!host) return;
	let title = host.querySelector('.qlpk-mini-calendar__title');
	if (!title) {
		title = document.createElement('span');
		title.className = 'qlpk-mini-calendar__title';
		title.setAttribute('aria-live', 'polite');
		host.prepend(title);
	}
	title.textContent = `Tháng ${instance.currentMonth + 1}, ${instance.currentYear}`;
}

document.addEventListener('DOMContentLoaded', function () {
	if (typeof flatpickr !== 'function' || !document.getElementById('miniCalendar')) return;
	let markedDays = appointmentDays();

	const miniCal = flatpickr('#miniCalendar', {
		inline: true,
		locale: typeof flatpickr.l10ns.vn !== 'undefined' ? 'vn' : 'default',
		dateFormat: 'Y-m-d',
		defaultDate: new Date(),
		monthSelectorType: 'static',
		onReady: function (selectedDates, dateStr, instance) {
			renderTitle(instance);
		},
		onDayCreate: function (selectedDates, dateStr, instance, dayElem) {
			if (dayElem.dateObj && markedDays.has(dateKey(dayElem.dateObj))) dayElem.classList.add('has-appointments');
		},
		onChange: function (selectedDates, dateStr) {
			if (!selectedDates.length) return;
			navigateCalendar(selectedDates[0]);
			openAddAppointmentWithDate(dateStr);
		},
		onMonthChange: function (selectedDates, dateStr, instance) {
			renderTitle(instance);
			navigateCalendar(new Date(instance.currentYear, instance.currentMonth, 1));
		},
		onYearChange: function (selectedDates, dateStr, instance) {
			renderTitle(instance);
			navigateCalendar(new Date(instance.currentYear, instance.currentMonth, 1));
		}
	});

	document.addEventListener(VIEW_CHANGED_EVENT, function () {
		markedDays = appointmentDays();
		miniCal.redraw();
		renderTitle(miniCal);
	});
});
