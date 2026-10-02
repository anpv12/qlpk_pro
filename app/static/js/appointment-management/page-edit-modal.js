import { state } from './page-state.js';
import { getStatusIcon, getStatusText, showCustomToast, updateAppointmentEditorSummary, updateBreadcrumb } from './page-editor.js';
import { AppointmentManagementIcdMultiselectUtils } from './icd-multiselect-utils.js';
import { loadPackages, loadServices } from './page-data.js';
import { AppointmentManagementDoctorControlsUtils } from './doctor-controls-utils.js';
import { AppointmentManagementEditModalUiUtils } from './edit-modal-ui-utils.js';
import { getSelectedICDsString, setSelectedICDsFromString } from './page-add-modal.js';
import { AppointmentManagementAllergyFormatUtils } from './allergy-format-utils.js';
import { afterDataChanged, checkDoctorAvailabilityBeforeCreate, showConflictWarning } from './page-view.js';
import { fieldValue, hideModal, setFieldValue, setProp, showModal, toggleClass } from '../shared/dom-query.js';
import { requestJson } from '../shared/http-json.js';
// Modal sửa lịch hẹn: mở, điền form, trạng thái, lưu.

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
		showCustomToast('error', 'Không tìm thấy lịch hẹn!');
		return;
	}

	// Thêm cấp 3 "CHI TIẾT" vào breadcrumb
	updateBreadcrumb('CHI TIẾT');

	state.editCurrentAppointment = appointment;

	// Show modal first
	showModal('#editAppointmentModal');
	// Store the actual numeric appointment ID for API calls
	state.editAppointmentId = appointment.id;
	// Store linked patient ID (no #editPatientId input exists in the template)
	state.editPatientId = appointment.patient_id;

	// Xóa dữ liệu của bệnh nhân trước đó ngay khi mở (chống rò rỉ A -> B trong lúc
	// chờ API /edit trả về; form.reset() không xóa tag ICD render bằng JS)
	document.querySelector('#editAppointmentForm').reset();
	AppointmentManagementIcdMultiselectUtils.clearSelectedICDs('edit');

	// Load data for edit modal - đồng bộ hóa việc tải dropdown trước khi populate form
	Promise.all([loadDoctorsForEdit(), loadServices(), loadPackages()]).then(async loaded => {
		if (loaded.includes(false)) {
			showCustomToast('error', 'Lỗi tải dữ liệu dropdown. Vui lòng thử lại.');
			return;
		}
		initializeEditModalFeatures();
		// Populate form fields: ưu tiên gọi API chi tiết để có patient_info đầy đủ (dùng ID số, không phải appt-{id})
		const actualAppointmentId = appointment.id;
		let detailed = appointment;
		try {
			detailed = await requestJson(`/api/${actualAppointmentId}/edit`);
		} catch {
			// Fallback: dùng dữ liệu sẵn có nếu API lỗi
		}
		// Bỏ qua response cũ nếu user đã đóng modal hoặc mở lịch hẹn khác
		if (state.editAppointmentId !== actualAppointmentId) return;
		await populateEditForm(detailed);
		// Đảm bảo status flag được cập nhật sau khi modal đã hiển thị
		setTimeout(() => updateEditStatusFlag(detailed.status), 100);
	});
}

