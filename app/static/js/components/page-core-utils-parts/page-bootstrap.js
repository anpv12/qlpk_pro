import { addButtonAnimationCSS, apiCall, autoSavePatientFormFieldShell, bindPaginationControls, bindRefreshButtons, ensureCurrentAppointmentIdForAutoSave, ensureSession, getAuthHeader, getDocument, resolveOptionValue, runPatientDataInternalSave, saveAppointmentClinicalUpdate, savePatientRecord, setCurrentPatientId, showAutoSaveIndicator, updatePagination } from './api-and-indicators.js';

function createPageCoreAdapter(options = {}) {
	const coreOptions = () => ({
		document: options.document,
		window: options.window || window,
		fetch: options.fetch
	});
	const adapter = {};

	adapter.addButtonAnimationCSS = () => addButtonAnimationCSS(coreOptions());
	adapter.ensureSession = ensureSession;
	adapter.getAuthHeader = getAuthHeader;
	adapter.apiCall = (url, requestOptions = {}) => apiCall(url, requestOptions, coreOptions());
	adapter.updatePagination = () => updatePagination({
		...coreOptions(),
		currentPage: resolveOptionValue(options.currentPage, 1),
		perPage: resolveOptionValue(options.perPage, 0),
		totalPages: resolveOptionValue(options.totalPages, 1),
		totalItems: resolveOptionValue(options.totalItems, 0)
	});
	adapter.showAutoSaveIndicator = (type = 'success', indicatorOptions = {}) => showAutoSaveIndicator(type, {
		...coreOptions(),
		...(options.autoSaveIndicatorOptions || {}),
		...indicatorOptions
	});
	adapter.setCurrentPatientId = value => setCurrentPatientId(value, {
		...coreOptions(),
		setLocalPatientId: options.setLocalPatientId,
		updateNotesAttachmentCount: options.updateNotesAttachmentCount,
		loadAttachmentsForCurrentPatient: options.loadAttachmentsForCurrentPatient
	});
	adapter.ensureCurrentAppointmentIdForAutoSave = () => ensureCurrentAppointmentIdForAutoSave({
		apiCall: adapter.apiCall,
		getCurrentAppointmentId: options.getCurrentAppointmentId,
		getCurrentPatientId: options.getCurrentPatientId,
		setCurrentAppointmentId: options.setCurrentAppointmentId
	});
	adapter.saveAppointmentClinicalUpdate = updateOptions => saveAppointmentClinicalUpdate({
		apiCall: adapter.apiCall,
		console: options.console || window.console,
		...(updateOptions || {})
	});
	adapter.autoSavePatientFormField = (fieldName, value, saveOptions = {}) => autoSavePatientFormFieldShell(fieldName, value, {
		apiCall: adapter.apiCall,
		ensureCurrentAppointmentIdForAutoSave: adapter.ensureCurrentAppointmentIdForAutoSave,
		getCurrentAppointmentId: options.getCurrentAppointmentId,
		showAutoSaveIndicator: adapter.showAutoSaveIndicator,
		...(saveOptions || {})
	});
	adapter.savePatientRecord = saveOptions => savePatientRecord({
		apiCall: adapter.apiCall,
		console: options.console || window.console,
		...(saveOptions || {})
	});
	adapter.runPatientDataInternalSave = saveOptions => runPatientDataInternalSave({
		apiCall: adapter.apiCall,
		console: options.console || window.console,
		...(saveOptions || {})
	});
	adapter.bindRefreshButtons = refreshOptions => bindRefreshButtons({
		...coreOptions(),
		...(options.refreshOptions || {}),
		...(refreshOptions || {})
	});
	adapter.bindPaginationControls = paginationOptions => bindPaginationControls({
		...coreOptions(),
		getCurrentPage: () => resolveOptionValue(options.currentPage, 1),
		getTotalPages: () => resolveOptionValue(options.totalPages, 1),
		...(options.paginationOptions || {}),
		...(paginationOptions || {})
	});

	return adapter;
}
function bindBootstrapRelativeTable(options, context) {
	const { actionButtonsUi, doc, targetWindow } = context;
	let relativeTableInstance = null;
	if (actionButtonsUi && typeof actionButtonsUi.initRelativeTable === 'function') {
		relativeTableInstance = actionButtonsUi.initRelativeTable({
			document: doc,
			window: targetWindow,
			...(options.relativeTableOptions || {})
		});
	}
	if (typeof options.setRelativeTableInstance === 'function') {
		options.setRelativeTableInstance(relativeTableInstance);
	}
	if (actionButtonsUi && typeof actionButtonsUi.bindTabPrintButtons === 'function') {
		actionButtonsUi.bindTabPrintButtons({
			document: doc,
			printModalTabContent: options.printModalTabContent
		});
	}
	return relativeTableInstance;
}
function bindBootstrapWaitingList(options, context) {
	const { doc, targetWindow, pageCoreAdapter } = context;
	const waitingListUi = options.waitingListUi || targetWindow.ClinicalExaminationWaitingListUi;
	if (waitingListUi && typeof waitingListUi.bindStatusTabs === 'function') {
		waitingListUi.bindStatusTabs({
			document: doc,
			setCurrentStatus: options.setCurrentStatus,
			loadAppointments: options.loadAppointments
		});
	}
	if (waitingListUi && typeof waitingListUi.bindPatientSearchInput === 'function') {
		waitingListUi.bindPatientSearchInput({
			document: doc,
			setPatientSearchQuery: options.setPatientSearchQuery,
			renderAppointmentsTable: options.renderAppointmentsTable
		});
	}

	if (pageCoreAdapter && typeof pageCoreAdapter.bindPaginationControls === 'function') {
		pageCoreAdapter.bindPaginationControls({
			getCurrentStatus: options.getCurrentStatus,
			setPerPage: options.setPerPage,
			loadAppointments: options.loadAppointments
		});
	}
	if (pageCoreAdapter && typeof pageCoreAdapter.bindRefreshButtons === 'function') {
		pageCoreAdapter.bindRefreshButtons({
			getCurrentStatus: options.getCurrentStatus,
			getCurrentPage: options.getCurrentPage,
			loadAppointments: options.loadAppointments
		});
	}
}
// Call owner[method] when available (keeps `this` = owner).
function callIfAvailable(owner, method, ...args) {
	if (owner && typeof owner[method] === 'function') owner[method](...args);
}

