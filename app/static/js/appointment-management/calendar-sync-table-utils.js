import { el, icon } from '../shared/dom.js';
import { AppointmentManagementCalendarSyncStatusUtils } from './calendar-sync-status-utils.js';

const { syncBadge } = AppointmentManagementCalendarSyncStatusUtils;
const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

function getBadgeTexts(data = {}) {
	return {
		total: 'Tổng: ' + (data.total || 0),
		synced: 'Đã đồng bộ: ' + (data.synced || 0),
		missing: 'Thiếu: ' + (data.missing || 0),
		error: 'Lỗi: ' + (data.error || 0)
	};
}

function buildEmptyRow() {
	return el('tr', {}, el('td', { colspan: 7, class: 'appointment-sync-empty-cell' },
		icon('bi-calendar-x', 'appointment-empty-icon appointment-sync-empty-icon'), ' Không có lịch hẹn trong khoảng thời gian này'));
}

function getDateKey(appointment) {
	return appointment.date_key || appointment.datetime.split(' ').slice(1).join(' ');
}

function groupAppointmentsByDate(appointments) {
	const groupedByDate = {};
	(appointments || []).forEach(appointment => {
		const dateKey = getDateKey(appointment);
		if (!groupedByDate[dateKey]) {
			groupedByDate[dateKey] = [];
		}
		groupedByDate[dateKey].push(appointment);
	});
	return groupedByDate;
}

function getDayName(dateKey) {
	const parts = dateKey.split('/');
	const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
	return DAY_NAMES[dateObj.getDay()];
}

function buildDateHeaderRow(dateKey, appointments) {
	return el('tr', { class: 'sync-date-header appointment-sync-date-header', 'data-date-key': dateKey },
		el('td', { colspan: 7, class: 'appointment-table-strong' },
			icon('bi-chevron-down', 'collapse-icon appointment-sync-date-icon'), ' ',
			icon('bi-calendar3', 'appointment-sync-date-icon'),
			` ${getDayName(dateKey)} - ${dateKey} `,
			el('span', { class: 'qlpk-status appointment-sync-badge appointment-sync-badge--info appointment-sync-date-count' }, `${appointments.length} lịch hẹn`)));
}

function buildStatusBadge(appointment) {
	const badge = appointment.sync_status === 'synced'
		? syncBadge('neutral', 'bi-hourglass-split', 'Đang kiểm tra...')
		: syncBadge('warning', 'bi-exclamation-triangle', 'Thiếu');
	return el('div', { class: 'verify-icons', 'data-appt-id': appointment.id }, badge);
}

function buildActionButton(appointment) {
	if (!appointment.doctor_has_calendar) {
		return el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', class: 'btn appointment-button appointment-button--neutral appointment-button--sm action-btn appointment-calendar-action-nowrap', disabled: true },
			icon('bi-google'), ' Chưa kết nối');
	}
	if (appointment.sync_status === 'synced') {
		return el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', class: 'btn appointment-button appointment-button--neutral appointment-button--sm action-btn', 'data-appt-id': appointment.id, disabled: true },
			icon('bi-hourglass-split'), ' Đang kiểm tra...');
	}
	return el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'btn appointment-button appointment-button--primary appointment-button--sm sync-single-btn action-btn', 'data-appt-id': appointment.id },
		icon('bi-arrow-repeat'), ' Đồng bộ');
}

function buildAppointmentRow(appointment, dateKey) {
	const googleIcon = appointment.doctor_has_calendar
		? el('i', { class: 'bi bi-google appointment-google-link-icon appointment-google-link-icon--connected', title: 'Đã liên kết Google Calendar' })
		: el('i', { class: 'bi bi-google appointment-google-link-icon appointment-google-link-icon--disconnected', title: 'Chưa liên kết Google Calendar' });
	return el('tr', { 'data-appt-id': appointment.id, 'data-sync-status': appointment.sync_status ?? '', 'data-date-key': dateKey },
		el('td', {}, el('input', { type: 'checkbox', class: 'form-check-input sync-checkbox', 'data-appt-id': appointment.id })),
		el('td', {}, el('strong', {}, appointment.time || appointment.datetime.split(' ')[0])),
		el('td', {}, `${appointment.duration || appointment.service_duration || '-'} phút`),
		el('td', {}, `${appointment.doctor_name ?? ''} `, googleIcon),
		el('td', {}, appointment.patient_name ?? ''),
		el('td', { class: 'sync-status-cell' }, buildStatusBadge(appointment)),
		el('td', {}, buildActionButton(appointment)));
}

function buildSyncTableRows(appointments) {
	const groupedByDate = groupAppointmentsByDate(appointments);
	return Object.keys(groupedByDate).flatMap(dateKey => [
		buildDateHeaderRow(dateKey, groupedByDate[dateKey]),
		...groupedByDate[dateKey].map(appointment => buildAppointmentRow(appointment, dateKey)),
	]);
}

function buildSyncTableView(data = {}) {
	const appointments = data.appointments || [];
	return {
		badgeTexts: getBadgeTexts(data),
		rows: appointments.length ? buildSyncTableRows(appointments) : [buildEmptyRow()],
		isEmpty: appointments.length === 0
	};
}

const AppointmentManagementCalendarSyncTableUtils = {
	buildActionButton,
	buildAppointmentRow,
	buildDateHeaderRow,
	buildEmptyRow,
	buildStatusBadge,
	buildSyncTableRows,
	buildSyncTableView,
	getBadgeTexts,
	getDateKey,
	groupAppointmentsByDate
};

export { AppointmentManagementCalendarSyncTableUtils };
