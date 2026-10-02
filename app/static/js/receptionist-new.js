import { state } from './receptionist/page-state.js';
import { formatDateDisplay, loadAttachmentsForCurrentPatient, resetFormToDefault } from './receptionist/medical-data-and-documents.js';
import { collectFormData, safeSetValue, saveReceptionistAppointment, saveReceptionistPatient, uploadReceptionistDraftDocuments } from './receptionist/save-flow.js';
import { ReceptionistAppointmentListControls } from './receptionist/appointment-list-controls.js';
import { ReceptionistAppointmentSubmit } from './receptionist/appointment-submit.js';
import { ReceptionistCatalogLoaders } from './receptionist/catalog-loaders.js';
import { ReceptionistDuplicatePatientModal } from './receptionist/duplicate-patient-modal.js';
import { ReceptionistPageCoreUtils } from './receptionist/page-core-utils.js';
import { ReceptionistPageSessionBootstrap } from './receptionist/page-session-bootstrap.js';
import { ReceptionistPatientVitalsHistory } from './receptionist/patient-vitals-history.js';

// Receptionist intake workspace
let currentPatientId = null;
state.relativeTableInstance = null;
const receptionistLoadState = { token: 0, loading: false, failed: false };

function beginReceptionistLoad() {
	const token = ++receptionistLoadState.token;
	receptionistLoadState.loading = true;
	receptionistLoadState.failed = true;
	return () => token === receptionistLoadState.token;
}

function setCurrentPatientId(value) {
	currentPatientId = value;
	window.currentPatientId = value;
	ReceptionistPatientVitalsHistory?.resetVitalsHints({ document });

	// Tự load danh sách tài liệu khi đổi bệnh nhân.
	if (typeof loadAttachmentsForCurrentPatient === 'function') {
		Promise.resolve(loadAttachmentsForCurrentPatient()).catch(() => { });
	}
}
state.currentAppointmentId = null;
let allAppointments = [];
let currentPage = 1;
state.perPage = 10000; // Hiển thị toàn bộ dữ liệu
let totalPages = 1;
// pendingJointExamList đã được quản lý bởi jointExamManagerInstance
state.currentStatus = 'waiting_transfer';

// Filter state cho danh sách bệnh nhân đang chờ
state.waitingListFilter = {
	patient_name: '',
	doctor_id: '',
	date: ''
};

// Kinship options từ kinship_mapping.json
const kinshipOptions = ['Cha', 'Mẹ', 'Cha dượng', 'Mẹ kế', 'Vợ', 'Chồng', 'Vợ cũ', 'Chồng cũ', 'Con trai', 'Con gái', 'Con trai riêng', 'Con gái riêng', 'Con trai nuôi', 'Con gái nuôi', 'Anh trai', 'Em trai', 'Chị gái', 'Em gái', 'Anh trai cùng cha khác mẹ', 'Em trai cùng cha khác mẹ', 'Anh trai cùng mẹ khác cha', 'Em trai cùng mẹ khác cha', 'Chị gái cùng cha khác mẹ', 'Em gái cùng cha khác mẹ', 'Chị gái cùng mẹ khác cha', 'Em gái cùng mẹ khác cha', 'Bạn', 'Bạn thân', 'Đồng nghiệp', 'Hàng xóm', 'Khác'];

function resetAppointmentFormRuntimeState() {
	state.currentAppointmentId = null;
	state.currentEditId = null;
	localStorage.removeItem('currentEditId');
}

function setDefaultAppointmentDateTime() {
	const today = new Date().toISOString().split('T')[0];
	const appointmentDateEl = document.getElementById('appointmentDate');
	if (appointmentDateEl && window.setDatepickerValue) {
		window.setDatepickerValue(appointmentDateEl, today);
	} else if (appointmentDateEl) {
		appointmentDateEl.value = today;
	}

	const now = new Date();
	const appointmentTimeEl = document.getElementById('appointmentTime');
	if (appointmentTimeEl) {
		appointmentTimeEl.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
	}
}

async function refreshReceptionistAfterSuccessfulSave() {
	resetFormToDefault();
	resetAppointmentFormRuntimeState();
	setDefaultAppointmentDateTime();

	currentPage = 1;
	await loadAppointments(state.currentStatus, currentPage);
}

