// Receptionist intake workspace
let currentPatientId = null;
let relativeTableInstance = null;
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
	window.ReceptionistPatientVitalsHistory?.resetVitalsHints({ document });

	// Tự load danh sách tài liệu khi đổi bệnh nhân.
	if (typeof loadAttachmentsForCurrentPatient === 'function') {
		Promise.resolve(loadAttachmentsForCurrentPatient()).catch(() => { });
	}
}
let currentAppointmentId = null;
let allAppointments = [];
let currentPage = 1;
let perPage = 10000; // Hiển thị toàn bộ dữ liệu
let totalPages = 1;
// pendingJointExamList đã được quản lý bởi jointExamManagerInstance
let currentStatus = 'waiting_transfer';

// Filter state cho danh sách bệnh nhân đang chờ
let waitingListFilter = {
	patient_name: '',
	doctor_id: '',
	date: ''
};

// Kinship options từ kinship_mapping.json
const kinshipOptions = ['Cha', 'Mẹ', 'Cha dượng', 'Mẹ kế', 'Vợ', 'Chồng', 'Vợ cũ', 'Chồng cũ', 'Con trai', 'Con gái', 'Con trai riêng', 'Con gái riêng', 'Con trai nuôi', 'Con gái nuôi', 'Anh trai', 'Em trai', 'Chị gái', 'Em gái', 'Anh trai cùng cha khác mẹ', 'Em trai cùng cha khác mẹ', 'Anh trai cùng mẹ khác cha', 'Em trai cùng mẹ khác cha', 'Chị gái cùng cha khác mẹ', 'Em gái cùng cha khác mẹ', 'Chị gái cùng mẹ khác cha', 'Em gái cùng mẹ khác cha', 'Bạn', 'Bạn thân', 'Đồng nghiệp', 'Hàng xóm', 'Khác'];

function resetAppointmentFormRuntimeState() {
	currentAppointmentId = null;
	currentEditId = null;
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
	await loadAppointments(currentStatus, currentPage);
}

// Form handling variables
let currentEditId = null;
let isSubmitting = false;
let isCheckingDuplicate = false;
let allDoctors = [];
let allServices = [];

// Token management
function ensureSession() {
	return window.ReceptionistPageCoreUtils.ensureSession();
}

function apiCall(url, options = {}) {
	return window.ReceptionistPageCoreUtils.apiCall(url, options, { fetch });
}

// Toast notification
function showCustomToast(type, message) {
	window.ReceptionistPageCoreUtils.showCustomToast(type, message, { Swal });
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
	return window.ReceptionistCatalogLoaders.loadDoctorsForForm({
		window,
		showCustomToast,
		setDoctors: doctors => {
			allDoctors = doctors || [];
		}
	});
}

