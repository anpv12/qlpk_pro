// components/document-section-ui-utils.js: phần 2/2 (nạp trước document-section-ui-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/document-section-ui-utils'] || (window.QLPKModuleParts['components/document-section-ui-utils'] = { state: {} });

	function installDocumentSectionFns1(ctx) {
		const getUploadedDocuments = () => typeof ctx.options.getUploadedDocuments === 'function' ? ctx.options.getUploadedDocuments() : [];

		const getAttachments = () => typeof ctx.options.getAttachments === 'function' ? ctx.options.getAttachments() : [];

		const getIsLocked = () => typeof ctx.options.getIsLocked === 'function' ? ctx.options.getIsLocked() : Boolean(ctx.options.isLocked);

		const showToast = (type, message) => {
			if (typeof ctx.options.showToast === 'function') ctx.options.showToast(type, message);
		};

		Object.assign(ctx, { getUploadedDocuments, getAttachments, getIsLocked, showToast });
	}

	function runDocumentSectionSetup1(closureCtx) {
		closureCtx.ctx = {};
		closureCtx.ctx.options = closureCtx.options;
		installDocumentSectionFns1(closureCtx.ctx);
		closureCtx.doc = closureCtx.ctx.options.document || window.document;
		closureCtx.adapter = {};
		closureCtx.adapter.updateNotesAttachmentCount = function () {
			return moduleParts.updateNotesAttachmentCount({
				document: closureCtx.doc,
				notesAttachmentChip: typeof closureCtx.ctx.options.getNotesAttachmentChip === 'function' ? closureCtx.ctx.options.getNotesAttachmentChip() : closureCtx.ctx.options.notesAttachmentChip,
				getTotalCount: () => (closureCtx.ctx.getAttachments()?.length || 0) + (closureCtx.ctx.getUploadedDocuments()?.length || 0)
			});
		};
		closureCtx.adapter.bindNotesUploadButton = function () {
			const chip = moduleParts.bindNotesUploadButton({
				notesAttachmentChip: typeof closureCtx.ctx.options.getNotesAttachmentChip === 'function' ? closureCtx.ctx.options.getNotesAttachmentChip() : closureCtx.ctx.options.notesAttachmentChip,
				loadAttachments: closureCtx.adapter.loadAttachmentsForCurrentPatient,
				getTotalCount: () => (closureCtx.ctx.getAttachments()?.length || 0) + (closureCtx.ctx.getUploadedDocuments()?.length || 0)
			});
			if (typeof closureCtx.ctx.options.setNotesAttachmentChip === 'function') closureCtx.ctx.options.setNotesAttachmentChip(chip);
			return chip;
		};
		closureCtx.adapter.ensureDocumentEditingAllowed = function (showToastOption = true) {
			return moduleParts.ensureDocumentEditingAllowed({
				isLocked: closureCtx.ctx.getIsLocked(),
				showToast: showToastOption,
				showWarning: message => closureCtx.ctx.showToast('warning', message)
			});
		};
		closureCtx.adapter.setDocumentSectionLockState = function (locked) {
			return moduleParts.setDocumentSectionLockState(locked, { document: closureCtx.doc });
		};
		closureCtx.adapter.initializeDocumentUpload = function () {
			if (typeof closureCtx.ctx.options.getUploadInitialized === 'function' && closureCtx.ctx.options.getUploadInitialized()) return false;
			if (typeof closureCtx.ctx.options.setUploadInitialized === 'function') closureCtx.ctx.options.setUploadInitialized(true);
			return moduleParts.bindDocumentUploadControls({
				document: closureCtx.doc,
				sessionStorage: closureCtx.ctx.options.sessionStorage,
				documentDraftKey: closureCtx.ctx.options.documentDraftKey,
				ensureEditingAllowed: closureCtx.adapter.ensureDocumentEditingAllowed,
				handleFileUpload: closureCtx.adapter.handleFileUpload,
				uploadAttachment: closureCtx.adapter.uploadAttachmentForCurrentPatient,
				getCurrentPatientId: closureCtx.ctx.options.getCurrentPatientId,
				getContextToken: closureCtx.ctx.options.getContextToken,
				hasCurrentPatient: () => Boolean(typeof closureCtx.ctx.options.getCurrentPatientId === 'function' ? closureCtx.ctx.options.getCurrentPatientId() : null),
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments,
				showInfo: message => closureCtx.ctx.showToast('info', message),
				setLockState: closureCtx.adapter.setDocumentSectionLockState,
				isLocked: closureCtx.ctx.getIsLocked()
			});
		};
		closureCtx.adapter.uploadFile = function (file, patientId, uploadOptions = {}) {
			return moduleParts.uploadFileToPatient(file, patientId, {
				...uploadOptions,
				fetch: closureCtx.ctx.options.fetch,
				validateFile: closureCtx.ctx.options.validateFile,
				loadAttachments: closureCtx.adapter.loadAttachmentsForCurrentPatient,
				showSuccess: message => closureCtx.ctx.showToast('success', message),
				showError: message => closureCtx.ctx.showToast('error', message)
			});
		};
	}

	function runDocumentSectionSetup2(closureCtx) {
		closureCtx.adapter.uploadDraftDocumentsForPatient = function (patientId, uploadOptions = {}) {
			return moduleParts.uploadDraftDocumentsForPatient(patientId, {
				isCurrentContext: uploadOptions.isCurrentContext,
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments,
				setUploadedDocuments: closureCtx.ctx.options.setUploadedDocuments,
				sessionStorage: closureCtx.ctx.options.sessionStorage,
				documentDraftKey: closureCtx.ctx.options.documentDraftKey,
				uploadFile: closureCtx.adapter.uploadFile,
				loadAttachments: closureCtx.adapter.loadAttachmentsForCurrentPatient
			});
		};
		closureCtx.adapter.handleFileUpload = function (files) {
			return moduleParts.handleDraftFileUpload(files, {
				document: closureCtx.doc,
				ensureEditingAllowed: closureCtx.adapter.ensureDocumentEditingAllowed,
				validateFile: closureCtx.ctx.options.validateFile,
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments,
				addUploadedDocument: documentItem => closureCtx.ctx.getUploadedDocuments().push(documentItem),
				renderDocumentsList: closureCtx.adapter.renderDocumentsList,
				showInfo: message => closureCtx.ctx.showToast('info', message),
				showSuccess: message => closureCtx.ctx.showToast('success', message)
			});
		};
		closureCtx.adapter.renderDocumentsList = function () {
			return moduleParts.renderSharedDocumentList({
				document: closureCtx.doc,
				getCurrentPatientId: closureCtx.ctx.options.getCurrentPatientId,
				getContextToken: closureCtx.ctx.options.getContextToken,
				ensureEditingAllowed: closureCtx.adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments,
				getAttachments: closureCtx.ctx.getAttachments,
				formatDateDisplay: closureCtx.ctx.options.formatDisplayDate,
				formatDraftDate: closureCtx.ctx.options.formatDraftDate,
				apiCall: closureCtx.ctx.options.apiCall,
				fetch: closureCtx.ctx.options.fetch,
				showToast: closureCtx.ctx.showToast,
				showConfirmationDialog: closureCtx.ctx.options.showConfirmationDialog,
				loadAttachmentsForCurrentPatient: closureCtx.adapter.loadAttachmentsForCurrentPatient,
				downloadDraftDocument: closureCtx.adapter.downloadDocument,
				deleteDraftDocument: closureCtx.adapter.deleteDocument,
				setLockState: closureCtx.adapter.setDocumentSectionLockState,
				isLocked: closureCtx.ctx.getIsLocked(),
				console: closureCtx.ctx.options.console || window.console
			});
		};
		closureCtx.adapter.loadAttachmentsForCurrentPatient = function () {
			return moduleParts.loadAttachmentsForCurrentPatient({
				document: closureCtx.doc,
				sessionStorage: closureCtx.ctx.options.sessionStorage,
				documentDraftKey: closureCtx.ctx.options.documentDraftKey,
				apiCall: closureCtx.ctx.options.apiCall,
				getCurrentPatientId: closureCtx.ctx.options.getCurrentPatientId,
				getContextToken: closureCtx.ctx.options.getContextToken,
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments,
				setUploadedDocuments: closureCtx.ctx.options.setUploadedDocuments,
				setAttachments: closureCtx.ctx.options.setAttachments,
				renderDocumentsList: closureCtx.adapter.renderDocumentsList,
				renderAttachmentsList: closureCtx.adapter.renderAttachmentsList
			});
		};
		closureCtx.adapter.renderAttachmentsList = function () {
			return closureCtx.adapter.renderDocumentsList();
		};
	}

	function runDocumentSectionSetup3(closureCtx) {
		closureCtx.adapter.uploadAttachmentForCurrentPatient = function (file) {
			return moduleParts.uploadAttachmentForCurrentPatient(file, {
				ensureEditingAllowed: closureCtx.adapter.ensureDocumentEditingAllowed,
				getCurrentPatientId: closureCtx.ctx.options.getCurrentPatientId,
				getContextToken: closureCtx.ctx.options.getContextToken,
				uploadFile: closureCtx.adapter.uploadFile,
				showError: message => closureCtx.ctx.showToast('error', message)
			});
		};
		closureCtx.adapter.downloadDocument = function (docId) {
			return moduleParts.downloadDraftDocument(docId, {
				document: closureCtx.doc,
				URL: closureCtx.ctx.options.URL || window.URL,
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments
			});
		};
		closureCtx.adapter.deleteDocument = function (docId, actionOptions = {}) {
			return moduleParts.deleteDraftDocument(docId, {
				...actionOptions,
				getCurrentPatientId: closureCtx.ctx.options.getCurrentPatientId,
				getContextToken: closureCtx.ctx.options.getContextToken,
				ensureEditingAllowed: closureCtx.adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments: closureCtx.ctx.getUploadedDocuments,
				setUploadedDocuments: closureCtx.ctx.options.setUploadedDocuments,
				renderDocumentsList: closureCtx.adapter.renderDocumentsList,
				showSuccess: message => closureCtx.ctx.showToast('success', message),
				showConfirmationDialog: closureCtx.ctx.options.showConfirmationDialog
			});
		};
	}

	function createDocumentSectionAdapter(options = {}) {
		const closureCtx = {};
		closureCtx.options = options;
		runDocumentSectionSetup1(closureCtx);
		runDocumentSectionSetup2(closureCtx);
		runDocumentSectionSetup3(closureCtx);
		return closureCtx.adapter;
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
