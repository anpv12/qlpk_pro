// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './flatpickr-vn.js';
import './datepicker-init.js';
import './sidebar-dry-loader.js';
import './utils.js';
import './custom-modal.js';
import './shared/icon-system.js';
import './components/icd-data-loader.js';
import './components/autocomplete-field.js';
import './components/icd-autocomplete.js';
import './components/appointment-calendar.js';
import './realtime-page-hooks.js';
import './text-expansion.js';
import { state } from './appointment-management/page-state.js';
import { clearStaleHeaderAppointmentModalRequest, initializeCalendar } from './appointment-management/page-calendar.js';
import { loadDoctors, loadPackages, loadServices } from './appointment-management/page-data.js';
import { bindAppointmentEditorSummaries, closeModalAndResetBreadcrumb, doDeleteAppointment, showCustomToast, updateAppointmentEditorSummary, updateBreadcrumb } from './appointment-management/page-editor.js';
import { afterDataChanged, exportToExcel, refreshView } from './appointment-management/page-view.js';
import { AppointmentManagementPageActionsUtils } from './appointment-management/page-actions-utils.js';
import { AppointmentManagementAddModalUiUtils } from './appointment-management/add-modal-ui-utils.js';
import { getPageActionsOptions, initializeICDMultiSelect, initializePhase3Features, isAddFormValid, setupICDMultiSelect, submitAppointmentForm, updateEditAppointmentStatus } from './appointment-management/page-add-modal.js';
import { clearAllEditFieldErrors, submitEditAppointmentForm, updateEditStatusFlag } from './appointment-management/page-edit-modal.js';
import { AppointmentManagementBusySchedulePopupUtils } from './appointment-management/busy-schedule-popup-utils.js';
import { initSyncCalendarModal, loadCalendarStatus, refreshBusySchedulesOnce } from './appointment-management/page-busy-sync.js';
import { AppointmentManagementBusySchedulePanelUtils } from './appointment-management/busy-schedule-panel-utils.js';
import { AppointmentManagementCalendarConnectionUtils } from './appointment-management/calendar-connection-utils.js';
import { AppointmentManagementPageInteractionsUtils } from './appointment-management/page-interactions-utils.js';
import './appointment-management/mini-calendar-bootstrap-utils.js';
import { fieldValue, hideModal, rebind, rebindDelegate, removeClass, setFieldValue, setProp } from './shared/dom-query.js';
import { openAddAppointmentWithDate } from './appointment-management/page-open-add.js';
import { CustomModal } from './custom-modal.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';

Object.assign(state, {
	doctors: [],
	services: [],
	packages: [],
	allAppointments: [],
	viewAppointments: [],
	selectedDoctor: '',
	selectedRoleFilter: '',
	searchKeyword: '',
	statusFilter: '',
	typeFilter: '',
	fromDate: '',
	toDate: '',
	calendar: undefined,
	calendarResizeObserver: null,
	calendarResizeFrame: null,
	calendarDataRequestSeq: 0,
	appointmentsRequest: null,
	busySchedulesRequest: null,
	cachedHolidays: null,
	holidaysRequestPromise: null,
	currentCalendarHolidays: [],
	currentCalendarBusySchedules: [],
	currentCalendarDateFrom: '',
	currentCalendarDateTo: '',
	editCurrentAppointment: null,
	editAppointmentId: undefined,
	editPatientId: undefined,
	APPOINTMENT_STATUS_VALUES: ['SCHEDULED', 'CONFIRMED', 'NO_SHOW', 'CANCELLED'],
	currentBusySchedules: []
});

const NS = 'appointmentManagement';
const onDocument = (type, selector, handler) => rebindDelegate(document, type, selector, NS, handler);

function initializeTooltips() {
	document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(trigger => {
		new window.bootstrap.Tooltip(trigger, { trigger: 'hover focus', delay: { show: 500, hide: 100 } });
	});
}

