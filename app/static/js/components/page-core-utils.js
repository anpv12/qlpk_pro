// Parts (nạp trước file này): part-1.js, part-2.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/page-core-utils'] || (window.QLPKModuleParts['components/page-core-utils'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.api = {
		addButtonAnimationCSS: moduleParts.addButtonAnimationCSS,
		ensureSession: moduleParts.ensureSession,
		getAuthHeader: moduleParts.getAuthHeader,
		apiCall: moduleParts.apiCall,
		updatePagination: moduleParts.updatePagination,
		showAutoSaveIndicator: moduleParts.showAutoSaveIndicator,
		setCurrentPatientId: moduleParts.setCurrentPatientId,
		ensureCurrentAppointmentIdForAutoSave: moduleParts.ensureCurrentAppointmentIdForAutoSave,
		resolveAppointmentIdForPatientSave: moduleParts.resolveAppointmentIdForPatientSave,
		saveAppointmentClinicalUpdate: moduleParts.saveAppointmentClinicalUpdate,
		autoSavePatientFormFieldShell: moduleParts.autoSavePatientFormFieldShell,
		savePatientRecord: moduleParts.savePatientRecord,
		runPatientDataInternalSave: moduleParts.runPatientDataInternalSave,
		reloadPage: moduleParts.reloadPage,
		isRefreshButtonInReloadHeader: moduleParts.isRefreshButtonInReloadHeader,
		bindRefreshButtons: moduleParts.bindRefreshButtons,
		bindPaginationControls: moduleParts.bindPaginationControls,
		initializeExaminationPageBootstrap: moduleParts.initializeExaminationPageBootstrap,
		createPageCoreAdapter: moduleParts.createPageCoreAdapter
	};

	window.ClinicalPageCoreUtils = moduleState.api;
})(window);
