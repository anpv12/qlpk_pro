$(function () {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;
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
		APPOINTMENT_STATUS_VALUES: ['SCHEDULED', 'CONFIRMED', 'NO_SHOW', 'CANCELLED'],
		currentBusySchedules: []
	});

	// Khi load trang lần đầu
	$(document).ready(function () {
		// Initialize tooltips với cấu hình rõ ràng
		const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
		tooltipTriggerList.forEach(function (tooltipTriggerEl) {
			new bootstrap.Tooltip(tooltipTriggerEl, {
				trigger: 'hover focus',
				delay: { show: 500, hide: 100 }
			});
		});

		// Mặc định hiển thị calendar view
		$('#calendarViewContainer').show();

		// Khởi tạo calendar ngay lập tức
		page.initializeCalendar();

		// Load data và kiểm tra
		// datesSet callback sẽ tự động load data khi calendar render lần đầu

		// Load doctors, services và packages để kiểm tra
		page.loadDoctors();
		page.loadServices();
		page.loadPackages();
		page.bindAppointmentEditorSummaries();

		// Hiển thị thông báo nếu không có data
		setTimeout(function () {
			if ((!state.services || state.services.length === 0) && (!state.packages || state.packages.length === 0)) {
				page.showCustomToast('warning', 'Chưa có dịch vụ/gói nào. Vui lòng thêm từ quản trị → Dịch vụ/Gói dịch vụ!');
			}
		}, 2000);
	});

	// Sự kiện filter - date picker đã được xóa khỏi UI
	$(document).off('change.appointmentManagement', '#doctorFilter').on('change.appointmentManagement', '#doctorFilter', function () {
		state.selectedDoctor = $(this).val();
		// Clear role filter when specific doctor is selected
		state.selectedRoleFilter = '';
		document.querySelectorAll('.appt-panel-label.active').forEach(el => el.classList.remove('active'));
		page.refreshView();
	});

	// Load XLSX library
	window.AppointmentManagementPageActionsUtils.ensureXlsxLibrary(document);

	// Sự kiện xuất dữ liệu
	$(document).off('click.appointmentManagement', '#exportDataBtn').on('click.appointmentManagement', '#exportDataBtn', function (e) {
		e.preventDefault();
		page.exportToExcel();
	});

	// Hàm mở modal tạo mới lịch hẹn với ngày tuỳ chỉnh (global để gọi từ mini calendar)
	page.clearStaleHeaderAppointmentModalRequest();
	window.openAddAppointmentWithDate = function (dateStr) {
		window.AppointmentManagementAddModalUiUtils.openAddAppointmentWithDate({
			$,
			dateStr,
			loadDoctorsForAdd: page.loadDoctorsForAdd,
			loadServices: page.loadServices,
			loadPackages: page.loadPackages
		});
	};

	// Sự kiện thêm lịch hẹn (nút header)
	$(document).off('click.appointmentManagement', '[data-bs-target="#addAppointmentModal"]').on('click.appointmentManagement', '[data-bs-target="#addAppointmentModal"]', function () {
		window.openAddAppointmentWithDate();
	});

	// Sự kiện đóng modal add
	$(document).off('hidden.bs.modal.appointmentManagement', '#addAppointmentModal').on('hidden.bs.modal.appointmentManagement', '#addAppointmentModal', function () {
		window.AppointmentManagementAddModalUiUtils.resetAddAppointmentForm($);
		page.updateAppointmentEditorSummary('add');
	});

	// Event handlers for edit modal
	$(document).off('shown.bs.modal.appointmentManagement', '#editAppointmentModal').on('shown.bs.modal.appointmentManagement', '#editAppointmentModal', function () {
		// Ensure submit button is always visible when modal is shown
		$('#editSubmitBtn').show();

		// Init ICD multi-select
		page.setupICDMultiSelect('editMedicalHistory', 'edit');

		// Đảm bảo status flag được cập nhật khi modal hiển thị
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (appointmentId && state.editCurrentAppointment) {
			setTimeout(() => {
				page.updateEditStatusFlag(state.editCurrentAppointment.status);
			}, 50);
		}

		// Đảm bảo tooltip không tự động show
		setTimeout(() => {
			$('[data-bs-toggle="tooltip"]').each(function () {
				const tooltip = bootstrap.Tooltip.getInstance(this);
				if (tooltip) {
					tooltip.hide();
				}
			});
		}, 100);
	});

	// Xóa lịch hẹn từ modal chỉnh sửa
	$(document).off('click.appointmentManagement', '#editDeleteAppointmentBtn').on('click.appointmentManagement', '#editDeleteAppointmentBtn', function () {
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (!appointmentId) return;

		window.CustomModal.confirm('Lịch hẹn sẽ bị ẩn khỏi danh sách và đánh dấu đã hủy. Bạn chắc chắn muốn tiếp tục?', 'Xác nhận xóa/ẩn', 'warning', 'danger').then(function (confirmed) {
			if (!confirmed) return;
			$('#editAppointmentModal').modal('hide');
			page.doDeleteAppointment(appointmentId);
		});
	});

	$(document).off('click.appointmentManagement', '#sendEmailReminderBtn').on('click.appointmentManagement', '#sendEmailReminderBtn', function () {
		window.AppointmentManagementPageActionsUtils.sendEmailReminder(page.getPageActionsOptions());
	});

	$(document).off('click.appointmentManagement', '[data-edit-appointment-status]').on('click.appointmentManagement', '[data-edit-appointment-status]', function (event) {
		event.preventDefault();
		const newStatus = $(this).data('editAppointmentStatus');
		if (newStatus) {
			page.updateEditAppointmentStatus(newStatus);
		}
	});

	$(document).off('click.appointmentManagement', '[data-appointment-action="close-edit-modal"]').on('click.appointmentManagement', '[data-appointment-action="close-edit-modal"]', function (event) {
		event.preventDefault();
		page.closeModalAndResetBreadcrumb();
	});

	$(document).off('hidden.bs.modal.appointmentManagement', '#editAppointmentModal').on('hidden.bs.modal.appointmentManagement', '#editAppointmentModal', function () {
		// Reset form
		$('#editAppointmentForm')[0].reset();
		$('#editAppointmentModal').removeData('appointmentId');
		$('#editAppointmentModal').removeData('patientId');

		// Clear errors
		page.clearAllEditFieldErrors();

		// Enable all fields (use the real template ids)
		$('#editPatientName, #editPatientPhone, #editPatientCCCD, #editPatientEmail, #editPatientDOB, #editMedicalHistorySearch, #editAllergies, #editCurrentMedication').prop('disabled', false).removeClass('bg-light');

		// Ensure submit button is always visible for single form
		$('#editSubmitBtn').show();

		// Xóa cấp 3 "CHI TIẾT" khỏi breadcrumb
		page.updateBreadcrumb();
	});

	// Khởi tạo modal events khi document ready
	$(document).ready(function () {
		// Khởi tạo modal khi shown
		$('#addAppointmentModal').off('shown.bs.modal.appointmentAddPrepare').on('shown.bs.modal.appointmentAddPrepare', function () {

			try {
				window.AppointmentManagementAddModalUiUtils.prepareAddModalShown({
					$,
					document,
					setDatepickerValue: window.setDatepickerValue,
					setupICDMultiSelect: page.setupICDMultiSelect,
					initializePhase3Features: page.initializePhase3Features
				});
				page.updateAppointmentEditorSummary('add');

			} catch (error) {
				console.error('Không thể mở form thêm lịch hẹn:', error);
			}
		});

	});

	// Submit button click handler
	$(document).off('click.appointmentManagement', '#submitForm').on('click.appointmentManagement', '#submitForm', function () {

		// Prevent double click
		const $submitBtn = $(this);
		if ($submitBtn.prop('disabled')) {
			return;
		}

		// Set submitting state
		$submitBtn.prop('disabled', true);

		// Validate tối thiểu các field bắt buộc
		if (!page.isAddFormValid()) {
			$submitBtn.prop('disabled', false); // Re-enable nếu validation fail
			return;
		}

		// Nếu tất cả valid, submit form
		page.submitAppointmentForm();
	});

	$(document).off('serviceSelected.appointmentManagement', '#addService').on('serviceSelected.appointmentManagement', '#addService', function (event, selectedService) {
		if (selectedService?.duration_minutes) {
			$('#addDuration').val(selectedService.duration_minutes);
		}
		if (selectedService?.id) {
			page.loadServicePrices(selectedService.id);
		}
	});

	$(document).off('serviceSelected.appointmentManagement', '#editService').on('serviceSelected.appointmentManagement', '#editService', function (event, selectedService) {
		if (selectedService?.duration_minutes) {
			$('#editDuration').val(selectedService.duration_minutes);
		}
		if (selectedService?.id) {
			page.loadServicePrices(selectedService.id);
		}
	});

	// Auto-fill duration khi chọn gói
	$(document).off('change.appointmentManagement', '#addPackage').on('change.appointmentManagement', '#addPackage', function () {
		window.AppointmentManagementAddModalUiUtils.applySelectedDuration($, this, false);
	});

	// Toggle service/package selection
	$('input[name="appointmentType"]').off('change.appointmentManagement').on('change.appointmentManagement', function () {
		window.AppointmentManagementAddModalUiUtils.applyAppointmentTypeSelection($, $(this).val(), true);
	});

	// Initialize ICD multi-select when page loads
	page.initializeICDMultiSelect();

	// Đảm bảo event handler cho nút submit edit được khởi tạo
	$(document).off('click.appointmentManagement', '#editSubmitBtn').on('click.appointmentManagement', '#editSubmitBtn', function (e) {
		e.preventDefault();
		e.stopPropagation();

		// Validate các trường bắt buộc
		const fullName = $('#editPatientName').val().trim();
		const appointmentDate = $('#editAppointmentDate').val();
		const appointmentTime = $('#editAppointmentTime').val();
		const doctor = $('#editDoctor').val();

		if (!fullName) {
			page.showCustomToast('error', 'Vui lòng nhập họ và tên bệnh nhân');
			return;
		}

		if (!appointmentDate) {
			page.showCustomToast('error', 'Vui lòng chọn ngày hẹn');
			return;
		}

		if (!appointmentTime) {
			page.showCustomToast('error', 'Vui lòng chọn giờ hẹn');
			return;
		}

		if (!doctor) {
			page.showCustomToast('error', 'Vui lòng chọn bác sĩ khám');
			return;
		}

		page.submitEditAppointmentForm();
	});

	$(document).off('click.appointmentManagement', '[data-busy-schedule-action="close"]').on('click.appointmentManagement', '[data-busy-schedule-action="close"]', function () {
		window.AppointmentManagementBusySchedulePopupUtils.closeBusySchedulePopup($);
	});

	// Helper function để broadcast busy schedule changes (gọi từ các nơi tạo/xóa/update)
	window.notifyBusyScheduleChanged = function () {
		if ('BroadcastChannel' in window) {
			const channel = new BroadcastChannel('busy_schedule_updates');
			channel.postMessage({ type: 'BUSY_SCHEDULE_CHANGED', timestamp: Date.now() });
			channel.close();
		}
		// Fallback: cập nhật localStorage để trigger storage event ở các tab khác
		localStorage.setItem('busy_schedule_version', Date.now().toString());

		// Cũng refresh local panel
		page.refreshBusySchedulesOnce();
	};

	$(document).off('click.appointmentManagement', '[data-doctor-busy-action="open"]').on('click.appointmentManagement', '[data-doctor-busy-action="open"]', function () {
		const doctorId = $(this).data('doctorId');
		const doctorName = $(this).data('doctorName');
		window.AppointmentManagementBusySchedulePopupUtils.showDoctorBusySchedules(
			$,
			window.AppointmentManagementBusySchedulePanelUtils,
			doctorId,
			doctorName,
			state.currentBusySchedules
		);
	});

	$(document).off('click.appointmentManagement', '[data-doctor-busy-action="close"]').on('click.appointmentManagement', '[data-doctor-busy-action="close"]', function () {
		window.AppointmentManagementBusySchedulePopupUtils.closeDoctorBusyPopup($);
	});

	// Cleanup khi rời khỏi trang
	$(window).off('beforeunload.appointmentManagement').on('beforeunload.appointmentManagement', function () {
		if (window.updateTimeout) {
			clearTimeout(window.updateTimeout);
		}
	});

	window.AppointmentManagementCalendarConnectionUtils.initializeCalendarConnection({
		$,
		hasSession: () => window.QLPKApiTransport.hasSession(),
		loadCalendarStatus: page.loadCalendarStatus,
		onReady: page.initSyncCalendarModal,
		showCustomToast: page.showCustomToast,
		window
	});

	window.AppointmentManagementPageInteractionsUtils.initializePageInteractions({
		$,
		document,
		refreshView: page.refreshView,
		setSearchKeyword: function (value) {
			state.searchKeyword = value;
		}
	});

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'catalog.changed', 'busy_schedule.changed'],
			debounceMs: 500,
			handler: function (event) {
				if (event.type === 'busy_schedule.changed') {
					page.refreshBusySchedulesOnce();
					return;
				}
				if (event.type === 'catalog.changed') {
					page.loadDoctors();
					page.loadServices();
					page.loadPackages();
				}
				page.afterDataChanged();
			}
		});
	}
});