// Form handling variables
state.currentEditId = null;
let isSubmitting = false;
state.isCheckingDuplicate = false;
let allServices = [];

// Token management
function ensureSession() {
	return ReceptionistPageCoreUtils.ensureSession();
}

function apiCall(url, options = {}) {
	return ReceptionistPageCoreUtils.apiCall(url, options, { fetch });
}

// Toast notification
function showCustomToast(type, message) {
	ReceptionistPageCoreUtils.showCustomToast(type, message, { Swal });
}

function buildReceptionistConfirmOptions({ title, text, icon = 'warning', confirmText = 'Xác nhận', cancelText = 'Hủy', variant = 'danger' }) {
	const confirmVariant = variant === 'warning' ? 'warning' : 'danger';
	return {
		title,
		text,
		icon,
		showCancelButton: true,
		confirmButtonText: confirmText,
		cancelButtonText: cancelText,
		buttonsStyling: false,
		reverseButtons: true,
		focusCancel: true,
		customClass: {
			container: 'qlpk-confirm-container',
			popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${confirmVariant}`,
			icon: 'qlpk-confirm-dialog__icon',
			title: 'qlpk-confirm-dialog__title',
			htmlContainer: 'qlpk-confirm-dialog__text',
			actions: 'qlpk-confirm-dialog__actions',
			confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${confirmVariant}`,
			cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
		}
	};
}

function loadDoctorsForForm() {
	return ReceptionistCatalogLoaders.loadDoctorsForForm({
		window,
		showCustomToast
	});
}

function loadServicesForForm() {
	return ReceptionistCatalogLoaders.loadServicesForForm({
		showCustomToast,
		servicePackage: window.ReceptionistServicePackage,
		setServices: services => {
			allServices = services || [];
		}
	});
}

function getFormCalculationOptions() {
	return {
		document,
		window,
		safeSetValue
	};
}

// Calculate age from date of birth

// Calculate BMI from weight and height

// Helper function: Tạm thời tắt event listener tính tuổi
function temporarilyDisableAgeCalculation() {
	window.ReceptionistFormCalculations.temporarilyDisableAgeCalculation(getFormCalculationOptions());
}

// Helper function: Bật lại event listener tính tuổi
function reEnableAgeCalculation() {
	window.ReceptionistFormCalculations.reEnableAgeCalculation(getFormCalculationOptions());
}

// Helper function: Format date string to ISO format (YYYY-MM-DD)

// Helper function: Set date of birth and calculate age (ưu tiên age từ API)
function setDateOfBirthAndAge(dateOfBirth, ageFromAPI = null) {
	window.ReceptionistFormCalculations.setDateOfBirthAndAge(dateOfBirth, ageFromAPI, getFormCalculationOptions());
}

// Auto-calculate age when date of birth changes
function setupAgeCalculation() {
	window.ReceptionistFormCalculations.setupAgeCalculation(getFormCalculationOptions());
}

// Auto-calculate BMI when weight or height changes
function setupBMICalculation() {
	window.ReceptionistFormCalculations.setupBMICalculation(getFormCalculationOptions());
}

// ================= Address draft auto-save (cache) & edit auto-update =================
const ADDRESS_DRAFT_KEY = 'receptionist:new_address_draft';
const MEDICAL_DRAFT_KEY = 'receptionist:new_medical_draft';
const DOCUMENT_DRAFT_KEY = 'receptionist:new_documents_draft';
const PAGE_LOAD_ID_KEY = 'receptionist:page_load_id';

function startReceptionistPage() {
	document.addEventListener('DOMContentLoaded', () => {
		if (window.ReferralSourceControl) {
			window.ReferralSourceControl.bind({ document });
		}
		ReceptionistPageSessionBootstrap.bootstrapPageSession({
			document,
			sessionStorage,
			localStorage,
			pageLoadIdKey: PAGE_LOAD_ID_KEY,
			draftKeys: [ADDRESS_DRAFT_KEY, MEDICAL_DRAFT_KEY, DOCUMENT_DRAFT_KEY],
			staleLocalKeys: ['medicalHistoryData'],
			kinshipOptions
		});
	});
}

// Initialize autocomplete for personal info fields
function initializeAutocomplete() {
	window.ReceptionistProfileAutocomplete.initializeAutocomplete({ document });
}

// Setup autocomplete for a field

