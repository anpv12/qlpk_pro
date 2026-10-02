import { state } from './page-state.js';
import { fieldValue, hideModal } from '../shared/dom-query.js';
import { el, icon, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';

async function exportToExcel(options) {
	const payload = {};
	if (options.selectedDoctor) payload.doctor_id = options.selectedDoctor;
	if (options.selectedRoleFilter) payload.role_filter = options.selectedRoleFilter;
	let blob;
	try {
		const response = await window.fetch('/api/export', { method: 'POST', credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(payload) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		blob = await response.blob();
	} catch {
		options.showCustomToast('error', 'Không thể xuất dữ liệu. Vui lòng thử lại.');
		return;
	}
	const url = window.URL.createObjectURL(blob);
	const anchor = options.document.createElement('a');
	anchor.href = url;
	anchor.download = `lich_hen_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
	options.document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.URL.revokeObjectURL(url);
	options.showCustomToast('success', 'Xuất Excel thành công!');
}

const crumb = (...children) => el('li', { class: 'breadcrumb-item' }, ...children);
const activeCrumb = text => el('li', { class: 'breadcrumb-item active', 'aria-current': 'page' }, text);

function updateBreadcrumb(thirdLevel = null) {
	const home = crumb(el('a', { href: 'index.html' }, 'TRANG CHỦ'));
	const items = thirdLevel
		? [home, crumb(el('a', { href: '#', 'data-appointment-action': 'close-edit-modal' }, 'KHÁM BỆNH')), activeCrumb(thirdLevel)]
		: [home, activeCrumb('KHÁM BỆNH')];
	const breadcrumb = document.getElementById('mainBreadcrumb');
	if (breadcrumb) replace(breadcrumb, items);
}

function closeModalAndResetBreadcrumb(options) {
	hideModal('#editAppointmentModal');
	options.updateBreadcrumb();
}

async function sendEmailReminder(options) {
	const appointmentId = state.editAppointmentId;
	if (!appointmentId) {
		options.showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
		return;
	}
	if (!fieldValue('#editPatientEmail')?.trim()) {
		options.showCustomToast('warning', 'Bệnh nhân chưa có email. Vui lòng cập nhật thông tin email trước khi gửi nhắc lịch.');
		return;
	}
	if (!await options.CustomModal.confirm('Bạn có chắc muốn gửi Email nhắc lịch cho bệnh nhân này?', 'Xác nhận gửi email')) return;
	const button = document.getElementById('sendEmailReminderBtn');
	const original = button ? [...button.childNodes].map(node => node.cloneNode(true)) : [];
	if (button) {
		replace(button, icon('bi-hourglass-split', 'me-1'), 'Đang gửi...');
		button.disabled = true;
	}
	try {
		await requestJson(`/notifications/create-reminder/${appointmentId}`, { method: 'POST',
			json: { reminder_hours: 24, notification_type: 'email' }, signal: AbortSignal.timeout(5000) });
		options.showCustomToast('success', 'Đã gửi email nhắc lịch.');
	} catch {
		options.showCustomToast('error', 'Không thể gửi Email nhắc lịch. Vui lòng thử lại.');
	} finally {
		if (button) {
			replace(button, original);
			button.disabled = false;
		}
	}
}

const AppointmentManagementPageActionsUtils = {
	closeModalAndResetBreadcrumb,
	exportToExcel,
	sendEmailReminder,
	updateBreadcrumb
};

export { AppointmentManagementPageActionsUtils };
