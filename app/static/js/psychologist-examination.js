// Psychologist Examination - New Layout

// Global variables
import { ClinicalAddressDraftUtils } from './components/address-draft-utils.js';
import { ClinicalAddressHierarchyUtils } from './components/address-hierarchy-utils.js';
import { ClinicalDocumentFileUtils } from './components/document-file-utils.js';
import { ClinicalDocumentSectionUiUtils } from './components/document-section-ui-utils.js';
import { ClinicalExaminationFormLockUtils } from './components/examination-form-lock-utils.js';
import { ClinicalPageCoreUtils } from './components/page-core-utils.js';
import { PsychologistExaminationCoreUtils } from './psychologist-examination/core-utils.js';
import { PsychologistWorkspaceUi } from './psychologist-examination/workspace-ui.js';
import { QLPKConfirmationDialog } from './shared/confirmation-dialog.js';
import { QLPKPsychologistPatientHistoryBridge } from './psychologist-examination/patient-history-bridge.js';
import { QLPKPsychologistWorkspaceRuntime } from './psychologist-examination/workspace-runtime.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';
import { QLPKWorkflowTwoPane } from './components/workflow-two-pane.js';
import { ClinicalExaminationWaitingListUi } from './components/examination-waiting-list-ui.js';
import { ClinicalFormDomUtils } from './components/form-dom-utils.js';
import { ClinicalVitalCalculationUtils } from './components/vital-calculation-utils.js';
import { OccupationAutocomplete } from './occupation-autocomplete.js';
import { ReferralSourceControl } from './referral-source-control.js';
import { state as psychologistPageState } from './psychologist-examination/page-state.js';

let currentPatientId = null;
let currentPatientData = null;
// Patient history modal, its selected patient and the medical record redraw, set once the history bridge binds.
let patientHistory = null;
let psychologistRelativeTableInstance = null;
const pageCoreAdapter = ClinicalPageCoreUtils.createPageCoreAdapter({
	document,
	window,
	localStorage,
	sessionStorage,
	setLocalPatientId: nextValue => { currentPatientId = nextValue; },
	updateNotesAttachmentCount: () => documentSectionAdapter.updateNotesAttachmentCount(),
	loadAttachmentsForCurrentPatient: () => documentSectionAdapter.loadAttachmentsForCurrentPatient(),
	getCurrentAppointmentId: () => currentAppointmentId,
	getCurrentPatientId: () => currentPatientId,
	setCurrentAppointmentId: nextValue => { currentAppointmentId = nextValue; },
	currentPage: () => currentPage,
	perPage: () => perPage,
	totalPages: () => totalPages,
	totalItems: () => allAppointments.length,
	autoSaveIndicatorOptions: { savingIconClass: 'bi-hourglass-split' }
});

// Debug function to track currentPatientId changes
const setCurrentPatientId = pageCoreAdapter.setCurrentPatientId;
let currentAppointmentId = null;
let allAppointments = [];
let currentPage = 1;
let perPage = 50;
let totalPages = 1;
let currentStatus = 'psychologist_exam';
let isFormLocked = false;
let patientSearchQuery = ''; // Từ khóa tìm kiếm bệnh nhân
let isLoadingExaminationData = false; // Flag để tạm tắt auto save khi đang load dữ liệu


// Helpers
const psychologistCoreUtils = PsychologistExaminationCoreUtils;
if (!psychologistCoreUtils) {
	throw new Error('PsychologistExaminationCoreUtils is not loaded');
}

const formatDisplayDate = psychologistCoreUtils.formatDisplayDate;
const psychologistGetExaminationStatusText = psychologistCoreUtils.getExaminationStatusText;
const psychologistGetExaminationStatusBadgeClass = psychologistCoreUtils.getExaminationStatusBadgeClass;
const psychologistWorkspaceUi = PsychologistWorkspaceUi;
const psychologistWorkspaceRuntime = QLPKPsychologistWorkspaceRuntime;

// Session and form state used by the canonical inline workspace.
const PAGE_LOAD_ID_KEY = 'qlpk_page_load_id';
const ADDRESS_DRAFT_KEY = 'qlpk_address_draft';
const DOCUMENT_DRAFT_KEY = 'qlpk_document_draft';

