(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const resolveUi = (name, fallback) => REGISTRY?.get?.(name) || fallback;
	const getTabsUi = options => options?.tabsUi || resolveUi('modalFunctionTabsUi', window.ModalFunctionTabsUi);
	const getHistoryListUi = options => options?.historyListUi || resolveUi('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);
	const DATA = window.ModalPatientSearchData;
	if (!DATA) throw new Error('Thiếu ModalPatientSearchData');
	const {
		buildSearchParams, buildSearchUrl, extractSearchPatients, buildSearchSuccessState, buildSearchErrorState,
		fetchSearchResults, fetchSearchResultsForFlow, extractPatientPayload, buildPatientDetailUrl,
		buildLatestAppointmentUrl, buildAppointmentDetailUrl, buildAppointmentRelativesUrl,
		loadLatestAppointmentContextForPatient, fetchAppointmentDetail,
		fetchAppointmentRelatives, buildAppointmentHistoryFetchers, extractLatestAppointment,
		buildLatestAppointmentState, buildAppointmentPatientFallback, loadPatientForAppointment
	} = DATA;
	const PARTS = window.QLPKModalPatientSearchParts;
	if (!PARTS || typeof PARTS.bindRelativeLinkResolver !== 'function' || typeof PARTS.selectPatientForModalFlow !== 'function') {
		throw new Error('Thiếu các phần của ModalPatientSearchUi');
	}
	const {
		applyAutoSelectAfterSearch, applyAutoSelectAfterSearchForFlow, applyNoSearchResultsUi,
		applySelectedPatientUi, applySinglePatientSearchUi, bindModalHidden, bindOpenButtons,
		bindPatientResultsClick, bindPatientSearchModalFlowControls, bindRelativeLinkResolver,
		bindSearchInput, bindSearchModalOpenButtons, bindSelectButton, bindSelectPatientFromModalButton,
		buildAppointmentPostLoadState, buildAutoSelectAfterSearchState, buildCopyHistoryPatientLoadState,
		buildHistoryTabStateFromStore, buildLinkedRelativePatientState, buildNoSearchResultsState,
		buildOpenSearchModalState, buildPatientRowHtml, buildPatientSelectionFlowState,
		buildResetModalState, buildSelectedPatientState, buildSinglePatientSearchState, buildStateHtml,
		copyPatientToFormFlow, createAppointmentCopyFormPreparer, createModalSearchStateStore,
		ensureHighlightStyles, getPatientSearchText, hasAppointmentContext, hideBootstrapModal,
		loadCopiedPatientFallback, loadCopiedPatientWithAppointmentContext, loadCopyHistoryPatient,
		openLinkedRelativePatientSearch, openSearchModalAndFetch, openSearchModalWithPreset,
		prepareAppointmentCopyForm, renderHistoryNoPatient, renderSearchResults, renderState, resetModalDom,
		resetModalStateForFlow, resolveAutoSelectIndex, resolveModalPatientId, resolvePatientAtIndex,
		resolvePatientIdentity, resolvePresetSearch, resolveWorkflowModalElements, selectAppointmentCard,
		selectAppointmentPatientFlow, selectPatientForModalFlow, setActivePatientRow,
		setSelectButtonEnabled, showBootstrapModal, showHistoryButton, syncWindowState
	} = PARTS;

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

	function createWorkflowModalSearchContext(options = {}) {
		const elements = options.elements || resolveWorkflowModalElements(options);
		const stateStore = options.stateStore || createModalSearchStateStore(options.initialState);
		let historyTabRenderers = null;

		const flow = createPatientSearchModalFlowAdapter({
			...pickFlowPassthroughOptions(options),
			tabsUi: getTabsUi(options),
			historyListUi: getHistoryListUi(options),
			searchButton: elements.searchPatientButton,
			historyButton: elements.historyButton,
			searchInput: elements.searchInput,
			resultsContainer: elements.resultsContainer,
			historyContainer: elements.historyContainer,
			selectButton: elements.selectButton,
			modal: elements.modal,
			tabs: elements.tabs,
			getState: stateStore.getState,
			setState: stateStore.setState,
			getHistoryTabRenderers: () => historyTabRenderers
		});

		flow.syncWindowState();
		ensureHighlightStyles();

		const appointmentFetchers = buildAppointmentHistoryFetchers({
			apiCall: options.apiCall,
			getToken: options.getToken,
			fetch: options.fetch
		});
		const tabsUi = getTabsUi(options);
		const historyListUi = getHistoryListUi(options);
		if (!tabsUi || !historyListUi) throw new Error('Thiếu module tabs/history của Patient Modal');
		const historyTabContext = tabsUi.createHistoryTabContext({
			getState: () => buildHistoryTabStateFromStore(stateStore),
			fetchPatientDetail: options.fetchPatientDetail,
			fetchExaminationDetail: options.fetchExaminationDetail,
			fetchSectionDetails: options.fetchSectionDetails,
			fetchPrescription: options.fetchPrescription,
			fetchAppointment: options.fetchAppointment || appointmentFetchers.fetchAppointment,
			fetchRelatives: options.fetchRelatives || appointmentFetchers.fetchRelatives
		});
		const rendererOptions = typeof options.buildHistoryRendererOptions === 'function'
			? options.buildHistoryRendererOptions({ context: historyTabContext, appointmentFetchers, elements, stateStore, flow })
			: (options.historyRendererOptions || {});
		historyTabRenderers = tabsUi.createHistoryTabRendererSet({
			...rendererOptions,
			context: historyTabContext,
			appointmentFetchers
		});

		const deleteFlow = createHistoryDeleteFlow(historyListUi, options, stateStore, flow);

		return {
			elements,
			stateStore,
			flow,
			appointmentFetchers,
			historyTabContext,
			historyTabRenderers,
			deleteFlow
		};
	}

	function installSearchFlowFns1(ctx) {
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

		Object.assign(ctx, {
			getState, setState, getRenderers, getCurrentAppointmentId, getCurrentPatientData, getFormatDateDisplay,
			buildCopyFlowOptions
		});
	}

	function runSearchFlowSetup1(closureCtx) {
		closureCtx.ctx = {};
		closureCtx.ctx.options = closureCtx.options;
		installSearchFlowFns1(closureCtx.ctx);
		closureCtx.searchRequestToken = 0;
		closureCtx.historyRequestToken = 0;
		closureCtx.flow = {};
		closureCtx.flow.syncWindowState = () => {
			const state = closureCtx.ctx.getState();
			return syncWindowState({
				exposeLegacyWindowState: closureCtx.ctx.options.exposeLegacyWindowState,
				selectedPatient: state.selectedPatient,
				medicalHistoryLoading: state.medicalHistoryLoading,
				medicalHistoryData: state.medicalHistoryData,
				selectedHistoryIndex: state.selectedHistoryIndex
			});
		};
		closureCtx.flow.renderSearchResults = (isError = false) => {
			const state = closureCtx.ctx.getState();
			return renderSearchResults({
				container: closureCtx.ctx.options.resultsContainer,
				isError,
				patients: state.searchResults,
				selectedPatient: state.selectedPatient,
				formatDateDisplay: closureCtx.ctx.getFormatDateDisplay(),
				showPatientAction: closureCtx.ctx.options.showPatientAction
			});
		};
		closureCtx.flow.fetchSearchResults = async (query = '') => {
			const requestToken = ++closureCtx.searchRequestToken;
			return fetchSearchResultsForFlow({
				query,
				limit: closureCtx.ctx.options.searchLimit,
				apiCall: closureCtx.ctx.options.apiCall,
				isCurrent: () => requestToken === closureCtx.searchRequestToken,
				setSearchResults(value) {
					closureCtx.ctx.setState({ searchResults: value });
				},
				renderResults: closureCtx.flow.renderSearchResults,
				autoSelect: closureCtx.flow.autoSelectAfterSearch,
				showToast: closureCtx.ctx.options.showToast,
				errorMessage: closureCtx.ctx.options.searchErrorMessage
			});
		};
		closureCtx.flow.autoSelectAfterSearch = () => {
			const state = closureCtx.ctx.getState();
			return applyAutoSelectAfterSearchForFlow({
				patients: state.searchResults,
				prefillPatientId: state.prefillPatientId,
				selectedPatient: state.selectedPatient,
				applyNoResultsState(autoSelectState) {
					closureCtx.ctx.setState({
						selectedPatient: autoSelectState.selectedPatient,
						currentPatientId: autoSelectState.currentPatientId,
						medicalHistoryData: autoSelectState.medicalHistoryData,
						selectedHistoryIndex: autoSelectState.selectedHistoryIndex
					});
				},
				syncState: closureCtx.flow.syncWindowState,
				updateContent: closureCtx.flow.updateContent,
				selectPatient: closureCtx.flow.selectPatient
			});
		};
	}

	function runSearchFlowSetup2(closureCtx) {
		closureCtx.flow.updateContent = () => {
			const tabsUi = getTabsUi(closureCtx.ctx.options);
			if (!tabsUi || typeof tabsUi.dispatchPatientTabContent !== 'function') return null;
			return tabsUi.dispatchPatientTabContent({
				patient: closureCtx.ctx.getState().selectedPatient,
				renderers: closureCtx.ctx.getRenderers()
			});
		};
		closureCtx.flow.getHistoryLoadStateHandlers = () => {
			const historyUi = getHistoryListUi(closureCtx.ctx.options);
			if (!historyUi || typeof historyUi.buildHistoryLoadStateHandlers !== 'function') return {};
			return historyUi.buildHistoryLoadStateHandlers({
				setMedicalHistoryLoading(value) {
					closureCtx.ctx.setState({ medicalHistoryLoading: value });
				},
				setCurrentPatientId(value) {
					closureCtx.ctx.setState({ currentPatientId: value });
				},
				setMedicalHistoryData(value) {
					closureCtx.ctx.setState({ medicalHistoryData: value });
				},
				setSelectedHistoryIndex(value) {
					closureCtx.ctx.setState({ selectedHistoryIndex: value });
				},
				syncState: closureCtx.flow.syncWindowState,
				onAfterLoad() {
					const tabsUi = getTabsUi(closureCtx.ctx.options);
					if (tabsUi && typeof tabsUi.dispatchActiveTabRender === 'function') {
						tabsUi.dispatchActiveTabRender({ renderers: closureCtx.ctx.getRenderers() });
					}
					if (typeof closureCtx.ctx.options.onAfterHistoryLoad === 'function') closureCtx.ctx.options.onAfterHistoryLoad();
				}
			});
		};
		closureCtx.flow.loadMedicalHistory = async patientId => {
			const historyUi = getHistoryListUi(closureCtx.ctx.options);
			if (!historyUi || typeof historyUi.loadAndRenderHistoryList !== 'function') {
				return { status: 'missingHistoryUi' };
			}
			const state = closureCtx.ctx.getState();
			const requestToken = ++closureCtx.historyRequestToken;
			const contextRevision = state.contextRevision;
			const isCurrent = () => {
				const current = closureCtx.ctx.getState();
				return requestToken === closureCtx.historyRequestToken
					&& current.contextRevision === contextRevision
					&& Number(current.selectedPatient?.id) === Number(patientId);
			};
			return historyUi.loadAndRenderHistoryList({
				patientId,
				apiCall: closureCtx.ctx.options.apiCall,
				container: closureCtx.ctx.options.historyContainer,
				selectedIndex: state.selectedHistoryIndex,
				currentAppointmentId: closureCtx.ctx.getCurrentAppointmentId(),
				activeStatuses: closureCtx.ctx.options.activeStatuses,
				getDescription: closureCtx.ctx.options.getHistoryDescription,
				formatDate: closureCtx.ctx.options.formatHistoryDate,
				getExaminationStatusBadgeClass: closureCtx.ctx.options.getExaminationStatusBadgeClass,
				getExaminationStatusText: closureCtx.ctx.options.getExaminationStatusText,
				showCopyAction: closureCtx.ctx.options.showCopyAction,
				showDeleteAction: closureCtx.ctx.options.showDeleteAction,
				isCurrent,
				...closureCtx.flow.getHistoryLoadStateHandlers()
			});
		};
	}

	function runSearchFlowSetup3(closureCtx) {
		closureCtx.flow.reset = () => resetModalStateForFlow({
			resetDom: true,
			applyResetState(resetState) {
				closureCtx.searchRequestToken += 1;
				closureCtx.historyRequestToken += 1;
				const currentRevision = Number(closureCtx.ctx.getState().contextRevision) || 0;
				closureCtx.ctx.setState({
					searchResults: resetState.searchResults,
					selectedPatient: resetState.selectedPatient,
					currentPatientId: resetState.currentPatientId,
					selectedHistoryIndex: resetState.selectedHistoryIndex,
					prefillPatientId: resetState.prefillPatientId,
					medicalHistoryData: resetState.medicalHistoryData,
					medicalHistoryLoading: false,
					contextRevision: currentRevision + 1
				});
				if (typeof closureCtx.ctx.options.clearHistoryTabs === 'function') closureCtx.ctx.options.clearHistoryTabs({ state: 'empty' });
			},
			searchInput: closureCtx.ctx.options.searchInput,
			searchResults: closureCtx.ctx.options.resultsContainer,
			medicalHistory: closureCtx.ctx.options.historyContainer,
			selectButton: closureCtx.ctx.options.selectButton
		});
		closureCtx.flow.selectPatient = index => {
			const state = closureCtx.ctx.getState();
			const nextRevision = (Number(state.contextRevision) || 0) + 1;
			closureCtx.historyRequestToken += 1;
			closureCtx.ctx.setState({ contextRevision: nextRevision });
			if (typeof closureCtx.ctx.options.clearHistoryTabs === 'function') closureCtx.ctx.options.clearHistoryTabs({ state: 'loading' });
			return selectPatientForModalFlow(state.searchResults, index, {
				applySelectionState(selectionState) {
					closureCtx.ctx.setState({
						selectedPatient: selectionState.selectedPatient,
						selectedHistoryIndex: selectionState.selectedHistoryIndex
					});
				},
				syncState: closureCtx.flow.syncWindowState,
				renderActiveTabLoading: closureCtx.ctx.options.renderActiveTabLoading,
				loadHistory: closureCtx.flow.loadMedicalHistory,
				updateContent: closureCtx.flow.updateContent,
				loadVitalSigns: closureCtx.ctx.options.loadVitalSigns,
				selectButton: closureCtx.ctx.options.selectButton
			});
		};
		closureCtx.flow.selectHistory = index => {
			const historyUi = getHistoryListUi(closureCtx.ctx.options);
			if (!historyUi || typeof historyUi.selectHistoryForModalFlow !== 'function') return null;
			return historyUi.selectHistoryForModalFlow(index, {
				setSelectedHistoryIndex(value) {
					const currentRevision = Number(closureCtx.ctx.getState().contextRevision) || 0;
					closureCtx.ctx.setState({ selectedHistoryIndex: value, contextRevision: currentRevision + 1 });
				},
				syncState: closureCtx.flow.syncWindowState,
				getRenderers: closureCtx.ctx.getRenderers
			});
		};
		closureCtx.flow.copyPatientToForm = index => {
			const state = closureCtx.ctx.getState();
			return copyPatientToFormFlow(index, closureCtx.ctx.buildCopyFlowOptions({
				patients: state.searchResults
			}));
		};
	}

	function runSearchFlowSetup4(closureCtx) {
		closureCtx.flow.copyHistoryToForm = historyIndex => {
			const historyUi = getHistoryListUi(closureCtx.ctx.options);
			if (!historyUi || typeof historyUi.copyHistoryToFormFlow !== 'function') {
				return Promise.resolve({ status: 'missingHistoryUi' });
			}
			const state = closureCtx.ctx.getState();
			return historyUi.copyHistoryToFormFlow(closureCtx.ctx.buildCopyFlowOptions({
				selectedPatient: state.selectedPatient,
				histories: state.medicalHistoryData,
				historyIndex: historyIndex === undefined ? state.selectedHistoryIndex : historyIndex,
				selectedHistoryIndex: state.selectedHistoryIndex
			}));
		};
		closureCtx.flow.setShouldPrefill = value => closureCtx.ctx.setState({ shouldPrefill: value });
		closureCtx.flow.openSearchModal = () => {
			const state = closureCtx.ctx.getState();
			return openSearchModalAndFetch({
				modal: closureCtx.ctx.options.modal,
				missingMessage: closureCtx.ctx.options.missingMessage || 'Không tìm thấy modal tìm kiếm bệnh nhân',
				reset: closureCtx.flow.reset,
				searchInput: closureCtx.ctx.options.searchInput,
				shouldPrefill: state.shouldPrefill,
				currentPatientData: closureCtx.ctx.getCurrentPatientData(),
				setPrefillPatientId(value) {
					closureCtx.ctx.setState({ prefillPatientId: value });
				},
				fetchSearch: closureCtx.flow.fetchSearchResults,
				setShouldPrefill: closureCtx.flow.setShouldPrefill
			});
		};
		closureCtx.flow.openLinkedRelative = async patientId => openLinkedRelativePatientSearch({
			patientId,
			modal: closureCtx.ctx.options.modal,
			missingMessage: closureCtx.ctx.options.missingMessage || 'Không tìm thấy modal tìm kiếm bệnh nhân',
			apiCall: closureCtx.ctx.options.apiCall,
			reset: closureCtx.flow.reset,
			setShouldPrefill: closureCtx.flow.setShouldPrefill,
			applyLoadedState(linkedPatientState) {
				closureCtx.ctx.setState({
					searchResults: linkedPatientState.searchResults,
					prefillPatientId: linkedPatientState.prefillPatientId
				});
			},
			renderResults: closureCtx.flow.renderSearchResults,
			selectPatient: closureCtx.flow.selectPatient,
			loadHistory: closureCtx.flow.loadMedicalHistory,
			searchInput: closureCtx.ctx.options.searchInput,
			selectButton: closureCtx.ctx.options.selectButton,
			fetchFallback: closureCtx.flow.fetchSearchResults,
			logMessage: closureCtx.ctx.options.linkedRelativeLogMessage || 'Không thể mở modal người thân liên kết:'
		});
	}

	function runSearchFlowSetup5(closureCtx) {
		closureCtx.flow.bindControls = (bindOptions = {}) => bindPatientSearchModalFlowControls({
			searchButton: closureCtx.ctx.options.searchButton,
			historyButton: closureCtx.ctx.options.historyButton,
			setShouldPrefill: closureCtx.flow.setShouldPrefill,
			open: closureCtx.flow.openSearchModal,
			searchInput: closureCtx.ctx.options.searchInput,
			fetchSearch: closureCtx.flow.fetchSearchResults,
			resultsContainer: closureCtx.ctx.options.resultsContainer,
			copyPatient: bindOptions.copyPatient,
			selectPatient: closureCtx.flow.selectPatient,
			historyContainer: closureCtx.ctx.options.historyContainer,
			selectHistory: closureCtx.flow.selectHistory,
			copyHistory: bindOptions.copyHistory,
			deleteHistory: bindOptions.deleteHistory,
			showToast: closureCtx.ctx.options.showToast,
			selectButton: closureCtx.ctx.options.selectButton,
			getSelectedPatient: bindOptions.getSelectedPatient || (() => closureCtx.ctx.getState().selectedPatient),
			loadPatient: bindOptions.loadPatient,
			modal: closureCtx.ctx.options.modal,
			isFormLocked: bindOptions.isFormLocked,
			unlockForm: bindOptions.unlockForm,
			resetModal: closureCtx.flow.reset,
			tabs: closureCtx.ctx.options.tabs,
			updateContent: closureCtx.flow.updateContent,
			openLinkedRelative: closureCtx.flow.openLinkedRelative
		});
	}

	function createPatientSearchModalFlowAdapter(options = {}) {
		const closureCtx = {};
		closureCtx.options = options;
		runSearchFlowSetup1(closureCtx);
		runSearchFlowSetup2(closureCtx);
		runSearchFlowSetup3(closureCtx);
		runSearchFlowSetup4(closureCtx);
		runSearchFlowSetup5(closureCtx);
		return closureCtx.flow;
	}

	const api = {
		buildStateHtml,
		showBootstrapModal,
		hideBootstrapModal,
		getPatientSearchText,
		resolvePresetSearch,
		openSearchModalWithPreset,
		buildOpenSearchModalState,
		openSearchModalAndFetch,
		buildSearchParams,
		buildSearchUrl,
		extractSearchPatients,
		buildSearchSuccessState,
		fetchSearchResults,
		fetchSearchResultsForFlow,
		extractPatientPayload,
		buildPatientDetailUrl,
		buildLatestAppointmentUrl,
		buildAppointmentDetailUrl,
		buildAppointmentRelativesUrl,
		loadLatestAppointmentContextForPatient,
		loadCopiedPatientWithAppointmentContext,
		loadCopiedPatientFallback,
		prepareAppointmentCopyForm,
		createAppointmentCopyFormPreparer,
		copyPatientToFormFlow,
		fetchAppointmentDetail,
		fetchAppointmentRelatives,
		buildAppointmentHistoryFetchers,
		extractLatestAppointment,
		buildLatestAppointmentState,
		buildAppointmentPatientFallback,
		loadPatientForAppointment,
		hasAppointmentContext,
		buildAppointmentPostLoadState,
		buildCopyHistoryPatientLoadState,
		loadCopyHistoryPatient,
		buildSinglePatientSearchState,
		buildLinkedRelativePatientState,
		buildNoSearchResultsState,
		buildAutoSelectAfterSearchState,
		applyAutoSelectAfterSearch,
		buildSearchErrorState,
		buildResetModalState,
		createModalSearchStateStore,
		resolveWorkflowModalElements,
		buildHistoryTabStateFromStore,
		createWorkflowModalSearchContext,
		resetModalStateForFlow,
		applyAutoSelectAfterSearchForFlow,
		buildSelectedPatientState,
		resolvePatientAtIndex,
		resolveModalPatientId,
		resolvePatientIdentity,
		buildPatientSelectionFlowState,
		renderState,
		ensureHighlightStyles,
		syncWindowState,
		buildPatientRowHtml,
		resolveAutoSelectIndex,
		renderSearchResults,
		renderHistoryNoPatient,
		setSelectButtonEnabled,
		setActivePatientRow,
		selectAppointmentCard,
		selectAppointmentPatientFlow,
		applySelectedPatientUi,
		applyNoSearchResultsUi,
		applySinglePatientSearchUi,
		selectPatientForModalFlow,
		showHistoryButton,
		resetModalDom,
		bindSearchInput,
		bindPatientResultsClick,
		bindModalHidden,
		bindSelectButton,
		bindSelectPatientFromModalButton,
		bindOpenButtons,
		bindSearchModalOpenButtons,
		bindPatientSearchModalFlowControls,
		openLinkedRelativePatientSearch,
		bindRelativeLinkResolver,
		createPatientSearchModalFlowAdapter
	};
	window.ModalPatientSearchUi = Object.freeze(api);
	window.QLPKDoctorModuleRegistry?.register?.('modalPatientSearchUi', window.ModalPatientSearchUi);
})(window);
