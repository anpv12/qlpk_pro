(function (window) {
	'use strict';

	const PARTS = window.QLPKModalPatientSearchParts || (window.QLPKModalPatientSearchParts = {});
	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const resolveUi = (name, fallback) => REGISTRY?.get?.(name) || fallback;
	const getTabsUi = options => options?.tabsUi || resolveUi('modalFunctionTabsUi', window.ModalFunctionTabsUi);
	const getHistoryListUi = options => options?.historyListUi || resolveUi('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);
	const DATA = window.ModalPatientSearchData;
	if (!DATA) throw new Error('Thiếu ModalPatientSearchData');
	const {
		extractPatientPayload, buildPatientDetailUrl, loadLatestAppointmentContextForPatient,
		loadPatientForAppointment
	} = DATA;
	const {
		applyNoSearchResultsUi, applySelectedPatientUi, applySinglePatientSearchUi, hideBootstrapModal,
		resetModalDom, resolveAutoSelectIndex, selectAppointmentCard, showBootstrapModal, showHistoryButton
	} = PARTS;

	function callOption(options, name, ...args) {
		return typeof options[name] === 'function' ? options[name](...args) : undefined;
	}

	async function loadOptionalAppointmentPart(options, name, fallbackMessage, messageName) {
		if (typeof options[name] !== 'function') return;
		try {
			await options[name]();
		} catch (error) {
			console.warn(options[messageName] || fallbackMessage, error);
		}
	}

	async function loadCopiedPatientWithAppointmentContext(patient, appointmentContext = {}, options = {}) {
		const appointment = appointmentContext.appointment || null;
		const appointmentId = appointmentContext.appointmentId || null;
		const examination = appointmentContext.examination || null;

		callOption(options, 'setCurrentAppointmentId', appointmentId);
		await callOption(options, 'loadPatient', patient, examination, appointment);

		const appointmentPostLoadState = buildAppointmentPostLoadState(appointment, appointmentId);
		const hasAppointment = appointmentPostLoadState.hasAppointmentContext;
		if (hasAppointment) {
			await callOption(options, 'loadExaminationFormData', appointmentId);
		}

		if (appointmentPostLoadState.shouldShowHistoryButton) {
			(typeof options.showHistoryButton === 'function' ? options.showHistoryButton : showHistoryButton)();
		}

		if (hasAppointment) {
			await loadOptionalAppointmentPart(options, 'loadAppointmentServices',
				'Không thể tải danh sách dịch vụ cho lịch hẹn:', 'serviceErrorMessage');
			await loadOptionalAppointmentPart(options, 'loadPrescriptionData',
				'Không thể tải đơn thuốc cho lịch hẹn:', 'prescriptionErrorMessage');
		}

		callOption(options, 'showToast', 'success', options.successMessage || `Đã tải thông tin bệnh nhân: ${patient.full_name}`);
		callOption(options, 'lockForm');

		return appointmentPostLoadState;
	}

	async function loadCopiedPatientFallback(patient, options = {}) {
		if (typeof options.loadPatient === 'function') {
			await options.loadPatient(patient);
		}
		if (typeof options.showToast === 'function') {
			options.showToast('success', options.successMessage || 'Đã sao chép thông tin bệnh nhân');
		}
		if (typeof options.lockForm === 'function') options.lockForm();
		return { patient };
	}

	function prepareAppointmentCopyForm(options = {}) {
		runSafeCallback(options.clearExaminationLayout, {
			message: options.clearExaminationMessage || 'Không thể reset form khám trước khi tải mới:'
		});
		runSafeCallback(options.clearSelectedServices, {
			message: options.clearServicesMessage || 'Không thể reset danh sách dịch vụ trước khi tải mới:'
		});
		runSafeCallback(options.resetExtraState, {
			message: options.resetExtraStateMessage || 'Không thể reset dữ liệu trước khi tải mới:'
		});

		if (typeof options.setCurrentAppointmentId === 'function') {
			options.setCurrentAppointmentId(null);
		}
		if (options.closeModal !== false) {
			hideBootstrapModal(options.modalElement || options.modal || 'patientSearchModal');
		}
		return { currentAppointmentId: null, modalClosed: options.closeModal !== false };
	}

	function createAppointmentCopyFormPreparer(options = {}) {
		return function prepareFormForCopy(closeModal = true) {
			return prepareAppointmentCopyForm({
				...options,
				closeModal
			});
		};
	}

	async function copyPatientToFormFlow(index, options = {}) {
		const patient = resolvePatientAtIndex(options.patients, index);
		if (!patient) return { status: 'missingPatient', patient: null };

		if (typeof options.setLoadingState === 'function') {
			options.setLoadingState(true);
		}

		try {
			if (typeof options.prepareFormForCopy === 'function') options.prepareFormForCopy();

			const response = await options.apiCall(buildPatientDetailUrl(patient.id));
			if (response.ok) {
				const data = await response.json();
				const fullPatient = extractPatientPayload(data);
				const appointmentContext = await loadLatestAppointmentContextForPatient(patient.id, {
					apiCall: options.apiCall
				});

				const postLoadState = await loadCopiedPatientWithAppointmentContext(fullPatient, appointmentContext, {
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
					successMessage: options.successMessage
				});

				return { status: 'success', patient, fullPatient, appointmentContext, postLoadState };
			}

			await loadCopiedPatientFallback(patient, {
				loadPatient: options.loadPatient,
				showToast: options.showToast,
				lockForm: options.lockForm,
				successMessage: options.fallbackSuccessMessage
			});
			return { status: 'fallback', patient };
		} catch (error) {
			console.error(options.errorLogMessage || 'Error loading patient data:', error);
			await loadCopiedPatientFallback(patient, {
				loadPatient: options.loadPatient,
				showToast: options.showToast,
				lockForm: options.lockForm,
				successMessage: options.fallbackSuccessMessage
			});
			return { status: 'errorFallback', patient, error };
		} finally {
			if (typeof options.setLoadingState === 'function') {
				options.setLoadingState(false);
			}
		}
	}

	function hasAppointmentContext(appointment, appointmentId) {
		return Boolean(appointment && appointmentId);
	}

	function buildAppointmentPostLoadState(appointment, appointmentId) {
		return {
			hasAppointmentContext: hasAppointmentContext(appointment, appointmentId),
			shouldShowHistoryButton: Boolean(appointment)
		};
	}

	function buildCopyHistoryPatientLoadState(selectedPatient) {
		return {
			fallbackPatient: selectedPatient || null,
			selectedPatientId: resolveModalPatientId(null, selectedPatient)
		};
	}

	async function loadCopyHistoryPatient(selectedPatient, options = {}) {
		const historyPatientLoadState = buildCopyHistoryPatientLoadState(selectedPatient);
		let fullPatient = historyPatientLoadState.fallbackPatient;
		const selectedPatientId = historyPatientLoadState.selectedPatientId;

		if (selectedPatientId && typeof options.apiCall === 'function') {
			try {
				const response = await options.apiCall(buildPatientDetailUrl(selectedPatientId));
				if (response && response.ok) {
					const data = await response.json();
					fullPatient = extractPatientPayload(data);
				}
			} catch (error) {
				console.warn(options.warningMessage || 'Không thể tải đầy đủ thông tin bệnh nhân:', error);
			}
		}

		return {
			...historyPatientLoadState,
			fullPatient
		};
	}

	function buildSinglePatientSearchState(patient) {
		return {
			patients: patient ? [patient] : [],
			prefillPatientId: patient ? patient.id : null
		};
	}

	function buildLinkedRelativePatientState(patient) {
		const singlePatientState = buildSinglePatientSearchState(patient);
		return {
			searchResults: singlePatientState.patients,
			prefillPatientId: singlePatientState.prefillPatientId,
			selectIndex: patient ? 0 : null,
			historyPatientId: patient ? patient.id : null
		};
	}

	function buildNoSearchResultsState() {
		return {
			selectedPatient: null,
			currentPatientId: null,
			medicalHistoryData: [],
			selectedHistoryIndex: null
		};
	}

	function buildAutoSelectAfterSearchState(options = {}) {
		const patients = Array.isArray(options.patients) ? options.patients : [];
		if (!patients.length) {
			return Object.assign({ hasResults: false, targetIndex: null }, buildNoSearchResultsState());
		}
		return {
			hasResults: true,
			targetIndex: resolveAutoSelectIndex({
				patients,
				prefillPatientId: options.prefillPatientId,
				selectedPatient: options.selectedPatient
			})
		};
	}

	function applyAutoSelectAfterSearch(options = {}) {
		const autoSelectState = buildAutoSelectAfterSearchState({
			patients: options.patients,
			prefillPatientId: options.prefillPatientId,
			selectedPatient: options.selectedPatient
		});
		if (!autoSelectState.hasResults) {
			if (typeof options.onNoResults === 'function') options.onNoResults(autoSelectState);
			applyNoSearchResultsUi(options);
			if (typeof options.updateContent === 'function') options.updateContent(autoSelectState);
			return autoSelectState;
		}

		if (typeof options.selectPatient === 'function') {
			options.selectPatient(autoSelectState.targetIndex, autoSelectState);
		}
		return autoSelectState;
	}

	function buildResetModalState() {
		return {
			searchResults: [],
			selectedPatient: null,
			currentPatientId: null,
			selectedHistoryIndex: null,
			prefillPatientId: null,
			medicalHistoryData: []
		};
	}

	function createModalSearchStateStore(initialState = {}) {
		const state = {
			...buildResetModalState(),
			shouldPrefill: false,
			medicalHistoryLoading: false,
			contextRevision: 0,
			...initialState
		};

		return {
			state,
			getState() {
				return state;
			},
			setState(patch = {}) {
				Object.keys(patch || {}).forEach(key => {
					state[key] = patch[key];
				});
				return state;
			},
			get(key) {
				return state[key];
			},
			set(key, value) {
				state[key] = value;
				return value;
			}
		};
	}

	function resolveWorkflowModalElements(options = {}) {
		const doc = options.document || window.document;
		const ids = {
			documentButton: 'documentBtn',
			orderButton: 'orderBtn',
			searchPatientButton: null,
			historyButton: 'historyBtn',
			searchInput: 'modalPatientSearch',
			resultsContainer: 'modalSearchResults',
			historyContainer: 'modalMedicalHistory',
			selectButton: 'selectPatientFromModal',
			modal: 'patientSearchModal',
			tabs: 'modalFunctionTabs',
			orderCategoryTree: 'orderCategoryTree',
			orderSelectionsTableBody: 'orderSelectionsTableBody',
			orderClearButton: 'orderClearBtn',
			orderAddNewButton: 'orderAddNewBtn',
			orderPrintInternalButton: 'orderPrintInternalBtn',
			orderPrintExternalButton: 'orderPrintExternalBtn',
			...(options.ids || {})
		};

		return Object.keys(ids).reduce((elements, key) => {
			elements[key] = ids[key] ? doc.getElementById(ids[key]) : null;
			return elements;
		}, {});
	}

	function buildHistoryTabStateFromStore(stateStore) {
		return {
			patient: stateStore.get('selectedPatient'),
			isHistoryLoading: stateStore.get('medicalHistoryLoading'),
			histories: stateStore.get('medicalHistoryData'),
			selectedIndex: stateStore.get('selectedHistoryIndex'),
			contextRevision: stateStore.get('contextRevision')
		};
	}

	function resetModalStateForFlow(options = {}) {
		const resetState = buildResetModalState();
		if (typeof options.applyResetState === 'function') {
			options.applyResetState(resetState);
		}
		if (options.resetDom !== false) resetModalDom(options);
		return resetState;
	}

	function applyAutoSelectAfterSearchForFlow(options = {}) {
		return applyAutoSelectAfterSearch({
			patients: options.patients,
			prefillPatientId: options.prefillPatientId,
			selectedPatient: options.selectedPatient,
			onNoResults(autoSelectState) {
				if (typeof options.applyNoResultsState === 'function') {
					options.applyNoResultsState(autoSelectState);
				}
				if (typeof options.syncState === 'function') options.syncState(autoSelectState);
			},
			updateContent: options.updateContent,
			selectPatient: options.selectPatient
		});
	}

	function buildSelectedPatientState(patient) {
		return {
			selectedPatient: patient || null,
			selectedHistoryIndex: null
		};
	}

	function resolvePatientAtIndex(patients, index) {
		const list = Array.isArray(patients) ? patients : [];
		const resolvedIndex = Number(index);
		if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0 || resolvedIndex >= list.length) return null;
		return list[resolvedIndex] || null;
	}

	function resolveModalPatientId(currentPatientId, selectedPatient) {
		return currentPatientId || (selectedPatient && selectedPatient.id) || null;
	}

	function resolvePatientIdentity(patient) {
		return {
			id: patient ? patient.id : null,
			fullName: patient ? patient.full_name : undefined
		};
	}

	function buildPatientSelectionFlowState(patients, index) {
		const patient = resolvePatientAtIndex(patients, index);
		if (!patient) return null;
		const selectedState = buildSelectedPatientState(patient);
		return {
			selectedPatient: selectedState.selectedPatient,
			selectedHistoryIndex: selectedState.selectedHistoryIndex,
			identity: resolvePatientIdentity(selectedState.selectedPatient)
		};
	}

	function runSafeCallback(callback, options = {}) {
		if (typeof callback !== 'function') return undefined;
		try {
			return callback();
		} catch (error) {
			console.warn(options.message || 'Không thể thực hiện thao tác:', error);
			return undefined;
		}
	}

	async function runSafeAsyncCallback(callback, options = {}) {
		if (typeof callback !== 'function') return undefined;
		try {
			return await callback();
		} catch (error) {
			console.warn(options.message || 'Không thể thực hiện thao tác:', error);
			return undefined;
		}
	}

	function callIfFunction(callback, ...args) {
		if (typeof callback === 'function') return callback(...args);
		return undefined;
	}

	function setFlowLoading(options, isLoading) {
		callIfFunction(options.setLoading, isLoading);
		callIfFunction(options.setSecondaryLoading, isLoading);
	}

	async function loadFlowExaminationForm(appointmentId, options, loadContext) {
		if (typeof options.loadExaminationFormData === 'function') {
			try {
				await options.loadExaminationFormData(appointmentId, loadContext);
			} catch (error) {
				console.error(options.examinationFormErrorMessage || 'Error loading examination form data:', error);
				callIfFunction(options.clearExaminationFormOnError);
			}
		}
		callIfFunction(options.afterExaminationFormLoad);
	}

	async function runAppointmentPatientFlow(appointmentId, appointment, options, shouldContinue) {
		let examination = appointment.examination || null;
		const patient = await loadPatientForAppointment(appointment, {
			apiCall: options.apiCall,
			errorMessage: options.patientLoadErrorMessage
		});
		if (!examination && typeof options.loadExaminationFallback === 'function') {
			examination = await runSafeAsyncCallback(() => options.loadExaminationFallback(appointmentId, appointment), {
				message: options.examinationFallbackErrorMessage || 'Không thể tải dữ liệu lượt khám:'
			}) || null;
		}
		const result = { appointment, patient, examination };
		if (!shouldContinue()) return { status: 'stale', ...result };

		const loadContext = callIfFunction(options.getLoadContext, appointmentId, appointment);
		if (patient && typeof options.loadPatient === 'function') {
			await options.loadPatient(patient, examination, appointment, loadContext);
		}
		if (!shouldContinue()) return { status: 'stale', ...result };

		await loadFlowExaminationForm(appointmentId, options, loadContext);
		if (!shouldContinue()) return { status: 'stale', ...result };

		callIfFunction(options.unlockIfNeeded);
		await runSafeAsyncCallback(options.loadAppointmentServices, {
			message: options.serviceErrorMessage || 'Không thể tải danh sách dịch vụ cho lịch hẹn:'
		});
		if (!shouldContinue()) return { status: 'stale', ...result };

		await runSafeAsyncCallback(options.loadPrescriptionData, {
			message: options.prescriptionErrorMessage || 'Không thể tải đơn thuốc cho lịch hẹn:'
		});
		return { status: 'loaded', ...result };
	}

	async function selectAppointmentPatientFlow(appointmentId, options = {}) {
		selectAppointmentCard(appointmentId, options.cardOptions || {});
		setFlowLoading(options, true);
		if (options.setAppointmentIdOnStart) callIfFunction(options.setCurrentAppointmentId, appointmentId);

		const shouldContinue = typeof options.isCurrentLoad === 'function'
			? options.isCurrentLoad
			: () => true;

		try {
			runSafeCallback(options.clearBeforeLoad, {
				message: options.clearErrorMessage || 'Error clearing examination fields:'
			});

			const historyUi = getHistoryListUi(options);
			const appointment = historyUi && typeof historyUi.resolveAppointmentById === 'function'
				? historyUi.resolveAppointmentById(options.appointments || [], appointmentId)
				: null;
			if (!appointment) {
				callIfFunction(options.onMissingAppointment, appointmentId);
				return { status: 'missingAppointment', appointment: null };
			}

			if (typeof options.showHistoryButton === 'function') {
				options.showHistoryButton();
			} else {
				showHistoryButton();
			}
			if (!options.setAppointmentIdOnStart) callIfFunction(options.setCurrentAppointmentId, appointmentId);

			return await runAppointmentPatientFlow(appointmentId, appointment, options, shouldContinue);
		} finally {
			const shouldFinalize = typeof options.shouldFinalize === 'function'
				? options.shouldFinalize()
				: true;
			if (shouldFinalize) setFlowLoading(options, false);
		}
	}

	function selectPatientForModalFlow(patients, index, options = {}) {
		const selectionState = buildPatientSelectionFlowState(patients, index);
		if (!selectionState) return null;

		if (typeof options.applySelectionState === 'function') {
			options.applySelectionState(selectionState);
		}
		if (typeof options.syncState === 'function') options.syncState(selectionState);

		const selectedPatientIdentity = selectionState.identity;
		applySelectedPatientUi(index, options);
		let vitalSignsLoadedByActiveTab = false;

		if (typeof options.renderActiveTabLoading === 'function') {
			options.renderActiveTabLoading({
				onVitalSigns() {
					vitalSignsLoadedByActiveTab = true;
					if (typeof options.loadVitalSigns === 'function') {
						options.loadVitalSigns(selectedPatientIdentity.id, selectedPatientIdentity.fullName);
					}
				}
			});
		}

		if (typeof options.loadHistory === 'function') options.loadHistory(selectedPatientIdentity.id, selectionState);
		if (typeof options.updateContent === 'function') options.updateContent(selectionState);
		if (!vitalSignsLoadedByActiveTab && typeof options.loadVitalSigns === 'function') {
			options.loadVitalSigns(selectedPatientIdentity.id, selectedPatientIdentity.fullName);
		}
		return selectionState;
	}

	async function openLinkedRelativePatientSearch(options = {}) {
		if (!options.patientId) return { status: 'missingPatientId' };
		if (!showBootstrapModal(options.modal, { missingMessage: options.missingMessage })) {
			return { status: 'missingModal' };
		}

		if (typeof options.setShouldPrefill === 'function') options.setShouldPrefill(false);
		if (typeof options.reset === 'function') options.reset();

		try {
			const response = await options.apiCall(buildPatientDetailUrl(options.patientId));
			if (!response.ok) throw new Error(await response.text());
			const payload = await response.json();
			const patient = extractPatientPayload(payload);
			if (!patient) throw new Error('Không có dữ liệu bệnh nhân');

			const linkedPatientState = buildLinkedRelativePatientState(patient);
			if (typeof options.applyLoadedState === 'function') {
				options.applyLoadedState(linkedPatientState, patient);
			}
			if (typeof options.renderResults === 'function') options.renderResults();
			if (typeof options.selectPatient === 'function') options.selectPatient(linkedPatientState.selectIndex);
			if (typeof options.loadHistory === 'function') {
				await options.loadHistory(linkedPatientState.historyPatientId);
			}
			applySinglePatientSearchUi(patient, {
				searchInput: options.searchInput,
				selectButton: options.selectButton
			});
			return { status: 'success', patient, linkedPatientState };
		} catch (error) {
			console.error(options.logMessage || 'Không thể mở modal người thân liên kết:', error);
			if (typeof options.fetchFallback === 'function') options.fetchFallback('');
			return { status: 'error', error };
		}
	}

	Object.assign(PARTS, {
		callOption, loadOptionalAppointmentPart, loadCopiedPatientWithAppointmentContext,
		loadCopiedPatientFallback, prepareAppointmentCopyForm, createAppointmentCopyFormPreparer,
		copyPatientToFormFlow, hasAppointmentContext, buildAppointmentPostLoadState,
		buildCopyHistoryPatientLoadState, loadCopyHistoryPatient, buildSinglePatientSearchState,
		buildLinkedRelativePatientState, buildNoSearchResultsState, buildAutoSelectAfterSearchState,
		applyAutoSelectAfterSearch, buildResetModalState, createModalSearchStateStore,
		resolveWorkflowModalElements, buildHistoryTabStateFromStore, resetModalStateForFlow,
		applyAutoSelectAfterSearchForFlow, buildSelectedPatientState, resolvePatientAtIndex,
		resolveModalPatientId, resolvePatientIdentity, buildPatientSelectionFlowState, runSafeCallback,
		runSafeAsyncCallback, callIfFunction, setFlowLoading, loadFlowExaminationForm,
		runAppointmentPatientFlow, selectAppointmentPatientFlow, selectPatientForModalFlow,
		openLinkedRelativePatientSearch
	});
})(window);