function loadServicesForForm() {
	return window.ReceptionistCatalogLoaders.loadServicesForForm({
		$,
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
		$,
		safeSetValue
	};
}

// Calculate age from date of birth
function calculateAge(dateOfBirth) {
	return window.ReceptionistFormCalculations.calculateAge(dateOfBirth);
}

// Calculate BMI from weight and height
function calculateBMI(weight, height) {
	return window.ReceptionistFormCalculations.calculateBMI(weight, height);
}

// Helper function: Tạm thời tắt event listener tính tuổi
function temporarilyDisableAgeCalculation() {
	window.ReceptionistFormCalculations.temporarilyDisableAgeCalculation(getFormCalculationOptions());
}

// Helper function: Bật lại event listener tính tuổi
function reEnableAgeCalculation() {
	window.ReceptionistFormCalculations.reEnableAgeCalculation(getFormCalculationOptions());
}

// Helper function: Format date string to ISO format (YYYY-MM-DD)
function formatDateToISO(dateString) {
	return window.ReceptionistFormCalculations.formatDateToISO(dateString);
}

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

// Hàm tính tuần và ngày tuổi thai từ ngày dự sinh
function calculatePregnancyWeek(expectedDeliveryDate) {
	return window.ReceptionistFormCalculations.calculatePregnancyWeek(expectedDeliveryDate);
}

// ================= Address draft auto-save (cache) & edit auto-update =================
const ADDRESS_DRAFT_KEY = 'receptionist:new_address_draft';
const MEDICAL_DRAFT_KEY = 'receptionist:new_medical_draft';
const DOCUMENT_DRAFT_KEY = 'receptionist:new_documents_draft';
const PAGE_LOAD_ID_KEY = 'receptionist:page_load_id';

function getCurrentLoadId() {
	try {
		let id = sessionStorage.getItem(PAGE_LOAD_ID_KEY);
		if (!id) {
			id = String(Date.now());
			sessionStorage.setItem(PAGE_LOAD_ID_KEY, id);
		}
		return id;
	} catch (e) {
		return String(Date.now());
	}
}

function buildFullAddressFromParts(addressDetail, ward, district, province) {
	return window.ReceptionistAddressMainForm.buildFullAddressFromParts(addressDetail, ward, district, province);
}

function getMainAddressFormValues() {
	return window.ReceptionistAddressMainForm.getMainAddressFormValues({ document });
}

async function saveAddressToServerIfEditing() {
	if (receptionistLoadState.loading || receptionistLoadState.failed) return { status: 'skipped', reason: 'not-ready' };
	try {
		if (!window.currentPatientId) return;
		const pid = window.currentPatientId;
		const { address_detail, province, district, ward, address } = getMainAddressFormValues();
		const body = {
			address_detail,
			province,
			district,
			ward,
			address
		};
		await apiCall(`/api/patients/${pid}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (e) {

	}
}

document.addEventListener('DOMContentLoaded', () => {
	if (window.ReferralSourceControl) {
		window.ReferralSourceControl.bind({ document });
	}
	window.ReceptionistPageSessionBootstrap.bootstrapPageSession({
		document,
		sessionStorage,
		localStorage,
		pageLoadIdKey: PAGE_LOAD_ID_KEY,
		draftKeys: [ADDRESS_DRAFT_KEY, MEDICAL_DRAFT_KEY, DOCUMENT_DRAFT_KEY],
		staleLocalKeys: ['medicalHistoryData'],
		kinshipOptions
	});
});

// Load regions (main form) - replacing Provinces
async function loadProvinces() {
	return window.ReceptionistAddressMainForm.loadProvinces({
		document,
		apiCall,
		console
	});
}

// Load units (main form) - replacing Wards
async function loadWards(provinceName, districtNameIgnored) {
	return window.ReceptionistAddressMainForm.loadWards(provinceName, districtNameIgnored, {
		document,
		apiCall,
		console
	});
}

// Update address summary
function updateAddressSummary() {
	window.ReceptionistAddressMainForm.updateAddressSummary({ document });
}

function bindAddressFieldChanges() {
	window.ReceptionistAddressMainForm.bindAddressFieldChanges({
		document,
		loadWards
	});
}

// Initialize autocomplete for personal info fields
function initializeAutocomplete() {
	window.ReceptionistProfileAutocomplete.initializeAutocomplete({ document });
}

// Setup autocomplete for a field
function setupAutocomplete(inputId, dropdownId, hiddenId, options) {
	window.ReceptionistProfileAutocomplete.setupAutocomplete(inputId, dropdownId, hiddenId, options, { document });
}

// Load appointments
async function loadAppointments(status = 'waiting_transfer', page = 1) {
	try {
		// Build API URL với filter params
		let apiUrl = `/api/?examination_status=${status}&page=${page}&per_page=${perPage}&receptionist=true`;

		// Thêm filter params nếu có
		if (waitingListFilter.patient_name) {
			apiUrl += `&patient_name=${encodeURIComponent(waitingListFilter.patient_name)}`;
		}
		if (waitingListFilter.doctor_id) {
			apiUrl += `&doctor_id=${waitingListFilter.doctor_id}`;
		}
		if (waitingListFilter.date) {
			apiUrl += `&appointment_date=${waitingListFilter.date}`;
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
	window.ReceptionistAppointmentListControls.renderAppointmentsTable({
		document,
		getAllAppointments: () => allAppointments,
		getCurrentPage: () => currentPage,
		getPerPage: () => perPage,
		formatDateDisplay
	});
}

// Update pagination
function updatePagination() {
	window.ReceptionistAppointmentListControls.updatePagination({
		document,
		getAllAppointments: () => allAppointments,
		getCurrentPage: () => currentPage,
		getPerPage: () => perPage,
		getTotalPages: () => totalPages
	});
}

// Update status counts
async function updateStatusCounts() {
	return window.ReceptionistAppointmentListControls.updateStatusCounts({
		document,
		apiCall
	});
}

// Save patient data
// Global variables for duplicate patient handling
let pendingDuplicateData = null;
let selectedDuplicatePatient = null;

// Show duplicate patient modal
function showDuplicatePatientModal(duplicatePatients, count) {
	pendingDuplicateData = { duplicatePatients, count };
	selectedDuplicatePatient = null;

	window.ReceptionistDuplicatePatientModal.show({
		document,
		bootstrap,
		duplicatePatients,
		onSelect: patient => {
			selectedDuplicatePatient = patient;
		},
		onAction: handleDuplicateChoice
	});
}

// Handle duplicate choice
function handleDuplicateChoice(action) {

	if (action === 'update' && selectedDuplicatePatient) {
		// Update existing patient

		setCurrentPatientId(selectedDuplicatePatient.id);

		// Close modal and continue with save process (skip duplicate check)
		$('#duplicatePatientModal').modal('hide');
		setTimeout(() => {
			savePatientDataWithoutDuplicateCheck();
		}, 100);
	} else if (action === 'cancel') {
		// Create new patient - close modal and continue with save process (skip duplicate check)

		setCurrentPatientId(null);

		$('#duplicatePatientModal').modal('hide');
		setTimeout(() => {
			savePatientDataWithoutDuplicateCheck();
		}, 100);
	}

	// Clear pending data
	pendingDuplicateData = null;
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
		$(`#${error.fieldId}`).focus();
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
	const appointmentId = currentAppointmentId;
	const formSnapshot = JSON.stringify(collectFormData());
	const hasNewChanges = () => JSON.stringify(collectFormData()) !== formSnapshot || uploadedDocuments.length > 0;
	const isCurrentContext = () => token === receptionistLoadState.token && patientId === currentPatientId
		&& !receptionistLoadState.loading && !receptionistLoadState.failed;
	isSubmitting = true;
	try {
		const appointmentSubmit = window.ReceptionistAppointmentSubmit;
		if (!appointmentSubmit) {
			throw new Error('ReceptionistAppointmentSubmit helper is not loaded');
		}

		const patientData = appointmentSubmit.buildPatientPayload(formData);
		const reExamCheckboxElement = document.getElementById('reExaminationCheck');
		const appointmentData = appointmentSubmit.buildAppointmentPayload(formData, {
			isReExamChecked: reExamCheckboxElement?.checked || false,
			originalAppointmentId: document.getElementById('originalAppointmentId')?.value || null
		});

		const validationError = appointmentSubmit.getAppointmentValidationError(appointmentData);
		if (validationError) {
			showReceptionistValidationError(validationError);
			return { status: 'invalid' };
		}
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
		patientId = savedPatientId;
		currentPatientId = patientId;
		window.currentPatientId = patientId;
		await window.ClinicalDocumentSectionUiUtils.uploadDraftDocumentsForPatient(patientId, {
			isCurrentContext,
			getUploadedDocuments: () => uploadedDocuments,
			setUploadedDocuments: value => { uploadedDocuments = value; renderDocumentsList(); },
			sessionStorage,
			documentDraftKey: DOCUMENT_DRAFT_KEY,
			uploadFile: async (file, targetId, options) => {
				const result = await uploadFile(file, targetId, { ...options, isCurrentContext });
				return result === true || Boolean(result?.id);
			}
		});
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

async function saveReceptionistAppointment(appointmentData, appointmentId, isCurrentContext, hasNewChanges) {
	if (!isCurrentContext()) return { status: 'stale' };
	const appointmentSubmit = window.ReceptionistAppointmentSubmit;
	const appointmentRequest = appointmentSubmit.resolveAppointmentRequest(appointmentId);
	const appointmentResponse = await apiCall(appointmentRequest.url, {
		method: appointmentRequest.method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(appointmentData)
	});
	if (!isCurrentContext()) return { status: 'stale' };
	if (!appointmentResponse.ok) {
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

	const appointmentResult = await appointmentResponse.json();
	if (!isCurrentContext()) return { status: 'stale' };
	const savedAppointmentId = Number(appointmentResult.id);
	if (!Number.isSafeInteger(savedAppointmentId) || savedAppointmentId <= 0) throw new Error('missing-appointment-id');
	if (appointmentId && Number(appointmentId) !== savedAppointmentId) throw new Error('appointment-id-mismatch');
	if (!appointmentId) {
		currentAppointmentId = savedAppointmentId;
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
	if (isSubmitting || isCheckingDuplicate) return { status: 'skipped', reason: 'saving' };
	const loadToken = receptionistLoadState.token;
	isCheckingDuplicate = true;

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
		isCheckingDuplicate = false;
	}
}

// Collect form data using DOM helpers
// Helper function to get element value by ID
function getElementValue(elementId, defaultValue = '') {
	return window.ReceptionistFormDataUtils.getElementValue(elementId, defaultValue, {
		document,
		window,
		console
	});
}

function collectFormData() {
	return window.ReceptionistFormDataUtils.collectFormData({
		document,
		window,
		console,
		servicePackage: window.ReceptionistServicePackage
	});
}

function safeSetValue(elementId, value) {
	return window.ReceptionistFormDataUtils.safeSetValue(elementId, value, {
		document,
		window
	});
}

function getPatientPopulateOptions() {
	return {
		safeSetValue,
		setDateOfBirthAndAge,
		temporarilyDisableAgeCalculation,
		reEnableAgeCalculation,
		buildFullAddressFromParts,
		summaryFieldId: 'addressSummary',
		loadProvinces,
		loadWards,
		updateAddressSummary,
		apiCall,
		allServices,
		document,
		RelativeTableManager: window.RelativeTableManager,
		JointExamManager: window.JointExamManager,
		bootstrap: window.bootstrap,
		$,
		window
	};
}

function buildSharedFormPayload({ appointment = {}, patient = {}, examination = {} } = {}) {
	return {
		appointment,
		patient_info: patient,
		examination_info: examination
	};
}

async function populateSharedForms({ appointment = {}, patient = {}, examination = {} } = {}, options = {}) {
	if (options.isCurrentLoad?.() === false) return false;
	const patientIntakeForm = window.QLPKPatientIntakeForm;
	if (!patientIntakeForm || typeof patientIntakeForm.populate !== 'function') {
		throw new Error('Shared patient intake component is not available');
	}

	const payload = buildSharedFormPayload({ appointment, patient, examination });
	const result = await patientIntakeForm.populate(payload, {
		document,
		isCurrentLoad: options.isCurrentLoad,
		syncAddressHierarchy: options.syncAddressHierarchy !== false,
		addressOptions: getPatientPopulateOptions()
	});
	if (result === false || options.isCurrentLoad?.() === false) return false;
	return payload;
}

function getMedicalDraftOptions() {
	return {
		draftKey: MEDICAL_DRAFT_KEY,
		pageLoadIdKey: PAGE_LOAD_ID_KEY,
		document,
		sessionStorage,
		localStorage
	};
}

async function copyPatientToReceptionistFormFromGlobalSearch(payload = {}) {
	const patientId = payload.patient_id;
	if (!patientId) {
		showCustomToast('warning', 'Không xác định được bệnh nhân cần sao chép.');
		return false;
	}

	const isCurrentLoad = beginReceptionistLoad();
	try {
		const response = await apiCall(`/api/patients/${patientId}`);
		if (!isCurrentLoad()) return false;
		if (!response.ok) throw new Error(await response.text());
		const responseData = await response.json();
		if (!isCurrentLoad()) return false;
		const patient = responseData.data || responseData;
		if (!patient || !patient.id) throw new Error('Không có dữ liệu bệnh nhân');

		window.ReceptionistFormResetUtils.clearFormForCopy({
			document,
			window,
			setupAgeCalculation,
			setCurrentPatientId
		});
		currentEditId = null;
		currentAppointmentId = null;
		window.ReceptionistJointExamOrchestration.clearPendingList(jointExamManagerInstance);
		localStorage.removeItem('currentEditId');

		const populated = await populateSharedForms({ patient }, { isCurrentLoad });
		if (!isCurrentLoad()) return false;
		if (populated === false) throw new Error('patient-load-incomplete');

		setCurrentPatientId(patient.id);
		if (window.ReceptionistAppointmentListControls && typeof window.ReceptionistAppointmentListControls.activateResponsiveWorkspacePane === 'function') {
			window.ReceptionistAppointmentListControls.activateResponsiveWorkspacePane('main', { document, window });
		}
		try { await loadAttachmentsForCurrentPatient(); } catch (attachmentError) { }
		if (!isCurrentLoad()) return false;
		receptionistLoadState.failed = false;
		showCustomToast('success', `Đã sao chép thông tin bệnh nhân: ${patient.full_name || ''}`.trim());
		return true;
	} catch (error) {
		if (!isCurrentLoad()) return false;
		console.error('Không thể sao chép bệnh nhân từ global search:', error);
		showCustomToast('error', 'Không thể sao chép thông tin bệnh nhân.');
		return false;
	} finally {
		if (isCurrentLoad()) receptionistLoadState.loading = false;
	}
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
	window.ReceptionistFormResetUtils.clearSharedFields({ document, window });
	currentAppointmentId = null;

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
		} else if (window.setDatepickerValue) {
			window.setDatepickerValue(appointmentDateInput, dateStr, true);
		} else {
			safeSetValue('appointmentDate', dateStr);
		}

		safeSetValue('appointmentTime', date.toTimeString().slice(0, 5));
	}
	safeSetValue('doctorId', appointment.doctor_id);
	window.ReceptionistServicePackage.setServiceSelection(appointment, allServices, $);

	setCurrentPatientId(appointment.patient_id);
	currentAppointmentId = appointment.id;

	window.ReceptionistAppointmentPrefill.applyEditReExamState(appointment, getPatientPopulateOptions());

	// Xóa pending list khi load appointment (vì đã có appointment rồi)
	window.ReceptionistJointExamOrchestration.clearPendingList(jointExamManagerInstance);

	relativeTableInstance = window.ReceptionistPatientRelativesTable.syncPatient(
		relativeTableInstance,
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
		loadAppointments(currentStatus, currentPage);
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
			loadAppointments(currentStatus, currentPage);
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
			$,
			window,
			console,
			setTimeout,
			servicePackage: window.ReceptionistServicePackage,
			loadServicesForForm,
			setupAgeCalculation,
			setupBMICalculation
		};
}

	// Initialize form
	function initializeForm() {
		window.ReceptionistFormBootstrap.initializeForm(getFormBootstrapOptions());
	}

	// Setup form event handlers
	function setupFormEventHandlers() {
		window.ReceptionistFormBootstrap.setupFormEventHandlers(getFormBootstrapOptions());
	}

// Load sidebar user info
async function loadSidebarUserInfo() {
	return window.ReceptionistPageSessionBootstrap.loadSidebarUserInfo({ document });
}

async function loadPreviousVitals(patientId) {
	if (!window.ReceptionistPatientVitalsHistory) return;
	return window.ReceptionistPatientVitalsHistory.loadPreviousVitals(patientId, {
		...getPatientPopulateOptions(),
		getCurrentPatientId: () => currentPatientId,
		getContextToken: () => receptionistLoadState.token
	});
}

window.calculatePregnancyWeek = calculatePregnancyWeek;
window.saveAddressToServerIfEditing = saveAddressToServerIfEditing;
window.buildFullAddressFromParts = buildFullAddressFromParts;
window.getCurrentLoadId = getCurrentLoadId;
window.safeSetValue = safeSetValue;

// Load patient medical data from API
async function loadPatientMedicalData(patientId) {
	const token = receptionistLoadState.token;
	const isCurrentLoad = () => token === receptionistLoadState.token && currentPatientId === patientId;
	try {

		const response = await apiCall(`/api/patients/${patientId}`);
		if (!isCurrentLoad()) return false;
		if (response.ok) {
			const responseData = await response.json();
			if (!isCurrentLoad()) return false;

			// Extract patient data from response
			const patient = responseData.data || responseData;

			return await populateSharedForms({ patient }, { isCurrentLoad });
		}
	} catch (error) {
		if (!isCurrentLoad()) return false;
		console.error('Error loading patient medical data:', error);
	}
}

// Load visible medical details and bind draft autosave for the intake form.
async function initializeVisibleMedicalDetails() {
	let draftResult = { hasValidDraft: false };
	try {
		draftResult = window.ReceptionistMedicalInfoDraft.loadDraft(getMedicalDraftOptions());
		window.ReceptionistMedicalInfoDraft.bindAutoSave(getMedicalDraftOptions());
	} catch (e) {
		console.error('Error loading medical draft:', e);
	}

	// Nếu không có draft data hợp lệ, load từ currentPatientId nếu có
	if (currentPatientId && !draftResult.hasValidDraft) {

		await loadPatientMedicalData(currentPatientId);
	}

	// Load attachments from server
	try { await loadAttachmentsForCurrentPatient(); } catch (e) { }
}

// Document upload functions
let uploadedDocuments = []; // nháp trong phiên (chưa upload)
let attachments = []; // tài liệu đã lưu trên server
let uploadInitialized = false;
let attachmentMaxSizeBytes = 50 * 1024 * 1024;
let attachmentMaxSizeMb = 50;

function getDocumentAttachmentControlsOptions() {
	return {
		window,
		document,
		sessionStorage,
		documentDraftKey: DOCUMENT_DRAFT_KEY,
		apiCall,
		showToast: showCustomToast,
		showConfirmationDialog: window.QLPKConfirmationDialog?.confirm,
		validateFile,
		uploadFile,
		renderDocumentsList,
		loadAttachmentsForCurrentPatient,
		getCurrentPatientId: () => window.currentPatientId,
		getContextToken: () => receptionistLoadState.token,
		getUploadedDocuments: () => uploadedDocuments,
		setUploadedDocuments: value => { uploadedDocuments = value; },
		getAttachments: () => attachments,
		setAttachments: value => { attachments = value; },
		getUploadInitialized: () => uploadInitialized,
		setUploadInitialized: value => { uploadInitialized = value; },
		getAttachmentMaxSizeBytes: () => attachmentMaxSizeBytes,
		setAttachmentMaxSizeBytes: value => { attachmentMaxSizeBytes = value; },
		getAttachmentMaxSizeMb: () => attachmentMaxSizeMb,
		setAttachmentMaxSizeMb: value => { attachmentMaxSizeMb = value; },
		keepUploadAreaVisible: true
	};
}

function updateAttachmentSizeHint() {
	documentAttachmentControls.updateAttachmentSizeHint(getDocumentAttachmentControlsOptions());
}

async function loadAttachmentConfig() {
	return documentAttachmentControls.loadAttachmentConfig(getDocumentAttachmentControlsOptions());
}

async function initializeDocumentUpload() {
	return documentAttachmentControls.initializeDocumentUpload(getDocumentAttachmentControlsOptions());
}

// ===== FILE UPLOAD UTILITY FUNCTIONS =====

function getDocumentUploadOptions(options = {}) {
	return Object.assign({}, getDocumentAttachmentOptions(), {
		FormData,
		maxSizeBytes: attachmentMaxSizeBytes,
		maxSizeMb: attachmentMaxSizeMb,
		isDraft: options.isDraft,
		shouldShowToast: options.showToast !== false,
		isCurrentContext: options.isCurrentContext,
		onUploadSuccess: attachment => {
			if (options.isDraft || !attachment || !attachment.id) return;
			const current = Array.isArray(attachments) ? attachments : [];
			attachments = [attachment, ...current.filter(item => item && item.id !== attachment.id)];
			renderDocumentsList();
		},
		reloadAttachments: loadAttachmentsForCurrentPatient
	});
}

function validateFile(file) {
	return documentAttachmentUtils.validateFile(file, getDocumentUploadOptions());
}

async function uploadFile(file, patientId, options = {}) {
	return documentAttachmentUtils.uploadFile(file, patientId, getDocumentUploadOptions(options));
}

function getDocumentAttachmentListOptions() {
	return {
		document,
		getCurrentPatientId: () => window.currentPatientId,
		getContextToken: () => receptionistLoadState.token,
		utils: documentAttachmentUtils,
		getAttachments: () => attachments,
		getUploadedDocuments: () => uploadedDocuments,
		formatDateDisplay,
		openAttachmentPreviewInNewTab,
		apiCall,
		showToast: showCustomToast,
		showConfirmationDialog: window.QLPKConfirmationDialog?.confirm,
		loadAttachmentsForCurrentPatient,
		downloadDraftDocument: downloadDocument,
		deleteDraftDocument: deleteDocument
	};
}

function handleFileUpload(files) {
	documentAttachmentControls.handleFileUpload(files, getDocumentAttachmentControlsOptions());
}

function renderDocumentsList() {
	window.ReceptionistDocumentAttachmentList.renderDocumentsList(getDocumentAttachmentListOptions());
}

async function loadAttachmentsForCurrentPatient() {
	return documentAttachmentControls.loadAttachmentsForCurrentPatient(getDocumentAttachmentControlsOptions());
}

async function uploadAttachmentForCurrentPatient(file) {
	return documentAttachmentControls.uploadAttachmentForCurrentPatient(file, getDocumentAttachmentControlsOptions());
}

const documentAttachmentControls = window.ReceptionistDocumentAttachmentControls;
const documentAttachmentUtils = window.ReceptionistDocumentAttachmentUtils;
const getFileIcon = documentAttachmentUtils.getFileIcon;
const formatFileSize = documentAttachmentUtils.formatFileSize;

function getDocumentAttachmentOptions() {
	return {
		getCurrentPatientId: () => window.currentPatientId,
		getContextToken: () => receptionistLoadState.token,
		window,
		document,
		URL,
		fetch,
		showConfirmationDialog: window.QLPKConfirmationDialog?.confirm,
		showToast: showCustomToast,
		getUploadedDocuments: () => uploadedDocuments,
		setUploadedDocuments: value => { uploadedDocuments = value; },
		renderDocumentsList
	};
}

function getAttachmentUrl(attachmentId, mode = 'download') {
	return documentAttachmentUtils.getAttachmentUrl(attachmentId, mode);
}

async function openAttachmentPreviewInNewTab(attachmentId, filename, actionOptions = {}) {
	await documentAttachmentUtils.openAttachmentPreviewInNewTab(attachmentId, filename, { ...getDocumentAttachmentOptions(), ...actionOptions });
}

async function downloadAttachmentWithAuth(attachmentId, filename) {
	await documentAttachmentUtils.downloadAttachmentWithAuth(attachmentId, filename, getDocumentAttachmentOptions());
}

function downloadDocument(docId) {
	documentAttachmentUtils.downloadDraftDocument(docId, getDocumentAttachmentOptions());
}

function deleteDocument(docId, options = {}) {
	return documentAttachmentUtils.deleteDraftDocument(docId, { ...getDocumentAttachmentOptions(), ...options });
}

// Initialize page
function initializePage() {

		// Reset form to default values
		resetFormToDefault();

	// Explicitly clear age field on page load
	setTimeout(() => {
		const ageField = document.getElementById('age');
		if (ageField) {
			ageField.value = '';
			ageField.textContent = '';
			ageField.innerHTML = '';
		}
	}, 100);

	// Load sidebar user info
	loadSidebarUserInfo();

	// Load initial data
	loadDoctorsForForm();
	loadProvinces();
	loadAppointments(currentStatus, currentPage);
	updateStatusCounts();

	// Initialize document upload
	initializeDocumentUpload();
	initializeVisibleMedicalDetails();

		setDefaultAppointmentDateTime();

	// Setup event listeners để remove highlight khi user thay đổi ngày/giờ hẹn
	setupAppointmentDateTimeListeners();
}

	const appointmentDateHighlight = window.ReceptionistAppointmentDateHighlight;
	const highlightAppointmentDateTimeFields = () => appointmentDateHighlight.highlight({ $, setTimeout });
	const setupAppointmentDateTimeListeners = () => appointmentDateHighlight.bindChangeListeners({ $, setTimeout });

	// Reset form to default values
	function resetFormToDefault() {
		receptionistLoadState.token += 1;
		receptionistLoadState.loading = false;
		receptionistLoadState.failed = false;
		currentAppointmentId = null;
		window.ReceptionistJointExamOrchestration.clearPendingList(jointExamManagerInstance);
		window.ReceptionistFormResetUtils.resetFormToDefault({
			document,
			window,
			localStorage,
			relativeTableInstance,
			setRelativeTableInstance: value => { relativeTableInstance = value; },
			setCurrentEditId: value => { currentEditId = value; },
			setUploadedDocuments: value => { uploadedDocuments = value; },
			setCurrentPatientId
		});
	window.QLPKPatientIntakeForm.updatePregnancyControls({ document });
	}

// Event listeners
document.addEventListener('DOMContentLoaded', async function () {
	if (!await ensureSession()) return;

	initializePage();

	window.ReceptionistAppointmentListControls.bindListControls({
		document,
		window,
		getCurrentStatus: () => currentStatus,
		setCurrentStatus: value => { currentStatus = value; },
		getCurrentPage: () => currentPage,
		getTotalPages: () => totalPages,
		setPerPage: value => { perPage = value; },
		loadAppointments,
		updateStatusCounts,
		editAppointment,
		transferAppointment,
		cancelAppointment
	});

	bindAddressFieldChanges();

	window.ReceptionistAppointmentListControls.bindWaitingListFilters({
			document,
			getCurrentStatus: () => currentStatus,
			getWaitingListFilter: () => waitingListFilter,
			setWaitingListFilter: value => { waitingListFilter = value; },
			loadAppointments,
			apiCall,
			showToast: showCustomToast
		});

	// Initialize form
	initializeForm();
	initializeAutocomplete();

	window.ReceptionistFormInputGuards.bindAgeInputGuard({ document });
	window.QLPKPatientIntakeForm.bind({ document, apiCall });

	window.ReceptionistJointExamOrchestration.bindModalControls(
		Object.assign({}, getPatientPopulateOptions(), {
			getManager: () => jointExamManagerInstance
		})
	);

	window.ReceptionistFormSaveControls.bindSaveInfoButton({
		document,
		savePatientData: () => savePatientData()
	});

	window.ReceptionistAppointmentPrefill.bindReExamSourceReset(getPatientPopulateOptions());

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'document.changed', 'catalog.changed', 'busy_schedule.changed'],
			debounceMs: 500,
			handler: function (event) {
				const payload = event && event.payload ? event.payload : {};
				const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;

				if (event.type === 'catalog.changed') {
					loadDoctorsForForm();
					loadServicesForForm();
				}

				if (event.type === 'document.changed') {
					if (eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId)) {
						loadAttachmentsForCurrentPatient();
					}
					return;
				}

				if (eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId)) {
					if (event.type === 'patient.changed' && relativeTableInstance) {
						const handledRelativeUpdate = typeof relativeTableInstance.applyPatientChanged === 'function'
							? relativeTableInstance.applyPatientChanged(payload)
							: false;
						if (!handledRelativeUpdate && payload.action !== 'family_member_updated' && typeof relativeTableInstance.reload === 'function') {
							relativeTableInstance.reload();
						}
					}
				}

				loadAppointments(currentStatus, currentPage);
				updateStatusCounts();
			}
		});
	}

});

