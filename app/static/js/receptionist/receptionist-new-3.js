/* global DOCUMENT_DRAFT_KEY, apiCall, bindAddressFieldChanges, cancelAppointment, currentAppointmentId: writable, currentEditId: writable, currentPage, currentPatientId, currentStatus: writable, editAppointment, ensureSession, getMedicalDraftOptions, getPatientPopulateOptions, initializeAutocomplete, initializeForm, loadAppointments, loadDoctorsForForm, loadProvinces, loadServicesForForm, loadSidebarUserInfo, perPage: writable, populateSharedForms, receptionistLoadState, relativeTableInstance: writable, savePatientData, setCurrentPatientId, setDefaultAppointmentDateTime, showCustomToast, totalPages, transferAppointment, updateStatusCounts, waitingListFilter: writable */
/* exported currentEditId, formatDateDisplay, highlightAppointmentDateTimeFields, jointExamManagerInstance, loadAttachmentsForCurrentPatient, perPage, renderDocumentsList, resetFormToDefault, savePendingJointExamList, uploadFile, uploadedDocuments */

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
	try { await loadAttachmentsForCurrentPatient(); } catch (e) { console.warn('Không thể tải tệp đính kèm:', e); }
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

function renderDocumentsList() {
	window.ReceptionistDocumentAttachmentList.renderDocumentsList(getDocumentAttachmentListOptions());
}

async function loadAttachmentsForCurrentPatient() {
	return documentAttachmentControls.loadAttachmentsForCurrentPatient(getDocumentAttachmentControlsOptions());
}

const documentAttachmentControls = window.ReceptionistDocumentAttachmentControls;
const documentAttachmentUtils = window.ReceptionistDocumentAttachmentUtils;

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
