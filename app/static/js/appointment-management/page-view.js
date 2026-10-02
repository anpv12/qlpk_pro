import { requestJson } from '../shared/http-json.js';
import { state } from './page-state.js';
import { showCustomToast, updateCalendarEvents } from './page-editor.js';
import { toLocalISOString, updateAppointmentTime } from './page-calendar.js';
import { AppointmentManagementConflictWarningUtils } from './conflict-warning-utils.js';
import { AppointmentManagementFilterUtils } from './filter-utils.js';
import { getCalendarDateRange, isAbort, loadAppointmentsData, loadDoctorBusySchedulesData, loadHolidaysData } from './page-data.js';
import { AppointmentManagementPatientDuplicateWarningUtils } from './patient-duplicate-warning-utils.js';
import { AppointmentManagementStatusFormatUtils } from './status-format-utils.js';
import { AppointmentManagementPageActionsUtils } from './page-actions-utils.js';
import { hideModal } from '../shared/dom-query.js';
import { QLPKAppointmentCalendar } from '../components/appointment-calendar.js';
// Kiểm tra lịch trống, cảnh báo trùng, làm mới view, thống kê, xuất Excel.

// Hàm kiểm tra bác sĩ có rảnh không cho drag & drop
function checkDoctorAvailabilityForDragDrop(appointmentId, newDate, info) {

	// Xử lý ID format - calendar events sử dụng appt-{id}
	let numericId = appointmentId;
	if (appointmentId.startsWith('appt-')) {
		numericId = appointmentId.replace('appt-', '');
	}

	const appointment = state.allAppointments.find(a => String(a.id) === String(numericId));
	if (!appointment) {
		showCustomToast('error', 'Không tìm thấy lịch hẹn!');
		info.revert();
		return;
	}


	// Tạo appointment data để kiểm tra
	const appointmentData = {
		appointment_date: toLocalISOString(newDate),
		doctor_id: appointment.doctor_id,
		duration_minutes: appointment.duration_minutes,
		appointment_id: numericId
	}


	// Kiểm tra lịch bận
	checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {

		if (isAvailable) {
			// Bác sĩ rảnh, cập nhật lịch hẹn
			showCustomToast('info', 'Đang cập nhật...');

			// Debounce để tránh gọi API quá nhiều
			clearTimeout(updateTimer);
			updateTimer = setTimeout(() => {
				updateAppointmentTime(appointmentId, newDate, info);
			}, 300);
		} else {
			// Bác sĩ bận, hiển thị cảnh báo và revert
			showConflictWarning(conflictInfo, appointmentData, true);
			info.revert(); // Revert the drag
		}
	});
}

// Debounce timer for drag/drop time updates
let updateTimer;

// Hàm kiểm tra bác sĩ có rảnh không trước khi tạo lịch hẹn
function checkDoctorAvailabilityBeforeCreate(appointmentData, callback) {
	const appointmentDateTime = appointmentData.appointment_date;
	const durationMinutes = parseInt(appointmentData.duration_minutes) || 30;


	requestJson('/api/check-doctor-availability', { method: 'POST', json: {
		doctor_id: appointmentData.doctor_id,
		appointment_datetime: appointmentDateTime,
		duration_minutes: durationMinutes,
		appointment_id: appointmentData.appointment_id || null
	} }).then(response => {
		if (response.available === true) {
			callback(true, null);
			return;
		}
		// Merge conflict_type vào conflict_info để có đầy đủ thông tin
		const conflictInfo = response.conflict_info || {};
		if (response.conflict_type) conflictInfo.conflict_type = response.conflict_type;
		callback(false, conflictInfo);
	}, () => callback(true, null)); // API lỗi: không chặn thao tác
}

// Hàm hiển thị cảnh báo xung đột
function showConflictWarning(conflictInfo, appointmentData, isEdit = false) {
	AppointmentManagementConflictWarningUtils.showConflictWarning(conflictInfo, appointmentData, {
		appointments: state.allAppointments,
		isEdit
	});
}

// Helper function để lấy user role từ localStorage
function getCurrentUserRole() {
	return String(window.QLPKApiTransport.userSnapshot().role || '').toUpperCase();
}

// Hàm cập nhật viewAppointments theo filter hiện tại
function updateViewAppointments() {
	const userRole = getCurrentUserRole();
	state.viewAppointments = AppointmentManagementFilterUtils.filterAppointments(state.allAppointments, {
		selectedDoctor: state.selectedDoctor,
		selectedRoleFilter: state.selectedRoleFilter,
		doctors: state.doctors,
		userRole,
		statusFilter: state.statusFilter,
		typeFilter: state.typeFilter,
		fromDate: state.fromDate,
		toDate: state.toDate,
		searchKeyword: state.searchKeyword
	}, { includeRoleFilter: true });
}