window.ReceptionistPatientRelativesTable.bindInitialLoad(
	Object.assign({}, getPatientPopulateOptions(), {
		getInstance: () => relativeTableInstance,
		setInstance: value => { relativeTableInstance = value; }
	})
);

// ========================================
// JOINT EXAM (NGƯỜI ĐI KHÁM CÙNG) - SỬ DỤNG MODULE DRY
// ========================================

// Khởi tạo JointExamManager instance
let jointExamManagerInstance = null;

	const receptionistFormatters = window.ReceptionistFormatters || {};
	const escapeHtml = receptionistFormatters.escapeHtml;
	const formatDateDisplay = receptionistFormatters.formatDateDisplay || window.formatDateDisplay || (value => value || '');

// Lấy appointment ID hiện tại
function getCurrentAppointmentId() {
	return currentAppointmentId;
}

window.ReceptionistJointExamOrchestration.bindInitialLoad(
	Object.assign({}, getPatientPopulateOptions(), {
		getInstance: () => jointExamManagerInstance,
		setInstance: value => { jointExamManagerInstance = value; },
		getAppointmentId: getCurrentAppointmentId,
		getContextToken: () => receptionistLoadState.token,
		onReloadFamilyMembers: () => {
			if (relativeTableInstance) {
				relativeTableInstance.reload();
			}
		},
		showToast: showCustomToast,
		escapeHtml,
		formatDateDisplay
	})
);

async function savePendingJointExamList(appointmentId, options = {}) {
	return window.ReceptionistJointExamOrchestration.savePendingList(jointExamManagerInstance, appointmentId, options);
}
