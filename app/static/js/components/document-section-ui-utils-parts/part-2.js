// components/document-section-ui-utils.js: phần 2/2 (nạp trước document-section-ui-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/document-section-ui-utils'] || (window.QLPKModuleParts['components/document-section-ui-utils'] = { state: {} });

	function installDocumentSection1(ctx) {
		const getUploadedDocuments = () => typeof ctx.options.getUploadedDocuments === 'function' ? ctx.options.getUploadedDocuments() : [];

		const getAttachments = () => typeof ctx.options.getAttachments === 'function' ? ctx.options.getAttachments() : [];

		const getIsLocked = () => typeof ctx.options.getIsLocked === 'function' ? ctx.options.getIsLocked() : Boolean(ctx.options.isLocked);

		const showToast = (type, message) => {
			if (typeof ctx.options.showToast === 'function') ctx.options.showToast(type, message);
		};

		Object.assign(ctx, { getUploadedDocuments, getAttachments, getIsLocked, showToast });
	}

	function runDocumentSection1(ctx) {
		ctx.doc = ctx.options.document || window.document;
		ctx.adapter = {};
		ctx.adapter.updateNotesAttachmentCount = function () {
			return moduleParts.updateNotesAttachmentCount({
				document: ctx.doc,
				notesAttachmentChip: typeof ctx.options.getNotesAttachmentChip === 'function' ? ctx.options.getNotesAttachmentChip() : ctx.options.notesAttachmentChip,
				getTotalCount: () => (ctx.getAttachments()?.length || 0) + (ctx.getUploadedDocuments()?.length || 0)
			});
		};
		ctx.adapter.bindNotesUploadButton = function () {
			const chip = moduleParts.bindNotesUploadButton({
				notesAttachmentChip: typeof ctx.options.getNotesAttachmentChip === 'function' ? ctx.options.getNotesAttachmentChip() : ctx.options.notesAttachmentChip,
				loadAttachments: ctx.adapter.loadAttachmentsForCurrentPatient,
				getTotalCount: () => (ctx.getAttachments()?.length || 0) + (ctx.getUploadedDocuments()?.length || 0)
			});
			if (typeof ctx.options.setNotesAttachmentChip === 'function') ctx.options.setNotesAttachmentChip(chip);
			return chip;
		};
		ctx.adapter.ensureDocumentEditingAllowed = function (showToastOption = true) {
			return moduleParts.ensureDocumentEditingAllowed({
				isLocked: ctx.getIsLocked(),
				showToast: showToastOption,
				showWarning: message => ctx.showToast('warning', message)
			});
		};
		ctx.adapter.setDocumentSectionLockState = function (locked) {
			return moduleParts.setDocumentSectionLockState(locked, { document: ctx.doc });
		};
		ctx.adapter.initializeDocumentUpload = function () {
			if (typeof ctx.options.getUploadInitialized === 'function' && ctx.options.getUploadInitialized()) return false;
			if (typeof ctx.options.setUploadInitialized === 'function') ctx.options.setUploadInitialized(true);
			return moduleParts.bindDocumentUploadControls({
				document: ctx.doc,
				sessionStorage: ctx.options.sessionStorage,
				documentDraftKey: ctx.options.documentDraftKey,
				ensureEditingAllowed: ctx.adapter.ensureDocumentEditingAllowed,
				handleFileUpload: ctx.adapter.handleFileUpload,
				uploadAttachment: ctx.adapter.uploadAttachmentForCurrentPatient,
				getCurrentPatientId: ctx.options.getCurrentPatientId,
				getContextToken: ctx.options.getContextToken,
				hasCurrentPatient: () => Boolean(typeof ctx.options.getCurrentPatientId === 'function' ? ctx.options.getCurrentPatientId() : null),
				getUploadedDocuments: ctx.getUploadedDocuments,
				showInfo: message => ctx.showToast('info', message),
				setLockState: ctx.adapter.setDocumentSectionLockState,
				isLocked: ctx.getIsLocked()
			});
		};
		ctx.adapter.uploadFile = function (file, patientId, uploadOptions = {}) {
			return moduleParts.uploadFileToPatient(file, patientId, {
				...uploadOptions,
				fetch: ctx.options.fetch,
				validateFile: ctx.options.validateFile,
				loadAttachments: ctx.adapter.loadAttachmentsForCurrentPatient,
				showSuccess: message => ctx.showToast('success', message),
				showError: message => ctx.showToast('error', message)
			});
		};
	}

	function runDocumentSection2(ctx) {
		ctx.adapter.uploadDraftDocumentsForPatient = function (patientId, uploadOptions = {}) {
			return moduleParts.uploadDraftDocumentsForPatient(patientId, {
				isCurrentContext: uploadOptions.isCurrentContext,
				getUploadedDocuments: ctx.getUploadedDocuments,
				setUploadedDocuments: ctx.options.setUploadedDocuments,
				sessionStorage: ctx.options.sessionStorage,
				documentDraftKey: ctx.options.documentDraftKey,
				uploadFile: ctx.adapter.uploadFile,
				loadAttachments: ctx.adapter.loadAttachmentsForCurrentPatient
			});
		};
		ctx.adapter.handleFileUpload = function (files) {
			return moduleParts.handleDraftFileUpload(files, {
				document: ctx.doc,
				ensureEditingAllowed: ctx.adapter.ensureDocumentEditingAllowed,
				validateFile: ctx.options.validateFile,
				getUploadedDocuments: ctx.getUploadedDocuments,
				addUploadedDocument: documentItem => ctx.getUploadedDocuments().push(documentItem),
				renderDocumentsList: ctx.adapter.renderDocumentsList,
				showInfo: message => ctx.showToast('info', message),
				showSuccess: message => ctx.showToast('success', message)
			});
		};
		ctx.adapter.renderDocumentsList = function () {
			return moduleParts.renderSharedDocumentList({
				document: ctx.doc,
				getCurrentPatientId: ctx.options.getCurrentPatientId,
				getContextToken: ctx.options.getContextToken,
				ensureEditingAllowed: ctx.adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments: ctx.getUploadedDocuments,
				getAttachments: ctx.getAttachments,
				formatDateDisplay: ctx.options.formatDisplayDate,
				formatDraftDate: ctx.options.formatDraftDate,
				apiCall: ctx.options.apiCall,
				fetch: ctx.options.fetch,
				showToast: ctx.showToast,
				showConfirmationDialog: ctx.options.showConfirmationDialog,
				loadAttachmentsForCurrentPatient: ctx.adapter.loadAttachmentsForCurrentPatient,
				downloadDraftDocument: ctx.adapter.downloadDocument,
				deleteDraftDocument: ctx.adapter.deleteDocument,
				setLockState: ctx.adapter.setDocumentSectionLockState,
				isLocked: ctx.getIsLocked(),
				console: ctx.options.console || window.console
			});
		};
		ctx.adapter.loadAttachmentsForCurrentPatient = function () {
			return moduleParts.loadAttachmentsForCurrentPatient({
				document: ctx.doc,
				sessionStorage: ctx.options.sessionStorage,
				documentDraftKey: ctx.options.documentDraftKey,
				apiCall: ctx.options.apiCall,
				getCurrentPatientId: ctx.options.getCurrentPatientId,
				getContextToken: ctx.options.getContextToken,
				getUploadedDocuments: ctx.getUploadedDocuments,
				setUploadedDocuments: ctx.options.setUploadedDocuments,
				setAttachments: ctx.options.setAttachments,
				renderDocumentsList: ctx.adapter.renderDocumentsList,
				renderAttachmentsList: ctx.adapter.renderAttachmentsList
			});
		};
		ctx.adapter.renderAttachmentsList = function () {
			return ctx.adapter.renderDocumentsList();
		};
	}

	function runDocumentSection3(ctx) {
		ctx.adapter.uploadAttachmentForCurrentPatient = function (file) {
			return moduleParts.uploadAttachmentForCurrentPatient(file, {
				ensureEditingAllowed: ctx.adapter.ensureDocumentEditingAllowed,
				getCurrentPatientId: ctx.options.getCurrentPatientId,
				getContextToken: ctx.options.getContextToken,
				uploadFile: ctx.adapter.uploadFile,
				showError: message => ctx.showToast('error', message)
			});
		};
		ctx.adapter.downloadDocument = function (docId) {
			return moduleParts.downloadDraftDocument(docId, {
				document: ctx.doc,
				URL: ctx.options.URL || window.URL,
				getUploadedDocuments: ctx.getUploadedDocuments
			});
		};
		ctx.adapter.deleteDocument = function (docId, actionOptions = {}) {
			return moduleParts.deleteDraftDocument(docId, {
				...actionOptions,
				getCurrentPatientId: ctx.options.getCurrentPatientId,
				getContextToken: ctx.options.getContextToken,
				ensureEditingAllowed: ctx.adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments: ctx.getUploadedDocuments,
				setUploadedDocuments: ctx.options.setUploadedDocuments,
				renderDocumentsList: ctx.adapter.renderDocumentsList,
				showSuccess: message => ctx.showToast('success', message),
				showConfirmationDialog: ctx.options.showConfirmationDialog
			});
		};
	}

	function createDocumentSectionAdapter(options = {}) {
		const ctx = {};
		ctx.options = options;
		installDocumentSection1(ctx);
		runDocumentSection1(ctx);
		runDocumentSection2(ctx);
		runDocumentSection3(ctx);
		return ctx.adapter;
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
