import { state } from './page-state.js';
import { DOCUMENT_DRAFT_KEY, allAppointments, allServices, apiCall, beginReceptionistLoad, buildReceptionistConfirmOptions, currentPage, currentPatientId, isSubmitting, loadAppointments, loadServicesForForm, receptionistLoadState, refreshReceptionistAfterSuccessfulSave, savePatientDataInternal, setCurrentPatientId, setupAgeCalculation, setupBMICalculation, showCustomToast, showDuplicatePatientModal, showReceptionistValidationError, updateStatusCounts, validateReceptionistFormData } from '../receptionist-new.js';
import { highlightAppointmentDateTimeFields, jointExamManagerInstance, renderDocumentsList, savePendingJointExamList, uploadFile } from './medical-data-and-documents.js';
import { copyPatientToReceptionistFormFromGlobalSearch, getPatientPopulateOptions, populateSharedForms } from './save-flow-parts/copy-patient.js';
import { ClinicalDocumentSectionUiUtils } from '../components/document-section-ui-utils.js';
import { ReceptionistAppointmentPrefill } from './appointment-prefill.js';
import { ReceptionistAppointmentSubmit } from './appointment-submit.js';
import { ReceptionistFormBootstrap } from './form-bootstrap.js';
import { ReceptionistFormDataUtils } from './form-data-utils.js';
import { ReceptionistFormResetUtils } from './form-reset-utils.js';
import { ReceptionistJointExamOrchestration } from './joint-exam-orchestration.js';
import { ReceptionistPageSessionBootstrap } from './page-session-bootstrap.js';
import { ReceptionistPatientVitalsHistory } from './patient-vitals-history.js';
import { ReceptionistPatientRelativesTable } from './patient-relatives-table.js';
import { ReceptionistServicePackage } from './service-package-selection.js';
import { setDatepickerValue } from '../datepicker-init.js';

// Returns { patientId } on success, otherwise { status } ('stale' | 'patientError'); throws on an invalid id.
async function saveReceptionistPatient(patientId, patientData, isCurrentContext) {
	const patientResponse = await apiCall(patientId ? `/api/patients/${patientId}` : '/api/patients/', {
		method: patientId ? 'PUT' : 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patientData)
	});
	if (!isCurrentContext()) return { status: 'stale' };
	if (!patientResponse.ok) {
		showCustomToast('error', 'Không thể lưu thông tin bệnh nhân. Vui lòng kiểm tra lại.');
		return { status: 'patientError' };
	}
	const patientResult = await patientResponse.json();
	if (!isCurrentContext()) return { status: 'stale' };
	const savedPatientId = Number(patientResult.id);
	if (!Number.isSafeInteger(savedPatientId) || savedPatientId <= 0) throw new Error('missing-patient-id');
	if (patientId && Number(patientId) !== savedPatientId) throw new Error('patient-id-mismatch');
	return { patientId: savedPatientId };
}

async function uploadReceptionistDraftDocuments(patientId, isCurrentContext) {
	await ClinicalDocumentSectionUiUtils.uploadDraftDocumentsForPatient(patientId, {
		isCurrentContext,
		getUploadedDocuments: () => state.uploadedDocuments,
		setUploadedDocuments: value => { state.uploadedDocuments = value; renderDocumentsList(); },
		sessionStorage,
		documentDraftKey: DOCUMENT_DRAFT_KEY,
		uploadFile: async (file, targetId, options) => {
			const result = await uploadFile(file, targetId, { ...options, isCurrentContext });
			return result === true || Boolean(result?.id);
		}
	});
}

async function reportAppointmentSaveError(appointmentResponse, appointmentSubmit, isCurrentContext) {
	const errorText = await appointmentResponse.text();
	if (!isCurrentContext()) return { status: 'stale' };
	console.error('savePatientDataInternal: Appointment API Error:', appointmentResponse.status, errorText);
	const errorMessage = appointmentSubmit.parseAppointmentErrorMessage(errorText);
	if (appointmentSubmit.isDuplicateAppointmentError(errorMessage)) {
		highlightAppointmentDateTimeFields();
	}
	showCustomToast('error', 'Đã lưu bệnh nhân nhưng chưa lưu được lịch hẹn. Vui lòng kiểm tra và thử lại.');
	return { status: 'appointmentError' };
}

