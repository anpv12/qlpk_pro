// Modal thêm: validation, lưu, trạng thái sửa, ICD.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	// ===== CÁC HÀM GỬI THÔNG BÁO =====
	function getPageActionsOptions() {
		return {
			$,
			CustomModal: window.CustomModal,
			showCustomToast: page.showCustomToast
		};
	}

	// ===== ADD APPOINTMENT MODAL SETUP =====

	function initializePhase3Features() {

		try {
			// Khởi tạo form validation
			initializeFormValidation();

		} catch (error) {
		}
	}

	// Khởi tạo form validation
	function initializeFormValidation() {
		window.AppointmentManagementAddModalUiUtils.initializeFormValidation({ $ });
	}

	// Submit form với loading state
	function submitAppointmentForm() {
		const $submitBtn = $('#submitForm');

		$submitBtn.addClass('btn-loading').prop('disabled', true);

		const formData = window.AppointmentManagementAddModalUiUtils.buildAddAppointmentFormData({
			$,
			getSelectedICDsString
		});

		// Kiểm tra lịch bận trước khi tạo lịch hẹn
		page.checkDoctorAvailabilityBeforeCreate(formData, function (isAvailable, conflictInfo) {
			if (!isAvailable) {
				// Hiển thị cảnh báo xung đột
				page.showConflictWarning(conflictInfo, formData, false);
				$submitBtn.removeClass('btn-loading').prop('disabled', false);
				return;
			}

			// Nếu bác sĩ rảnh, tiếp tục tạo lịch hẹn
			$.ajax({
				url: '/api/',
				method: 'POST',
				contentType: 'application/json',
				data: JSON.stringify(formData),
				timeout: 10000, // 10 seconds timeout
				success: function (response) {
					// Kiểm tra xem có yêu cầu confirm không (patient trùng với thay đổi quan trọng)
					if (response.requires_confirmation) {
						// Hiển thị popup cảnh báo và yêu cầu confirm
						page.showPatientDuplicateWarning(response, formData);
						$submitBtn.removeClass('btn-loading').prop('disabled', false);
						return;
					}

					page.showCustomToast('success', 'Thêm lịch hẹn thành công!');
					$('#addAppointmentModal').modal('hide');
					page.afterDataChanged();
				},
				error: function (xhr, status, error) {

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

	// Simple form validation for Add Appointment modal (bỏ logic step cũ)
	function isAddFormValid() {
		return window.AppointmentManagementAddModalUiUtils.isAddFormValid($);
	}

	// Function to update appointment status from edit modal
	function updateEditAppointmentStatus(newStatus) {
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		const normalizedStatus = page.normalizeAppointmentStatus(newStatus);
		const currentStatus = page.getCurrentEditAppointmentStatus();
		const blockMessage = page.getEditStatusTransitionBlockMessage(currentStatus, normalizedStatus);
		if (blockMessage) {
			page.showCustomToast('warning', blockMessage);
			page.refreshEditStatusDropdown(currentStatus);
			return;
		}

		if (!appointmentId) {
			page.showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
			return;
		}

		const statusText = page.getStatusText(normalizedStatus);

		// Sử dụng custom modal thay vì confirm
		window.CustomModal.confirm(`Bạn có chắc chắn muốn thay đổi trạng thái thành "${statusText}"?`, 'Xác nhận thay đổi trạng thái').then((confirmed) => {
			if (confirmed) {
				$.ajax({
					url: `/api/${appointmentId}`,
					method: 'PUT',
					contentType: 'application/json',
						data: JSON.stringify({
							status: normalizedStatus
						}),
						success: function () {
							page.showCustomToast('success', `Đã cập nhật trạng thái thành "${statusText}" thành công!`);
							if (state.editCurrentAppointment) {
								state.editCurrentAppointment.status = normalizedStatus;
							}
							page.updateEditStatusFlag(normalizedStatus);
							page.updateAppointmentEditorSummary('edit');
							page.afterDataChanged();
						},
					error: function (xhr) {
						page.showCustomToast('error', 'Không thể cập nhật trạng thái. Vui lòng thử lại.');
					}
				});
			}
		});
	}

	function initializeICDMultiSelect() {
		window.AppointmentManagementIcdMultiselectUtils.initializeICDMultiSelect($);
	}

	function setupICDMultiSelect(fieldId, mode) {
		window.AppointmentManagementIcdMultiselectUtils.setupICDMultiSelect($, fieldId, mode);
	}

	function getSelectedICDsString(mode) {
		return window.AppointmentManagementIcdMultiselectUtils.getSelectedICDsString(mode);
	}

	async function setSelectedICDsFromString(icdString, mode) {
		return window.AppointmentManagementIcdMultiselectUtils.setSelectedICDsFromString($, icdString, mode);
	}

	function clearSelectedICDs(mode) {
		window.AppointmentManagementIcdMultiselectUtils.clearSelectedICDs($, mode);
	}

	Object.assign(page, {
		getPageActionsOptions,
		initializePhase3Features,
		initializeFormValidation,
		submitAppointmentForm,
		isAddFormValid,
		updateEditAppointmentStatus,
		initializeICDMultiSelect,
		setupICDMultiSelect,
		getSelectedICDsString,
		setSelectedICDsFromString,
		clearSelectedICDs
	});
})(window);
