import { AppointmentManagementFeedbackUtils } from './feedback-utils.js';
import { rebind, setProp, toggleClass } from '../shared/dom-query.js';
import { el, icon, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
const statusBadge = (variant, className, iconName, text) => el('span', { class: `qlpk-status qlpk-status--${variant} ${className}` }, icon(iconName), ` ${text}`);

function buildConnectedStatus() {
	return statusBadge('success', 'appointment-calendar-connected-badge', 'bi-check-circle-fill', 'Google Calendar đã kết nối');
}

function buildCheckingStatus() {
	return statusBadge('info', 'appointment-calendar-status-badge appointment-calendar-status-badge--checking', 'bi-arrow-repeat', 'Đang kiểm tra Calendar');
}

function buildUnknownStatus() {
	return statusBadge('warning', 'appointment-calendar-status-badge appointment-calendar-status-badge--unknown', 'bi-exclamation-triangle', 'Chưa xác định Calendar');
}

function setCalendarStatus(content, connectVisible, disconnectVisible) {
	const status = document.getElementById('calendarStatus');
	if (status) replace(status, content);
	// [hidden] (forced by Bootstrap) beats the button's display rule, which .appointment-hidden cannot
	[['#connectGoogleCalendarBtn', connectVisible], ['#disconnectGoogleCalendarBtn', disconnectVisible]].forEach(([selector, visible]) => {
		toggleClass(selector, 'appointment-hidden', !visible);
		setProp(selector, 'hidden', !visible);
	});
}

function applyCalendarStatusUi(isConnected) {
	if (isConnected) setCalendarStatus(buildConnectedStatus(), false, true);
	else setCalendarStatus(null, true, false);
}

function showCalendarToast(options, type, message) {
	if (typeof options.showCustomToast === 'function') {
		options.showCustomToast(type, message);
		return;
	}
	AppointmentManagementFeedbackUtils?.showToast({
		type,
		message,
		window: options.window
	});
}

async function loadCalendarStatus(options) {
	if (!options.hasSession()) {
		setCalendarStatus(buildUnknownStatus(), false, false);
		return;
	}
	setCalendarStatus(buildCheckingStatus(), false, false);
	try {
		const data = await requestJson('/api/calendar/status');
		applyCalendarStatusUi(Boolean(data.connected && data.is_active));
	} catch (error) {
		if (error?.status === 401) return;
		setCalendarStatus(buildUnknownStatus(), false, false);
	}
}

async function connectGoogleCalendar(options) {
	if (!options.hasSession()) {
		showCalendarToast(options, 'warning', 'Vui lòng đăng nhập để kết nối Google Calendar');
		return;
	}
	let data;
	try {
		data = await requestJson('/api/calendar/connect/google/init');
	} catch (error) {
		if (error?.status === 401) {
			showCalendarToast(options, 'warning', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
			options.window.location.href = '/login.html';
		} else {
			showCalendarToast(options, 'error', 'Không thể kết nối Google Calendar. Vui lòng thử lại.');
		}
		return;
	}
	if (data.url) (options.window.top || options.window).location.href = data.url;
	else showCalendarToast(options, 'error', 'Không thể lấy authorization URL');
}

async function disconnectGoogleCalendar(options) {
	if (!options.hasSession()) return;
	try {
		await requestJson('/api/calendar/disconnect', { method: 'POST' });
	} catch {
		options.showCustomToast('error', 'Có lỗi xảy ra khi ngắt kết nối');
		return;
	}
	options.loadCalendarStatus();
	options.showCustomToast('success', 'Đã ngắt kết nối Google Calendar');
}

function getCalendarConnectionQueryEvent(search) {
	const urlParams = new URLSearchParams(search || '');
	if (urlParams.get('calendar_connected') === 'google') {
		return {
			message: 'Đã kết nối Google Calendar thành công!',
			type: 'success'
		};
	}
	if (urlParams.get('calendar_error')) {
		return {
			message: 'Không thể kết nối Google Calendar. Vui lòng thử lại.',
			type: 'error'
		};
	}
	return null;
}

function handleCalendarConnectionQuery(options) {
	const queryEvent = getCalendarConnectionQueryEvent(options.window.location.search);
	if (!queryEvent) return;

	options.window.history.replaceState({}, options.window.document.title, options.window.location.pathname);
	options.showCustomToast(queryEvent.type, queryEvent.message);
	if (queryEvent.type === 'success') {
		options.loadCalendarStatus();
	}
}

function bindCalendarConnectionButtons(options) {
	rebind('#connectGoogleCalendarBtn', 'click', 'appointmentCalendarConnection', () => connectGoogleCalendar(options));
	rebind('#disconnectGoogleCalendarBtn', 'click', 'appointmentCalendarConnection', () => disconnectGoogleCalendar(options));
}

// Called once the page DOM is ready
function initializeCalendarConnection(options) {
	bindCalendarConnectionButtons(options);
	handleCalendarConnectionQuery(options);
	options.loadCalendarStatus();
	options.onReady();
}

const AppointmentManagementCalendarConnectionUtils = {
	applyCalendarStatusUi,
	bindCalendarConnectionButtons,
	buildCheckingStatus,
	buildConnectedStatus,
	buildUnknownStatus,
	connectGoogleCalendar,
	disconnectGoogleCalendar,
	getCalendarConnectionQueryEvent,
	handleCalendarConnectionQuery,
	initializeCalendarConnection,
	loadCalendarStatus
};

export { AppointmentManagementCalendarConnectionUtils };
