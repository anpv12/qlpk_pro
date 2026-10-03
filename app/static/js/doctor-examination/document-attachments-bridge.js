import { QLPKDoctorModuleRegistry } from './module-registry.js';

const STATE = {
	contextToken: 0,
	initialized: false,
	uploadedDocuments: [],
	attachments: [],
	maxSizeBytes: 50 * 1024 * 1024,
	maxSizeMb: 50,
	options: {}
};
const DOCUMENT_DRAFT_KEY = 'doctor:patient_documents_draft';
const REGISTRY = QLPKDoctorModuleRegistry;
if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
const ATTACHMENT_UTILS = REGISTRY.require('documentAttachmentUtils');
const ATTACHMENT_LIST = REGISTRY.require('documentAttachmentList');
const ATTACHMENT_CONTROLS = REGISTRY.require('documentAttachmentControls');
const RELATIVES_TABLE = REGISTRY.require('patientRelativesTable');
const CONFIRMATION_DIALOG = REGISTRY.require('confirmationDialog');

function getOption(name, fallback) {
	return typeof STATE.options[name] === 'function' ? STATE.options[name]() : fallback;
}

function showToast(type, message) {
	if (typeof STATE.options.showToast === 'function') STATE.options.showToast(type, message);
}

function renderDocumentsList() {
	ATTACHMENT_LIST.renderDocumentsList({
		document,
		getCurrentPatientId: STATE.options.getCurrentPatientId,
		getContextToken: () => STATE.contextToken,
		utils: ATTACHMENT_UTILS,
		getAttachments: () => STATE.attachments,
		getUploadedDocuments: () => STATE.uploadedDocuments,
		formatDateDisplay: STATE.options.formatDateDisplay,
		openAttachmentPreviewInNewTab,
		apiCall: STATE.options.apiCall,
		showToast,
		showConfirmationDialog: CONFIRMATION_DIALOG.confirm,
		loadAttachmentsForCurrentPatient,
		downloadDraftDocument: downloadDocument,
		deleteDraftDocument: deleteDocument
	});
}

function getAttachmentOptions(options = {}) {
	return Object.assign({
		getCurrentPatientId: STATE.options.getCurrentPatientId,
		getContextToken: () => STATE.contextToken,
		window,
		document,
		URL: window.URL,
		fetch: window.fetch.bind(window),
		showConfirmationDialog: CONFIRMATION_DIALOG.confirm,
		showToast,
		getUploadedDocuments: () => STATE.uploadedDocuments,
		setUploadedDocuments: value => { STATE.uploadedDocuments = Array.isArray(value) ? value : []; },
		renderDocumentsList
	}, options);
}

function getControlsOptions() {
	return {
		window,
		document,
		sessionStorage,
		documentDraftKey: DOCUMENT_DRAFT_KEY,
		apiCall: STATE.options.apiCall,
		showToast,
		validateFile,
		uploadFile,
		renderDocumentsList,
		loadAttachmentsForCurrentPatient,
		getCurrentPatientId: STATE.options.getCurrentPatientId,
		getContextToken: () => STATE.contextToken,
		getUploadedDocuments: () => STATE.uploadedDocuments,
		setUploadedDocuments: value => { STATE.uploadedDocuments = Array.isArray(value) ? value : []; },
		getAttachments: () => STATE.attachments,
		setAttachments: value => { STATE.attachments = Array.isArray(value) ? value : []; },
		getUploadInitialized: () => STATE.initialized,
		setUploadInitialized: value => { STATE.initialized = Boolean(value); },
		getAttachmentMaxSizeBytes: () => STATE.maxSizeBytes,
		setAttachmentMaxSizeBytes: value => { STATE.maxSizeBytes = Number(value) || STATE.maxSizeBytes; },
		getAttachmentMaxSizeMb: () => STATE.maxSizeMb,
		setAttachmentMaxSizeMb: value => { STATE.maxSizeMb = Number(value) || STATE.maxSizeMb; }
	};
}

function validateFile(file) {
	return ATTACHMENT_UTILS.validateFile(file, getAttachmentOptions({
		maxSizeBytes: STATE.maxSizeBytes,
		maxSizeMb: STATE.maxSizeMb
	}));
}

async function uploadFile(file, patientId, options = {}) {
	return ATTACHMENT_UTILS.uploadFile(file, patientId, getAttachmentOptions({
		maxSizeBytes: STATE.maxSizeBytes,
		maxSizeMb: STATE.maxSizeMb,
		isDraft: options.isDraft,
		isCurrentContext: options.isCurrentContext,
		shouldShowToast: options.showToast !== false,
		onUploadSuccess: attachment => {
			if (options.isDraft || !attachment || !attachment.id) return;
			STATE.attachments = [attachment, ...STATE.attachments.filter(item => item && item.id !== attachment.id)];
			renderDocumentsList();
		},
		reloadAttachments: loadAttachmentsForCurrentPatient
	}));
}

async function loadAttachmentsForCurrentPatient() {
	return ATTACHMENT_CONTROLS.loadAttachmentsForCurrentPatient(getControlsOptions());
}

async function openAttachmentPreviewInNewTab(attachmentId, filename, actionOptions = {}) {
	await ATTACHMENT_UTILS.openAttachmentPreviewInNewTab(attachmentId, filename, getAttachmentOptions(actionOptions));
}

function downloadDocument(docId) {
	ATTACHMENT_UTILS.downloadDraftDocument(docId, getAttachmentOptions());
}

function deleteDocument(docId, options = {}) {
	return ATTACHMENT_UTILS.deleteDraftDocument(docId, getAttachmentOptions(options));
}

function initialize(options = {}) {
	STATE.options = { ...STATE.options, ...options };
	if (typeof STATE.options.getRelativeTableInstance === 'function') {
		RELATIVES_TABLE.bindInitialLoad({
			document,
			getInstance: STATE.options.getRelativeTableInstance,
			setInstance: STATE.options.setRelativeTableInstance
		});
	}
	ATTACHMENT_CONTROLS.initializeDocumentUpload(getControlsOptions()).catch(() => {});
	renderDocumentsList();
	return true;
}

function clear() {
	STATE.contextToken++;
	STATE.uploadedDocuments = [];
	STATE.attachments = [];
	renderDocumentsList();
}

function syncPatient(patientId, options = {}) {
	STATE.options.appointmentDate = options.appointmentDate || null;
	if (typeof STATE.options.getRelativeTableInstance === 'function') {
		const instance = RELATIVES_TABLE.syncPatient(
			STATE.options.getRelativeTableInstance(),
			patientId,
			{
				document,
				syncAppointmentDate: true,
				appointmentDate: STATE.options.appointmentDate
			}
		);
		if (typeof STATE.options.setRelativeTableInstance === 'function') STATE.options.setRelativeTableInstance(instance);
	}
	loadAttachmentsForCurrentPatient().catch(() => showToast('error', 'Không tải được danh sách tài liệu'));
}

function handleRealtimeEvent(event, patientId) {
	const payload = event && event.payload ? event.payload : {};
	const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;
	if (event && event.type === 'document.changed' && eventPatientId && patientId && eventPatientId === Number(patientId)) {
		loadAttachmentsForCurrentPatient();
		return true;
	}
	return false;
}

REGISTRY.register('documentAttachments', {
	initialize,
	clear,
	syncPatient,
	load: loadAttachmentsForCurrentPatient,
	handleRealtimeEvent,
	getCurrentPatientId: () => getOption('getCurrentPatientId', null)
});
