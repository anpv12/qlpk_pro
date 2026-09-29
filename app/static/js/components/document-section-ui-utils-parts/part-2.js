// components/document-section-ui-utils.js: phần 2/2 (nạp trước document-section-ui-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/document-section-ui-utils'] || (window.QLPKModuleParts['components/document-section-ui-utils'] = { state: {} });

	function createDocumentSectionAdapter(options = {}) {
		const doc = options.document || window.document;
		const getUploadedDocuments = () => typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		const getAttachments = () => typeof options.getAttachments === 'function' ? options.getAttachments() : [];
		const getIsLocked = () => typeof options.getIsLocked === 'function' ? options.getIsLocked() : Boolean(options.isLocked);
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') options.showToast(type, message);
		};
		const adapter = {};

		adapter.updateNotesAttachmentCount = function () {
			return moduleParts.updateNotesAttachmentCount({
				document: doc,
				notesAttachmentChip: typeof options.getNotesAttachmentChip === 'function' ? options.getNotesAttachmentChip() : options.notesAttachmentChip,
				getTotalCount: () => (getAttachments()?.length || 0) + (getUploadedDocuments()?.length || 0)
			});
		};

		adapter.bindNotesUploadButton = function () {
			const chip = moduleParts.bindNotesUploadButton({
				notesAttachmentChip: typeof options.getNotesAttachmentChip === 'function' ? options.getNotesAttachmentChip() : options.notesAttachmentChip,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient,
				getTotalCount: () => (getAttachments()?.length || 0) + (getUploadedDocuments()?.length || 0)
			});
			if (typeof options.setNotesAttachmentChip === 'function') options.setNotesAttachmentChip(chip);
			return chip;
		};

		adapter.ensureDocumentEditingAllowed = function (showToastOption = true) {
			return moduleParts.ensureDocumentEditingAllowed({
				isLocked: getIsLocked(),
				showToast: showToastOption,
				showWarning: message => showToast('warning', message)
			});
		};

		adapter.setDocumentSectionLockState = function (locked) {
			return moduleParts.setDocumentSectionLockState(locked, { document: doc });
		};

		adapter.initializeDocumentUpload = function () {
			if (typeof options.getUploadInitialized === 'function' && options.getUploadInitialized()) return false;
			if (typeof options.setUploadInitialized === 'function') options.setUploadInitialized(true);
			return moduleParts.bindDocumentUploadControls({
				document: doc,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				handleFileUpload: adapter.handleFileUpload,
				uploadAttachment: adapter.uploadAttachmentForCurrentPatient,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				hasCurrentPatient: () => Boolean(typeof options.getCurrentPatientId === 'function' ? options.getCurrentPatientId() : null),
				getUploadedDocuments,
				showInfo: message => showToast('info', message),
				setLockState: adapter.setDocumentSectionLockState,
				isLocked: getIsLocked()
			});
		};

		adapter.uploadFile = function (file, patientId, uploadOptions = {}) {
			return moduleParts.uploadFileToPatient(file, patientId, {
				...uploadOptions,
				fetch: options.fetch,
				validateFile: options.validateFile,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient,
				showSuccess: message => showToast('success', message),
				showError: message => showToast('error', message)
			});
		};

		adapter.uploadDraftDocumentsForPatient = function (patientId, uploadOptions = {}) {
			return moduleParts.uploadDraftDocumentsForPatient(patientId, {
				isCurrentContext: uploadOptions.isCurrentContext,
				getUploadedDocuments,
				setUploadedDocuments: options.setUploadedDocuments,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				uploadFile: adapter.uploadFile,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient
			});
		};

		adapter.handleFileUpload = function (files) {
			return moduleParts.handleDraftFileUpload(files, {
				document: doc,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				validateFile: options.validateFile,
				getUploadedDocuments,
				addUploadedDocument: documentItem => getUploadedDocuments().push(documentItem),
				renderDocumentsList: adapter.renderDocumentsList,
				showInfo: message => showToast('info', message),
				showSuccess: message => showToast('success', message)
			});
		};

		adapter.renderDocumentsList = function () {
			return moduleParts.renderSharedDocumentList({
				document: doc,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments,
				getAttachments,
				formatDateDisplay: options.formatDisplayDate,
				formatDraftDate: options.formatDraftDate,
				apiCall: options.apiCall,
				fetch: options.fetch,
				showToast,
				showConfirmationDialog: options.showConfirmationDialog,
				loadAttachmentsForCurrentPatient: adapter.loadAttachmentsForCurrentPatient,
				downloadDraftDocument: adapter.downloadDocument,
				deleteDraftDocument: adapter.deleteDocument,
				setLockState: adapter.setDocumentSectionLockState,
				isLocked: getIsLocked(),
				console: options.console || window.console
			});
		};

		adapter.loadAttachmentsForCurrentPatient = function () {
			return moduleParts.loadAttachmentsForCurrentPatient({
				document: doc,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				apiCall: options.apiCall,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				getUploadedDocuments,
				setUploadedDocuments: options.setUploadedDocuments,
				setAttachments: options.setAttachments,
				renderDocumentsList: adapter.renderDocumentsList,
				renderAttachmentsList: adapter.renderAttachmentsList
			});
		};

		adapter.renderAttachmentsList = function () {
			return adapter.renderDocumentsList();
		};

		adapter.uploadAttachmentForCurrentPatient = function (file) {
			return moduleParts.uploadAttachmentForCurrentPatient(file, {
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				uploadFile: adapter.uploadFile,
				showError: message => showToast('error', message)
			});
		};

		adapter.downloadDocument = function (docId) {
			return moduleParts.downloadDraftDocument(docId, {
				document: doc,
				URL: options.URL || window.URL,
				getUploadedDocuments
			});
		};

		adapter.deleteDocument = function (docId, actionOptions = {}) {
			return moduleParts.deleteDraftDocument(docId, {
				...actionOptions,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments,
				setUploadedDocuments: options.setUploadedDocuments,
				renderDocumentsList: adapter.renderDocumentsList,
				showSuccess: message => showToast('success', message),
				showConfirmationDialog: options.showConfirmationDialog
			});
		};

		return adapter;
	}
	function createExaminationDocumentSectionAdapter(options = {}) {
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') {
				options.showToast(type, message);
			}
		};
		const formatDraftDate = typeof options.formatDraftDate === 'function'
			? options.formatDraftDate
			: documentItem => {
				if (window.formatDateDisplay) return window.formatDateDisplay(documentItem.uploadDate);
				if (typeof options.formatDisplayDate === 'function') return options.formatDisplayDate(documentItem.uploadDate);
				return documentItem.uploadDate || '';
			};

		return createDocumentSectionAdapter({
			...options,
			URL: options.URL || window.URL,
			validateFile: options.validateFile,
			getFileIcon: options.getFileIcon,
			formatFileSize: options.formatFileSize,
			formatDraftDate,
			showToast,
			getCurrentPatientId: options.getCurrentPatientId || (() => window.currentPatientId),
			getIsLocked: options.getIsLocked,
			getUploadInitialized: options.getUploadInitialized,
			setUploadInitialized: options.setUploadInitialized,
			getNotesAttachmentChip: options.getNotesAttachmentChip,
			setNotesAttachmentChip: options.setNotesAttachmentChip,
			getUploadedDocuments: options.getUploadedDocuments,
			setUploadedDocuments: options.setUploadedDocuments,
			getAttachments: options.getAttachments,
			setAttachments: options.setAttachments
		});
	}

	Object.assign(moduleParts, {
		createDocumentSectionAdapter,
		createExaminationDocumentSectionAdapter
	});
})(window);
