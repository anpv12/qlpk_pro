// Modal sửa lịch hẹn: mở, điền form, trạng thái, lưu.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	// Mở modal edit
	function openEditModal(appointmentId) {

		// Try different ID formats to find the appointment
		let appointment = state.allAppointments.find(a => String(a.id) === String(appointmentId));

		// If not found, try without "appt-" prefix (calendar events use appt-{id} format)
		if (!appointment && appointmentId.startsWith('appt-')) {
			const numericId = appointmentId.replace('appt-', '');
			appointment = state.allAppointments.find(a => String(a.id) === String(numericId));
		}

		// If still not found, try string comparison
		if (!appointment) {
			appointment = state.allAppointments.find(a => String(a.id) === String(appointmentId));
		}

		// If still not found, try with "appt-" prefix
		if (!appointment) {
			appointment = state.allAppointments.find(a => `appt-${a.id}` === appointmentId);
		}

		if (!appointment) {
			page.showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			return;
		}

		// Thêm cấp 3 "CHI TIẾT" vào breadcrumb
		page.updateBreadcrumb('CHI TIẾT');

		state.editCurrentAppointment = appointment;

		// Show modal first
		$('#editAppointmentModal').modal('show');
		// Store the actual numeric appointment ID for API calls
		$('#editAppointmentModal').data('appointmentId', appointment.id);
		// Store linked patient ID (no #editPatientId input exists in the template)
		$('#editAppointmentModal').data('patientId', appointment.patient_id);

		// Xóa dữ liệu của bệnh nhân trước đó ngay khi mở (chống rò rỉ A -> B trong lúc
		// chờ API /edit trả về; form.reset() không xóa tag ICD render bằng JS)
		$('#editAppointmentForm')[0].reset();
		window.AppointmentManagementIcdMultiselectUtils.clearSelectedICDs($, 'edit');

		// Ensure submit button is always visible for single form
		$('#editSubmitBtn').show();

		// Load data for edit modal - đồng bộ hóa việc tải dropdown trước khi populate form
		$.when(
			loadDoctorsForEdit(),
			page.loadServices(),
			page.loadPackages()
		).done(function () {
			// Initialize edit modal features
			initializeEditModalFeatures();

			// Populate form fields: ưu tiên gọi API chi tiết để có patient_info đầy đủ
			// Use the actual appointment ID (not the calendar event ID with appt- prefix)
			const actualAppointmentId = appointment.id;
			$.ajax({
				url: `/api/${actualAppointmentId}/edit`,
				method: 'GET',
				success: async function (detailed) {
					// Bỏ qua response cũ nếu user đã đóng modal hoặc mở lịch hẹn khác
					if ($('#editAppointmentModal').data('appointmentId') !== actualAppointmentId) return;
					await populateEditForm(detailed);
					// Đảm bảo status flag được cập nhật sau khi modal đã hiển thị
					setTimeout(() => {
						updateEditStatusFlag(detailed.status);
					}, 100);
				},
				error: async function () {
					// Bỏ qua response cũ nếu user đã đóng modal hoặc mở lịch hẹn khác
					if ($('#editAppointmentModal').data('appointmentId') !== actualAppointmentId) return;
					// Fallback: dùng dữ liệu sẵn có nếu API lỗi
					await populateEditForm(appointment);
					// Đảm bảo status flag được cập nhật sau khi modal đã hiển thị
					setTimeout(() => {
						updateEditStatusFlag(appointment.status);
					}, 100);
				}
			});
		}).fail(function () {
			page.showCustomToast('error', 'Lỗi tải dữ liệu dropdown. Vui lòng thử lại.');
		});
	}

	// Load danh sách bác sĩ cho edit modal
	function loadDoctorsForEdit() {
		return $.ajax({
			url: '/users/doctors',
			method: 'GET',
			success: function (res) {
				state.doctors = res;
				window.AppointmentManagementDoctorControlsUtils.populateDoctorSelect($, '#editDoctor', state.doctors, 'Chọn bác sĩ');
			},
			error: function (xhr) {

				// Handle authentication error
				if (xhr.status === 401) {
					page.showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
				} else {
					page.showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	// Initialize edit modal features
	function initializeEditModalFeatures() {
		// Initialize form validation
		initializeEditFormValidation();
	}

	// Show edit field error
	function showEditFieldError(selector, message) {
		window.AppointmentManagementEditModalUiUtils.showEditFieldError($, selector, message);
	}

	// Clear edit field error
	function clearEditFieldError(selector) {
		window.AppointmentManagementEditModalUiUtils.clearEditFieldError($, selector);
	}

	// Clear all edit field errors
	function clearAllEditFieldErrors() {
		window.AppointmentManagementEditModalUiUtils.clearAllEditFieldErrors($);
	}

	// Populate edit form
	async function fillEditHistoryFields(appointment) {
		const historyPatient = appointment.medical_history?.patient || {};
		await page.setSelectedICDsFromString(historyPatient.physical_history || [], 'edit');
		window.AppointmentManagementAllergyFormatUtils.setFieldValue($('#editAllergies'), historyPatient.allergies || []);
		$('#editCurrentMedication').val(appointment.patient_info?.current_medication || '');
	}

	async function populateEditForm(appointment) {
		fillEditPatientFields(appointment);

		await fillEditHistoryFields(appointment);

		// Set doctor value - dropdown đã được tải xong
		$('#editDoctor').val(appointment.doctor_id || '');
		$('#editStatus').val(appointment.status || 'SCHEDULED');

		fillEditServiceSelection(appointment);
		fillEditCategory(appointment.appointment_category || 'NEW');

		// Intake reason and symptoms are examination-owned fields.
		const examinationInfo = appointment.examination_info || {};
		$('#editMainReason').val(examinationInfo.main_reason || '');
		$('#editSymptoms').val(examinationInfo.main_symptoms || '');

		// Ưu tiên: duration từ service/package > appointment.duration_minutes > mặc định 60
		$('#editDuration').val(getEditDurationFromSelection(appointment) || appointment.duration_minutes || 60);

		// Update status flag
		updateEditStatusFlag(appointment.status);
		page.updateAppointmentEditorSummary('edit');
	}

	function getEditPatientPhone(appointment) {
		return appointment.patient_info?.phone || appointment.patient_phone || appointment.phone || '';
	}

	function getEditPatientIdNumber(appointment) {
		return appointment.patient_id_number || appointment.id_number || (appointment.patient_info ? appointment.patient_info.id_number : '') || '';
	}

	function fillEditPatientFields(appointment) {
		$('#editPatientName').val(appointment.patient_full_name || appointment.full_name || '');

		// Appointment details - set this EARLY to avoid async blocking issues
		if (appointment.appointment_date) {
			const appointmentDate = new Date(appointment.appointment_date);
			const dateStr = appointmentDate.toISOString().split('T')[0];
			const timeStr = appointmentDate.toTimeString().slice(0, 5);
			window.setDatepickerValue(document.getElementById('editAppointmentDate'), dateStr, true);
			$('#editAppointmentTime').val(timeStr);
		}

		$('#editPatientPhone').val(getEditPatientPhone(appointment));
		$('#editPatientCCCD').val(getEditPatientIdNumber(appointment));
		$('#editPatientEmail').val(appointment.patient_email || appointment.patient_info?.email || '');

		const dobValue = appointment.patient_date_of_birth || appointment.patient_info?.date_of_birth || '';
		window.setDatepickerValue(document.getElementById('editPatientDOB'), dobValue, true);
	}

	function showEditServiceMode(isService) {
		$(isService ? '#editServiceSelection' : '#editPackageSelection').show();
		$(isService ? '#editPackageSelection' : '#editServiceSelection').hide();
	}

	function fillEditServiceSelection(appointment) {
		// Set service autocomplete: tìm tên dịch vụ từ ID
		if (appointment.service_id && state.services && state.services.length > 0) {
			const svc = state.services.find(s => String(s.id) === String(appointment.service_id));
			$('#editService').val(svc ? svc.name : '');
			$('#editServiceId').val(appointment.service_id);
		} else {
			$('#editService').val('');
			$('#editServiceId').val('');
		}
		$('#editPackage').val(appointment.package_id || '');

		if (appointment.service_id) {
			$('#editTypeService').prop('checked', true);
			showEditServiceMode(true);
			page.updateEditPriceDisplay();
		} else if (appointment.package_id) {
			$('#editTypePackage').prop('checked', true);
			showEditServiceMode(false);
		} else {
			$('#editTypeService').prop('checked', true);
			showEditServiceMode(true);
		}
	}

	function fillEditCategory(appointmentCategory) {
		const isReExamination = appointmentCategory === 'RE_EXAMINATION';
		$('#editCategoryReExam').prop('checked', isReExamination);
		$('#editCategoryNew').prop('checked', !isReExamination);
	}

	function getEditDurationFromSelection(appointment) {
		if (appointment.service_id) {
			const selectedService = state.services.find(service => String(service.id) === String(appointment.service_id));
			return selectedService?.duration_minutes;
		}
		if (appointment.package_id) return $('#editPackage option:selected').data('duration');
		return null;
	}

	// Function to update status flag
	function updateEditStatusFlag(status) {
		const normalizedStatus = normalizeAppointmentStatus(status);
		$('#editStatus').val(normalizedStatus);
		window.AppointmentManagementEditModalUiUtils.updateEditStatusFlag({
			$,
			status: normalizedStatus,
			getStatusText: page.getStatusText,
			getStatusIcon: page.getStatusIcon
		});
		refreshEditStatusDropdown(normalizedStatus);
	}

	function normalizeAppointmentStatus(status) {
		const normalized = String(status || '').toUpperCase();
		return state.APPOINTMENT_STATUS_VALUES.includes(normalized) ? normalized : 'SCHEDULED';
	}

	function getCurrentEditAppointmentStatus() {
		return normalizeAppointmentStatus(
			(state.editCurrentAppointment && state.editCurrentAppointment.status) || $('#editStatus').val()
		);
	}

	function getEditStatusTransitionBlockMessage(currentStatus, newStatus) {
		if (!state.APPOINTMENT_STATUS_VALUES.includes(newStatus)) {
			return 'Trạng thái lịch hẹn không hợp lệ.';
		}
		if (newStatus === currentStatus) {
			return 'Lịch hẹn đang ở trạng thái này.';
		}
		if (currentStatus === 'CONFIRMED' && newStatus === 'SCHEDULED') {
			return 'Không thể chuyển lịch đã xác nhận về chờ xác nhận từ màn lịch hẹn.';
		}
		return '';
	}

	function refreshEditStatusDropdown(currentStatus) {
		const normalizedCurrentStatus = normalizeAppointmentStatus(currentStatus);
		$('[data-edit-appointment-status]').each(function () {
			const $item = $(this);
			const targetStatus = normalizeAppointmentStatus($item.data('editAppointmentStatus'));
			const blockedMessage = getEditStatusTransitionBlockMessage(normalizedCurrentStatus, targetStatus);
			const isBlocked = Boolean(blockedMessage);

			$item
				.toggleClass('disabled', isBlocked)
				.attr('aria-disabled', isBlocked ? 'true' : 'false')
				.attr('tabindex', isBlocked ? '-1' : '0')
				.attr('title', isBlocked ? blockedMessage : '');
		});
	}

	// Initialize edit form validation
	function initializeEditFormValidation() {
		window.AppointmentManagementEditModalUiUtils.initializeEditFormValidation({
			$,
			clearEditFieldError,
			showCustomToast: page.showCustomToast,
			updateEditPriceDisplay: page.updateEditPriceDisplay,
			updatePriceDisplay: page.updatePriceDisplay
		});
	}

	// Submit edit appointment form
	function submitEditAppointmentForm() {
		const $submitBtn = $('#editSubmitBtn');
		$submitBtn.prop('disabled', true).addClass('btn-loading');

		// Lấy ID lịch hẹn từ data của modal
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (!appointmentId) {
			page.showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
			$submitBtn.prop('disabled', false).removeClass('btn-loading');
			return;
		}

			const appointmentDateTime = $('#editAppointmentDate').val() + 'T' + $('#editAppointmentTime').val();
			const editAppointmentType = $('input[name="editAppointmentType"]:checked').val();

			const formData = {
			patient_id: $('#editAppointmentModal').data('patientId') || null,
			full_name: $('#editPatientName').val(),
			phone: $('#editPatientPhone').val(),
			id_number: $('#editPatientCCCD').val(),
			email: $('#editPatientEmail').val(),
			date_of_birth: $('#editPatientDOB').val(),
			physical_history: page.getSelectedICDsString('edit'),
			allergies: window.AppointmentManagementAllergyFormatUtils.getSubmitValue($('#editAllergies')),
			current_medication: $('#editCurrentMedication').val(),
			appointment_date: appointmentDateTime,
			doctor_id: $('#editDoctor').val(),
			status: $('#editStatus').val(),
			appointment_category: $('input[name="editAppointmentCategory"]:checked').val(),
				appointment_type: editAppointmentType,
				service_id: editAppointmentType === 'service' ? ($('#editServiceId').val() || null) : null,
				package_id: editAppointmentType === 'package' ? ($('#editPackage').val() || null) : null,
			main_reason: $('#editMainReason').val(),
			main_symptoms: $('#editSymptoms').val(),
			duration_minutes: $('#editDuration').val() || 30,
			// Đánh dấu nguồn lưu là màn lịch hẹn để backend không ghi đè lý do/triệu chứng
			// đã được bác sĩ nhập khi phiếu khám đã bắt đầu (xem update_service guard)
			is_appointment_edit: true
		}

		// Kiểm tra lịch bận trước khi cập nhật lịch hẹn
		const availabilityPayload = Object.assign({}, formData, { appointment_id: appointmentId });
		page.checkDoctorAvailabilityBeforeCreate(availabilityPayload, function (isAvailable, conflictInfo) {
			if (!isAvailable) {
				// Hiển thị cảnh báo xung đột
				page.showConflictWarning(conflictInfo, formData, true);
				$submitBtn.prop('disabled', false).removeClass('btn-loading');
				return;
			}

			// Nếu bác sĩ rảnh, tiếp tục cập nhật lịch hẹn
			$.ajax({
				url: `/api/${appointmentId}`,
				method: 'PUT',
				contentType: 'application/json',
				data: JSON.stringify(formData),
				timeout: 30000,
				success: function () {
					page.showCustomToast('success', 'Cập nhật lịch hẹn thành công!');
					$('#editAppointmentModal').modal('hide');
					page.afterDataChanged();
				},
				error: function () {
					const errorMessage = 'Không thể cập nhật lịch hẹn. Vui lòng kiểm tra lại.';
					page.showCustomToast('error', errorMessage);
				},
				complete: function () {
					$submitBtn.prop('disabled', false).removeClass('btn-loading');
				}
			});
		});
	}

	Object.assign(page, {
		openEditModal,
		loadDoctorsForEdit,
		initializeEditModalFeatures,
		showEditFieldError,
		clearEditFieldError,
		clearAllEditFieldErrors,
		populateEditForm,
		updateEditStatusFlag,
		normalizeAppointmentStatus,
		getCurrentEditAppointmentStatus,
		getEditStatusTransitionBlockMessage,
		refreshEditStatusDropdown,
		initializeEditFormValidation,
		submitEditAppointmentForm
	});
})(window);