function verifiedAppointmentId(appointmentResult, appointmentId) {
	const savedAppointmentId = Number(appointmentResult.id);
	if (!Number.isSafeInteger(savedAppointmentId) || savedAppointmentId <= 0) throw new Error('missing-appointment-id');
	if (appointmentId && Number(appointmentId) !== savedAppointmentId) throw new Error('appointment-id-mismatch');
	return savedAppointmentId;
}

async function saveReceptionistAppointment(appointmentData, appointmentId, isCurrentContext, hasNewChanges) {
	if (!isCurrentContext()) return { status: 'stale' };
	const appointmentSubmit = ReceptionistAppointmentSubmit;
	const appointmentRequest = appointmentSubmit.resolveAppointmentRequest(appointmentId);
	const appointmentResponse = await apiCall(appointmentRequest.url, {
		method: appointmentRequest.method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(appointmentData)
	});
	if (!isCurrentContext()) return { status: 'stale' };
	if (!appointmentResponse.ok) return reportAppointmentSaveError(appointmentResponse, appointmentSubmit, isCurrentContext);

	const appointmentResult = await appointmentResponse.json();
	if (!isCurrentContext()) return { status: 'stale' };
	const savedAppointmentId = verifiedAppointmentId(appointmentResult, appointmentId);
	if (!appointmentId) {
		state.currentAppointmentId = savedAppointmentId;
	}
	const jointResult = await savePendingJointExamList(savedAppointmentId, { isCurrentContext });
	if (!isCurrentContext()) return { status: 'stale' };
	if (jointResult?.status !== 'saved') {
		showCustomToast('error', 'Đã lưu lịch hẹn nhưng chưa lưu đủ người đi cùng. Vui lòng kiểm tra và thử lại.');
		return { status: 'jointExamError' };
	}
	if (hasNewChanges()) {
		showCustomToast('warning', 'Đã lưu dữ liệu trước đó. Có thay đổi mới chưa lưu; vui lòng bấm Lưu lần nữa.');
		return { status: 'dirty', patientId: appointmentData.patient_id, appointmentId: savedAppointmentId };
	}

	showCustomToast('success', 'Lưu thông tin bệnh nhân và lịch hẹn thành công');
	await refreshReceptionistAfterSuccessfulSave();
	return { status: 'saved' };
}

// Check for duplicate patients
async function checkDuplicatePatient(formData) {
	try {
		const response = await apiCall('/api/patients/check-duplicate', {
			method: 'POST',
			body: JSON.stringify({
				full_name: formData.full_name,
				phone: formData.phone,
				id_number: formData.id_number
			})
		});

		if (!response.ok) throw new Error('duplicate-check-failed');
		const result = await response.json();
		if (typeof result.is_duplicate !== 'boolean') throw new Error('duplicate-check-unconfirmed');
		if (result.is_duplicate && !Array.isArray(result.duplicate_patients)) throw new Error('duplicate-check-invalid');
		return result;
	} catch (error) {
		console.error('Error checking duplicate patient:', error);
		return null;
	}
}

async function savePatientData() {
	if (receptionistLoadState.loading || receptionistLoadState.failed) return { status: 'skipped', reason: 'not-ready' };
	if (isSubmitting || state.isCheckingDuplicate) return { status: 'skipped', reason: 'saving' };
	const loadToken = receptionistLoadState.token;
	state.isCheckingDuplicate = true;

	try {
		const formData = collectFormData();
		const validationError = validateReceptionistFormData(formData);
		if (validationError) {
			showReceptionistValidationError(validationError);
			return;
		}

		// Check for duplicate patient (only for new patients or when creating new)
		if (!currentPatientId) {

			const duplicateCheck = await checkDuplicatePatient(formData);
			if (loadToken !== receptionistLoadState.token) return { status: 'stale' };
			if (!duplicateCheck) {
				showCustomToast('error', 'Chưa kiểm tra được bệnh nhân trùng. Vui lòng thử lại trước khi lưu.');
				return { status: 'duplicateCheckError' };
			}
			if (JSON.stringify(collectFormData()) !== JSON.stringify(formData)) {
				showCustomToast('warning', 'Thông tin đã thay đổi trong lúc kiểm tra. Vui lòng bấm Lưu lần nữa.');
				return { status: 'dirty' };
			}

			if (duplicateCheck.is_duplicate) {
				// Show custom modal with duplicate patients
				showDuplicatePatientModal(duplicateCheck.duplicate_patients, duplicateCheck.count);
				return; // Stop execution, wait for user choice
			}
		}

		return await savePatientDataInternal(formData);
	} catch (error) {
		if (loadToken !== receptionistLoadState.token) return { status: 'stale' };
		console.error('Error in savePatientData:', error);
		showCustomToast('error', 'Lỗi khi lưu thông tin bệnh nhân');
	} finally {
		state.isCheckingDuplicate = false;
	}
}

