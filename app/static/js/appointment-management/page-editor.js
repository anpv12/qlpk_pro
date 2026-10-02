import { state } from './page-state.js';
import { AppointmentManagementAddModalUiUtils } from './add-modal-ui-utils.js';
import { clearSelectedICDs } from './page-add-modal.js';
import { initializeCalendar, loadDoctorsForAdd } from './page-calendar.js';
import { loadPackages, loadServices } from './page-data.js';
import { AppointmentManagementCalendarEventSourceUtils } from './calendar-event-source-utils.js';
import { updateBusyDoctorsPanel } from './page-busy-sync.js';
import { AppointmentManagementStatusFormatUtils } from './status-format-utils.js';
import { AppointmentManagementPageActionsUtils } from './page-actions-utils.js';
import { afterDataChanged } from './page-view.js';
import { AppointmentManagementFeedbackUtils } from './feedback-utils.js';
import { addClass, fieldValue, rebindDelegate, removeClass, setText } from '../shared/dom-query.js';
import { requestJson } from '../shared/http-json.js';
// Modal thêm, sự kiện lịch, tóm tắt editor, breadcrumb, xóa, thông báo.

// Mở modal add với ngày đã chọn
function openAddModal(dateStr) {
	AppointmentManagementAddModalUiUtils.resetAddModalForOpen({
		dateStr,
		clearSelectedICDs: clearSelectedICDs,
		loadDoctorsForAdd: loadDoctorsForAdd,
		loadServices: loadServices,
		loadPackages: loadPackages
	});
}

// Cập nhật events cho calendar
function updateCalendarEvents() {

	if (!state.calendar) {
		initializeCalendar();
		if (!state.calendar) {
			return;
		}
	}

	// Sử dụng viewAppointments đã được filter để hiển thị lịch hẹn trên calendar
	const appointmentsToShow = state.viewAppointments;

	updateCalendarWithHolidaysAndBusySchedules(
		appointmentsToShow,
		state.currentCalendarHolidays,
		state.currentCalendarBusySchedules
	);
}

// Hàm cập nhật calendar với cả appointments, holidays và busy schedules
function updateCalendarWithHolidaysAndBusySchedules(appointmentsToShow, holidays, busySchedules) {
	const eventSourceUtils = AppointmentManagementCalendarEventSourceUtils;
	const appointmentEvents = eventSourceUtils.buildCurrentAppointmentEvents(appointmentsToShow);

	// Không hiển thị busy schedules trên calendar nữa
	// Thay vào đó sẽ hiển thị trong panel riêng

	// Kết hợp tất cả events (chỉ appointments)
	const allEvents = [...appointmentEvents];

	// Cập nhật panel hiển thị bác sĩ bận
	updateBusyDoctorsPanel(busySchedules);

	// Cập nhật calendar
	if (state.calendar) {
		const renderEvents = function () {
			state.calendar.removeAllEvents();
			state.calendar.addEventSource(allEvents);
		};

		if (typeof state.calendar.batchRendering === 'function') {
			state.calendar.batchRendering(renderEvents);
		} else {
			renderEvents();
		}
	}
}

// Sử dụng utility functions cho status
function getStatusText(status) {
	return AppointmentManagementStatusFormatUtils.getStatusText(status);
}

function getStatusIcon(status) {
	return AppointmentManagementStatusFormatUtils.getStatusIcon(status);
}