const addressDraftAdapter = ClinicalAddressDraftUtils.createAddressDraftAdapter({
	document,
	sessionStorage,
	pageLoadIdKey: PAGE_LOAD_ID_KEY,
	addressDraftKey: ADDRESS_DRAFT_KEY
});

const getAuthHeader = pageCoreAdapter.getAuthHeader;

// API call wrapper with the shared authenticated runtime.
function apiCall(url, options = {}) {
	return pageCoreAdapter.apiCall(url, options);
}

// Read by the shared joint-exam bootstrap (same contract as the doctor page).
window.QLPKCurrentAppointment = { getId: () => currentAppointmentId, getContextToken: () => psychologistPageState.contextToken, apiCall };

const addressHierarchyAdapter = ClinicalAddressHierarchyUtils.createAddressHierarchyAdapter({
	document,
	apiCall,
	console,
	encodeURIComponent,
	getCurrentPatientId: () => currentPatientId
});

const saveAddressDraftToCache = () => addressDraftAdapter.saveAddressDraftToCache();
const loadAddressDraftFromCache = () => addressDraftAdapter.loadAddressDraftFromCache();

async function autoSavePatientField(fieldName, value) {
	const appointmentId = currentAppointmentId;
	const patientId = currentPatientId;
	const contextToken = psychologistWorkspaceRuntime?.getState?.().contextToken;
	const isCurrentContext = () => currentAppointmentId === appointmentId
		&& currentPatientId === patientId
		&& psychologistWorkspaceRuntime?.getState?.().contextToken === contextToken;
	return pageCoreAdapter.autoSavePatientFormField(fieldName, value, {
		shouldSkip: () => !appointmentId || isLoadingExaminationData
			|| psychologistWorkspaceRuntime?.getState?.().loadFailed || !isCurrentContext(),
		recheckSkipBeforeSave: true,
		isCurrentAppointment: savedId => savedId === appointmentId && isCurrentContext()
	});
}

async function syncModalDataToMainForm(saveToDb = false) {
	return addressHierarchyAdapter.syncPersonalDetailModalToMainForm(saveToDb);
}

const loadProvinces = addressHierarchyAdapter.loadProvinces;

const psychologistWaitingListAdapter = ClinicalExaminationWaitingListUi.createWaitingListAdapter({
	document,
	apiCall,
	statuses: ['psychologist_exam', 'conclusion'],
	roleQueryParam: 'psychologist=true',
	defaultStatus: 'psychologist_exam',
	variant: 'timeline',
	patientCodeLabel: '',
	showActions: false,
	onSelectAppointment: appointmentId => selectPatientCard(appointmentId),
	includeAge: true,
	includeGender: true,
	includePhone: false,
	includeStatus: false,
	includePractitioner: false,
	includeDateTime: true,
	getPerPage: () => perPage,
	getAppointments: () => allAppointments,
	getPatientSearchQuery: () => patientSearchQuery,
	getCurrentPage: () => currentPage,
	setAppointments: appointments => { allAppointments = appointments; },
	setCurrentPage: nextPage => { currentPage = nextPage; },
	setTotalPages: nextTotalPages => { totalPages = nextTotalPages; },
	updatePagination: () => pageCoreAdapter.updatePagination(),
	formatDateDisplay: date => window.formatDateDisplay ? window.formatDateDisplay(date) : formatDisplayDate(date),
	calculateAge: ClinicalVitalCalculationUtils.calculateAge,
	showError: () => window.showCustomToast('error', 'Lỗi khi tải danh sách lịch hẹn')
});

async function loadAppointments(status = 'psychologist_exam', page = 1) {
	return psychologistWaitingListAdapter.loadAppointments(status, page);
}

function renderAppointmentsTable() {
	return psychologistWaitingListAdapter.renderAppointmentsTable();
}
// Helper function to sync modal data only when appropriate
function syncModalDataIfNeeded() {
	return addressHierarchyAdapter.syncPersonalDetailModalIfNeeded({
		getCurrentAppointmentId: () => currentAppointmentId,
		syncModalDataToMainForm
	});
}

