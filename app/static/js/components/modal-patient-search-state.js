// Parts (nạp trước file này): copy-flow.js, select-flow.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/modal-patient-search-state'] || (window.QLPKModuleParts['components/modal-patient-search-state'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.PARTS = window.QLPKModalPatientSearchParts || (window.QLPKModalPatientSearchParts = {});
	moduleState.REGISTRY = window.QLPKDoctorModuleRegistry;
	moduleState.resolveUi = (name, fallback) => moduleState.REGISTRY?.get?.(name) || fallback;
	moduleState.getTabsUi = options => options?.tabsUi || moduleState.resolveUi('modalFunctionTabsUi', window.ModalFunctionTabsUi);
	moduleState.getHistoryListUi = options => options?.historyListUi || moduleState.resolveUi('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);
	moduleState.DATA = window.ModalPatientSearchData;
	if (!moduleState.DATA) throw new Error('Thiếu ModalPatientSearchData');
	({ extractPatientPayload: moduleState.extractPatientPayload, buildPatientDetailUrl: moduleState.buildPatientDetailUrl, loadLatestAppointmentContextForPatient: moduleState.loadLatestAppointmentContextForPatient, loadPatientForAppointment: moduleState.loadPatientForAppointment } = moduleState.DATA);
	({ applyNoSearchResultsUi: moduleState.applyNoSearchResultsUi, applySelectedPatientUi: moduleState.applySelectedPatientUi, applySinglePatientSearchUi: moduleState.applySinglePatientSearchUi, hideBootstrapModal: moduleState.hideBootstrapModal, resetModalDom: moduleState.resetModalDom, resolveAutoSelectIndex: moduleState.resolveAutoSelectIndex, selectAppointmentCard: moduleState.selectAppointmentCard, showBootstrapModal: moduleState.showBootstrapModal, showHistoryButton: moduleState.showHistoryButton } = moduleState.PARTS);

	Object.assign(moduleState.PARTS, {
		callOption: moduleParts.callOption, loadOptionalAppointmentPart: moduleParts.loadOptionalAppointmentPart, loadCopiedPatientWithAppointmentContext: moduleParts.loadCopiedPatientWithAppointmentContext,
		loadCopiedPatientFallback: moduleParts.loadCopiedPatientFallback, prepareAppointmentCopyForm: moduleParts.prepareAppointmentCopyForm, createAppointmentCopyFormPreparer: moduleParts.createAppointmentCopyFormPreparer,
		copyPatientToFormFlow: moduleParts.copyPatientToFormFlow, hasAppointmentContext: moduleParts.hasAppointmentContext, buildAppointmentPostLoadState: moduleParts.buildAppointmentPostLoadState,
		buildCopyHistoryPatientLoadState: moduleParts.buildCopyHistoryPatientLoadState, loadCopyHistoryPatient: moduleParts.loadCopyHistoryPatient, buildSinglePatientSearchState: moduleParts.buildSinglePatientSearchState,
		buildLinkedRelativePatientState: moduleParts.buildLinkedRelativePatientState, buildNoSearchResultsState: moduleParts.buildNoSearchResultsState, buildAutoSelectAfterSearchState: moduleParts.buildAutoSelectAfterSearchState,
		applyAutoSelectAfterSearch: moduleParts.applyAutoSelectAfterSearch, buildResetModalState: moduleParts.buildResetModalState, createModalSearchStateStore: moduleParts.createModalSearchStateStore,
		resolveWorkflowModalElements: moduleParts.resolveWorkflowModalElements, buildHistoryTabStateFromStore: moduleParts.buildHistoryTabStateFromStore, resetModalStateForFlow: moduleParts.resetModalStateForFlow,
		applyAutoSelectAfterSearchForFlow: moduleParts.applyAutoSelectAfterSearchForFlow, buildSelectedPatientState: moduleParts.buildSelectedPatientState, resolvePatientAtIndex: moduleParts.resolvePatientAtIndex,
		resolveModalPatientId: moduleParts.resolveModalPatientId, resolvePatientIdentity: moduleParts.resolvePatientIdentity, buildPatientSelectionFlowState: moduleParts.buildPatientSelectionFlowState, runSafeCallback: moduleParts.runSafeCallback,
		runSafeAsyncCallback: moduleParts.runSafeAsyncCallback, callIfFunction: moduleParts.callIfFunction, setFlowLoading: moduleParts.setFlowLoading, loadFlowExaminationForm: moduleParts.loadFlowExaminationForm,
		runAppointmentPatientFlow: moduleParts.runAppointmentPatientFlow, selectAppointmentPatientFlow: moduleParts.selectAppointmentPatientFlow, selectPatientForModalFlow: moduleParts.selectPatientForModalFlow,
		openLinkedRelativePatientSearch: moduleParts.openLinkedRelativePatientSearch
	});
})(window);
