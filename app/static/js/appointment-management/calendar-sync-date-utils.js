function pad2(value) {
	return String(value).padStart(2, '0');
}

function formatDateForDisplay(date) {
	if (!date) return '';
	const sourceDate = new Date(date);
	return `${pad2(sourceDate.getDate())}/${pad2(sourceDate.getMonth() + 1)}/${sourceDate.getFullYear()}`;
}

function parseDisplayDateToApi(value) {
	if (!value) return null;
	const rawValue = String(value).trim();
	if (!rawValue) return null;
	if (!rawValue.includes('/')) return rawValue;

	const parts = rawValue.split('/');
	if (parts.length !== 3) return rawValue;
	return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function getCurrentWeekRange(today) {
	const sourceDate = today ? new Date(today) : new Date();
	const dayOfWeek = sourceDate.getDay();
	const monday = new Date(sourceDate);
	monday.setDate(sourceDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

	const sunday = new Date(monday);
	sunday.setDate(monday.getDate() + 6);

	return {
		fromDate: monday,
		toDate: sunday
	};
}

function getPresetDateRange(preset, today) {
	const sourceDate = today ? new Date(today) : new Date();

	if (preset === 'today') {
		return {
			fromDate: new Date(sourceDate),
			toDate: new Date(sourceDate)
		};
	}

	if (preset === 'week') {
		return getCurrentWeekRange(sourceDate);
	}

	if (preset === 'month') {
		return {
			fromDate: new Date(sourceDate.getFullYear(), sourceDate.getMonth(), 1),
			toDate: new Date(sourceDate.getFullYear(), sourceDate.getMonth() + 1, 0)
		};
	}

	return {
		fromDate: null,
		toDate: null
	};
}

function formatDateRangeForDisplay(dateRange) {
	return {
		fromDate: formatDateForDisplay(dateRange && dateRange.fromDate),
		toDate: formatDateForDisplay(dateRange && dateRange.toDate)
	};
}

const AppointmentManagementCalendarSyncDateUtils = {
	formatDateForDisplay,
	formatDateRangeForDisplay,
	getCurrentWeekRange,
	getPresetDateRange,
	parseDisplayDateToApi
};

export { AppointmentManagementCalendarSyncDateUtils };
