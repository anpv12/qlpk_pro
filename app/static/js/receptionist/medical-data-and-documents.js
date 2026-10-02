import { state } from './page-state.js';
import { DOCUMENT_DRAFT_KEY, apiCall, currentPage, currentPatientId, ensureSession, initializeAutocomplete, loadAppointments, loadDoctorsForForm, loadServicesForForm, receptionistLoadState, setCurrentPatientId, setDefaultAppointmentDateTime, showCustomToast, totalPages, updateStatusCounts } from '../receptionist-new.js';
import { getMedicalDraftOptions, getPatientPopulateOptions, populateSharedForms } from './save-flow-parts/copy-patient.js';
import { cancelAppointment, editAppointment, initializeForm, loadSidebarUserInfo, savePatientData, transferAppointment } from './save-flow.js';
import { bindAddressFieldChanges, loadProvinces } from '../receptionist-new-parts/address.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';
import { QLPKRealtimePageHooks } from '../realtime-page-hooks.js';
import { ReceptionistAppointmentDateHighlight } from './appointment-date-highlight.js';
import { ReceptionistAppointmentListControls } from './appointment-list-controls.js';
import { ReceptionistAppointmentPrefill } from './appointment-prefill.js';
import { ReceptionistDocumentAttachmentList } from './document-attachment-list.js';
import { ReceptionistDocumentAttachmentUtils } from './document-attachment-utils.js';
import { ReceptionistFormInputGuards } from './form-input-guards.js';
import { ReceptionistFormResetUtils } from './form-reset-utils.js';
import { ReceptionistFormSaveControls } from './form-save-controls.js';
import { ReceptionistFormatters } from './formatters.js';
import { ReceptionistJointExamOrchestration } from './joint-exam-orchestration.js';
import { ReceptionistMedicalInfoDraft } from './medical-info-draft.js';
import { QLPKPatientIntakeForm } from '../components/patient-intake-form.js';
import { ReceptionistDocumentAttachmentControls } from './document-attachment-controls.js';
import { ReceptionistPatientRelativesTable } from './patient-relatives-table.js';

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
		draftResult = ReceptionistMedicalInfoDraft.loadDraft(getMedicalDraftOptions());
		ReceptionistMedicalInfoDraft.bindAutoSave(getMedicalDraftOptions());
	} catch (e) {
		console.error('Error loading medical draft:', e);
	}

	// Nếu không có draft data hợp lệ, load từ currentPatientId nếu có
	if (currentPatientId && !draftResult.hasValidDraft) {

		await loadPatientMedicalData(currentPatientId);
	}

	// Load attachments from server
	try { await loadAttachmentsForCurrentPatient(); } catch (e) { console.warn('Không thể tải tệp đính kèm:', e); }
}

// Document upload functions
state.uploadedDocuments = []; // nháp trong phiên (chưa upload)
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
		showConfirmationDialog: QLPKConfirmationDialog?.confirm,
		validateFile,
		uploadFile,
		renderDocumentsList,
		loadAttachmentsForCurrentPatient,
		getCurrentPatientId: () => currentPatientId,
		getContextToken: () => receptionistLoadState.token,
		getUploadedDocuments: () => state.uploadedDocuments,
		setUploadedDocuments: value => { state.uploadedDocuments = value; },
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
		getCurrentPatientId: () => currentPatientId,
		getContextToken: () => receptionistLoadState.token,
		utils: documentAttachmentUtils,
		getAttachments: () => attachments,
		getUploadedDocuments: () => state.uploadedDocuments,
		formatDateDisplay,
		openAttachmentPreviewInNewTab,
		apiCall,
		showToast: showCustomToast,
		showConfirmationDialog: QLPKConfirmationDialog?.confirm,
		loadAttachmentsForCurrentPatient,
		downloadDraftDocument: downloadDocument,
		deleteDraftDocument: deleteDocument
	};
}

function renderDocumentsList() {
	ReceptionistDocumentAttachmentList.renderDocumentsList(getDocumentAttachmentListOptions());
}

