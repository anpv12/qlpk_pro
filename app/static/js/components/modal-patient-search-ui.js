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
		'apiCall',
		'showToast',
		'getCurrentPatientData',
		'getCurrentAppointmentId',
		'getFormatDateDisplay',
		'showPatientAction',
		'renderActiveTabLoading',
		'loadVitalSigns',
		'clearHistoryTabs',
		'prepareFormForCopy',
		'setLoadingState',
		'setCurrentAppointmentId',
		'loadPatient',
		'loadExaminationFormData',
		'loadAppointmentServices',
		'loadPrescriptionData',
		'lockForm',
		'activeStatuses',
		'getHistoryDescription',
		'formatHistoryDate',
		'getExaminationStatusBadgeClass',
		'getExaminationStatusText',
		'showCopyAction',
		'showDeleteAction',
		'searchLimit',
		'searchErrorMessage',
		'copySuccessMessage',
		'copyFallbackSuccessMessage',
		'copyErrorLogMessage',
		'serviceErrorMessage',
		'prescriptionErrorMessage',
		'formErrorMessage',
		'onAfterHistoryLoad'
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

	function createPatientSearchModalFlowAdapter(options = {}) {
		const getState = () => {
			if (typeof options.getState !== 'function') return {};
			return options.getState() || {};
		};
		const setState = patch => {
			if (typeof options.setState === 'function') options.setState(patch || {});
			return getState();
		};
		const getRenderers = () => {
			if (typeof options.getHistoryTabRenderers === 'function') return options.getHistoryTabRenderers();
			return options.historyTabRenderers;
		};
		const getCurrentAppointmentId = () => {
			if (typeof options.getCurrentAppointmentId === 'function') return options.getCurrentAppointmentId();
			return options.currentAppointmentId;
		};
		const getCurrentPatientData = () => {
			if (typeof options.getCurrentPatientData === 'function') return options.getCurrentPatientData();
			return options.currentPatientData;
		};
		const getFormatDateDisplay = () => {
			if (typeof options.getFormatDateDisplay === 'function') return options.getFormatDateDisplay();
			return options.formatDateDisplay;
		};
		let searchRequestToken = 0;
		let historyRequestToken = 0;
		const flow = {};

		flow.syncWindowState = () => {
			const state = getState();
			return syncWindowState({
				exposeLegacyWindowState: options.exposeLegacyWindowState,
				selectedPatient: state.selectedPatient,
				medicalHistoryLoading: state.medicalHistoryLoading,
				medicalHistoryData: state.medicalHistoryData,
				selectedHistoryIndex: state.selectedHistoryIndex
			});
		};

		flow.renderSearchResults = (isError = false) => {
			const state = getState();
			return renderSearchResults({
				container: options.resultsContainer,
				isError,
				patients: state.searchResults,
				selectedPatient: state.selectedPatient,
				formatDateDisplay: getFormatDateDisplay(),
				showPatientAction: options.showPatientAction
			});
		};

		flow.fetchSearchResults = async (query = '') => {
			const requestToken = ++searchRequestToken;
			return fetchSearchResultsForFlow({
				query,
				limit: options.searchLimit,
				apiCall: options.apiCall,
				isCurrent: () => requestToken === searchRequestToken,
				setSearchResults(value) {
					setState({ searchResults: value });
				},
				renderResults: flow.renderSearchResults,
				autoSelect: flow.autoSelectAfterSearch,
				showToast: options.showToast,
				errorMessage: options.searchErrorMessage
			});
		};

		flow.autoSelectAfterSearch = () => {
			const state = getState();
			return applyAutoSelectAfterSearchForFlow({
				patients: state.searchResults,
				prefillPatientId: state.prefillPatientId,
				selectedPatient: state.selectedPatient,
				applyNoResultsState(autoSelectState) {
					setState({
						selectedPatient: autoSelectState.selectedPatient,
						currentPatientId: autoSelectState.currentPatientId,
						medicalHistoryData: autoSelectState.medicalHistoryData,
						selectedHistoryIndex: autoSelectState.selectedHistoryIndex
					});
				},
				syncState: flow.syncWindowState,
				updateContent: flow.updateContent,
				selectPatient: flow.selectPatient
			});
		};

		flow.updateContent = () => {
			const tabsUi = getTabsUi(options);
			if (!tabsUi || typeof tabsUi.dispatchPatientTabContent !== 'function') return null;
			return tabsUi.dispatchPatientTabContent({
				patient: getState().selectedPatient,
				renderers: getRenderers()
			});
		};

		flow.getHistoryLoadStateHandlers = () => {
			const historyUi = getHistoryListUi(options);
			if (!historyUi || typeof historyUi.buildHistoryLoadStateHandlers !== 'function') return {};
			return historyUi.buildHistoryLoadStateHandlers({
				setMedicalHistoryLoading(value) {
					setState({ medicalHistoryLoading: value });
				},
				setCurrentPatientId(value) {
					setState({ currentPatientId: value });
				},
				setMedicalHistoryData(value) {
					setState({ medicalHistoryData: value });
				},
				setSelectedHistoryIndex(value) {
					setState({ selectedHistoryIndex: value });
				},
				syncState: flow.syncWindowState,
				onAfterLoad() {
					const tabsUi = getTabsUi(options);
					if (tabsUi && typeof tabsUi.dispatchActiveTabRender === 'function') {
						tabsUi.dispatchActiveTabRender({ renderers: getRenderers() });
					}
					if (typeof options.onAfterHistoryLoad === 'function') options.onAfterHistoryLoad();
				}
			});
		};

		flow.loadMedicalHistory = async patientId => {
			const historyUi = getHistoryListUi(options);
			if (!historyUi || typeof historyUi.loadAndRenderHistoryList !== 'function') {
				return { status: 'missingHistoryUi' };
			}
			const state = getState();
			const requestToken = ++historyRequestToken;
			const contextRevision = state.contextRevision;
			const isCurrent = () => {
				const current = getState();
				return requestToken === historyRequestToken
					&& current.contextRevision === contextRevision
					&& Number(current.selectedPatient?.id) === Number(patientId);
			};
			return historyUi.loadAndRenderHistoryList({
				patientId,
				apiCall: options.apiCall,
				container: options.historyContainer,
				selectedIndex: state.selectedHistoryIndex,
				currentAppointmentId: getCurrentAppointmentId(),
				activeStatuses: options.activeStatuses,
				getDescription: options.getHistoryDescription,
				formatDate: options.formatHistoryDate,
				getExaminationStatusBadgeClass: options.getExaminationStatusBadgeClass,
				getExaminationStatusText: options.getExaminationStatusText,
				showCopyAction: options.showCopyAction,
				showDeleteAction: options.showDeleteAction,
				isCurrent,
				...flow.getHistoryLoadStateHandlers()
			});
		};

		flow.reset = () => resetModalStateForFlow({
			resetDom: true,
			applyResetState(resetState) {
				searchRequestToken += 1;
				historyRequestToken += 1;
				const currentRevision = Number(getState().contextRevision) || 0;
				setState({
					searchResults: resetState.searchResults,
					selectedPatient: resetState.selectedPatient,
					currentPatientId: resetState.currentPatientId,
					selectedHistoryIndex: resetState.selectedHistoryIndex,
					prefillPatientId: resetState.prefillPatientId,
					medicalHistoryData: resetState.medicalHistoryData,
					medicalHistoryLoading: false,
					contextRevision: currentRevision + 1
				});
				if (typeof options.clearHistoryTabs === 'function') options.clearHistoryTabs({ state: 'empty' });
			},
			searchInput: options.searchInput,
			searchResults: options.resultsContainer,
			medicalHistory: options.historyContainer,
			selectButton: options.selectButton
		});

		flow.selectPatient = index => {
			const state = getState();
			const nextRevision = (Number(state.contextRevision) || 0) + 1;
			historyRequestToken += 1;
			setState({ contextRevision: nextRevision });
			if (typeof options.clearHistoryTabs === 'function') options.clearHistoryTabs({ state: 'loading' });
			return selectPatientForModalFlow(state.searchResults, index, {
				applySelectionState(selectionState) {
					setState({
						selectedPatient: selectionState.selectedPatient,
						selectedHistoryIndex: selectionState.selectedHistoryIndex
					});
				},
				syncState: flow.syncWindowState,
				renderActiveTabLoading: options.renderActiveTabLoading,
				loadHistory: flow.loadMedicalHistory,
				updateContent: flow.updateContent,
				loadVitalSigns: options.loadVitalSigns,
				selectButton: options.selectButton
			});
		};

		flow.selectHistory = index => {
			const historyUi = getHistoryListUi(options);
			if (!historyUi || typeof historyUi.selectHistoryForModalFlow !== 'function') return null;
			return historyUi.selectHistoryForModalFlow(index, {
				setSelectedHistoryIndex(value) {
					const currentRevision = Number(getState().contextRevision) || 0;
					setState({ selectedHistoryIndex: value, contextRevision: currentRevision + 1 });
				},
				syncState: flow.syncWindowState,
				getRenderers
			});
		};

		function buildCopyFlowOptions(extra = {}) {
			return {
				apiCall: options.apiCall,
				prepareFormForCopy: options.prepareFormForCopy,
				setLoadingState: options.setLoadingState,
				setCurrentAppointmentId: options.setCurrentAppointmentId,
				loadPatient: options.loadPatient,
				loadExaminationFormData: options.loadExaminationFormData,
				loadAppointmentServices: options.loadAppointmentServices,
				loadPrescriptionData: options.loadPrescriptionData,
				showToast: options.showToast,
				lockForm: options.lockForm,
				showHistoryButton: options.showHistoryButton,
				serviceErrorMessage: options.serviceErrorMessage,
				prescriptionErrorMessage: options.prescriptionErrorMessage,
				formErrorMessage: options.formErrorMessage,
				successMessage: options.copySuccessMessage,
				fallbackSuccessMessage: options.copyFallbackSuccessMessage,
				errorLogMessage: options.copyErrorLogMessage,
				...extra
			};
		}

		flow.copyPatientToForm = index => {
			const state = getState();
			return copyPatientToFormFlow(index, buildCopyFlowOptions({
				patients: state.searchResults
			}));
		};

		flow.copyHistoryToForm = historyIndex => {
			const historyUi = getHistoryListUi(options);
			if (!historyUi || typeof historyUi.copyHistoryToFormFlow !== 'function') {
				return Promise.resolve({ status: 'missingHistoryUi' });
			}
			const state = getState();
			return historyUi.copyHistoryToFormFlow(buildCopyFlowOptions({
				selectedPatient: state.selectedPatient,
				histories: state.medicalHistoryData,
				historyIndex: historyIndex === undefined ? state.selectedHistoryIndex : historyIndex,
				selectedHistoryIndex: state.selectedHistoryIndex
			}));
		};

		flow.setShouldPrefill = value => setState({ shouldPrefill: value });

		flow.openSearchModal = () => {
			const state = getState();
			return openSearchModalAndFetch({
				modal: options.modal,
				missingMessage: options.missingMessage || 'Không tìm thấy modal tìm kiếm bệnh nhân',
				reset: flow.reset,
				searchInput: options.searchInput,
				shouldPrefill: state.shouldPrefill,
				currentPatientData: getCurrentPatientData(),
				setPrefillPatientId(value) {
					setState({ prefillPatientId: value });
				},
				fetchSearch: flow.fetchSearchResults,
				setShouldPrefill: flow.setShouldPrefill
			});
		};

		flow.openLinkedRelative = async patientId => openLinkedRelativePatientSearch({
			patientId,
			modal: options.modal,
			missingMessage: options.missingMessage || 'Không tìm thấy modal tìm kiếm bệnh nhân',
			apiCall: options.apiCall,
			reset: flow.reset,
			setShouldPrefill: flow.setShouldPrefill,
			applyLoadedState(linkedPatientState) {
				setState({
					searchResults: linkedPatientState.searchResults,
					prefillPatientId: linkedPatientState.prefillPatientId
				});
			},
			renderResults: flow.renderSearchResults,
			selectPatient: flow.selectPatient,
			loadHistory: flow.loadMedicalHistory,
			searchInput: options.searchInput,
			selectButton: options.selectButton,
			fetchFallback: flow.fetchSearchResults,
			logMessage: options.linkedRelativeLogMessage || 'Không thể mở modal người thân liên kết:'
		});

		flow.bindControls = (bindOptions = {}) => bindPatientSearchModalFlowControls({
			searchButton: options.searchButton,
			historyButton: options.historyButton,
			setShouldPrefill: flow.setShouldPrefill,
			open: flow.openSearchModal,
			searchInput: options.searchInput,
			fetchSearch: flow.fetchSearchResults,
			resultsContainer: options.resultsContainer,
			copyPatient: bindOptions.copyPatient,
			selectPatient: flow.selectPatient,
			historyContainer: options.historyContainer,
			selectHistory: flow.selectHistory,
			copyHistory: bindOptions.copyHistory,
			deleteHistory: bindOptions.deleteHistory,
			showToast: options.showToast,
			selectButton: options.selectButton,
			getSelectedPatient: bindOptions.getSelectedPatient || (() => getState().selectedPatient),
			loadPatient: bindOptions.loadPatient,
			modal: options.modal,
			isFormLocked: bindOptions.isFormLocked,
			unlockForm: bindOptions.unlockForm,
			resetModal: flow.reset,
			tabs: options.tabs,
			updateContent: flow.updateContent,
			openLinkedRelative: flow.openLinkedRelative
		});

		return flow;
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
