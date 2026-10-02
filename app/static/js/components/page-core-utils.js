import { moduleState } from './page-core-utils-parts/state.js';
import { addButtonAnimationCSS, apiCall, autoSavePatientFormFieldShell, bindPaginationControls, bindRefreshButtons, ensureCurrentAppointmentIdForAutoSave, ensureSession, getAuthHeader, isRefreshButtonInReloadHeader, reloadPage, resolveAppointmentIdForPatientSave, runPatientDataInternalSave, saveAppointmentClinicalUpdate, savePatientRecord, setCurrentPatientId, showAutoSaveIndicator, updatePagination } from './page-core-utils-parts/api-and-indicators.js';
import { createPageCoreAdapter, initializeExaminationPageBootstrap } from './page-core-utils-parts/page-bootstrap.js';

moduleState.api = {
	addButtonAnimationCSS: addButtonAnimationCSS,
	ensureSession: ensureSession,
	getAuthHeader: getAuthHeader,
	apiCall: apiCall,
	updatePagination: updatePagination,
	showAutoSaveIndicator: showAutoSaveIndicator,
	setCurrentPatientId: setCurrentPatientId,
	ensureCurrentAppointmentIdForAutoSave: ensureCurrentAppointmentIdForAutoSave,
	resolveAppointmentIdForPatientSave: resolveAppointmentIdForPatientSave,
	saveAppointmentClinicalUpdate: saveAppointmentClinicalUpdate,
	autoSavePatientFormFieldShell: autoSavePatientFormFieldShell,
	savePatientRecord: savePatientRecord,
	runPatientDataInternalSave: runPatientDataInternalSave,
	reloadPage: reloadPage,
	isRefreshButtonInReloadHeader: isRefreshButtonInReloadHeader,
	bindRefreshButtons: bindRefreshButtons,
	bindPaginationControls: bindPaginationControls,
	initializeExaminationPageBootstrap: initializeExaminationPageBootstrap,
	createPageCoreAdapter: createPageCoreAdapter
};

export const ClinicalPageCoreUtils = moduleState.api;