// Collect form data using DOM helpers

function collectFormData() {
	return ReceptionistFormDataUtils.collectFormData({
		document,
		window,
		console,
		servicePackage: ReceptionistServicePackage
	});
}

function safeSetValue(elementId, value) {
	return ReceptionistFormDataUtils.safeSetValue(elementId, value, {
		document,
		window
	});
}

window.QLPKGlobalSearchActions = {
	handleAction(action = {}, item = {}) {
		if (action.kind === 'copy_patient_to_receptionist_form') {
			return this.copyPatientToReceptionistForm(action.payload || {}, item);
		}
		return false;
	},
	copyPatientToReceptionistForm(payload = {}) {
		return copyPatientToReceptionistFormFromGlobalSearch(payload);
	}
};

// Edit appointment
async function editAppointment(appointmentId) {

	const appointment = allAppointments.find(apt => apt.id === appointmentId);
	if (!appointment) {

		return;
	}

	const isCurrentLoad = beginReceptionistLoad();
	ReceptionistFormResetUtils.clearSharedFields({ document, window });
	state.currentAppointmentId = null;

	// Đồng bộ currentPatientId + refresh attachment count/list
	setCurrentPatientId(appointment.patient_id);

	// Then fetch complete patient data from API

	let patient = null;
	try {
		const response = await apiCall(`/api/patients/${appointment.patient_id}`);
		if (!isCurrentLoad()) return false;
		if (!response.ok) throw new Error(await response.text());
		const patientData = await response.json();
		if (!isCurrentLoad()) return false;
		patient = patientData.data || patientData;
		const populated = await populateSharedForms({
			appointment,
			patient,
			examination: appointment.examination || {}
		}, { isCurrentLoad });
		if (!isCurrentLoad()) return false;
		if (populated === false) throw new Error('patient-load-incomplete');

		const reminderCheck = document.getElementById('reminderCheck');
		if (reminderCheck) reminderCheck.checked = appointment.reminder || false;
		safeSetValue('reminderTime', appointment.reminder_time);
		applyLoadedAppointment(appointment);
		receptionistLoadState.failed = false;
		showCustomToast('info', 'Đã tải thông tin bệnh nhân vào form');
		return true;
	} catch (error) {
		if (!isCurrentLoad()) return false;
		console.error('Error fetching complete patient data:', error);
		showCustomToast('error', 'Không thể tải đầy đủ dữ liệu hành chính của bệnh nhân.');
		return false;
	} finally {
		if (isCurrentLoad()) receptionistLoadState.loading = false;
	}
}

function applyLoadedAppointment(appointment) {
	// Set appointment details from appointment data
	if (appointment.appointment_date) {
		const date = new Date(appointment.appointment_date);
		const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

		// Ưu tiên đồng bộ qua Flatpickr để giữ đúng định dạng hiển thị.
		const appointmentDateInput = document.getElementById('appointmentDate');
		if (appointmentDateInput && appointmentDateInput._flatpickr) {
			appointmentDateInput._flatpickr.setDate(dateStr, true); // true = trigger onChange
		} else if (setDatepickerValue) {
			setDatepickerValue(appointmentDateInput, dateStr, true);
		} else {
			safeSetValue('appointmentDate', dateStr);
		}

		safeSetValue('appointmentTime', date.toTimeString().slice(0, 5));
	}
	safeSetValue('doctorId', appointment.doctor_id);
	ReceptionistServicePackage.setServiceSelection(appointment, allServices);

	setCurrentPatientId(appointment.patient_id);
	state.currentAppointmentId = appointment.id;

	ReceptionistAppointmentPrefill.applyEditReExamState(appointment, getPatientPopulateOptions());

	// Xóa pending list khi load appointment (vì đã có appointment rồi)
	ReceptionistJointExamOrchestration.clearPendingList(jointExamManagerInstance);

	state.relativeTableInstance = ReceptionistPatientRelativesTable.syncPatient(
		state.relativeTableInstance,
		appointment.patient_id,
		Object.assign({}, getPatientPopulateOptions(), {
			syncAppointmentDate: true,
			appointmentDate: appointment ? appointment.appointment_date : null
		})
	);

	// Load hint cân nặng / chiều cao gần nhất
	if (appointment.patient_id) loadPreviousVitals(appointment.patient_id);

}

