// Quick time presets for the busy schedule form; buttons carry data-quick-time="morning|afternoon|evening|allday|2hours".
import { setDatepickerValue } from '../datepicker-init.js';

const HOUR = 60 * 60 * 1000;
const PRESETS = {
	morning: today => [today + 8 * HOUR, today + 12 * HOUR],
	afternoon: today => [today + 13 * HOUR, today + 17 * HOUR],
	evening: today => [today + 18 * HOUR, today + 22 * HOUR],
	allday: today => [today + 8 * HOUR, today + 23 * HOUR + 59 * 60 * 1000],
	'2hours': (today, now) => [now, now + 2 * HOUR],
};

// Writes both datetime fields through the shared datepicker helper (Flatpickr, or the plain value before it initialises).
export function setRange(startTime, endTime) {
	const start = document.querySelector('input[name="start_datetime"]');
	const end = document.querySelector('input[name="end_datetime"]');
	if (start) setDatepickerValue(start, startTime, true);
	if (end) setDatepickerValue(end, endTime, true);
}

export function setQuickTimeSelection(button) {
	document.querySelectorAll('#busyScheduleForm [data-quick-time]').forEach(item => {
		item.classList.remove('active');
		item.setAttribute('aria-pressed', 'false');
	});
	if (button) {
		button.classList.add('active');
		button.setAttribute('aria-pressed', 'true');
	}
}

export function setQuickTime(type, button) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const [start, end] = PRESETS[type](today, now.getTime());
	setRange(new Date(start), new Date(end));
	setQuickTimeSelection(button);
}