// Hàm refresh view (cập nhật viewAppointments, stats, render)
function refreshView() {
	updateViewAppointments();
	updateStats();
	updateCalendarEvents();
	// Lịch nhỏ đánh dấu ngày có lịch theo danh sách đang hiển thị.
	document.dispatchEvent(new CustomEvent('qlpk:appointments-view-changed'));
}

function loadCalendarRangeData(dateFrom, dateTo) {
	const requestSeq = ++state.calendarDataRequestSeq;
	state.currentCalendarDateFrom = dateFrom || '';
	state.currentCalendarDateTo = dateTo || '';

	Promise.all([
		loadAppointmentsData(dateFrom, dateTo),
		loadHolidaysData(),
		loadDoctorBusySchedulesData(dateFrom, dateTo)
	]).then(([appointments, holidays, busySchedules]) => {
		if (requestSeq !== state.calendarDataRequestSeq) return;
		state.allAppointments = appointments || [];
		state.currentCalendarHolidays = holidays || [];
		state.currentCalendarBusySchedules = busySchedules || [];
		refreshView();
	}, error => {
		if (isAbort(error) || requestSeq !== state.calendarDataRequestSeq) return;

		state.allAppointments = [];
		state.currentCalendarBusySchedules = [];
		refreshView();
	});
}

// Hàm reload data sau khi thêm/sửa/xóa
function afterDataChanged() {
	const { dateFrom, dateTo } = getCalendarDateRange();
	loadCalendarRangeData(dateFrom, dateTo);
}

// Hàm hiển thị cảnh báo patient trùng với thay đổi quan trọng
function showPatientDuplicateWarning(response, appointmentData) {
	AppointmentManagementPatientDuplicateWarningUtils.showPatientDuplicateWarning({
		response,
		appointmentData,
		formatDateDisplay: window.formatDateDisplay,
		onConfirm: function () {
			appointmentData.confirm_update_patient = true;

			const submitButton = document.getElementById('submitForm');
			const setSubmitting = submitting => {
				if (!submitButton) return;
				submitButton.disabled = submitting;
				submitButton.classList.toggle('btn-loading', submitting);
			};
			setSubmitting(true);

			checkDoctorAvailabilityBeforeCreate(appointmentData, async (isAvailable, conflictInfo) => {
				if (!isAvailable) {
					showConflictWarning(conflictInfo, appointmentData, false);
					setSubmitting(false);
					return;
				}
				try {
					await requestJson('/api/', { method: 'POST', json: appointmentData, signal: AbortSignal.timeout(10000) });
					showCustomToast('success', 'Thêm lịch hẹn thành công!');
					hideModal('#addAppointmentModal');
					afterDataChanged();
				} catch (error) {
					showCustomToast('error', error?.name === 'TimeoutError'
						? 'Thao tác mất quá nhiều thời gian. Vui lòng thử lại.'
						: 'Không thể thêm lịch hẹn. Vui lòng kiểm tra lại.');
				} finally {
					setSubmitting(false);
				}
			});
		}
	});
}

// Định dạng ngày và giờ
function formatDate(dateStr) {
	return AppointmentManagementStatusFormatUtils.formatDate(dateStr);
}
function formatTime(dtStr) {
	return AppointmentManagementStatusFormatUtils.formatTime(dtStr);
}

// Cập nhật badge thống kê
function updateStats() {
	// Đếm trên allAppointments với các filter khác (không filter theo status)
	// để hiển thị tổng số chính xác cho tất cả các status
	const userRole = getCurrentUserRole();
	const filteredAppointments = AppointmentManagementFilterUtils.filterAppointments(state.allAppointments, {
		selectedDoctor: state.selectedDoctor,
		userRole,
		typeFilter: state.typeFilter,
		fromDate: state.fromDate,
		toDate: state.toDate,
		searchKeyword: state.searchKeyword
	}, {
		includeRoleFilter: false,
		includeStatusFilter: false
	});

	// Đếm trên filteredAppointments (đã filter theo các tiêu chí khác, không filter theo status)
	const statusCounts = AppointmentManagementFilterUtils.countByStatus(filteredAppointments);

	// Cập nhật số lượng cho các badge
	QLPKAppointmentCalendar.renderStatusCounts(document.querySelector('.appt-status-list'), statusCounts);
}

// Hàm xuất Excel — gọi backend API với openpyxl format
function exportToExcel() {
	AppointmentManagementPageActionsUtils.exportToExcel({
		document,
		selectedDoctor: state.selectedDoctor,
		selectedRoleFilter: state.selectedRoleFilter,
		showCustomToast: showCustomToast
	});
}

export { afterDataChanged, checkDoctorAvailabilityBeforeCreate, checkDoctorAvailabilityForDragDrop, exportToExcel, formatDate, formatTime, getCurrentUserRole, loadCalendarRangeData, refreshView, showConflictWarning, showPatientDuplicateWarning, updateStats, updateViewAppointments };