// Lưu thông tin hành chính bằng owner dùng chung; phần lâm sàng do workspace runtime lưu.
async function savePatientDataInternal(formData) {
	const appointmentId = currentAppointmentId;
	const patientId = currentPatientId;
	const contextToken = psychologistWorkspaceRuntime?.getState?.().contextToken;
	if (!appointmentId || isLoadingExaminationData || psychologistWorkspaceRuntime?.getState?.().loadFailed) {
		return { status: 'skipped', reason: 'not-ready' };
	}
	return pageCoreAdapter.runPatientDataInternalSave({
		formData,
		isCurrentContext: () => currentAppointmentId === appointmentId
			&& currentPatientId === patientId
			&& !isLoadingExaminationData
			&& !psychologistWorkspaceRuntime?.getState?.().loadFailed
			&& psychologistWorkspaceRuntime?.getState?.().contextToken === contextToken,
		syncModalDataIfNeeded,
		getCurrentPatientId: () => patientId,
		buildPatientPayload: data => ClinicalFormDomUtils.buildPatientSavePayload(data),
		uploadDraftDocumentsForPatient: (savedPatientId, uploadOptions) => documentSectionAdapter.uploadDraftDocumentsForPatient(savedPatientId, uploadOptions),
		getCurrentAppointmentId: () => appointmentId,
		buildAppointmentPayload: data => ClinicalFormDomUtils.buildAppointmentClinicalUpdatePayload(data),
		setCurrentPatientId,
		showToast: window.showCustomToast,
		afterPatientSaved: (patientResult, patientData) => {
			const selectedModalPatient = patientHistory?.getSelectedPatient();
			if (selectedModalPatient) {
				Object.assign(selectedModalPatient, patientData);
				selectedModalPatient.id = patientResult.id;
				patientHistory.updateMedicalRecordTab();
			}
		}
	});
}

async function savePatientData() {
	return psychologistWorkspaceRuntime.save();
}

// ===== DOM UTILITY FUNCTIONS =====

const formDomAdapter = ClinicalFormDomUtils.createFormDomAdapter({
	document,
	getReferralSourceControl: () => ReferralSourceControl
});
const getElementValue = formDomAdapter.getElementValue;

// Collect form data using DOM helpers
function collectFormData() {
	const history = psychologistWorkspaceRuntime?.getHistory?.();
	const historySnapshot = history?.collect?.() || {};
	const getInlineHistoryValue = (_hiddenFieldId, modalFieldId) => getElementValue(modalFieldId);

	return ClinicalFormDomUtils.collectClinicalAdministrativeFormData({
		document,
		getElementValue,
		getMedicalHistoryValue: getInlineHistoryValue,
		getFamilyHistory: () => historySnapshot.familyHistory || [],
		getPhysicalHistory: () => historySnapshot.physicalHistory || []
	});
}

// Transfer/Cancel/Edit appointment functions removed - not needed for psychologist examination page

// Initialize form
function initializeForm() {
	ClinicalFormDomUtils.initializeWorkflowFormShell({
		document,
		window,
		console,
		setTimeout,
		loadProvinces,
		vitalUtils: ClinicalVitalCalculationUtils,
		autoSaveBMI: (bmi) => {
			if (typeof autoSavePatientField === 'function') {
				autoSavePatientField('bmi', bmi);
			}
		},
		setupMainAddressChangeHandlers: () => addressHierarchyAdapter.setupMainAddressChangeHandlers(),
		occupationOptions: { OccupationAutocomplete: OccupationAutocomplete },
		documentSectionAdapter,
		getElementValue,
		autoSaveField: autoSavePatientField
	});
}

// Patient search sidebar functions removed - not needed for psychologist examination page

async function loadPatientIntoForm(patient, examination = null, appointment = null) {
	if (!patient) return { status: 'missingPatient' };
	currentPatientData = patient;
	setCurrentPatientId(patient.id);
	if (appointment?.id) currentAppointmentId = appointment.id;
	return { status: 'staged', patient, examination, appointment };
}

// Document upload functions
let uploadedDocuments = []; // nháp trong phiên (chưa upload)
let attachments = []; // tài liệu đã lưu trên server
let uploadInitialized = false;