function parseAppointmentEditorDate(value) {
	const rawValue = String(value || '').trim();
	if (!rawValue) return null;

	let parts = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (parts) {
		return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
	}

	parts = rawValue.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (parts) {
		return new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
	}

	const parsedDate = new Date(rawValue);
	return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatAppointmentEditorDate(value) {
	const date = parseAppointmentEditorDate(value);
	if (!date) return '';

	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${day}/${month}/${date.getFullYear()}`;
}

function calculateAppointmentEditorAge(value) {
	const date = parseAppointmentEditorDate(value);
	if (!date) return null;

	const today = new Date();
	let age = today.getFullYear() - date.getFullYear();
	const monthDiff = today.getMonth() - date.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
		age -= 1;
	}
	return age >= 0 ? age : null;
}

function getAppointmentEditorModeConfig(mode) {
	const isEdit = mode === 'edit';
	return {
		mode,
		prefix: isEdit ? 'edit' : 'add',
		formSelector: isEdit ? '#editAppointmentForm' : '#addAppointmentForm',
		categoryName: isEdit ? 'editAppointmentCategory' : 'appointmentCategory',
		defaultName: isEdit ? 'Bệnh nhân' : 'Bệnh nhân mới'
	};
}

function getAppointmentEditorSelectText(selector, fallback) {
	const select = document.querySelector(selector);
	const value = select?.value;
	const text = (select?.selectedOptions[0]?.textContent || '').trim();
	return value && text ? text : fallback;
}

function updateAppointmentSummaryStatus(mode, status) {
	const config = getAppointmentEditorModeConfig(mode);
	const statusClassMap = {
		SCHEDULED: 'appointment-status-scheduled',
		CONFIRMED: 'appointment-status-confirmed',
		NO_SHOW: 'appointment-status-no-show',
		CANCELLED: 'appointment-status-cancelled'
	};
	const summarySelector = `#${config.prefix}SummaryStatus`;
	const statusClass = statusClassMap[status] || 'appointment-status-scheduled';

	removeClass(summarySelector, 'appointment-status-scheduled appointment-status-confirmed appointment-status-no-show appointment-status-cancelled');
	addClass(summarySelector, statusClass);
	setText(summarySelector, getStatusText(status || 'SCHEDULED'));
}

function updateAppointmentEditorSummary(mode) {
	const config = getAppointmentEditorModeConfig(mode);
	const prefix = config.prefix;
	const name = fieldValue(`#${prefix}PatientName`).trim() || config.defaultName;
	const dobValue = fieldValue(`#${prefix}PatientDOB`);
	const dobText = formatAppointmentEditorDate(dobValue);
	const age = calculateAppointmentEditorAge(dobValue);
	const dobAgeText = dobText
		? `${dobText}${age !== null ? ` · ${age} tuổi` : ''}`
		: 'Chưa có ngày sinh';
	const appointmentDate = formatAppointmentEditorDate(fieldValue(`#${prefix}AppointmentDate`)) || 'Chưa chọn';
	const appointmentTime = fieldValue(`#${prefix}AppointmentTime`) || 'Chưa chọn';
	const doctorText = getAppointmentEditorSelectText(`#${prefix}Doctor`, 'Chưa chọn');
	const categoryValue = fieldValue(`input[name="${config.categoryName}"]:checked`);
	const categoryText = categoryValue === 'RE_EXAMINATION' ? 'Tái khám' : 'Khám mới';
	const status = fieldValue(`#${prefix}Status`) || 'SCHEDULED';

	setText(`#${prefix}SummaryName`, name);
	setText(`#${prefix}SummaryDobAge`, dobAgeText);
	setText(`#${prefix}SummaryDate`, appointmentDate);
	setText(`#${prefix}SummaryTime`, appointmentTime);
	setText(`#${prefix}SummaryDoctor`, doctorText);
	setText(`#${prefix}SummaryCategory`, categoryText);
	updateAppointmentSummaryStatus(mode, status);
}

function bindAppointmentEditorSummaries() {
	['add', 'edit'].forEach(mode => {
		const fields = `#${mode}AppointmentForm input, #${mode}AppointmentForm select`;
		['input', 'change'].forEach(type => rebindDelegate(document, type, fields, 'appointmentEditorSummary', () => updateAppointmentEditorSummary(mode)));
		rebindDelegate(document, 'shown.bs.modal', `#${mode}AppointmentModal`, 'appointmentEditorSummary', () => updateAppointmentEditorSummary(mode));
	});
}

// Hàm cập nhật breadcrumb
function updateBreadcrumb(thirdLevel = null) {
	AppointmentManagementPageActionsUtils.updateBreadcrumb(thirdLevel);
}

// Hàm đóng modal và reset breadcrumb
function closeModalAndResetBreadcrumb() {
	AppointmentManagementPageActionsUtils.closeModalAndResetBreadcrumb({ updateBreadcrumb });
}

// Hàm gọi API xóa appointment (hỗ trợ force param cho lifecycle guard)
async function doDeleteAppointment(appointmentId, force = false) {
	try {
		await requestJson(`/api/appointments/${appointmentId}/cancel`, { method: 'DELETE',
			headers: { 'Content-Type': 'application/json' }, body: force ? JSON.stringify({ force: true }) : undefined });
	} catch (error) {
		if (error?.status === 409 && error.data?.requires_force) {
			// Đang trong quá trình khám — hỏi xác nhận lần 2
			const confirmed = await window.CustomModal.confirm('Lịch hẹn đang được sử dụng trong ca khám. Bạn có chắc muốn xóa?', 'Xác nhận xóa/ẩn', 'warning', 'danger');
			if (confirmed) doDeleteAppointment(appointmentId, true);
		} else {
			// 400 blocked hoặc lỗi khác — hiển thị thông báo
			showCustomToast('error', 'Không thể xóa lịch hẹn. Vui lòng kiểm tra lại.');
		}
		return;
	}
	showCustomToast('success', 'Đã xóa lịch hẹn thành công!');
	afterDataChanged();
}

function showCustomToast(type, message) {
	AppointmentManagementFeedbackUtils.showToast({
		bootstrap: window.bootstrap,
		document,
		message,
		type
	});
}

export { bindAppointmentEditorSummaries, calculateAppointmentEditorAge, closeModalAndResetBreadcrumb, doDeleteAppointment, formatAppointmentEditorDate, getAppointmentEditorModeConfig, getAppointmentEditorSelectText, getStatusIcon, getStatusText, openAddModal, parseAppointmentEditorDate, showCustomToast, updateAppointmentEditorSummary, updateAppointmentSummaryStatus, updateBreadcrumb, updateCalendarEvents, updateCalendarWithHolidaysAndBusySchedules };