// List filter, export and the add-appointment entry points
function bindListAndAddEvents() {
	onDocument('change', '#doctorFilter', function () {
		state.selectedDoctor = this.value;
		// Clear role filter when specific doctor is selected
		state.selectedRoleFilter = '';
		removeClass('.appt-panel-label.active', 'active');
		refreshView();
	});
	onDocument('click', '#exportDataBtn', event => {
		event.preventDefault();
		exportToExcel();
	});
	onDocument('click', '[data-bs-target="#addAppointmentModal"]', () => openAddAppointmentWithDate());
	onDocument('hidden.bs.modal', '#addAppointmentModal', () => {
		AppointmentManagementAddModalUiUtils.resetAddAppointmentForm();
		updateAppointmentEditorSummary('add');
	});
	rebind('#addAppointmentModal', 'shown.bs.modal', 'appointmentAddPrepare', () => {
		try {
			AppointmentManagementAddModalUiUtils.prepareAddModalShown({
				document,
				setDatepickerValue: window.setDatepickerValue,
				setupICDMultiSelect,
				initializePhase3Features
			});
			updateAppointmentEditorSummary('add');
		} catch (error) {
			console.error('Không thể mở form thêm lịch hẹn:', error);
		}
	});
	onDocument('click', '#submitForm', function () {
		// Prevent double click; re-enabled when validation fails
		if (this.disabled) return;
		this.disabled = true;
		if (!isAddFormValid()) {
			this.disabled = false;
			return;
		}
		submitAppointmentForm();
	});
	// Duration follows the chosen service or package
	['add', 'edit'].forEach(mode => onDocument('qlpk:service-selected', `#${mode}Service`, event => {
		if (event.detail?.duration_minutes) setFieldValue(`#${mode}Duration`, event.detail.duration_minutes);
	}));
	onDocument('change', '#addPackage', function () {
		AppointmentManagementAddModalUiUtils.applySelectedDuration(this, false);
	});
	rebind('input[name="appointmentType"]', 'change', NS, function () {
		AppointmentManagementAddModalUiUtils.applyAppointmentTypeSelection(this.value, true);
	});
}

const EDIT_PATIENT_FIELDS = '#editPatientName, #editPatientPhone, #editPatientCCCD, #editPatientEmail, #editPatientDOB, #editMedicalHistorySearch, #editAllergies, #editCurrentMedication';

function bindEditModalEvents() {
	onDocument('shown.bs.modal', '#editAppointmentModal', () => {
		setupICDMultiSelect('editMedicalHistory', 'edit');
		// Đảm bảo status flag được cập nhật khi modal hiển thị
		if (state.editAppointmentId && state.editCurrentAppointment) {
			setTimeout(() => updateEditStatusFlag(state.editCurrentAppointment.status), 50);
		}
		// Đảm bảo tooltip không tự động show
		setTimeout(() => {
			document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(trigger => window.bootstrap.Tooltip.getInstance(trigger)?.hide());
		}, 100);
	});
	// Xóa lịch hẹn từ modal chỉnh sửa
	onDocument('click', '#editDeleteAppointmentBtn', () => {
		const appointmentId = state.editAppointmentId;
		if (!appointmentId) return;
		CustomModal.confirm('Lịch hẹn sẽ bị ẩn khỏi danh sách và đánh dấu đã hủy. Bạn chắc chắn muốn tiếp tục?', 'Xác nhận xóa/ẩn', 'warning', 'danger').then(confirmed => {
			if (!confirmed) return;
			hideModal('#editAppointmentModal');
			doDeleteAppointment(appointmentId);
		});
	});
	onDocument('click', '#sendEmailReminderBtn', () => AppointmentManagementPageActionsUtils.sendEmailReminder(getPageActionsOptions()));
	onDocument('click', '[data-edit-appointment-status]', function (event) {
		event.preventDefault();
		const newStatus = this.dataset.editAppointmentStatus;
		if (newStatus) updateEditAppointmentStatus(newStatus);
	});
	onDocument('click', '[data-appointment-action="close-edit-modal"]', event => {
		event.preventDefault();
		closeModalAndResetBreadcrumb();
	});
	onDocument('hidden.bs.modal', '#editAppointmentModal', () => {
		document.querySelector('#editAppointmentForm').reset();
		state.editAppointmentId = undefined;
		state.editPatientId = undefined;
		clearAllEditFieldErrors();
		setProp(EDIT_PATIENT_FIELDS, 'disabled', false);
		removeClass(EDIT_PATIENT_FIELDS, 'bg-light');
		// Xóa cấp 3 "CHI TIẾT" khỏi breadcrumb
		updateBreadcrumb();
	});
	onDocument('click', '#editSubmitBtn', event => {
		event.preventDefault();
		event.stopPropagation();
		const missing = [
			[!fieldValue('#editPatientName').trim(), 'Vui lòng nhập họ và tên bệnh nhân'],
			[!fieldValue('#editAppointmentDate'), 'Vui lòng chọn ngày hẹn'],
			[!fieldValue('#editAppointmentTime'), 'Vui lòng chọn giờ hẹn'],
			[!fieldValue('#editDoctor'), 'Vui lòng chọn bác sĩ khám'],
		].find(([isMissing]) => isMissing);
		if (missing) {
			showCustomToast('error', missing[1]);
			return;
		}
		submitEditAppointmentForm();
	});
}

