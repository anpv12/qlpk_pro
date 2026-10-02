import { el, icon } from '../shared/dom.js';
import { AppointmentManagementBusySchedulePanelUtils } from './busy-schedule-panel-utils.js';

const { busyInfoRow } = AppointmentManagementBusySchedulePanelUtils;

function formatDateTime(value) {
	if (!value) return 'Không có thông tin';
	return new Date(value).toLocaleString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function buildBusySchedulePopup(event) {
	const props = event.extendedProps || {};
	return el('div', { class: 'busy-schedule-popup' },
		el('div', { class: 'popup-header' },
			el('h6', { class: 'appointment-popup-title' }, icon('bi-calendar-x', 'me-2'), 'Lịch bận của bác sĩ'),
			el('button', { type: 'button', class: 'btn-close', 'data-busy-schedule-action': 'close' })),
		el('div', { class: 'popup-body' },
			busyInfoRow('Bác sĩ:', props.doctorName, 'row mb-2'),
			busyInfoRow('Thời gian:', `${formatDateTime(event.start)} - ${formatDateTime(event.end)}`, 'row mb-2'),
			busyInfoRow('Lý do:', props.reason, 'row mb-2'),
			busyInfoRow('Ngày tạo:', formatDateTime(props.created_at), 'row mb-2')),
		el('div', { class: 'popup-footer' },
			el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn appointment-button appointment-button--neutral appointment-button--sm', 'data-busy-schedule-action': 'close' }, 'Đóng')));
}

// Overlay fades in on the next frame (.show) and is removed after the fade-out transition
function showOverlay(className, content) {
	const overlay = el('div', { class: className }, content);
	document.body.append(overlay);
	setTimeout(() => overlay.classList.add('show'), 10);
}

function closeOverlay(selector) {
	const overlays = [...document.querySelectorAll(selector)];
	overlays.forEach(overlay => overlay.classList.remove('show'));
	setTimeout(() => overlays.forEach(overlay => overlay.remove()), 300);
}

function showBusySchedulePopup(event) {
	showOverlay('busy-schedule-overlay', buildBusySchedulePopup(event));
}

function closeBusySchedulePopup() {
	closeOverlay('.busy-schedule-overlay');
}

function showDoctorBusySchedules(panelUtils, doctorId, doctorName, currentBusySchedules) {
	showOverlay('doctor-busy-overlay', panelUtils.buildDoctorBusyPopup(doctorId, doctorName, currentBusySchedules));
}

function closeDoctorBusyPopup() {
	closeOverlay('.doctor-busy-overlay');
}

const AppointmentManagementBusySchedulePopupUtils = {
	buildBusySchedulePopup,
	closeBusySchedulePopup,
	closeDoctorBusyPopup,
	formatDateTime,
	showBusySchedulePopup,
	showDoctorBusySchedules
};

export { AppointmentManagementBusySchedulePopupUtils };
