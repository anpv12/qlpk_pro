// Quick time presets for the busy schedule form; buttons carry data-quick-time="morning|afternoon|evening|allday|2hours".
const HOUR = 60 * 60 * 1000;
const PRESETS = {
	morning: today => [today + 8 * HOUR, today + 12 * HOUR],
	afternoon: today => [today + 13 * HOUR, today + 17 * HOUR],
	evening: today => [today + 18 * HOUR, today + 22 * HOUR],
	allday: today => [today + 8 * HOUR, today + 23 * HOUR + 59 * 60 * 1000],
	'2hours': (today, now) => [now, now + 2 * HOUR],
};

export function formatForInput(date) {
	const pad = value => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Writes both datetime fields through the Flatpickr helper when present, else as plain input values.
export function setRange(startTime, endTime) {
	const start = document.querySelector('input[name="start_datetime"]');
	const end = document.querySelector('input[name="end_datetime"]');
	if (typeof window.setDatepickerValue === 'function') {
		if (start) window.setDatepickerValue(start, startTime, true);
		if (end) window.setDatepickerValue(end, endTime, true);
		return;
	}
	if (start) start.value = formatForInput(startTime);
	if (end) end.value = formatForInput(endTime);
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
