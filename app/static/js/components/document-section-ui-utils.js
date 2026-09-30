// Parts (nạp trước file này): upload-controls.js, section-adapters.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/document-section-ui-utils'] || (window.QLPKModuleParts['components/document-section-ui-utils'] = { state: {} });

	window.ClinicalDocumentSectionUiUtils = {
		updateNotesAttachmentCount: moduleParts.updateNotesAttachmentCount,
		bindNotesUploadButton: moduleParts.bindNotesUploadButton,
		ensureDocumentEditingAllowed: moduleParts.ensureDocumentEditingAllowed,
		setDocumentSectionLockState: moduleParts.setDocumentSectionLockState,
		bindDocumentUploadControls: moduleParts.bindDocumentUploadControls,
		handleDraftFileUpload: moduleParts.handleDraftFileUpload,
		downloadDraftDocument: moduleParts.downloadDraftDocument,
		deleteDraftDocument: moduleParts.deleteDraftDocument,
		buildDocumentDeleteConfirmationOptions: moduleParts.buildDocumentDeleteConfirmationOptions,
		confirmDocumentDelete: moduleParts.confirmDocumentDelete,
		uploadAttachmentForCurrentPatient: moduleParts.uploadAttachmentForCurrentPatient,
		loadAttachmentsForCurrentPatient: moduleParts.loadAttachmentsForCurrentPatient,
		uploadFileToPatient: moduleParts.uploadFileToPatient,
		uploadDraftDocumentsForPatient: moduleParts.uploadDraftDocumentsForPatient,
		createDocumentSectionAdapter: moduleParts.createDocumentSectionAdapter,
		createExaminationDocumentSectionAdapter: moduleParts.createExaminationDocumentSectionAdapter
	};
})(window);