let notesAttachmentChip = null;

const documentFileAdapter = ClinicalDocumentFileUtils.createDocumentFileAdapter({
	showError: message => window.showCustomToast('error', message)
});

const documentSectionAdapter = ClinicalDocumentSectionUiUtils.createExaminationDocumentSectionAdapter({
	document,
	getCurrentPatientId: () => currentPatientId,
	getContextToken: () => psychologistPageState.contextToken,
	sessionStorage,
	documentDraftKey: DOCUMENT_DRAFT_KEY,
	apiCall,
	fetch,
	getAuthHeader,
	validateFile: file => validateFile(file),
	getFileIcon: fileType => documentFileAdapter.getFileIcon(fileType),
	formatFileSize: bytes => documentFileAdapter.formatFileSize(bytes),
	formatDisplayDate,
	showToast: (type, message) => window.showCustomToast(type, message),
	showConfirmationDialog: options => QLPKConfirmationDialog.confirm(options),
	console,
	getIsLocked: () => isFormLocked,
	getUploadInitialized: () => uploadInitialized,
	setUploadInitialized: value => { uploadInitialized = value; },
	getNotesAttachmentChip: () => notesAttachmentChip,
	setNotesAttachmentChip: value => { notesAttachmentChip = value; },
	getUploadedDocuments: () => uploadedDocuments,
	setUploadedDocuments: nextDocuments => { uploadedDocuments = nextDocuments; },
	getAttachments: () => attachments,
	setAttachments: nextAttachments => { attachments = nextAttachments; }
});

// ===== FILE UPLOAD UTILITY FUNCTIONS =====

const validateFile = documentFileAdapter.validateFile;


// Initialize page
function initializePage() {
	ClinicalFormDomUtils.initializeWorkflowPageShell({
		document,
		window,
		console,
		setTimeout,
		resetFormToDefault,
		loadAddressDraftFromCache,
		loadProvinces,
		loadAppointments,
		currentStatus,
		currentPage,
		occupationOptions: { OccupationAutocomplete: OccupationAutocomplete },
		documentSectionAdapter,
		addressDraftAdapter,
		saveAddressDraftToCache,
		getElementValue,
		autoSaveField: autoSavePatientField
	});
}