function bindBootstrapFormControls(options, context) {
	const { actionButtonsUi, targetWindow } = context;
	callIfAvailable(options, 'initializeForm');
	callIfAvailable(options.formDomUtils || targetWindow.ClinicalFormDomUtils, 'bindAgeInputGuard', options.ageField || 'age');
	callIfAvailable(actionButtonsUi, 'bindPersonalDetailEditButtons', options.personalDetailOptions || {});
	callIfAvailable(options.medicalHistoryModalAdapter, 'bindOpenButton', {
		isFormLocked: options.isFormLocked,
		loadIntoModal: options.loadMedicalHistoryIntoModal
	});
	callIfAvailable(actionButtonsUi, 'bindSaveInfoButton', options.saveInfoButton || 'saveInfoBtn', {
		save: options.savePatientData
	});
	callIfAvailable(actionButtonsUi, 'bindReExaminationSourceReset', options.reExaminationCheckbox || 'reExaminationCheck', {
		originalAppointmentInput: options.originalAppointmentInput || 'originalAppointmentId'
	});
}
async function initializeExaminationPageBootstrap(options = {}) {
	const doc = getDocument(options);
	const targetWindow = options.window || window;
	const pageCoreAdapter = options.pageCoreAdapter || createPageCoreAdapter(options);

	if (options.ensureSession !== false) {
		if (!await pageCoreAdapter.ensureSession()) return { status: 'sessionBlocked', relativeTableInstance: null };
	}

	if (pageCoreAdapter && typeof pageCoreAdapter.addButtonAnimationCSS === 'function') {
		pageCoreAdapter.addButtonAnimationCSS();
	}
	if (typeof options.initializePage === 'function') options.initializePage();

	const context = {
		doc,
		targetWindow,
		pageCoreAdapter,
		actionButtonsUi: options.actionButtonsUi || targetWindow.ExaminationActionButtonsUi
	};
	const relativeTableInstance = bindBootstrapRelativeTable(options, context);
	bindBootstrapWaitingList(options, context);
	bindBootstrapFormControls(options, context);

	return { status: 'initialized', relativeTableInstance };
}

export { bindBootstrapFormControls, bindBootstrapRelativeTable, bindBootstrapWaitingList, createPageCoreAdapter, initializeExaminationPageBootstrap };
