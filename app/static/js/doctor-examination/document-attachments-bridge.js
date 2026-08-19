(function (window, document) {
	'use strict';

	const STATE = {
		initialized: false,
		uploadedDocuments: [],
		attachments: [],
		maxSizeBytes: 50 * 1024 * 1024,
		maxSizeMb: 50,
		options: {}
	};
	const DOCUMENT_DRAFT_KEY = 'doctor:patient_documents_draft';

	function getOption(name, fallback) {
		return typeof STATE.options[name] === 'function' ? STATE.options[name]() : fallback;
	}

	function showToast(type, message) {
		if (typeof STATE.options.showToast === 'function') STATE.options.showToast(type, message);
	}

	function renderDocumentsList() {
		const list = window.ReceptionistDocumentAttachmentList;
		if (!list || typeof list.renderDocumentsList !== 'function') return;
		list.renderDocumentsList({
			document,
			utils: window.ReceptionistDocumentAttachmentUtils,
			getAttachments: () => STATE.attachments,
			getUploadedDocuments: () => STATE.uploadedDocuments,
			formatDateDisplay: STATE.options.formatDateDisplay,
			openAttachmentPreviewInNewTab,
			apiCall: STATE.options.apiCall,
			showToast,
			showConfirmationDialog: STATE.options.showConfirmationDialog || window.QLPKConfirmationDialog?.confirm,
			loadAttachmentsForCurrentPatient,
			downloadDraftDocument: downloadDocument,
			deleteDraftDocument: deleteDocument
		});
	}

	function getAttachmentOptions(options = {}) {
		return Object.assign({
			window,
			document,
			URL: window.URL,
			fetch: window.fetch.bind(window),
			showConfirmationDialog: STATE.options.showConfirmationDialog || window.QLPKConfirmationDialog?.confirm,
			getAuthHeader: STATE.options.getAuthHeader,
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
		const utils = window.ReceptionistDocumentAttachmentUtils;
		if (!utils || typeof utils.validateFile !== 'function') return true;
		return utils.validateFile(file, getAttachmentOptions({
			maxSizeBytes: STATE.maxSizeBytes,
			maxSizeMb: STATE.maxSizeMb
		}));
	}

	async function uploadFile(file, patientId, options = {}) {
		const utils = window.ReceptionistDocumentAttachmentUtils;
		if (!utils || typeof utils.uploadFile !== 'function') return false;
		return utils.uploadFile(file, patientId, getAttachmentOptions({
			maxSizeBytes: STATE.maxSizeBytes,
			maxSizeMb: STATE.maxSizeMb,
			isDraft: options.isDraft,
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
		const controls = window.ReceptionistDocumentAttachmentControls;
		if (!controls || typeof controls.loadAttachmentsForCurrentPatient !== 'function') {
			renderDocumentsList();
			return false;
		}
		return controls.loadAttachmentsForCurrentPatient(getControlsOptions());
	}

	async function openAttachmentPreviewInNewTab(attachmentId, filename) {
		const utils = window.ReceptionistDocumentAttachmentUtils;
		if (!utils || typeof utils.openAttachmentPreviewInNewTab !== 'function') return;
		await utils.openAttachmentPreviewInNewTab(attachmentId, filename, getAttachmentOptions());
	}

	function downloadDocument(docId) {
		const utils = window.ReceptionistDocumentAttachmentUtils;
		if (utils && typeof utils.downloadDraftDocument === 'function') {
			utils.downloadDraftDocument(docId, getAttachmentOptions());
		}
	}

	function deleteDocument(docId) {
		const utils = window.ReceptionistDocumentAttachmentUtils;
		if (utils && typeof utils.deleteDraftDocument === 'function') {
			utils.deleteDraftDocument(docId, getAttachmentOptions());
		}
	}

	function initialize(options = {}) {
		STATE.options = { ...STATE.options, ...options };
		const relativeTable = window.ReceptionistPatientRelativesTable;
		if (relativeTable && typeof relativeTable.bindInitialLoad === 'function' && typeof STATE.options.getRelativeTableInstance === 'function') {
			relativeTable.bindInitialLoad({
				document,
				getInstance: STATE.options.getRelativeTableInstance,
				setInstance: STATE.options.setRelativeTableInstance
			});
		}
		const controls = window.ReceptionistDocumentAttachmentControls;
		if (controls && typeof controls.initializeDocumentUpload === 'function') {
			controls.initializeDocumentUpload(getControlsOptions()).catch(() => {});
		}
		renderDocumentsList();
		return true;
	}

	function clear() {
		STATE.uploadedDocuments = [];
		STATE.attachments = [];
		renderDocumentsList();
	}

	function syncPatient(patientId, options = {}) {
		STATE.options.appointmentDate = options.appointmentDate || null;
		const relativeTable = window.ReceptionistPatientRelativesTable;
		if (relativeTable && typeof relativeTable.syncPatient === 'function' && typeof STATE.options.getRelativeTableInstance === 'function') {
			const instance = relativeTable.syncPatient(
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

	window.QLPKDoctorModuleRegistry.register('documentAttachments', {
		initialize,
		clear,
		syncPatient,
		load: loadAttachmentsForCurrentPatient,
		handleRealtimeEvent,
		getCurrentPatientId: () => getOption('getCurrentPatientId', null)
	});
})(window, document);