async function loadAttachmentsForCurrentPatient() {
	return documentAttachmentControls.loadAttachmentsForCurrentPatient(getDocumentAttachmentControlsOptions());
}

const documentAttachmentControls = ReceptionistDocumentAttachmentControls;
const documentAttachmentUtils = ReceptionistDocumentAttachmentUtils;

function getDocumentAttachmentOptions() {
	return {
		getCurrentPatientId: () => currentPatientId,
		getContextToken: () => receptionistLoadState.token,
		window,
		document,
		URL,
		fetch,
		showConfirmationDialog: QLPKConfirmationDialog?.confirm,
		showToast: showCustomToast,
		getUploadedDocuments: () => state.uploadedDocuments,
		setUploadedDocuments: value => { state.uploadedDocuments = value; },
		renderDocumentsList
	};
}

async function openAttachmentPreviewInNewTab(attachmentId, filename, actionOptions = {}) {
	await documentAttachmentUtils.openAttachmentPreviewInNewTab(attachmentId, filename, { ...getDocumentAttachmentOptions(), ...actionOptions });
}

function downloadDocument(docId) {
	documentAttachmentUtils.downloadDraftDocument(docId, getDocumentAttachmentOptions());
}

function deleteDocument(docId, options = {}) {
	return documentAttachmentUtils.deleteDraftDocument(docId, { ...getDocumentAttachmentOptions(), ...options });
}

// Initialize page

function refreshRelativesAfterPatientChange(payload) {
	const handledRelativeUpdate = typeof state.relativeTableInstance.applyPatientChanged === 'function'
		? state.relativeTableInstance.applyPatientChanged(payload)
		: false;
	if (!handledRelativeUpdate && payload.action !== 'family_member_updated' && typeof state.relativeTableInstance.reload === 'function') {
		state.relativeTableInstance.reload();
	}
}

function initializePage() {

	// Reset form to default values
	resetFormToDefault();

	// Explicitly clear age field on page load
	setTimeout(() => {
		const ageField = document.getElementById('age');
		if (ageField) {
			ageField.value = '';
			ageField.textContent = '';
			ageField.replaceChildren();
		}
	}, 100);

	// Load sidebar user info
	loadSidebarUserInfo();

	// Load initial data
	loadDoctorsForForm();
	loadProvinces();
	loadAppointments(state.currentStatus, currentPage);
	updateStatusCounts();

	// Initialize document upload
	initializeDocumentUpload();
	initializeVisibleMedicalDetails();

	setDefaultAppointmentDateTime();

	// Setup event listeners để remove highlight khi user thay đổi ngày/giờ hẹn
	setupAppointmentDateTimeListeners();
}

const appointmentDateHighlight = ReceptionistAppointmentDateHighlight;
const highlightAppointmentDateTimeFields = () => appointmentDateHighlight.highlight({ setTimeout });
const setupAppointmentDateTimeListeners = () => appointmentDateHighlight.bindChangeListeners({ setTimeout });

// Reset form to default values
function resetFormToDefault() {
	receptionistLoadState.token += 1;
	receptionistLoadState.loading = false;
	receptionistLoadState.failed = false;
	state.currentAppointmentId = null;
	ReceptionistJointExamOrchestration.clearPendingList(jointExamManagerInstance);
	ReceptionistFormResetUtils.resetFormToDefault({
		document,
		window,
		localStorage,
		relativeTableInstance: state.relativeTableInstance,
		setRelativeTableInstance: value => { state.relativeTableInstance = value; },
		setCurrentEditId: value => { state.currentEditId = value; },
		setUploadedDocuments: value => { state.uploadedDocuments = value; },
		setCurrentPatientId
	});
	QLPKPatientIntakeForm.updatePregnancyControls({ document });
}

// ========================================
// JOINT EXAM (NGƯỜI ĐI KHÁM CÙNG) - SỬ DỤNG MODULE DRY
// ========================================

// Khởi tạo JointExamManager instance
let jointExamManagerInstance = null;

const receptionistFormatters = ReceptionistFormatters || {};
const formatDateDisplay = receptionistFormatters.formatDateDisplay || window.formatDateDisplay || (value => value || '');