// ===== MODAL CHUYỂN KHÁM =====
async function transferAppointment(appointmentId) {
	if (!window.TransferModal || typeof window.TransferModal.openWithErrorHandling !== 'function') {
		console.error('TransferModal module chưa được load.');
		showCustomToast('error', 'Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
		return;
	}

	window.TransferModal.openWithErrorHandling([appointmentId], 'receptionist', function () {
		loadAppointments(state.currentStatus, currentPage);
		updateStatusCounts();
	});
}

// Cancel appointment
async function cancelAppointment(appointmentId, force = false) {

	if (!force) {
		const result = await Swal.fire(buildReceptionistConfirmOptions({
			title: 'Xác nhận hủy lịch hẹn',
			text: 'Bạn có chắc chắn muốn hủy lịch hẹn này?',
			icon: 'warning',
			confirmText: 'Có, hủy lịch hẹn',
			cancelText: 'Không',
			variant: 'danger'
		}));

		if (!result.isConfirmed) return;
	}

	try {
		const response = await apiCall(`/api/${appointmentId}/cancel`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: force ? JSON.stringify({ force: true }) : undefined
		});

		const data = await response.json();

		if (response.ok && data.success) {
			showCustomToast('success', 'Hủy lịch hẹn thành công');
			loadAppointments(state.currentStatus, currentPage);
			updateStatusCounts();
		} else if (response.status === 409 && data.requires_force) {
			// Đang trong quá trình khám — hỏi xác nhận lần 2
			const forceResult = await Swal.fire(buildReceptionistConfirmOptions({
				title: 'Cảnh báo',
				text: 'Lịch hẹn đang được sử dụng trong ca khám. Bạn có chắc muốn xóa?',
				icon: 'warning',
				confirmText: 'Xác nhận xóa',
				cancelText: 'Không',
				variant: 'danger'
			}));
			if (forceResult.isConfirmed) {
				cancelAppointment(appointmentId, true);
			}
		} else {
			// 400 blocked hoặc lỗi khác
			showCustomToast('error', 'Không thể hủy lịch hẹn. Vui lòng kiểm tra lại.');
		}
	} catch (error) {
		console.error('Error cancelling appointment:', error);
		showCustomToast('error', 'Không thể hủy lịch hẹn. Vui lòng thử lại.');
	}
}

function getFormBootstrapOptions() {
	return {
		window,
		console,
		setTimeout,
		servicePackage: ReceptionistServicePackage,
		loadServicesForForm,
		setupAgeCalculation,
		setupBMICalculation
	};
}

// Initialize form
function initializeForm() {
	ReceptionistFormBootstrap.initializeForm(getFormBootstrapOptions());
}

// Load sidebar user info
async function loadSidebarUserInfo() {
	return ReceptionistPageSessionBootstrap.loadSidebarUserInfo({ document });
}

async function loadPreviousVitals(patientId) {
	if (!ReceptionistPatientVitalsHistory) return;
	return ReceptionistPatientVitalsHistory.loadPreviousVitals(patientId, {
		...getPatientPopulateOptions(),
		getCurrentPatientId: () => currentPatientId,
		getContextToken: () => receptionistLoadState.token
	});
}

export { cancelAppointment, collectFormData, editAppointment, initializeForm, loadSidebarUserInfo, safeSetValue, savePatientData, saveReceptionistAppointment, saveReceptionistPatient, transferAppointment, uploadReceptionistDraftDocuments };
