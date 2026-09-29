// Kiểm tra lịch trống, cảnh báo trùng, làm mới view, thống kê, xuất Excel.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	// Hàm kiểm tra bác sĩ có rảnh không cho drag & drop
	function checkDoctorAvailabilityForDragDrop(appointmentId, newDate, info) {
		//   appointmentId: appointmentId,
		//   newDate: newDate,
		//   newDateISO: newDate.toISOString(),
		//   newDateLocal: newDate.toLocaleString('vi-VN')
		// });

		// Xử lý ID format - calendar events sử dụng appt-{id}
		let numericId = appointmentId;
		if (appointmentId.startsWith('appt-')) {
			numericId = appointmentId.replace('appt-', '');
		}

		const appointment = state.allAppointments.find(a => a.id == numericId);
		if (!appointment) {
			//   numericId: numericId,
			//   availableIds: allAppointments.map(a => a.id)
			// });
			page.showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			info.revert();
			return;
		}

		//   id: appointment.id,
		//   doctor_id: appointment.doctor_id,
		//   duration_minutes: appointment.duration_minutes,
		//   original_date: appointment.appointment_date
		// });

		// Tạo appointment data để kiểm tra
		const appointmentData = {
			appointment_date: page.toLocalISOString(newDate),
			doctor_id: appointment.doctor_id,
			duration_minutes: appointment.duration_minutes,
			appointment_id: numericId
		}

		//   appointment_date: appointmentData.appointment_date,
		//   doctor_id: appointmentData.doctor_id,
		//   duration_minutes: appointmentData.duration_minutes
		// });

		// Kiểm tra lịch bận
		checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {
			//   isAvailable: isAvailable,
			//   conflictInfo: conflictInfo,
			//   appointmentData: appointmentData
			// });

			if (isAvailable) {
				// Bác sĩ rảnh, cập nhật lịch hẹn
				page.showCustomToast('info', 'Đang cập nhật...');

				// Debounce để tránh gọi API quá nhiều
				clearTimeout(window.updateTimeout);
				window.updateTimeout = setTimeout(() => {
					page.updateAppointmentTime(appointmentId, newDate, info);
				}, 300);
			} else {
				// Bác sĩ bận, hiển thị cảnh báo và revert
				showConflictWarning(conflictInfo, appointmentData, true);
				info.revert(); // Revert the drag
			}
		});
	}

	// Hàm kiểm tra bác sĩ có rảnh không trước khi tạo lịch hẹn
	function checkDoctorAvailabilityBeforeCreate(appointmentData, callback) {
		const appointmentDateTime = appointmentData.appointment_date;
		const durationMinutes = parseInt(appointmentData.duration_minutes) || 30;

		//   doctor_id: appointmentData.doctor_id,
		//   appointment_datetime: appointmentDateTime,
		//   duration_minutes: durationMinutes,
		//   url: '/api/check-doctor-availability'
		// });

		$.ajax({
			url: '/api/check-doctor-availability',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			data: JSON.stringify({
				doctor_id: appointmentData.doctor_id,
				appointment_datetime: appointmentDateTime,
				duration_minutes: durationMinutes,
				appointment_id: appointmentData.appointment_id || null
			}),
			success: function (response) {
				//   response: response,
				//   available: response.available,
				//   conflict_info: response.conflict_info
				// });

				if (response.available === true) {
					callback(true, null);
				} else {
					// Merge conflict_type vào conflict_info để có đầy đủ thông tin
					const conflictInfo = response.conflict_info || {};
					if (response.conflict_type) {
						conflictInfo.conflict_type = response.conflict_type;
					}
					callback(false, conflictInfo);
				}
			},
			error: function (xhr) {
				// Nếu API lỗi, log chi tiết và fallback
				//   status: xhr.status,
				//   statusText: xhr.statusText,
				//   responseText: xhr.responseText,
				//   appointmentData: appointmentData
				// });
				callback(true, null);
			}
		});
	}

	// Hàm hiển thị cảnh báo xung đột
	function showConflictWarning(conflictInfo, appointmentData, isEdit = false) {
		window.AppointmentManagementConflictWarningUtils.showConflictWarning(conflictInfo, appointmentData, {
			$,
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
		state.viewAppointments = window.AppointmentManagementFilterUtils.filterAppointments(state.allAppointments, {
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
		page.updateCalendarEvents();
	}

	function loadCalendarRangeData(dateFrom, dateTo) {
		const requestSeq = ++state.calendarDataRequestSeq;
		state.currentCalendarDateFrom = dateFrom || '';
		state.currentCalendarDateTo = dateTo || '';

		$.when(
			page.loadAppointmentsData(dateFrom, dateTo),
			page.loadHolidaysData(),
			page.loadDoctorBusySchedulesData(dateFrom, dateTo)
		).done(function (appointments, holidays, busySchedules) {
			if (requestSeq !== state.calendarDataRequestSeq) return;

			state.allAppointments = appointments || [];
			state.currentCalendarHolidays = holidays || [];
			state.currentCalendarBusySchedules = busySchedules || [];
			refreshView();
		}).fail(function (status) {
			if (status === 'abort' || requestSeq !== state.calendarDataRequestSeq) return;

			state.allAppointments = [];
			state.currentCalendarBusySchedules = [];
			refreshView();
		});
	}

	// Hàm reload data sau khi thêm/sửa/xóa
	function afterDataChanged() {
		const { dateFrom, dateTo } = page.getCalendarDateRange();
		loadCalendarRangeData(dateFrom, dateTo);
	}

	// Hàm hiển thị cảnh báo patient trùng với thay đổi quan trọng
	function showPatientDuplicateWarning(response, appointmentData) {
		window.AppointmentManagementPatientDuplicateWarningUtils.showPatientDuplicateWarning({
			$,
			response,
			appointmentData,
			formatDateDisplay: window.formatDateDisplay,
			onConfirm: function () {
				appointmentData.confirm_update_patient = true;

				const $submitBtn = $('#submitForm');
				$submitBtn.prop('disabled', true).addClass('btn-loading');

				checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {
					if (!isAvailable) {
						showConflictWarning(conflictInfo, appointmentData, false);
						$submitBtn.removeClass('btn-loading').prop('disabled', false);
						return;
					}

					$.ajax({
						url: '/api/',
						method: 'POST',
						contentType: 'application/json',
						data: JSON.stringify(appointmentData),
						timeout: 10000,
						success: function () {
							page.showCustomToast('success', 'Thêm lịch hẹn thành công!');
							$('#addAppointmentModal').modal('hide');
							afterDataChanged();
						},
						error: function (xhr, status) {
							let errorMsg = 'Không thể thêm lịch hẹn. Vui lòng kiểm tra lại.';
							if (status === 'timeout') {
								errorMsg = 'Thao tác mất quá nhiều thời gian. Vui lòng thử lại.';
							}
							page.showCustomToast('error', errorMsg);
						},
						complete: function () {
							$submitBtn.removeClass('btn-loading').prop('disabled', false);
						}
					});
				});
			}
		});
	}

	// Định dạng ngày và giờ
	function formatDate(dateStr) {
		return window.AppointmentManagementStatusFormatUtils.formatDate(dateStr);
	}
	function formatTime(dtStr) {
		return window.AppointmentManagementStatusFormatUtils.formatTime(dtStr);
	}

	// Cập nhật badge thống kê
	function updateStats() {
		// Đếm trên allAppointments với các filter khác (không filter theo status)
		// để hiển thị tổng số chính xác cho tất cả các status
		const userRole = getCurrentUserRole();
		const filteredAppointments = window.AppointmentManagementFilterUtils.filterAppointments(state.allAppointments, {
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
		const statusCounts = window.AppointmentManagementFilterUtils.countByStatus(filteredAppointments);

		// Cập nhật số lượng cho các badge
		window.QLPKAppointmentCalendar.renderStatusCounts(document.querySelector('.appt-status-list'), statusCounts);
	}

	// Hàm xuất Excel — gọi backend API với openpyxl format
	function exportToExcel() {
		window.AppointmentManagementPageActionsUtils.exportToExcel({
			$,
			document,
			selectedDoctor: state.selectedDoctor,
			selectedRoleFilter: state.selectedRoleFilter,
			showCustomToast: page.showCustomToast
		});
	}

	Object.assign(page, {
		checkDoctorAvailabilityForDragDrop,
		checkDoctorAvailabilityBeforeCreate,
		showConflictWarning,
		getCurrentUserRole,
		updateViewAppointments,
		refreshView,
		loadCalendarRangeData,
		afterDataChanged,
		showPatientDuplicateWarning,
		formatDate,
		formatTime,
		updateStats,
		exportToExcel
	});
})(window);