// Reset form to default values
function resetFormToDefault() {
	ClinicalFormDomUtils.resetPsychologistWorkflowPageState({
		document,
		localStorage,
		relativeTable: psychologistRelativeTableInstance,
		setUploadedDocuments: value => { uploadedDocuments = value; },
		setCurrentPatientId
	});
}
// Event listeners
document.addEventListener('DOMContentLoaded', async function () {
	const bootstrapResult = await ClinicalPageCoreUtils.initializeExaminationPageBootstrap({
		document,
		window,
		pageCoreAdapter,
		initializePage,
		initializeForm,
		setRelativeTableInstance: instance => { psychologistRelativeTableInstance = instance; },
		setCurrentStatus: nextStatus => { currentStatus = nextStatus; },
		setPatientSearchQuery: nextQuery => { patientSearchQuery = nextQuery; },
		renderAppointmentsTable,
		getCurrentStatus: () => currentStatus,
		getCurrentPage: () => currentPage,
		setPerPage: nextValue => { perPage = nextValue; },
		loadAppointments,
		personalDetailOptions: { bindings: {} },
		isFormLocked: () => isFormLocked,
		savePatientData
	});
	if (bootstrapResult.status !== 'initialized') return;
	psychologistWorkspaceRuntime?.bind({ document, page: {
		setLoading: value => { isLoadingExaminationData = Boolean(value); },
		setCurrentPatient: patient => { currentPatientData = patient; },
		setCurrentPatientId: value => setCurrentPatientId(value),
		setCurrentAppointmentId: value => { currentAppointmentId = value || null; },
		baseSave: () => savePatientDataInternal(collectFormData()),
		openHistory: () => patientHistory?.patientHistoryModal?.open?.()
	} });
	psychologistWorkspaceUi?.bind({ document });
	psychologistWorkspaceUi?.clearWorkspace({ document });

	if (QLPKRealtimePageHooks) {
		QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'order.changed', 'survey.changed', 'patient.changed', 'document.changed', 'catalog.changed', 'busy_schedule.changed'],
			debounceMs: 500,
			handler: function (event) {
				const payload = event && event.payload ? event.payload : {};
				const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;

				if (event.type === 'document.changed' && eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId)) {
					documentSectionAdapter.loadAttachmentsForCurrentPatient();
					documentSectionAdapter.updateNotesAttachmentCount();
				}

				if (event.type === 'patient.changed' && eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId) && psychologistRelativeTableInstance && typeof psychologistRelativeTableInstance.reload === 'function') {
					psychologistRelativeTableInstance.reload();
				}

				loadAppointments(currentStatus, currentPage);
			}
		});
	}

	patientHistory = QLPKPsychologistPatientHistoryBridge.create({
		document,
		apiCall,
		showToast: window.showCustomToast,
		showConfirmationDialog: options => QLPKConfirmationDialog.confirm(options),
		formatDisplayDate,
		getAppointments: () => allAppointments,
		getCurrentPatientData: () => currentPatientData,
		getCurrentAppointmentId: () => currentAppointmentId,
		getFormatDateDisplay: () => window.formatDateDisplay || formatDisplayDate,
		setLoadingState: value => { isLoadingExaminationData = value; },
		setCurrentAppointmentId: value => { currentAppointmentId = value; },
		setCurrentPatientId,
		loadPatient: loadPatientIntoForm,
		loadExaminationFormData,
		lockForm: () => copyViewLockController.lock(),
		isFormLocked: () => isFormLocked,
		unlockForm: () => copyViewLockController.unlock(),
		getExaminationStatusBadgeClass: psychologistGetExaminationStatusBadgeClass,
		getExaminationStatusText: psychologistGetExaminationStatusText,
		resetFormToDefault,
		loadAppointments,
		selectPatientCard,
		clearExaminationLayout: () => psychologistWorkspaceRuntime?.clear({ document })
	}).bind();

	// Print preview and queue management removed - not needed for psychologist examination page
});
// Chọn bệnh nhân từ card
async function selectPatientCard(appointmentId) {
	return window.ModalPatientSearchUi.selectAppointmentPatientFlow(appointmentId, {
		apiCall,
		appointments: allAppointments,
		setCurrentAppointmentId: value => { currentAppointmentId = value; },
		setLoading: value => { isLoadingExaminationData = value; },
		clearBeforeLoad: () => {
			psychologistWorkspaceRuntime?.clear({ document });
			psychologistWorkspaceUi?.clearWorkspace({ document });
			return true;
		},
		loadPatient: loadPatientIntoForm,
		loadExaminationFormData,
		clearExaminationFormOnError: () => psychologistWorkspaceRuntime?.clear({ document }),
		afterExaminationFormLoad: () => {
			isLoadingExaminationData = false;
			QLPKWorkflowTwoPane?.activate?.('main', { document });
			psychologistWorkspaceUi?.showWorkspace({
				document,
				patient: currentPatientData,
				appointmentId: currentAppointmentId
			});
		},
		unlockIfNeeded: () => {
			if (isFormLocked) copyViewLockController.unlock();
		},
		serviceErrorMessage: 'Không thể tải danh sách dịch vụ cho lịch hẹn:',
		examinationFormErrorMessage: 'Error loading examination form data:',
		clearErrorMessage: 'Error clearing examination fields:'
	});
}

// ========================================
// ICD DATA LOADING (for autocomplete components)
// ========================================

/**
 * Load ICD data from API with search query
 * Note: This function is available to shared ICD autocomplete consumers.
 */
const copyViewLockController = ClinicalExaminationFormLockUtils.createWorkflowCopyViewLockController({
	document,
	afterApplyLockState: locked => documentSectionAdapter.setDocumentSectionLockState(locked),
	setLocked: locked => { isFormLocked = locked; }
});

/**
 * Load examination form data when appointment is selected
 */
async function loadExaminationFormData(appointmentId) {
	return psychologistWorkspaceRuntime.loadAppointment(appointmentId, { document });
}