// Load appointments
async function loadAppointments(status = 'waiting_transfer', page = 1) {
	try {
		// Build API URL với filter params
		let apiUrl = `/api/?examination_status=${status}&page=${page}&per_page=${state.perPage}&receptionist=true`;

		// Thêm filter params nếu có
		if (state.waitingListFilter.patient_name) {
			apiUrl += `&patient_name=${encodeURIComponent(state.waitingListFilter.patient_name)}`;
		}
		if (state.waitingListFilter.doctor_id) {
			apiUrl += `&doctor_id=${state.waitingListFilter.doctor_id}`;
		}
		if (state.waitingListFilter.date) {
			apiUrl += `&appointment_date=${state.waitingListFilter.date}`;
		}

		const response = await apiCall(apiUrl);

		if (!response.ok) {
			console.error(`API Error: ${response.status} ${response.statusText}`);
			const errorText = await response.text();
			console.error('Error response:', errorText);
			return;
		}

		const data = await response.json();

		if (data.appointments && data.pagination) {
			allAppointments = data.appointments;
			currentPage = data.pagination.page;
			totalPages = data.pagination.total_pages;

			renderAppointmentsTable();
			updatePagination();
			updateStatusCounts();
		} else {

			allAppointments = [];
			renderAppointmentsTable();
		}
	} catch (error) {
		console.error('Error loading appointments:', error);
		showCustomToast('error', 'Lỗi khi tải danh sách lịch hẹn');
	}
}

// Render appointments table
function renderAppointmentsTable() {
	ReceptionistAppointmentListControls.renderAppointmentsTable({
		document,
		getAllAppointments: () => allAppointments,
		getCurrentPage: () => currentPage,
		getPerPage: () => state.perPage,
		formatDateDisplay
	});
}

// Update pagination
function updatePagination() {
	ReceptionistAppointmentListControls.updatePagination({
		document,
		getAllAppointments: () => allAppointments,
		getCurrentPage: () => currentPage,
		getPerPage: () => state.perPage,
		getTotalPages: () => totalPages
	});
}

// Update status counts
async function updateStatusCounts() {
	return ReceptionistAppointmentListControls.updateStatusCounts({
		document,
		apiCall
	});
}

// Save patient data
let selectedDuplicatePatient = null;

// Show duplicate patient modal
function showDuplicatePatientModal(duplicatePatients) {
	selectedDuplicatePatient = null;

	ReceptionistDuplicatePatientModal.show({
		document,
		bootstrap,
		duplicatePatients,
		onSelect: patient => {
			selectedDuplicatePatient = patient;
		},
		onAction: handleDuplicateChoice
	});
}

function hideDuplicatePatientModal() {
	const modalEl = document.getElementById('duplicatePatientModal');
	if (modalEl) window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
}

// Handle duplicate choice
function handleDuplicateChoice(action) {

	if (action === 'update' && selectedDuplicatePatient) {
		// Update existing patient

		setCurrentPatientId(selectedDuplicatePatient.id);

		// Close modal and continue with save process (skip duplicate check)
		hideDuplicatePatientModal();
		setTimeout(() => {
			savePatientDataWithoutDuplicateCheck();
		}, 100);
	} else if (action === 'cancel') {
		// Create new patient - close modal and continue with save process (skip duplicate check)

		setCurrentPatientId(null);

		hideDuplicatePatientModal();
		setTimeout(() => {
			savePatientDataWithoutDuplicateCheck();
		}, 100);
	}

	// Clear pending data
	selectedDuplicatePatient = null;
}

// Save patient data without duplicate check (used after user makes choice)
function validateReceptionistFormData(formData) {
	if (!formData.full_name || !formData.gender) {
		return { message: 'Vui lòng nhập đầy đủ thông tin bắt buộc' };
	}
	if (!formData.appointment_date) {
		return { message: 'Vui lòng chọn ngày hẹn', fieldId: 'appointmentDate' };
	}
	if (!formData.appointment_time) {
		return { message: 'Vui lòng chọn giờ hẹn', fieldId: 'appointmentTime' };
	}
	if (!formData.doctor_id) {
		return { message: 'Vui lòng chọn bác sĩ', fieldId: 'doctorId' };
	}
	if (!formData.service_id) {
		return { message: 'Vui lòng chọn dịch vụ', fieldId: 'serviceType' };
	}
	return null;
}

