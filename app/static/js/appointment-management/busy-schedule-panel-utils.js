import { el, icon } from '../shared/dom.js';

function formatDateTime(value) {
	return new Date(value).toLocaleString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

// One "label: value" row of a busy-schedule popup
function busyInfoRow(label, value, rowClass = 'row') {
	return el('div', { class: rowClass }, el('div', { class: 'col-4' }, el('strong', {}, label)), el('div', { class: 'col-8' }, value ?? ''));
}

function buildBusyScheduleItem(schedule) {
	return el('div', { class: 'busy-schedule-item appointment-busy-schedule-card mb-3 p-3 border rounded' },
		busyInfoRow('Thời gian:', `${formatDateTime(schedule.start_datetime)} - ${formatDateTime(schedule.end_datetime)}`),
		busyInfoRow('Lý do:', schedule.reason),
		busyInfoRow('Ngày tạo:', schedule.created_at ? formatDateTime(schedule.created_at) : 'Không có thông tin'));
}

function buildDoctorBusyPopup(doctorId, doctorName, busySchedules) {
	const doctorSchedules = (busySchedules || []).filter(schedule => schedule.doctor_id === doctorId);
	const body = doctorSchedules.length
		? doctorSchedules.map(buildBusyScheduleItem)
		: el('div', { class: 'text-center text-muted py-4' },
			icon('bi-check-circle', 'appointment-doctor-free-icon'),
			el('h5', { class: 'mt-3 mb-2 appointment-subsection-title' }, 'Bác sĩ rảnh'),
			el('p', { class: 'mb-0' }, `${doctorName ?? ''} hiện tại không có lịch bận nào`));
	return el('div', { class: 'doctor-busy-popup' },
		el('div', { class: 'popup-header' },
			el('h6', { class: 'appointment-popup-title' }, icon('bi-person-circle', 'me-2'), `Lịch bận của ${doctorName ?? ''}`),
			el('button', { type: 'button', class: 'btn-close', 'data-doctor-busy-action': 'close' })),
		el('div', { class: 'popup-body' }, body),
		el('div', { class: 'popup-footer' },
			el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn appointment-button appointment-button--neutral appointment-button--sm', 'data-doctor-busy-action': 'close' }, 'Đóng')));
}

const AppointmentManagementBusySchedulePanelUtils = {
	buildBusyScheduleItem,
	buildDoctorBusyPopup,
	busyInfoRow,
	formatDateTime
};

export { AppointmentManagementBusySchedulePanelUtils };