function bindBusyScheduleEvents() {
	onDocument('click', '[data-busy-schedule-action="close"]', () => AppointmentManagementBusySchedulePopupUtils.closeBusySchedulePopup());
	onDocument('click', '[data-doctor-busy-action="open"]', function () {
		AppointmentManagementBusySchedulePopupUtils.showDoctorBusySchedules(
			AppointmentManagementBusySchedulePanelUtils,
			Number(this.dataset.doctorId) || this.dataset.doctorId,
			this.dataset.doctorName,
			state.currentBusySchedules
		);
	});
	onDocument('click', '[data-doctor-busy-action="close"]', () => AppointmentManagementBusySchedulePopupUtils.closeDoctorBusyPopup());
}

function registerRealtimeRefresh() {
	QLPKRealtimePageHooks?.register({
		types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'catalog.changed', 'busy_schedule.changed'],
		debounceMs: 500,
		handler: event => {
			if (event.type === 'busy_schedule.changed') {
				refreshBusySchedulesOnce();
				return;
			}
			if (event.type === 'catalog.changed') {
				loadDoctors();
				loadServices();
				loadPackages();
			}
			afterDataChanged();
		}
	});
}

document.addEventListener('DOMContentLoaded', () => {
	initializeTooltips();
	// datesSet callback sẽ tự động load data khi calendar render lần đầu
	initializeCalendar();
	loadDoctors();
	loadServices();
	loadPackages();
	bindAppointmentEditorSummaries();
	setTimeout(() => {
		if ((!state.services || state.services.length === 0) && (!state.packages || state.packages.length === 0)) {
			showCustomToast('warning', 'Chưa có dịch vụ/gói nào. Vui lòng thêm từ quản trị → Dịch vụ/Gói dịch vụ!');
		}
	}, 2000);

	clearStaleHeaderAppointmentModalRequest();
	bindListAndAddEvents();
	initializeICDMultiSelect();
	bindEditModalEvents();
	bindBusyScheduleEvents();
	AppointmentManagementCalendarConnectionUtils.initializeCalendarConnection({
		hasSession: () => window.QLPKApiTransport.hasSession(),
		loadCalendarStatus,
		onReady: initSyncCalendarModal,
		showCustomToast,
		window
	});
	AppointmentManagementPageInteractionsUtils.initializePageInteractions({
		document,
		refreshView,
		setSearchKeyword: value => { state.searchKeyword = value; }
	});
	registerRealtimeRefresh();
});
