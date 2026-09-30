// Parts (nạp trước file này): search-flow-installers.js
(function (window) {
	'use strict';
	const { pickFlowPassthroughOptions, createHistoryDeleteFlow, installSearchFlow1 } = window.QLPKModuleParts["components/modal-patient-search-ui"];

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

	function runSearchFlow1(ctx) {
		ctx.searchRequestToken = 0;
		ctx.historyRequestToken = 0;
		ctx.flow = {};
		ctx.flow.syncWindowState = () => {
			const state = ctx.getState();
			return syncWindowState({
				exposeLegacyWindowState: ctx.options.exposeLegacyWindowState,
				selectedPatient: state.selectedPatient,
				medicalHistoryLoading: state.medicalHistoryLoading,
				medicalHistoryData: state.medicalHistoryData,
				selectedHistoryIndex: state.selectedHistoryIndex
			});
		};
		ctx.flow.renderSearchResults = (isError = false) => {
			const state = ctx.getState();
			return renderSearchResults({
				container: ctx.options.resultsContainer,
				isError,
				patients: state.searchResults,
				selectedPatient: state.selectedPatient,
				formatDateDisplay: ctx.getFormatDateDisplay(),
				showPatientAction: ctx.options.showPatientAction
			});
		};
		ctx.flow.fetchSearchResults = async (query = '') => {
			const requestToken = ++ctx.searchRequestToken;
			return fetchSearchResultsForFlow({
				query,
				limit: ctx.options.searchLimit,
				apiCall: ctx.options.apiCall,
				isCurrent: () => requestToken === ctx.searchRequestToken,
				setSearchResults(value) {
					ctx.setState({ searchResults: value });
				},
				renderResults: ctx.flow.renderSearchResults,
				autoSelect: ctx.flow.autoSelectAfterSearch,
				showToast: ctx.options.showToast,
				errorMessage: ctx.options.searchErrorMessage
			});
		};
		ctx.flow.autoSelectAfterSearch = () => {
			const state = ctx.getState();
			return applyAutoSelectAfterSearchForFlow({
				patients: state.searchResults,
				prefillPatientId: state.prefillPatientId,
				selectedPatient: state.selectedPatient,
				applyNoResultsState(autoSelectState) {
					ctx.setState({
						selectedPatient: autoSelectState.selectedPatient,
						currentPatientId: autoSelectState.currentPatientId,
						medicalHistoryData: autoSelectState.medicalHistoryData,
						selectedHistoryIndex: autoSelectState.selectedHistoryIndex
					});
				},
				syncState: ctx.flow.syncWindowState,
				updateContent: ctx.flow.updateContent,
				selectPatient: ctx.flow.selectPatient
			});
		};
		ctx.flow.updateContent = () => {
			const tabsUi = getTabsUi(ctx.options);
			if (!tabsUi || typeof tabsUi.dispatchPatientTabContent !== 'function') return null;
			return tabsUi.dispatchPatientTabContent({
				patient: ctx.getState().selectedPatient,
				renderers: ctx.getRenderers()
			});
		};
	}

	function runSearchFlow2(ctx) {
		ctx.flow.getHistoryLoadStateHandlers = () => {
			const historyUi = getHistoryListUi(ctx.options);
			if (!historyUi || typeof historyUi.buildHistoryLoadStateHandlers !== 'function') return {};
			return historyUi.buildHistoryLoadStateHandlers({
				setMedicalHistoryLoading(value) {
					ctx.setState({ medicalHistoryLoading: value });
				},
				setCurrentPatientId(value) {
					ctx.setState({ currentPatientId: value });
				},
				setMedicalHistoryData(value) {
					ctx.setState({ medicalHistoryData: value });
				},
				setSelectedHistoryIndex(value) {
					ctx.setState({ selectedHistoryIndex: value });
				},
				syncState: ctx.flow.syncWindowState,
				onAfterLoad() {
					const tabsUi = getTabsUi(ctx.options);
					if (tabsUi && typeof tabsUi.dispatchActiveTabRender === 'function') {
						tabsUi.dispatchActiveTabRender({ renderers: ctx.getRenderers() });
					}
					if (typeof ctx.options.onAfterHistoryLoad === 'function') ctx.options.onAfterHistoryLoad();
				}
			});
		};
		ctx.flow.loadMedicalHistory = async patientId => {
			const historyUi = getHistoryListUi(ctx.options);
			if (!historyUi || typeof historyUi.loadAndRenderHistoryList !== 'function') {
				return { status: 'missingHistoryUi' };
			}
			const state = ctx.getState();
			const requestToken = ++ctx.historyRequestToken;
			const contextRevision = state.contextRevision;
			const isCurrent = () => {
				const current = ctx.getState();
				return requestToken === ctx.historyRequestToken
					&& current.contextRevision === contextRevision
					&& Number(current.selectedPatient?.id) === Number(patientId);
			};
			return historyUi.loadAndRenderHistoryList({
				patientId,
				apiCall: ctx.options.apiCall,
				container: ctx.options.historyContainer,
				selectedIndex: state.selectedHistoryIndex,
				currentAppointmentId: ctx.getCurrentAppointmentId(),
				activeStatuses: ctx.options.activeStatuses,
				getDescription: ctx.options.getHistoryDescription,
				formatDate: ctx.options.formatHistoryDate,
				getExaminationStatusBadgeClass: ctx.options.getExaminationStatusBadgeClass,
				getExaminationStatusText: ctx.options.getExaminationStatusText,
				showCopyAction: ctx.options.showCopyAction,
				showDeleteAction: ctx.options.showDeleteAction,
				isCurrent,
				...ctx.flow.getHistoryLoadStateHandlers()
			});
		};
	}

	function runSearchFlow3(ctx) {
		ctx.flow.reset = () => resetModalStateForFlow({
			resetDom: true,
			applyResetState(resetState) {
				ctx.searchRequestToken += 1;
				ctx.historyRequestToken += 1;
				const currentRevision = Number(ctx.getState().contextRevision) || 0;
				ctx.setState({
					searchResults: resetState.searchResults,
					selectedPatient: resetState.selectedPatient,
					currentPatientId: resetState.currentPatientId,
					selectedHistoryIndex: resetState.selectedHistoryIndex,
					prefillPatientId: resetState.prefillPatientId,
					medicalHistoryData: resetState.medicalHistoryData,
					medicalHistoryLoading: false,
					contextRevision: currentRevision + 1
				});
				if (typeof ctx.options.clearHistoryTabs === 'function') ctx.options.clearHistoryTabs({ state: 'empty' });
			},
			searchInput: ctx.options.searchInput,
			searchResults: ctx.options.resultsContainer,
			medicalHistory: ctx.options.historyContainer,
			selectButton: ctx.options.selectButton
		});
		ctx.flow.selectPatient = index => {
			const state = ctx.getState();
			const nextRevision = (Number(state.contextRevision) || 0) + 1;
			ctx.historyRequestToken += 1;
			ctx.setState({ contextRevision: nextRevision });
			if (typeof ctx.options.clearHistoryTabs === 'function') ctx.options.clearHistoryTabs({ state: 'loading' });
			return selectPatientForModalFlow(state.searchResults, index, {
				applySelectionState(selectionState) {
					ctx.setState({
						selectedPatient: selectionState.selectedPatient,
						selectedHistoryIndex: selectionState.selectedHistoryIndex
					});
				},
				syncState: ctx.flow.syncWindowState,
				renderActiveTabLoading: ctx.options.renderActiveTabLoading,
				loadHistory: ctx.flow.loadMedicalHistory,
				updateContent: ctx.flow.updateContent,
				loadVitalSigns: ctx.options.loadVitalSigns,
				selectButton: ctx.options.selectButton
			});
		};
		ctx.flow.selectHistory = index => {
			const historyUi = getHistoryListUi(ctx.options);
			if (!historyUi || typeof historyUi.selectHistoryForModalFlow !== 'function') return null;
			return historyUi.selectHistoryForModalFlow(index, {
				setSelectedHistoryIndex(value) {
					const currentRevision = Number(ctx.getState().contextRevision) || 0;
					ctx.setState({ selectedHistoryIndex: value, contextRevision: currentRevision + 1 });
				},
				syncState: ctx.flow.syncWindowState,
				getRenderers: ctx.getRenderers
			});
		};
		ctx.flow.copyPatientToForm = index => {
			const state = ctx.getState();
			return copyPatientToFormFlow(index, ctx.buildCopyFlowOptions({
				patients: state.searchResults
			}));
		};
	}

	function runSearchFlow4(ctx) {
		ctx.flow.copyHistoryToForm = historyIndex => {
			const historyUi = getHistoryListUi(ctx.options);
			if (!historyUi || typeof historyUi.copyHistoryToFormFlow !== 'function') {
				return Promise.resolve({ status: 'missingHistoryUi' });
			}
			const state = ctx.getState();
			return historyUi.copyHistoryToFormFlow(ctx.buildCopyFlowOptions({
				selectedPatient: state.selectedPatient,
				histories: state.medicalHistoryData,
				historyIndex: historyIndex === undefined ? state.selectedHistoryIndex : historyIndex,
				selectedHistoryIndex: state.selectedHistoryIndex
			}));
		};
		ctx.flow.setShouldPrefill = value => ctx.setState({ shouldPrefill: value });
		ctx.flow.openSearchModal = () => {
			const state = ctx.getState();
			return openSearchModalAndFetch({
				modal: ctx.options.modal,
				missingMessage: ctx.options.missingMessage || 'Không tìm thấy modal tìm kiếm bệnh nhân',
				reset: ctx.flow.reset,
				searchInput: ctx.options.searchInput,
				shouldPrefill: state.shouldPrefill,
				currentPatientData: ctx.getCurrentPatientData(),
				setPrefillPatientId(value) {
					ctx.setState({ prefillPatientId: value });
				},
				fetchSearch: ctx.flow.fetchSearchResults,
				setShouldPrefill: ctx.flow.setShouldPrefill
			});
		};
		ctx.flow.openLinkedRelative = async patientId => openLinkedRelativePatientSearch({
			patientId,
			modal: ctx.options.modal,
			missingMessage: ctx.options.missingMessage || 'Không tìm thấy modal tìm kiếm bệnh nhân',
			apiCall: ctx.options.apiCall,
			reset: ctx.flow.reset,
			setShouldPrefill: ctx.flow.setShouldPrefill,
			applyLoadedState(linkedPatientState) {
				ctx.setState({
					searchResults: linkedPatientState.searchResults,
					prefillPatientId: linkedPatientState.prefillPatientId
				});
			},
			renderResults: ctx.flow.renderSearchResults,
			selectPatient: ctx.flow.selectPatient,
			loadHistory: ctx.flow.loadMedicalHistory,
			searchInput: ctx.options.searchInput,
			selectButton: ctx.options.selectButton,
			fetchFallback: ctx.flow.fetchSearchResults,
			logMessage: ctx.options.linkedRelativeLogMessage || 'Không thể mở modal người thân liên kết:'
		});
	}

	function runSearchFlow5(ctx) {
		ctx.flow.bindControls = (bindOptions = {}) => bindPatientSearchModalFlowControls({
			searchButton: ctx.options.searchButton,
			historyButton: ctx.options.historyButton,
			setShouldPrefill: ctx.flow.setShouldPrefill,
			open: ctx.flow.openSearchModal,
			searchInput: ctx.options.searchInput,
			fetchSearch: ctx.flow.fetchSearchResults,
			resultsContainer: ctx.options.resultsContainer,
			copyPatient: bindOptions.copyPatient,
			selectPatient: ctx.flow.selectPatient,
			historyContainer: ctx.options.historyContainer,
			selectHistory: ctx.flow.selectHistory,
			copyHistory: bindOptions.copyHistory,
			deleteHistory: bindOptions.deleteHistory,
			showToast: ctx.options.showToast,
			selectButton: ctx.options.selectButton,
			getSelectedPatient: bindOptions.getSelectedPatient || (() => ctx.getState().selectedPatient),
			loadPatient: bindOptions.loadPatient,
			modal: ctx.options.modal,
			isFormLocked: bindOptions.isFormLocked,
			unlockForm: bindOptions.unlockForm,
			resetModal: ctx.flow.reset,
			tabs: ctx.options.tabs,
			updateContent: ctx.flow.updateContent,
			openLinkedRelative: ctx.flow.openLinkedRelative
		});
	}

	function createPatientSearchModalFlowAdapter(options = {}) {
		const ctx = {};
		ctx.options = options;
		installSearchFlow1(ctx);
		runSearchFlow1(ctx);
		runSearchFlow2(ctx);
		runSearchFlow3(ctx);
		runSearchFlow4(ctx);
		runSearchFlow5(ctx);
		return ctx.flow;
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