// Load danh sách bác sĩ cho edit modal; resolves false on failure
async function loadDoctorsForEdit() {
	try {
		state.doctors = await requestJson('/users/doctors');
	} catch (error) {
		showCustomToast('error', error?.status === 401 ? 'Lỗi xác thực. Vui lòng đăng nhập lại.' : 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
		return false;
	}
	AppointmentManagementDoctorControlsUtils.populateDoctorSelect('#editDoctor', state.doctors, 'Chọn bác sĩ');
	return true;
}

// Initialize edit modal features
function initializeEditModalFeatures() {
	// Initialize form validation
	initializeEditFormValidation();
}

// Show edit field error
function showEditFieldError(selector, message) {
	AppointmentManagementEditModalUiUtils.showEditFieldError(selector, message);
}

// Clear edit field error
function clearEditFieldError(selector) {
	AppointmentManagementEditModalUiUtils.clearEditFieldError(selector);
}

// Clear all edit field errors
function clearAllEditFieldErrors() {
	AppointmentManagementEditModalUiUtils.clearAllEditFieldErrors();
}

// Populate edit form
async function fillEditHistoryFields(appointment) {
	const historyPatient = appointment.medical_history?.patient || {};
	await setSelectedICDsFromString(historyPatient.physical_history || [], 'edit');
	AppointmentManagementAllergyFormatUtils.setFieldValue(document.getElementById('editAllergies'), historyPatient.allergies || []);
	setFieldValue('#editCurrentMedication', appointment.patient_info?.current_medication || '');
}

async function populateEditForm(appointment) {
	fillEditPatientFields(appointment);

	await fillEditHistoryFields(appointment);

	// Set doctor value - dropdown đã được tải xong
	setFieldValue('#editDoctor', appointment.doctor_id || '');
	setFieldValue('#editStatus', appointment.status || 'SCHEDULED');

	fillEditServiceSelection(appointment);
	fillEditCategory(appointment.appointment_category || 'NEW');

	// Intake reason and symptoms are examination-owned fields.
	const examinationInfo = appointment.examination_info || {};
	setFieldValue('#editMainReason', examinationInfo.main_reason || '');
	setFieldValue('#editSymptoms', examinationInfo.main_symptoms || '');

	// Ưu tiên: duration từ service/package > appointment.duration_minutes > mặc định 60
	setFieldValue('#editDuration', getEditDurationFromSelection(appointment) || appointment.duration_minutes || 60);

	// Update status flag
	updateEditStatusFlag(appointment.status);
	updateAppointmentEditorSummary('edit');
}

function getEditPatientPhone(appointment) {
	return appointment.patient_info?.phone || appointment.patient_phone || appointment.phone || '';
}

function getEditPatientIdNumber(appointment) {
	return appointment.patient_id_number || appointment.id_number || (appointment.patient_info ? appointment.patient_info.id_number : '') || '';
}

function fillEditPatientFields(appointment) {
	setFieldValue('#editPatientName', appointment.patient_full_name || appointment.full_name || '');

	// Appointment details - set this EARLY to avoid async blocking issues
	if (appointment.appointment_date) {
		const appointmentDate = new Date(appointment.appointment_date);
		const dateStr = appointmentDate.toISOString().split('T')[0];
		const timeStr = appointmentDate.toTimeString().slice(0, 5);
		window.setDatepickerValue(document.getElementById('editAppointmentDate'), dateStr, true);
		setFieldValue('#editAppointmentTime', timeStr);
	}

	setFieldValue('#editPatientPhone', getEditPatientPhone(appointment));
	setFieldValue('#editPatientCCCD', getEditPatientIdNumber(appointment));
	setFieldValue('#editPatientEmail', appointment.patient_email || appointment.patient_info?.email || '');

	const dobValue = appointment.patient_date_of_birth || appointment.patient_info?.date_of_birth || '';
	window.setDatepickerValue(document.getElementById('editPatientDOB'), dobValue, true);
}

function showEditServiceMode(isService) {
	toggleClass('#editServiceSelection', 'appointment-hidden', !isService);
	toggleClass('#editPackageSelection', 'appointment-hidden', isService);
}

function fillEditServiceSelection(appointment) {
	// Set service autocomplete: tìm tên dịch vụ từ ID
	if (appointment.service_id && state.services && state.services.length > 0) {
		const svc = state.services.find(s => String(s.id) === String(appointment.service_id));
		setFieldValue('#editService', svc ? svc.name : '');
		setFieldValue('#editServiceId', appointment.service_id);
	} else {
		setFieldValue('#editService', '');
		setFieldValue('#editServiceId', '');
	}
	setFieldValue('#editPackage', appointment.package_id || '');

	if (appointment.service_id) {
		setProp('#editTypeService', 'checked', true);
		showEditServiceMode(true);
	} else if (appointment.package_id) {
		setProp('#editTypePackage', 'checked', true);
		showEditServiceMode(false);
	} else {
		setProp('#editTypeService', 'checked', true);
		showEditServiceMode(true);
	}
}

function fillEditCategory(appointmentCategory) {
	const isReExamination = appointmentCategory === 'RE_EXAMINATION';
	setProp('#editCategoryReExam', 'checked', isReExamination);
	setProp('#editCategoryNew', 'checked', !isReExamination);
}

function getEditDurationFromSelection(appointment) {
	if (appointment.service_id) {
		const selectedService = state.services.find(service => String(service.id) === String(appointment.service_id));
		return selectedService?.duration_minutes;
	}
	if (appointment.package_id) return document.getElementById('editPackage')?.selectedOptions[0]?.dataset.duration;
	return null;
}

// Function to update status flag
function updateEditStatusFlag(status) {
	const normalizedStatus = normalizeAppointmentStatus(status);
	setFieldValue('#editStatus', normalizedStatus);
	AppointmentManagementEditModalUiUtils.updateEditStatusFlag({
		status: normalizedStatus,
		getStatusText: getStatusText,
		getStatusIcon: getStatusIcon
	});
	refreshEditStatusDropdown(normalizedStatus);
}

function normalizeAppointmentStatus(status) {
	const normalized = String(status || '').toUpperCase();
	return state.APPOINTMENT_STATUS_VALUES.includes(normalized) ? normalized : 'SCHEDULED';
}

function getCurrentEditAppointmentStatus() {
	return normalizeAppointmentStatus(
		(state.editCurrentAppointment && state.editCurrentAppointment.status) || fieldValue('#editStatus')
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
	document.querySelectorAll('[data-edit-appointment-status]').forEach(item => {
		const targetStatus = normalizeAppointmentStatus(item.dataset.editAppointmentStatus);
		const blockedMessage = getEditStatusTransitionBlockMessage(normalizedCurrentStatus, targetStatus);
		const isBlocked = Boolean(blockedMessage);
		item.classList.toggle('disabled', isBlocked);
		item.setAttribute('aria-disabled', isBlocked ? 'true' : 'false');
		item.setAttribute('tabindex', isBlocked ? '-1' : '0');
		item.setAttribute('title', isBlocked ? blockedMessage : '');
	});
}

// Initialize edit form validation
function initializeEditFormValidation() {
	AppointmentManagementEditModalUiUtils.initializeEditFormValidation({
		clearEditFieldError,
		showCustomToast
	});
}

// Submit edit appointment form
function submitEditAppointmentForm() {
	const submitButton = document.getElementById('editSubmitBtn');
	const setSubmitting = submitting => {
		if (!submitButton) return;
		submitButton.disabled = submitting;
		submitButton.classList.toggle('btn-loading', submitting);
	};
	setSubmitting(true);

	// Lấy ID lịch hẹn từ data của modal
	const appointmentId = state.editAppointmentId;
	if (!appointmentId) {
		showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
		setSubmitting(false);
		return;
	}

		const appointmentDateTime = fieldValue('#editAppointmentDate') + 'T' + fieldValue('#editAppointmentTime');
		const editAppointmentType = fieldValue('input[name="editAppointmentType"]:checked');

		const formData = {
		patient_id: state.editPatientId || null,
		full_name: fieldValue('#editPatientName'),
		phone: fieldValue('#editPatientPhone'),
		id_number: fieldValue('#editPatientCCCD'),
		email: fieldValue('#editPatientEmail'),
		date_of_birth: fieldValue('#editPatientDOB'),
		physical_history: getSelectedICDsString('edit'),
		allergies: AppointmentManagementAllergyFormatUtils.getSubmitValue(document.getElementById('editAllergies')),
		current_medication: fieldValue('#editCurrentMedication'),
		appointment_date: appointmentDateTime,
		doctor_id: fieldValue('#editDoctor'),
		status: fieldValue('#editStatus'),
		appointment_category: fieldValue('input[name="editAppointmentCategory"]:checked'),
			appointment_type: editAppointmentType,
			service_id: editAppointmentType === 'service' ? (fieldValue('#editServiceId') || null) : null,
			package_id: editAppointmentType === 'package' ? (fieldValue('#editPackage') || null) : null,
		main_reason: fieldValue('#editMainReason'),
		main_symptoms: fieldValue('#editSymptoms'),
		duration_minutes: fieldValue('#editDuration') || 30,
		// Đánh dấu nguồn lưu là màn lịch hẹn để backend không ghi đè lý do/triệu chứng
		// đã được bác sĩ nhập khi phiếu khám đã bắt đầu (xem update_service guard)
		is_appointment_edit: true
	}

	// Kiểm tra lịch bận trước khi cập nhật lịch hẹn
	const availabilityPayload = Object.assign({}, formData, { appointment_id: appointmentId });
	checkDoctorAvailabilityBeforeCreate(availabilityPayload, function (isAvailable, conflictInfo) {
		if (!isAvailable) {
			// Hiển thị cảnh báo xung đột
			showConflictWarning(conflictInfo, formData, true);
			setSubmitting(false);
			return;
		}
		// Nếu bác sĩ rảnh, tiếp tục cập nhật lịch hẹn
		requestJson(`/api/${appointmentId}`, { method: 'PUT', json: formData, signal: AbortSignal.timeout(30000) }).then(() => {
			showCustomToast('success', 'Cập nhật lịch hẹn thành công!');
			hideModal('#editAppointmentModal');
			afterDataChanged();
		}, () => showCustomToast('error', 'Không thể cập nhật lịch hẹn. Vui lòng kiểm tra lại.'))
			.finally(() => setSubmitting(false));
	});
}

export { clearAllEditFieldErrors, clearEditFieldError, getCurrentEditAppointmentStatus, getEditStatusTransitionBlockMessage, initializeEditFormValidation, initializeEditModalFeatures, loadDoctorsForEdit, normalizeAppointmentStatus, openEditModal, populateEditForm, refreshEditStatusDropdown, showEditFieldError, submitEditAppointmentForm, updateEditStatusFlag };
