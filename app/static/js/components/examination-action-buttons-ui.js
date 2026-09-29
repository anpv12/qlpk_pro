// Parts (nạp trước file này): part-1.js, part-2.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/examination-action-buttons-ui'] || (window.QLPKModuleParts['components/examination-action-buttons-ui'] = { state: {} });

	window.ExaminationActionButtonsUi = {
		buildExaminationIdUrl: moduleParts.buildExaminationIdUrl,
		extractExaminationId: moduleParts.extractExaminationId,
		buildTransitionRequestOptions: moduleParts.buildTransitionRequestOptions,
		showTransferMenuFlow: moduleParts.showTransferMenuFlow,
		createTransferMenuHandler: moduleParts.createTransferMenuHandler,
		completeExaminationFlow: moduleParts.completeExaminationFlow,
		bindEditHistoryButton: moduleParts.bindEditHistoryButton,
		bindCompleteExaminationButton: moduleParts.bindCompleteExaminationButton,
		bindDocumentModalButton: moduleParts.bindDocumentModalButton,
		bindSaveMedicalHistoryButton: moduleParts.bindSaveMedicalHistoryButton,
		bindSaveInfoButton: moduleParts.bindSaveInfoButton,
		bindReExaminationSourceReset: moduleParts.bindReExaminationSourceReset,
		openPersonalDetailSection: moduleParts.openPersonalDetailSection,
		bindPersonalDetailEditButtons: moduleParts.bindPersonalDetailEditButtons,
		initRelativeTable: moduleParts.initRelativeTable,
		bindTabPrintButtons: moduleParts.bindTabPrintButtons,
		openDetailExaminationModalFlow: moduleParts.openDetailExaminationModalFlow,
		bindDetailExaminationModalButton: moduleParts.bindDetailExaminationModalButton,
		bindFeedbackButtons: moduleParts.bindFeedbackButtons,
		bindExaminationFormShell: moduleParts.bindExaminationFormShell,
		buildDefaultExaminationFormFieldEvents: moduleParts.buildDefaultExaminationFormFieldEvents,
		createExaminationFormInitializer: moduleParts.createExaminationFormInitializer,
		bindExaminationActionButtons: moduleParts.bindExaminationActionButtons,
		createExaminationFeedbackAdapter: moduleParts.createExaminationFeedbackAdapter
	};
})(window);