function showReceptionistValidationError(error) {
	if (!error) return;
	showCustomToast('error', 'Dữ liệu tiếp nhận chưa hợp lệ. Vui lòng kiểm tra lại.');
	if (error.fieldId) {
		document.getElementById(error.fieldId)?.focus();
	}
}

async function savePatientDataWithoutDuplicateCheck() {

	try {
		const formData = collectFormData();
		const validationError = validateReceptionistFormData(formData);
		if (validationError) {
			showReceptionistValidationError(validationError);
			return;
		}
		await savePatientDataInternal(formData);

	} catch (error) {
		console.error('savePatientDataWithoutDuplicateCheck: Error saving patient data:', error);
		showCustomToast('error', 'Lỗi khi lưu thông tin bệnh nhân và lịch hẹn.');
	}
}

// Internal function to save patient data (without duplicate check)
async function savePatientDataInternal(formData) {
	if (receptionistLoadState.loading || receptionistLoadState.failed) return { status: 'skipped', reason: 'not-ready' };
	if (isSubmitting) return { status: 'skipped', reason: 'saving' };
	const token = receptionistLoadState.token;
	let patientId = currentPatientId;
	const appointmentId = state.currentAppointmentId;
	const formSnapshot = JSON.stringify(collectFormData());
	const hasNewChanges = () => JSON.stringify(collectFormData()) !== formSnapshot || state.uploadedDocuments.length > 0;
	const isCurrentContext = () => token === receptionistLoadState.token && patientId === currentPatientId
		&& !receptionistLoadState.loading && !receptionistLoadState.failed;
	isSubmitting = true;
	try {
		const { patientData, appointmentData, validationError } = buildReceptionistSubmission(formData);
		if (validationError) {
			showReceptionistValidationError(validationError);
			return { status: 'invalid' };
		}
		const saved = await saveReceptionistPatient(patientId, patientData, isCurrentContext);
		if (saved.status) return saved;
		patientId = saved.patientId;
		currentPatientId = patientId;
		window.currentPatientId = patientId;
		await uploadReceptionistDraftDocuments(patientId, isCurrentContext);
		if (!isCurrentContext()) return { status: 'stale' };
		appointmentData.patient_id = patientId;
		return await saveReceptionistAppointment(appointmentData, appointmentId, isCurrentContext, hasNewChanges);
	} catch (error) {
		if (!isCurrentContext()) return { status: 'stale' };
		console.error('savePatientDataInternal: Error saving patient data:', error);
		showCustomToast('error', 'Chưa lưu đầy đủ hồ sơ. Vui lòng kiểm tra tài liệu và thử lại.');
		return { status: 'error' };
	} finally {
		isSubmitting = false;
	}
}

function buildReceptionistSubmission(formData) {
	const appointmentSubmit = ReceptionistAppointmentSubmit;
	if (!appointmentSubmit) {
		throw new Error('ReceptionistAppointmentSubmit helper is not loaded');
	}
	const patientData = appointmentSubmit.buildPatientPayload(formData);
	const reExamCheckboxElement = document.getElementById('reExaminationCheck');
	const appointmentData = appointmentSubmit.buildAppointmentPayload(formData, {
		isReExamChecked: reExamCheckboxElement?.checked || false,
		originalAppointmentId: document.getElementById('originalAppointmentId')?.value || null
	});
	return { patientData, appointmentData, validationError: appointmentSubmit.getAppointmentValidationError(appointmentData) };
}

export { startReceptionistPage, DOCUMENT_DRAFT_KEY, MEDICAL_DRAFT_KEY, PAGE_LOAD_ID_KEY, allAppointments, allServices, apiCall, beginReceptionistLoad, buildReceptionistConfirmOptions, currentPage, currentPatientId, ensureSession, initializeAutocomplete, isSubmitting, loadAppointments, loadDoctorsForForm, loadServicesForForm, reEnableAgeCalculation, receptionistLoadState, refreshReceptionistAfterSuccessfulSave, savePatientDataInternal, setCurrentPatientId, setDateOfBirthAndAge, setDefaultAppointmentDateTime, setupAgeCalculation, setupBMICalculation, showCustomToast, showDuplicatePatientModal, showReceptionistValidationError, temporarilyDisableAgeCalculation, totalPages, updateStatusCounts, validateReceptionistFormData };
