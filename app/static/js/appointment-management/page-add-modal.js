import { state } from './page-state.js';
import { getStatusText, showCustomToast, updateAppointmentEditorSummary } from './page-editor.js';
import { AppointmentManagementAddModalUiUtils } from './add-modal-ui-utils.js';
import { afterDataChanged, checkDoctorAvailabilityBeforeCreate, showConflictWarning, showPatientDuplicateWarning } from './page-view.js';
import { getCurrentEditAppointmentStatus, getEditStatusTransitionBlockMessage, normalizeAppointmentStatus, refreshEditStatusDropdown, updateEditStatusFlag } from './page-edit-modal.js';
import { AppointmentManagementIcdMultiselectUtils } from './icd-multiselect-utils.js';
import { hideModal } from '../shared/dom-query.js';
import { requestJson } from '../shared/http-json.js';
// Modal thêm: validation, lưu, trạng thái sửa, ICD.

// ===== CÁC HÀM GỬI THÔNG BÁO =====
function getPageActionsOptions() {
	return {
		CustomModal: window.CustomModal,
		showCustomToast: showCustomToast
	};
}

// ===== ADD APPOINTMENT MODAL SETUP =====

function initializePhase3Features() {

	try {
		// Khởi tạo form validation
		initializeFormValidation();

	} catch (error) {
		console.error('Không thể khởi tạo form thêm lịch hẹn:', error);
	}
}

// Khởi tạo form validation
function initializeFormValidation() {
	AppointmentManagementAddModalUiUtils.initializeFormValidation();
}

// Submit form với loading state
function submitAppointmentForm() {
	const submitButton = document.getElementById('submitForm');
	const setSubmitting = submitting => {
		if (!submitButton) return;
		submitButton.disabled = submitting;
		submitButton.classList.toggle('btn-loading', submitting);
	};
	setSubmitting(true);
	const formData = AppointmentManagementAddModalUiUtils.buildAddAppointmentFormData({ getSelectedICDsString });

	// Kiểm tra lịch bận trước khi tạo lịch hẹn
	checkDoctorAvailabilityBeforeCreate(formData, async (isAvailable, conflictInfo) => {
		if (!isAvailable) {
			showConflictWarning(conflictInfo, formData, false);
			setSubmitting(false);
			return;
		}
		try {
			const response = await requestJson('/api/', { method: 'POST', json: formData, signal: AbortSignal.timeout(10000) });
			// Patient trùng với thay đổi quan trọng: hiển thị cảnh báo và chờ xác nhận
			if (response?.requires_confirmation) {
				showPatientDuplicateWarning(response, formData);
				return;
			}
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

// Simple form validation for Add Appointment modal (bỏ logic step cũ)
function isAddFormValid() {
	return AppointmentManagementAddModalUiUtils.isAddFormValid();
}

// Function to update appointment status from edit modal
function updateEditAppointmentStatus(newStatus) {
	const appointmentId = state.editAppointmentId;
	const normalizedStatus = normalizeAppointmentStatus(newStatus);
	const currentStatus = getCurrentEditAppointmentStatus();
	const blockMessage = getEditStatusTransitionBlockMessage(currentStatus, normalizedStatus);
	if (blockMessage) {
		showCustomToast('warning', blockMessage);
		refreshEditStatusDropdown(currentStatus);
		return;
	}

	if (!appointmentId) {
		showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
		return;
	}

	const statusText = getStatusText(normalizedStatus);

	// Sử dụng custom modal thay vì confirm
	window.CustomModal.confirm(`Bạn có chắc chắn muốn thay đổi trạng thái thành "${statusText}"?`, 'Xác nhận thay đổi trạng thái').then((confirmed) => {
		if (!confirmed) return;
		requestJson(`/api/${appointmentId}`, { method: 'PUT', json: { status: normalizedStatus } }).then(() => {
			showCustomToast('success', `Đã cập nhật trạng thái thành "${statusText}" thành công!`);
			if (state.editCurrentAppointment) state.editCurrentAppointment.status = normalizedStatus;
			updateEditStatusFlag(normalizedStatus);
			updateAppointmentEditorSummary('edit');
			afterDataChanged();
		}, () => showCustomToast('error', 'Không thể cập nhật trạng thái. Vui lòng thử lại.'));
	});
}

function initializeICDMultiSelect() {
	AppointmentManagementIcdMultiselectUtils.initializeICDMultiSelect();
}

function setupICDMultiSelect(fieldId, mode) {
	AppointmentManagementIcdMultiselectUtils.setupICDMultiSelect(fieldId, mode);
}

function getSelectedICDsString(mode) {
	return AppointmentManagementIcdMultiselectUtils.getSelectedICDsString(mode);
}

async function setSelectedICDsFromString(icdString, mode) {
	return AppointmentManagementIcdMultiselectUtils.setSelectedICDsFromString(icdString, mode);
}

function clearSelectedICDs(mode) {
	AppointmentManagementIcdMultiselectUtils.clearSelectedICDs(mode);
}

export { clearSelectedICDs, getPageActionsOptions, getSelectedICDsString, initializeFormValidation, initializeICDMultiSelect, initializePhase3Features, isAddFormValid, setSelectedICDsFromString, setupICDMultiSelect, submitAppointmentForm, updateEditAppointmentStatus };