// Lấy appointment ID hiện tại
function getCurrentAppointmentId() {
	return state.currentAppointmentId;
}

async function savePendingJointExamList(appointmentId, options = {}) {
	return ReceptionistJointExamOrchestration.savePendingList(jointExamManagerInstance, appointmentId, options);
}

function registerRealtimeRefresh() {
	if (QLPKRealtimePageHooks) {
		QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'document.changed', 'catalog.changed', 'busy_schedule.changed'],
			debounceMs: 500,
			handler: function (event) {
				const payload = event && event.payload ? event.payload : {};
				const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;

				if (event.type === 'catalog.changed') {
					loadDoctorsForForm();
					loadServicesForForm();
				}

				const isCurrentPatient = Boolean(eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId));
				if (event.type === 'document.changed') {
					if (isCurrentPatient) loadAttachmentsForCurrentPatient();
					return;
				}

				if (isCurrentPatient && event.type === 'patient.changed' && state.relativeTableInstance) {
					refreshRelativesAfterPatientChange(payload);
				}

				loadAppointments(state.currentStatus, currentPage);
				updateStatusCounts();
			}
		});
	}
}

function startMedicalDataAndDocuments() {
	document.addEventListener('DOMContentLoaded', async function () {
		if (!await ensureSession()) return;

		initializePage();

		ReceptionistAppointmentListControls.bindListControls({
			document,
			window,
			getCurrentStatus: () => state.currentStatus,
			setCurrentStatus: value => { state.currentStatus = value; },
			getCurrentPage: () => currentPage,
			getTotalPages: () => totalPages,
			setPerPage: value => { state.perPage = value; },
			loadAppointments,
			updateStatusCounts,
			editAppointment,
			transferAppointment,
			cancelAppointment
		});

		bindAddressFieldChanges();

		ReceptionistAppointmentListControls.bindWaitingListFilters({
			document,
			getCurrentStatus: () => state.currentStatus,
			getWaitingListFilter: () => state.waitingListFilter,
			setWaitingListFilter: value => { state.waitingListFilter = value; },
			loadAppointments,
			apiCall,
			showToast: showCustomToast
		});

		// Initialize form
		initializeForm();
		initializeAutocomplete();

		ReceptionistFormInputGuards.bindAgeInputGuard({ document });
		QLPKPatientIntakeForm.bind({ document, apiCall });

		ReceptionistJointExamOrchestration.bindModalControls(
			Object.assign({}, getPatientPopulateOptions(), {
				getManager: () => jointExamManagerInstance
			})
		);

		ReceptionistFormSaveControls.bindSaveInfoButton({
			document,
			savePatientData: () => savePatientData()
		});

		ReceptionistAppointmentPrefill.bindReExamSourceReset(getPatientPopulateOptions());

		registerRealtimeRefresh();

	});

	// Same DOMContentLoaded order as the former classic script: session check starts, then the relatives table and joint-exam manager initialize.
	document.addEventListener('DOMContentLoaded', () => {
		ReceptionistPatientRelativesTable.bindInitialLoad(
			Object.assign({}, getPatientPopulateOptions(), {
				getInstance: () => state.relativeTableInstance,
				setInstance: value => { state.relativeTableInstance = value; }
			})
		);

		ReceptionistJointExamOrchestration.bindInitialLoad(
			Object.assign({}, getPatientPopulateOptions(), {
				getInstance: () => jointExamManagerInstance,
				setInstance: value => { jointExamManagerInstance = value; },
				getAppointmentId: getCurrentAppointmentId,
				getContextToken: () => receptionistLoadState.token,
				onReloadFamilyMembers: () => {
					if (state.relativeTableInstance) {
						state.relativeTableInstance.reload();
					}
				},
				showToast: showCustomToast,
				formatDateDisplay
			})
		);
	});
}

export { startMedicalDataAndDocuments, formatDateDisplay, highlightAppointmentDateTimeFields, jointExamManagerInstance, loadAttachmentsForCurrentPatient, renderDocumentsList, resetFormToDefault, savePendingJointExamList, uploadFile };
