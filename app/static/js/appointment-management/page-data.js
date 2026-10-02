import { state } from './page-state.js';
import { AppointmentManagementDoctorControlsUtils } from './doctor-controls-utils.js';
import { refreshView } from './page-view.js';
import { showCustomToast } from './page-editor.js';
import { AppointmentManagementDoctorLegendUtils } from './doctor-legend-utils.js';
import { AppointmentManagementServicePackageControlsUtils } from './service-package-controls-utils.js';
import { AppointmentManagementCalendarDateUtils } from './calendar-date-utils.js';
import { AppointmentManagementBusyScheduleUtils } from './busy-schedule-utils.js';
import { HttpError, requestJson } from '../shared/http-json.js';
// Tải dữ liệu nền: bác sĩ, dịch vụ, gói, lịch hẹn, ngày lễ, lịch bận.

// Load danh sách bác sĩ
async function loadDoctors() {
	try {
		state.doctors = await requestJson('/users/doctors');
	} catch (error) {
		showCustomToast('error', error?.status === 401 ? 'Lỗi xác thực. Vui lòng đăng nhập lại.' : 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
		return;
	}
	AppointmentManagementDoctorControlsUtils.populateMainDoctorControls(state.doctors);
	// Lấy thông tin user hiện tại và set filter tự động
	setupDoctorFilterForCurrentUser();
	buildDoctorLegend();
	if (state.calendar && state.allAppointments.length) refreshView();
}

// Build legend bác sĩ — màu trong sidebar
function buildDoctorLegend() {
	AppointmentManagementDoctorLegendUtils.buildDoctorLegend({
		document,
		doctors: state.doctors,
		getSelectedRoleFilter: () => state.selectedRoleFilter,
		setSelectedRoleFilter: value => { state.selectedRoleFilter = value; },
		setSelectedDoctor: value => { state.selectedDoctor = value; },
		refreshView
	});
}

// Setup doctorFilter theo role của user hiện tại
function setupDoctorFilterForCurrentUser() {
	window.QLPKApiTransport.currentUser().then(currentUser => {
		if (currentUser && currentUser.id) applyDoctorFilterSettings(currentUser);
	});
}

// Áp dụng cài đặt filter theo user role
function applyDoctorFilterSettings(currentUser) {
	AppointmentManagementDoctorControlsUtils.applyDoctorFilterSettings({
		currentUser,
		setSelectedDoctor: value => { state.selectedDoctor = value; }
	});
}

// Load danh sách dịch vụ; resolves false when the list could not be loaded
async function loadServices() {
	try {
		state.services = await requestJson('/services/');
	} catch (error) {
		console.error('Lỗi tải dịch vụ:', error);
		AppointmentManagementServicePackageControlsUtils.renderServiceLoadError();
		return false;
	}
	initServiceAutocomplete('addService', 'addServiceDropdown', 'addServiceId');
	initServiceAutocomplete('editService', 'editServiceDropdown', 'editServiceId');
	return true;
}

// Hàm khởi tạo autocomplete cho service input
function initServiceAutocomplete(inputId, dropdownId, hiddenId) {
	AppointmentManagementServicePackageControlsUtils.initializeServiceAutocomplete({
		inputId,
		dropdownId,
		hiddenId,
		getServices: () => state.services
	});
}

// Load danh sách gói dịch vụ
async function loadPackages() {
	try {
		state.packages = await requestJson('/packages/');
	} catch {
		AppointmentManagementServicePackageControlsUtils.renderPackageSelectError();
		return false;
	}
	AppointmentManagementServicePackageControlsUtils.populatePackageSelects(state.packages);
	return true;
}

function appendDateRangeParams(url, dateFrom, dateTo) {
	let result = url;
	if (dateFrom) result += `&date_from=${encodeURIComponent(dateFrom)}`;
	if (dateTo) result += `&date_to=${encodeURIComponent(dateTo)}`;
	return result;
}

function toRangeStartDateTime(dateValue) {
	return dateValue ? `${dateValue}T00:00:00` : '';
}

function toRangeEndDateTime(dateValue) {
	return dateValue ? `${dateValue}T23:59:59` : '';
}

// One in-flight request per key; a newer call aborts the previous one, which then rejects with its AbortError.
function startRequest(key, abortPrevious) {
	if (abortPrevious) state[key]?.abort();
	const controller = new AbortController();
	state[key] = controller;
	return controller.signal;
}

const isAbort = error => error?.name === 'AbortError';

async function loadAppointmentsData(dateFrom, dateTo, options = {}) {
	const signal = startRequest('appointmentsRequest', options.abortPrevious !== false);
	try {
		return (await requestJson(appendDateRangeParams('/api/?per_page=10000', dateFrom, dateTo), { signal })).appointments || [];
	} catch (error) {
		if (isAbort(error)) throw error;
		if (error instanceof HttpError && error.status === 401) {
			showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
			throw error;
		}
		return [];
	}
}

// Helper: lấy date range từ FullCalendar view hiện tại
function getCalendarDateRange() {
	return AppointmentManagementCalendarDateUtils.getCalendarDateRange(state.calendar);
}

// Ngày lễ: tải một lần, các lời gọi đồng thời dùng chung một request
function loadHolidaysData() {
	if (state.cachedHolidays) return Promise.resolve(state.cachedHolidays);
	if (!state.holidaysRequestPromise) {
		state.holidaysRequestPromise = requestJson('/holidays/')
			.then(holidays => (Array.isArray(holidays) ? holidays : []), () => [])
			.then(holidays => {
				state.cachedHolidays = holidays;
				state.holidaysRequestPromise = null;
				return holidays;
			});
	}
	return state.holidaysRequestPromise;
}

async function loadDoctorBusySchedulesData(dateFrom, dateTo, options = {}) {
	const signal = startRequest('busySchedulesRequest', options.abortPrevious !== false);
	const url = appendDateRangeParams('/api/doctor-busy-schedules?status=active', toRangeStartDateTime(dateFrom), toRangeEndDateTime(dateTo));
	try {
		const res = await requestJson(url, { signal });
		return res?.success && res.data ? res.data : [];
	} catch (error) {
		if (isAbort(error)) throw error;
		return [];
	}
}

// Hàm lấy text hiển thị cho lý do bận
function getReasonText(reason) {
	return AppointmentManagementBusyScheduleUtils.getReasonText(reason);
}

export { appendDateRangeParams, applyDoctorFilterSettings, buildDoctorLegend, getCalendarDateRange, isAbort, getReasonText, initServiceAutocomplete, loadAppointmentsData, loadDoctorBusySchedulesData, loadDoctors, loadHolidaysData, loadPackages, loadServices, setupDoctorFilterForCurrentUser, toRangeEndDateTime, toRangeStartDateTime };
