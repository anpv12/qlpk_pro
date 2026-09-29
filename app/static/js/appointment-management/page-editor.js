// Modal thêm, sự kiện lịch, tóm tắt editor, breadcrumb, xóa, thông báo.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	// Mở modal add với ngày đã chọn
	function openAddModal(dateStr) {
		window.AppointmentManagementAddModalUiUtils.resetAddModalForOpen({
			$,
			dateStr,
			clearSelectedICDs: page.clearSelectedICDs,
			loadDoctorsForAdd: page.loadDoctorsForAdd,
			loadServices: page.loadServices,
			loadPackages: page.loadPackages
		});
	}

	// Cập nhật events cho calendar
	function updateCalendarEvents() {

		if (!state.calendar) {
			page.initializeCalendar();
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
		const eventSourceUtils = window.AppointmentManagementCalendarEventSourceUtils;
		const appointmentEvents = eventSourceUtils.buildCurrentAppointmentEvents(appointmentsToShow);

		// Không hiển thị busy schedules trên calendar nữa
		// Thay vào đó sẽ hiển thị trong panel riêng

		// Kết hợp tất cả events (chỉ appointments)
		const allEvents = [...appointmentEvents];

		// Cập nhật panel hiển thị bác sĩ bận
		page.updateBusyDoctorsPanel(busySchedules);

		// Setup realtime update cho busy schedules
		page.setupRealtimeBusyScheduleUpdate();

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
		return window.AppointmentManagementStatusFormatUtils.getStatusText(status);
	}

	function getStatusIcon(status) {
		return window.AppointmentManagementStatusFormatUtils.getStatusIcon(status);
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
		const value = $(selector).val();
		const text = $(`${selector} option:selected`).text().trim();
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

		$(summarySelector)
			.removeClass('appointment-status-scheduled appointment-status-confirmed appointment-status-no-show appointment-status-cancelled')
			.addClass(statusClass)
			.text(getStatusText(status || 'SCHEDULED'));
	}

	function updateAppointmentEditorSummary(mode) {
		const config = getAppointmentEditorModeConfig(mode);
		const prefix = config.prefix;
		const name = $(`#${prefix}PatientName`).val().trim() || config.defaultName;
		const dobValue = $(`#${prefix}PatientDOB`).val();
		const dobText = formatAppointmentEditorDate(dobValue);
		const age = calculateAppointmentEditorAge(dobValue);
		const dobAgeText = dobText
			? `${dobText}${age !== null ? ` · ${age} tuổi` : ''}`
			: 'Chưa có ngày sinh';
		const appointmentDate = formatAppointmentEditorDate($(`#${prefix}AppointmentDate`).val()) || 'Chưa chọn';
		const appointmentTime = $(`#${prefix}AppointmentTime`).val() || 'Chưa chọn';
		const doctorText = getAppointmentEditorSelectText(`#${prefix}Doctor`, 'Chưa chọn');
		const categoryValue = $(`input[name="${config.categoryName}"]:checked`).val();
		const categoryText = categoryValue === 'RE_EXAMINATION' ? 'Tái khám' : 'Khám mới';
		const status = $(`#${prefix}Status`).val() || 'SCHEDULED';

		$(`#${prefix}SummaryName`).text(name);
		$(`#${prefix}SummaryDobAge`).text(dobAgeText);
		$(`#${prefix}SummaryDate`).text(appointmentDate);
		$(`#${prefix}SummaryTime`).text(appointmentTime);
		$(`#${prefix}SummaryDoctor`).text(doctorText);
		$(`#${prefix}SummaryCategory`).text(categoryText);
		updateAppointmentSummaryStatus(mode, status);
	}

	function bindAppointmentEditorSummaries() {
		$(document)
			.off('input.appointmentEditorSummary change.appointmentEditorSummary', '#addAppointmentForm input, #addAppointmentForm select')
			.on('input.appointmentEditorSummary change.appointmentEditorSummary', '#addAppointmentForm input, #addAppointmentForm select', function () {
				updateAppointmentEditorSummary('add');
			});

		$(document)
			.off('input.appointmentEditorSummary change.appointmentEditorSummary', '#editAppointmentForm input, #editAppointmentForm select')
			.on('input.appointmentEditorSummary change.appointmentEditorSummary', '#editAppointmentForm input, #editAppointmentForm select', function () {
				updateAppointmentEditorSummary('edit');
			});

		$(document)
			.off('shown.bs.modal.appointmentEditorSummary', '#addAppointmentModal')
			.on('shown.bs.modal.appointmentEditorSummary', '#addAppointmentModal', function () {
				updateAppointmentEditorSummary('add');
			});

		$(document)
			.off('shown.bs.modal.appointmentEditorSummary', '#editAppointmentModal')
			.on('shown.bs.modal.appointmentEditorSummary', '#editAppointmentModal', function () {
				updateAppointmentEditorSummary('edit');
			});
	}

	// Hàm cập nhật breadcrumb
	function updateBreadcrumb(thirdLevel = null) {
		window.AppointmentManagementPageActionsUtils.updateBreadcrumb($, thirdLevel);
	}

	// Hàm đóng modal và reset breadcrumb
	function closeModalAndResetBreadcrumb() {
		window.AppointmentManagementPageActionsUtils.closeModalAndResetBreadcrumb({
			$,
			updateBreadcrumb
		});
	}

	// Hàm gọi API xóa appointment (hỗ trợ force param cho lifecycle guard)
	function doDeleteAppointment(appointmentId, force = false) {
		$.ajax({
			url: `/api/appointments/${appointmentId}/cancel`,
			type: 'DELETE',
			contentType: 'application/json',
			data: force ? JSON.stringify({ force: true }) : undefined,
			success: function (response) {
				showCustomToast('success', 'Đã xóa lịch hẹn thành công!');
				page.afterDataChanged();
			},
			error: function (xhr) {
				const data = xhr.responseJSON || {};
				if (xhr.status === 409 && data.requires_force) {
					// Đang trong quá trình khám — hỏi xác nhận lần 2
					window.CustomModal.confirm('Lịch hẹn đang được sử dụng trong ca khám. Bạn có chắc muốn xóa?', 'Xác nhận xóa/ẩn', 'warning', 'danger').then(function (confirmed) {
						if (confirmed) {
							doDeleteAppointment(appointmentId, true);
						}
					});
				} else {
					// 400 blocked hoặc lỗi khác — hiển thị thông báo
					showCustomToast('error', 'Không thể xóa lịch hẹn. Vui lòng kiểm tra lại.');
				}
			}
		});
	}

	function showCustomToast(type, message) {
		window.AppointmentManagementFeedbackUtils.showToast({
			bootstrap,
			document,
			message,
			type
		});
	}

	Object.assign(page, {
		openAddModal,
		updateCalendarEvents,
		updateCalendarWithHolidaysAndBusySchedules,
		getStatusText,
		getStatusIcon,
		parseAppointmentEditorDate,
		formatAppointmentEditorDate,
		calculateAppointmentEditorAge,
		getAppointmentEditorModeConfig,
		getAppointmentEditorSelectText,
		updateAppointmentSummaryStatus,
		updateAppointmentEditorSummary,
		bindAppointmentEditorSummaries,
		updateBreadcrumb,
		closeModalAndResetBreadcrumb,
		doDeleteAppointment,
		showCustomToast
	});
})(window);
