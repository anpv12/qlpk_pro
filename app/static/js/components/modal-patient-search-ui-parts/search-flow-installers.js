const FLOW_PASSTHROUGH_OPTION_KEYS = [
	'apiCall', 'showToast', 'getCurrentPatientData', 'getCurrentAppointmentId', 'getFormatDateDisplay',
	'showPatientAction', 'renderActiveTabLoading', 'loadVitalSigns', 'clearHistoryTabs',
	'prepareFormForCopy', 'setLoadingState', 'setCurrentAppointmentId', 'loadPatient',
	'loadExaminationFormData', 'loadAppointmentServices', 'loadPrescriptionData', 'lockForm',
	'activeStatuses', 'getHistoryDescription', 'formatHistoryDate', 'getExaminationStatusBadgeClass',
	'getExaminationStatusText', 'showCopyAction', 'showDeleteAction', 'searchLimit',
	'searchErrorMessage', 'copySuccessMessage', 'copyFallbackSuccessMessage', 'copyErrorLogMessage',
	'serviceErrorMessage', 'prescriptionErrorMessage', 'formErrorMessage', 'onAfterHistoryLoad'
];

function pickFlowPassthroughOptions(options) {
	return Object.fromEntries(FLOW_PASSTHROUGH_OPTION_KEYS.map(key => [key, options[key]]));
}

function createHistoryDeleteFlow(historyListUi, options, stateStore, flow) {
	return historyListUi.createExaminationDeleteFlowAdapter({
		apiCall: options.apiCall,
		showToast: options.showToast,
		showConfirmationDialog: options.showConfirmationDialog,
		getAppointments: options.getAppointments,
		getHistories: () => stateStore.get('medicalHistoryData'),
		getCurrentAppointmentId: options.getCurrentAppointmentId,
		getFormatDate: options.getFormatDate,
		resetFormToDefault: options.resetFormToDefault,
		setCurrentAppointmentId: options.setCurrentAppointmentId,
		setCurrentPatientId: options.setCurrentPatientId,
		getModalCurrentPatientId: () => stateStore.get('currentPatientId'),
		getModalSelectedPatient: () => stateStore.get('selectedPatient'),
		loadAppointments: options.loadAppointments,
		loadModalMedicalHistory: patientId => flow.loadMedicalHistory(patientId)
	});
}

function installSearchFlow1(ctx) {
	const getState = () => {
		if (typeof ctx.options.getState !== 'function') return {};
		return ctx.options.getState() || {};
	};

	const setState = patch => {
		if (typeof ctx.options.setState === 'function') ctx.options.setState(patch || {});
		return getState();
	};

	const getRenderers = () => {
		if (typeof ctx.options.getHistoryTabRenderers === 'function') return ctx.options.getHistoryTabRenderers();
		return ctx.options.historyTabRenderers;
	};

	const getCurrentAppointmentId = () => {
		if (typeof ctx.options.getCurrentAppointmentId === 'function') return ctx.options.getCurrentAppointmentId();
		return ctx.options.currentAppointmentId;
	};

	const getCurrentPatientData = () => {
		if (typeof ctx.options.getCurrentPatientData === 'function') return ctx.options.getCurrentPatientData();
		return ctx.options.currentPatientData;
	};

	const getFormatDateDisplay = () => {
		if (typeof ctx.options.getFormatDateDisplay === 'function') return ctx.options.getFormatDateDisplay();
		return ctx.options.formatDateDisplay;
	};

	function buildCopyFlowOptions(extra = {}) {
		return {
			apiCall: ctx.options.apiCall,
			prepareFormForCopy: ctx.options.prepareFormForCopy,
			setLoadingState: ctx.options.setLoadingState,
			setCurrentAppointmentId: ctx.options.setCurrentAppointmentId,
			loadPatient: ctx.options.loadPatient,
			loadExaminationFormData: ctx.options.loadExaminationFormData,
			loadAppointmentServices: ctx.options.loadAppointmentServices,
			loadPrescriptionData: ctx.options.loadPrescriptionData,
			showToast: ctx.options.showToast,
			lockForm: ctx.options.lockForm,
			showHistoryButton: ctx.options.showHistoryButton,
			serviceErrorMessage: ctx.options.serviceErrorMessage,
			prescriptionErrorMessage: ctx.options.prescriptionErrorMessage,
			formErrorMessage: ctx.options.formErrorMessage,
			successMessage: ctx.options.copySuccessMessage,
			fallbackSuccessMessage: ctx.options.copyFallbackSuccessMessage,
			errorLogMessage: ctx.options.copyErrorLogMessage,
			...extra
		};
	}

	Object.assign(ctx, { getState, setState, getRenderers, getCurrentAppointmentId, getCurrentPatientData, getFormatDateDisplay, buildCopyFlowOptions });
}

export { FLOW_PASSTHROUGH_OPTION_KEYS, createHistoryDeleteFlow, installSearchFlow1, pickFlowPassthroughOptions };
