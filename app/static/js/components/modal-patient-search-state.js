import { PARTS } from './modal-patient-search-parts.js';
import { moduleState } from './modal-patient-search-state-parts/state.js';
import { applyAutoSelectAfterSearch, applyAutoSelectAfterSearchForFlow, buildAppointmentPostLoadState, buildAutoSelectAfterSearchState, buildCopyHistoryPatientLoadState, buildHistoryTabStateFromStore, buildLinkedRelativePatientState, buildNoSearchResultsState, buildPatientSelectionFlowState, buildResetModalState, buildSelectedPatientState, buildSinglePatientSearchState, callIfFunction, callOption, copyPatientToFormFlow, createAppointmentCopyFormPreparer, createModalSearchStateStore, hasAppointmentContext, loadCopiedPatientFallback, loadCopiedPatientWithAppointmentContext, loadCopyHistoryPatient, loadFlowExaminationForm, loadOptionalAppointmentPart, prepareAppointmentCopyForm, resetModalStateForFlow, resolveModalPatientId, resolvePatientAtIndex, resolvePatientIdentity, resolveWorkflowModalElements, runAppointmentPatientFlow, runSafeAsyncCallback, runSafeCallback, setFlowLoading } from './modal-patient-search-state-parts/copy-flow.js';
import { openLinkedRelativePatientSearch, selectAppointmentPatientFlow, selectPatientForModalFlow } from './modal-patient-search-state-parts/select-flow.js';
import { ModalFunctionTabsUi } from './modal-function-tabs-ui.js';
import { ModalMedicalHistoryListUi } from './modal-medical-history-list-ui.js';
import { ModalPatientSearchData } from './modal-patient-search-data.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

moduleState.PARTS = PARTS;
moduleState.REGISTRY = QLPKDoctorModuleRegistry;
moduleState.resolveUi = (name, fallback) => moduleState.REGISTRY?.get?.(name) || fallback;
moduleState.getTabsUi = options => options?.tabsUi || moduleState.resolveUi('modalFunctionTabsUi', ModalFunctionTabsUi);
moduleState.getHistoryListUi = options => options?.historyListUi || moduleState.resolveUi('modalMedicalHistoryListUi', ModalMedicalHistoryListUi);
moduleState.DATA = ModalPatientSearchData;
if (!moduleState.DATA) throw new Error('Thiếu ModalPatientSearchData');
({ extractPatientPayload: moduleState.extractPatientPayload, buildPatientDetailUrl: moduleState.buildPatientDetailUrl, loadLatestAppointmentContextForPatient: moduleState.loadLatestAppointmentContextForPatient, loadPatientForAppointment: moduleState.loadPatientForAppointment } = moduleState.DATA);
({ applyNoSearchResultsUi: moduleState.applyNoSearchResultsUi, applySelectedPatientUi: moduleState.applySelectedPatientUi, applySinglePatientSearchUi: moduleState.applySinglePatientSearchUi, hideBootstrapModal: moduleState.hideBootstrapModal, resetModalDom: moduleState.resetModalDom, resolveAutoSelectIndex: moduleState.resolveAutoSelectIndex, selectAppointmentCard: moduleState.selectAppointmentCard, showBootstrapModal: moduleState.showBootstrapModal, showHistoryButton: moduleState.showHistoryButton } = moduleState.PARTS);

Object.assign(moduleState.PARTS, {
	callOption: callOption, loadOptionalAppointmentPart: loadOptionalAppointmentPart, loadCopiedPatientWithAppointmentContext: loadCopiedPatientWithAppointmentContext,
	loadCopiedPatientFallback: loadCopiedPatientFallback, prepareAppointmentCopyForm: prepareAppointmentCopyForm, createAppointmentCopyFormPreparer: createAppointmentCopyFormPreparer,
	copyPatientToFormFlow: copyPatientToFormFlow, hasAppointmentContext: hasAppointmentContext, buildAppointmentPostLoadState: buildAppointmentPostLoadState,
	buildCopyHistoryPatientLoadState: buildCopyHistoryPatientLoadState, loadCopyHistoryPatient: loadCopyHistoryPatient, buildSinglePatientSearchState: buildSinglePatientSearchState,
	buildLinkedRelativePatientState: buildLinkedRelativePatientState, buildNoSearchResultsState: buildNoSearchResultsState, buildAutoSelectAfterSearchState: buildAutoSelectAfterSearchState,
	applyAutoSelectAfterSearch: applyAutoSelectAfterSearch, buildResetModalState: buildResetModalState, createModalSearchStateStore: createModalSearchStateStore,
	resolveWorkflowModalElements: resolveWorkflowModalElements, buildHistoryTabStateFromStore: buildHistoryTabStateFromStore, resetModalStateForFlow: resetModalStateForFlow,
	applyAutoSelectAfterSearchForFlow: applyAutoSelectAfterSearchForFlow, buildSelectedPatientState: buildSelectedPatientState, resolvePatientAtIndex: resolvePatientAtIndex,
	resolveModalPatientId: resolveModalPatientId, resolvePatientIdentity: resolvePatientIdentity, buildPatientSelectionFlowState: buildPatientSelectionFlowState, runSafeCallback: runSafeCallback,
	runSafeAsyncCallback: runSafeAsyncCallback, callIfFunction: callIfFunction, setFlowLoading: setFlowLoading, loadFlowExaminationForm: loadFlowExaminationForm,
	runAppointmentPatientFlow: runAppointmentPatientFlow, selectAppointmentPatientFlow: selectAppointmentPatientFlow, selectPatientForModalFlow: selectPatientForModalFlow,
	openLinkedRelativePatientSearch: openLinkedRelativePatientSearch
});
