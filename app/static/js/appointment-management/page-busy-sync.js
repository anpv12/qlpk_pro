import { state } from './page-state.js';
import { AppointmentManagementBusySchedulePopupUtils } from './busy-schedule-popup-utils.js';
import { AppointmentManagementBusyScheduleUtils } from './busy-schedule-utils.js';
import { loadDoctorBusySchedulesData } from './page-data.js';
import { AppointmentManagementCalendarConnectionUtils } from './calendar-connection-utils.js';
import { AppointmentManagementCalendarSyncModalUtils } from './calendar-sync-modal-utils.js';
import { AppointmentManagementCalendarSyncRuntimeUtils } from './calendar-sync-runtime-utils.js';
import { showCustomToast } from './page-editor.js';
import { AppointmentManagementCalendarSyncControlsUtils } from './calendar-sync-controls-utils.js';
import { AppointmentManagementCalendarSyncDateUtils } from './calendar-sync-date-utils.js';
import { AppointmentManagementCalendarSyncFilterUtils } from './calendar-sync-filter-utils.js';
import { AppointmentManagementCalendarSyncStatusUtils } from './calendar-sync-status-utils.js';
import { AppointmentManagementCalendarSyncTableUtils } from './calendar-sync-table-utils.js';
import { CustomModal } from '../custom-modal.js';
// Lịch bận realtime và đồng bộ Google Calendar.

function showBusySchedulePopup(event) {
	AppointmentManagementBusySchedulePopupUtils.showBusySchedulePopup(event);
}

// Function kiểm tra xem bác sĩ có đang bận trong thời gian hiện tại không
function isDoctorCurrentlyBusy(busySchedules) {
	return AppointmentManagementBusyScheduleUtils.isDoctorCurrentlyBusy(busySchedules);
}

// Function kiểm tra xem bác sĩ có lịch bận trong tương lai không (chưa bắt đầu)
function isDoctorFutureBusy(busySchedules) {
	return AppointmentManagementBusyScheduleUtils.isDoctorFutureBusy(busySchedules);
}

// Function lọc các lịch bận chưa kết thúc
function filterActiveBusySchedules(busySchedules) {
	return AppointmentManagementBusyScheduleUtils.filterActiveBusySchedules(busySchedules);
}

// Lưu dữ liệu lịch bận hiện tại cho popup và các callback realtime.
function updateBusyDoctorsPanel(busySchedules) {
	state.currentBusySchedules = busySchedules || [];
}

// Hàm refresh busy schedules 1 lần (không loop); request bị hủy bởi lần tải mới thì bỏ qua
function refreshBusySchedulesOnce() {
	loadDoctorBusySchedulesData(state.currentCalendarDateFrom, state.currentCalendarDateTo)
		.then(busySchedules => updateBusyDoctorsPanel(Array.isArray(busySchedules) ? busySchedules : []), () => {});
}

// ========== Google Calendar Integration ==========

// Load trạng thái kết nối Google Calendar
function loadCalendarStatus() {
	return AppointmentManagementCalendarConnectionUtils.loadCalendarStatus({
		hasSession: () => window.QLPKApiTransport.hasSession()
	});
}

// =====================================================
// CALENDAR SYNC DASHBOARD
// =====================================================

function initSyncCalendarModal() {
	AppointmentManagementCalendarSyncModalUtils.initializeSyncCalendarModal({
		abortCalendarSyncRequests: () => AppointmentManagementCalendarSyncRuntimeUtils.abortCalendarSyncRequests(),
		customModal: CustomModal,
		filterSyncTable,
		flatpickrInstance: window.flatpickr || null,
		loadSyncData,
		showCustomToast: showCustomToast,
		syncAppointments,
		syncControlsUtils: AppointmentManagementCalendarSyncControlsUtils,
		syncDateUtils: AppointmentManagementCalendarSyncDateUtils,
		updateSyncButtonStates,
		validateCalendarConnections
	});
}

function getCalendarSyncRuntimeOptions() {
	return {
		controlsUtils: AppointmentManagementCalendarSyncControlsUtils,
		filterUtils: AppointmentManagementCalendarSyncFilterUtils,
		hasSession: () => window.QLPKApiTransport.hasSession(),
		renderSyncTable,
		showCustomToast: showCustomToast,
		statusUtils: AppointmentManagementCalendarSyncStatusUtils,
		syncAppointments,
		syncDateUtils: AppointmentManagementCalendarSyncDateUtils,
		tableUtils: AppointmentManagementCalendarSyncTableUtils,
		updateSyncBadgesAfterVerify,
		updateSyncButtonStates,
		updateSyncCounters,
		verifyCalendarEvents
	};
}

// Validate tất cả connections để đảm bảo data integrity
function validateCalendarConnections() {
	return AppointmentManagementCalendarSyncRuntimeUtils.validateCalendarConnections(getCalendarSyncRuntimeOptions());
}

function loadSyncData() {
	return AppointmentManagementCalendarSyncRuntimeUtils.loadSyncData(getCalendarSyncRuntimeOptions());
}

function renderSyncTable(data) {
	return AppointmentManagementCalendarSyncRuntimeUtils.renderSyncTable(getCalendarSyncRuntimeOptions(), data);
}

function updateSyncButtonStates() {
	return AppointmentManagementCalendarSyncRuntimeUtils.updateSyncButtonStates(getCalendarSyncRuntimeOptions());
}

// Verify calendar events thực tế trên Google Calendar
function verifyCalendarEvents(appointmentIds) {
	return AppointmentManagementCalendarSyncRuntimeUtils.verifyCalendarEvents(getCalendarSyncRuntimeOptions(), appointmentIds);
}

// Cập nhật badges count sau khi verify
function updateSyncBadgesAfterVerify() {
	return AppointmentManagementCalendarSyncRuntimeUtils.updateSyncBadgesAfterVerify(getCalendarSyncRuntimeOptions());
}

function syncAppointments(appointmentIds) {
	return AppointmentManagementCalendarSyncRuntimeUtils.syncAppointments(getCalendarSyncRuntimeOptions(), appointmentIds);
}

// Cập nhật các counter trên header sau khi sync
function updateSyncCounters() {
	return AppointmentManagementCalendarSyncRuntimeUtils.updateSyncCounters(getCalendarSyncRuntimeOptions());
}

// Filter bảng sync theo search text và status
function filterSyncTable() {
	return AppointmentManagementCalendarSyncRuntimeUtils.filterSyncTable(getCalendarSyncRuntimeOptions());
}

export { filterActiveBusySchedules, filterSyncTable, getCalendarSyncRuntimeOptions, initSyncCalendarModal, isDoctorCurrentlyBusy, isDoctorFutureBusy, loadCalendarStatus, loadSyncData, refreshBusySchedulesOnce, renderSyncTable, showBusySchedulePopup, syncAppointments, updateBusyDoctorsPanel, updateSyncBadgesAfterVerify, updateSyncButtonStates, updateSyncCounters, validateCalendarConnections, verifyCalendarEvents };
