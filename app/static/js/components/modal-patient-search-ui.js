(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const resolveUi = (name, fallback) => REGISTRY?.get?.(name) || fallback;
	const getTabsUi = options => options?.tabsUi || resolveUi('modalFunctionTabsUi', window.ModalFunctionTabsUi);
	const getHistoryListUi = options => options?.historyListUi || resolveUi('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);

	function resolveElement(elementOrId) {
		if (!elementOrId) return null;
		return typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
	}

	function getBootstrapModalApi() {
		if (window.bootstrap && window.bootstrap.Modal) return window.bootstrap.Modal;
		if (typeof bootstrap !== 'undefined' && bootstrap.Modal) return bootstrap.Modal;
		return null;
	}

	function showBootstrapModal(modalOrId, options = {}) {
		const modalEl = resolveElement(modalOrId || 'patientSearchModal');
		if (!modalEl) {
			if (options.missingMessage) console.warn(options.missingMessage);
			return null;
		}
		const Modal = getBootstrapModalApi();
		if (!Modal) return null;
		const instance = Modal.getOrCreateInstance(modalEl);
		instance.show();
		return instance;
	}

	function hideBootstrapModal(modalOrId) {
		const modalEl = resolveElement(modalOrId || 'patientSearchModal');
		if (!modalEl) return null;
		const Modal = getBootstrapModalApi();
		if (!Modal) return null;
		const instance = Modal.getInstance(modalEl);
		if (instance) instance.hide();
		return instance;
	}

	function buildStateHtml(state) {
		const states = {
			error: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--search patient-search-modal__empty-state--error">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-exclamation-triangle patient-search-modal__empty-icon"></i>
                </span>
                <p class="patient-search-modal__empty-title">Lỗi tải danh sách bệnh nhân</p>
                <small class="patient-search-modal__empty-description">Vui lòng thử lại thao tác tìm kiếm</small>
            </div>
        `,
			emptySearch: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--search">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-search patient-search-modal__empty-icon"></i>
                </span>
                <p class="patient-search-modal__empty-title">Nhập tên hoặc mã hồ sơ để tìm kiếm bệnh nhân</p>
                <small class="patient-search-modal__empty-description">Kết quả tìm kiếm sẽ hiển thị tại đây</small>
            </div>
        `,
			noPatientHistory: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--history">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-person patient-search-modal__empty-icon--sm"></i>
                </span>
                <p class="patient-search-modal__empty-title">Vui lòng chọn bệnh nhân</p>
                <small class="patient-search-modal__empty-description">Lịch sử khám sẽ hiển thị theo hồ sơ đã chọn</small>
            </div>
        `
		};

		return states[state] || '';
	}

	function renderState(containerOrId, state) {
		const container = resolveElement(containerOrId);
		if (!container) return '';
		const html = buildStateHtml(state);
		container.innerHTML = html;
		return html;
	}

	function ensureHighlightStyles() {
		// CSS is owned by patient-search-modal.css; keep this function for legacy callers.
		return true;
	}

	function syncWindowState(options = {}) {
		if (options.exposeLegacyWindowState === false || typeof window === 'undefined') return options;
		window.modalSelectedPatient = options.selectedPatient;
		window.modalMedicalHistoryLoading = options.medicalHistoryLoading;
		window.modalMedicalHistoryData = options.medicalHistoryData;
		window.modalSelectedHistoryIndex = options.selectedHistoryIndex;
		return options;
	}

	function getDateFormatter(formatDateDisplay) {
		if (typeof formatDateDisplay === 'function') return formatDateDisplay;
		if (typeof window.formatDateDisplay === 'function') return window.formatDateDisplay;
		return value => value || '';
	}

	function getPatientSearchText(patient) {
		if (!patient) return '';
		return patient.patient_code || patient.full_name || '';
	}

	function resolvePresetSearch(options = {}) {
		const input = resolveElement(options.searchInput || 'modalPatientSearch');
		if (options.shouldPrefill && options.currentPatientData) {
			const query = getPatientSearchText(options.currentPatientData);
			if (input) input.value = query;
			return {
				query,
				prefillPatientId: options.currentPatientData.id || null
			};
		}

		return {
			query: input ? input.value.trim() : '',
			prefillPatientId: null
		};
	}

	function openSearchModalWithPreset(options = {}) {
		const modal = showBootstrapModal(options.modal || options.modalElement || 'patientSearchModal', {
			missingMessage: options.missingMessage
		});
		if (!modal) return null;
		if (typeof options.reset === 'function') options.reset();
		return {
			modal,
			presetSearch: resolvePresetSearch({
				searchInput: options.searchInput,
				shouldPrefill: options.shouldPrefill,
				currentPatientData: options.currentPatientData
			})
		};
	}

	function buildOpenSearchModalState(openResult) {
		if (!openResult || !openResult.presetSearch) return null;
		return {
			prefillPatientId: openResult.presetSearch.prefillPatientId,
			query: openResult.presetSearch.query || '',
			shouldPrefill: false
		};
	}

	function openSearchModalAndFetch(options = {}) {
		const openResult = openSearchModalWithPreset(options);
		const openState = buildOpenSearchModalState(openResult);
		if (!openState) return null;
		if (typeof options.setPrefillPatientId === 'function') {
			options.setPrefillPatientId(openState.prefillPatientId);
		}
		if (typeof options.fetchSearch === 'function') {
			options.fetchSearch(openState.query);
		}
		if (typeof options.setShouldPrefill === 'function') {
			options.setShouldPrefill(openState.shouldPrefill);
		}
		return openState;
	}

	function buildSearchParams(query = '', options = {}) {
		const params = new URLSearchParams();
		const normalizedQuery = String(query || '').trim();
		if (normalizedQuery) params.append('query', normalizedQuery);
		params.append('limit', String(options.limit || 50000));
		return params;
	}

	function buildSearchUrl(params) {
		const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
		return `/api/patients/modal-search?${searchParams.toString()}`;
	}

	function extractSearchPatients(payload) {
		return payload && Array.isArray(payload.patients) ? payload.patients : [];
	}

	function buildSearchSuccessState(payload) {
		return {
			searchResults: extractSearchPatients(payload)
		};
	}

	async function fetchSearchResults(options = {}) {
		try {
			const params = buildSearchParams(options.query, { limit: options.limit });
			const response = await options.apiCall(buildSearchUrl(params));
			if (!response.ok) {
				throw new Error(await response.text());
			}
			const data = await response.json();
			const searchSuccessState = buildSearchSuccessState(data);
			if (typeof options.onSuccess === 'function') {
				options.onSuccess(searchSuccessState, data);
			}
			return { status: 'success', data, searchSuccessState };
		} catch (error) {
			console.error(options.logMessage || 'Error fetching modal search results:', error);
			const searchErrorState = buildSearchErrorState();
			if (typeof options.onError === 'function') {
				options.onError(searchErrorState, error);
			}
			return { status: 'error', error, searchErrorState };
		}
	}

	async function fetchSearchResultsForFlow(options = {}) {
		return fetchSearchResults({
			query: options.query,
			limit: options.limit,
			apiCall: options.apiCall,
			onSuccess(searchSuccessState, data) {
				if (typeof options.isCurrent === 'function' && !options.isCurrent()) return;
				if (typeof options.setSearchResults === 'function') {
					options.setSearchResults(searchSuccessState.searchResults);
				}
				if (typeof options.renderResults === 'function') options.renderResults();
				if (typeof options.autoSelect === 'function') options.autoSelect(searchSuccessState, data);
			},
			onError(searchErrorState, error) {
				if (typeof options.isCurrent === 'function' && !options.isCurrent()) return;
				if (typeof options.setSearchResults === 'function') {
					options.setSearchResults(searchErrorState.searchResults);
				}
				if (typeof options.renderResults === 'function') options.renderResults(true);
				if (typeof options.showToast === 'function') {
					options.showToast('error', options.errorMessage || 'Không tải được danh sách bệnh nhân');
				}
				if (typeof options.onError === 'function') options.onError(searchErrorState, error);
			}
		});
	}

	function extractPatientPayload(payload) {
		return payload && payload.data ? payload.data : payload;
	}

	function buildPatientDetailUrl(patientId) {
		return `/api/patients/${patientId}`;
	}

	function buildLatestAppointmentUrl(patientId) {
		return `/api/appointments/?patient_id=${patientId}&per_page=1`;
	}

	function buildAppointmentDetailUrl(appointmentId) {
		return `/api/appointments/${appointmentId}`;
	}

	function buildAppointmentRelativesUrl(appointmentId) {
		return `/api/appointment-relatives/appointment/${appointmentId}`;
	}

	async function loadLatestAppointmentContextForPatient(patientId, options = {}) {
		let appointment = null;
		let appointmentId = null;
		let examination = null;

		try {
			const appointmentResponse = await options.apiCall(buildLatestAppointmentUrl(patientId));
			if (appointmentResponse && appointmentResponse.ok) {
				const appointmentData = await appointmentResponse.json();
				const appointmentState = buildLatestAppointmentState(
					extractLatestAppointment(appointmentData)
				);
				appointment = appointmentState.appointment;
				appointmentId = appointmentState.appointmentId;
				examination = appointmentState.examination;

				if (appointment && !examination) {
					try {
						const historyUi = getHistoryListUi(options);
						const examResponse = await options.apiCall(historyUi.buildExaminationIdUrl(appointment.id));
						if (examResponse && examResponse.ok) {
							const examData = await examResponse.json();
							const examinationId = historyUi.extractExaminationId(examData);
							if (examinationId) {
								const examDetailResponse = await options.apiCall(historyUi.buildExaminationDetailUrl(examinationId));
								if (examDetailResponse && examDetailResponse.ok) {
									examination = await examDetailResponse.json();
								}
							}
						}
					} catch (examError) {
						console.warn(options.examinationErrorMessage || 'Không thể lấy examination data:', examError);
					}
				}
			}
		} catch (appointmentError) {
			console.warn(options.appointmentErrorMessage || 'Không thể tìm appointment cho patient:', appointmentError);
		}

		return { appointment, appointmentId, examination };
	}

	async function loadCopiedPatientWithAppointmentContext(patient, appointmentContext = {}, options = {}) {
		const appointment = appointmentContext.appointment || null;
		const appointmentId = appointmentContext.appointmentId || null;
		const examination = appointmentContext.examination || null;

		if (typeof options.setCurrentAppointmentId === 'function') {
			options.setCurrentAppointmentId(appointmentId);
		}
		if (typeof options.loadPatient === 'function') {
			await options.loadPatient(patient, examination, appointment);
		}

		const appointmentPostLoadState = buildAppointmentPostLoadState(appointment, appointmentId);
		if (appointmentPostLoadState.hasAppointmentContext && typeof options.loadExaminationFormData === 'function') {
			await options.loadExaminationFormData(appointmentId);
		}

		if (appointmentPostLoadState.shouldShowHistoryButton) {
			if (typeof options.showHistoryButton === 'function') {
				options.showHistoryButton();
			} else {
				showHistoryButton();
			}
		}

		if (appointmentPostLoadState.hasAppointmentContext && typeof options.loadAppointmentServices === 'function') {
			try {
				await options.loadAppointmentServices();
			} catch (serviceError) {
				console.warn(options.serviceErrorMessage || 'Không thể tải danh sách dịch vụ cho lịch hẹn:', serviceError);
			}
		}

		if (appointmentPostLoadState.hasAppointmentContext && typeof options.loadPrescriptionData === 'function') {
			try {
				await options.loadPrescriptionData();
			} catch (prescriptionError) {
				console.warn(options.prescriptionErrorMessage || 'Không thể tải đơn thuốc cho lịch hẹn:', prescriptionError);
			}
		}

		if (typeof options.showToast === 'function') {
			options.showToast('success', options.successMessage || `Đã tải thông tin bệnh nhân: ${patient.full_name}`);
		}
		if (typeof options.lockForm === 'function') options.lockForm();

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

	function resolveAuthToken(options = {}) {
		if (typeof options.getToken === 'function') return options.getToken();
		if (typeof localStorage !== 'undefined') return localStorage.getItem('qlpk_token');
		if (window.localStorage) return window.localStorage.getItem('qlpk_token');
		return null;
	}

	function buildAuthHeaders(options = {}) {
		const token = resolveAuthToken(options);
		return token ? { 'Authorization': `Bearer ${token}` } : {};
	}

	function fetchAppointmentDetail(appointmentId, options = {}) {
		if (typeof options.apiCall !== 'function') return Promise.resolve(null);
		return options.apiCall(buildAppointmentDetailUrl(appointmentId))
			.then(response => response.ok ? response.json() : null);
	}

	function fetchAppointmentRelatives(appointmentId, options = {}) {
		const fetchImpl = options.fetch || (typeof fetch !== 'undefined' ? fetch : window.fetch);
		if (typeof fetchImpl !== 'function') return Promise.resolve({ data: [] });
		return fetchImpl(buildAppointmentRelativesUrl(appointmentId), {
			headers: buildAuthHeaders(options)
		}).then(response => response.ok ? response.json() : { data: [] });
	}

	function buildAppointmentHistoryFetchers(options = {}) {
		return {
			fetchAppointment(appointmentId) {
				return fetchAppointmentDetail(appointmentId, options);
			},
			fetchRelatives(appointmentId) {
				return fetchAppointmentRelatives(appointmentId, options);
			}
		};
	}

	function extractLatestAppointment(payload) {
		return payload && payload.appointments && payload.appointments.length > 0
			? payload.appointments[0]
			: null;
	}

	function buildLatestAppointmentState(appointment) {
		return {
			appointment: appointment || null,
			appointmentId: appointment ? appointment.id : null,
			examination: appointment && appointment.examination ? appointment.examination : null
		};
	}

	function buildAppointmentPatientFallback(appointment) {
		if (!appointment) return null;
		return {
			id: appointment.patient_id,
			full_name: appointment.patient_full_name,
			date_of_birth: appointment.patient_date_of_birth,
			phone: appointment.patient_phone,
			gender: appointment.patient_gender || ''
		};
	}

	async function loadPatientForAppointment(appointment, options = {}) {
		if (!appointment) return null;
		let patient = null;

		if (typeof options.apiCall === 'function' && appointment.patient_id) {
			try {
				const response = await options.apiCall(buildPatientDetailUrl(appointment.patient_id));
				if (response && response.ok) {
					const data = await response.json();
					patient = extractPatientPayload(data);
				} else {
					patient = buildAppointmentPatientFallback(appointment);
				}
			} catch (error) {
				console.error(options.errorMessage || 'Error loading patient data:', error);
				patient = buildAppointmentPatientFallback(appointment);
			}
		} else {
			patient = buildAppointmentPatientFallback(appointment);
		}

		return patient;
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

	function buildSearchErrorState() {
		return {
			searchResults: []
		};
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

	function createWorkflowModalSearchContext(options = {}) {
		const elements = options.elements || resolveWorkflowModalElements(options);
		const stateStore = options.stateStore || createModalSearchStateStore(options.initialState);
		let historyTabRenderers = null;

		const flow = createPatientSearchModalFlowAdapter({
			apiCall: options.apiCall,
			showToast: options.showToast,
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
			getHistoryTabRenderers: () => historyTabRenderers,
			getCurrentPatientData: options.getCurrentPatientData,
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			getFormatDateDisplay: options.getFormatDateDisplay,
			showPatientAction: options.showPatientAction,
			renderActiveTabLoading: options.renderActiveTabLoading,
			loadVitalSigns: options.loadVitalSigns,
			clearHistoryTabs: options.clearHistoryTabs,
			prepareFormForCopy: options.prepareFormForCopy,
			setLoadingState: options.setLoadingState,
			setCurrentAppointmentId: options.setCurrentAppointmentId,
			loadPatient: options.loadPatient,
			loadExaminationFormData: options.loadExaminationFormData,
			loadAppointmentServices: options.loadAppointmentServices,
			loadPrescriptionData: options.loadPrescriptionData,
			lockForm: options.lockForm,
			activeStatuses: options.activeStatuses,
			getHistoryDescription: options.getHistoryDescription,
			formatHistoryDate: options.formatHistoryDate,
			getExaminationStatusBadgeClass: options.getExaminationStatusBadgeClass,
			getExaminationStatusText: options.getExaminationStatusText,
			showCopyAction: options.showCopyAction,
			showDeleteAction: options.showDeleteAction,
			searchLimit: options.searchLimit,
			searchErrorMessage: options.searchErrorMessage,
			copySuccessMessage: options.copySuccessMessage,
			copyFallbackSuccessMessage: options.copyFallbackSuccessMessage,
			copyErrorLogMessage: options.copyErrorLogMessage,
			serviceErrorMessage: options.serviceErrorMessage,
			prescriptionErrorMessage: options.prescriptionErrorMessage,
			formErrorMessage: options.formErrorMessage,
			onAfterHistoryLoad: options.onAfterHistoryLoad
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

		const deleteFlow = historyListUi.createExaminationDeleteFlowAdapter({
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

	function buildPatientRowHtml({ patient, index, selectedPatient, formatDateDisplay, showPatientAction = true }) {
		const isActive = selectedPatient && selectedPatient.id === patient.id;
		const formatDate = getDateFormatter(formatDateDisplay);
		const dateColumnClass = showPatientAction ? 'col-2' : 'col-3';
		const phoneColumnClass = showPatientAction ? 'col-2' : 'col-3';
		const actionColumn = showPatientAction
			? `
            <div class="col-2 text-center">
				<button class="btn btn-sm patient-search-modal__patient-action" data-action="copy" data-index="${index}" title="Xem lại">
                    <i class="bi bi-eye"></i>
                </button>
            </div>`
			: '';

		return `
            <div class="row border-bottom py-2 align-items-center modal-patient-item${isActive ? ' modal-patient-item-active' : ''}"
             data-index="${index}">
            <div class="col-2 text-center patient-search-modal__patient-code">
                ${patient.patient_code || ''}
            </div>
			<div class="col-4 text-center patient-search-modal__patient-name">
				${patient.full_name || ''}
			</div>
			<div class="${dateColumnClass} text-center">
				${patient.date_of_birth ? formatDate(patient.date_of_birth) : ''}
			</div>
			<div class="${phoneColumnClass} text-center">
				${patient.phone || ''}
			</div>
			${actionColumn}
	        </div>
	    `;
	}

	function syncPatientActionColumn(containerOrId, showPatientAction) {
		const container = resolveElement(containerOrId || 'modalSearchResults');
		const headerCell = container
			?.closest('.patient-search-modal__results-card')
			?.querySelector('.patient-search-modal__table-head-row > :last-child');
		if (!headerCell) return null;
		headerCell.hidden = !showPatientAction;
		return headerCell;
	}

	function renderSearchResults(options = {}) {
		const container = resolveElement(options.container || 'modalSearchResults');
		if (!container) return '';
		const showPatientAction = options.showPatientAction !== false;
		syncPatientActionColumn(container, showPatientAction);

		if (options.isError) {
			return renderState(container, 'error');
		}

		const patients = Array.isArray(options.patients) ? options.patients : [];
		if (!patients.length) {
			return renderState(container, 'emptySearch');
		}

		const rows = patients.map((patient, index) => buildPatientRowHtml({
			patient,
			index,
			selectedPatient: options.selectedPatient,
			formatDateDisplay: options.formatDateDisplay,
			showPatientAction
		})).join('');
		container.innerHTML = rows;
		return rows;
	}

	function resolveAutoSelectIndex(options = {}) {
		const patients = Array.isArray(options.patients) ? options.patients : [];
		if (!patients.length) return -1;

		let targetIndex = -1;
		if (options.prefillPatientId) {
			targetIndex = patients.findIndex(patient => patient.id === options.prefillPatientId);
		}
		if (targetIndex < 0 && options.selectedPatient) {
			targetIndex = patients.findIndex(patient => patient.id === options.selectedPatient.id);
		}
		return targetIndex < 0 ? 0 : targetIndex;
	}

	function renderHistoryNoPatient(containerOrId = 'modalMedicalHistory') {
		return renderState(containerOrId, 'noPatientHistory');
	}

	function setSelectButtonEnabled(enabled, buttonOrId = 'selectPatientFromModal') {
		const button = resolveElement(buttonOrId);
		if (button) button.disabled = !enabled;
		return button;
	}

	function setActivePatientRow(index, options = {}) {
		const activeClass = options.activeClass || 'modal-patient-item-active';
		document.querySelectorAll(options.rowSelector || '.modal-patient-item').forEach(item => item.classList.remove(activeClass));
		const row = document.querySelector(`${options.rowSelector || '.modal-patient-item'}[data-index="${index}"]`);
		if (row) row.classList.add(activeClass);
		return row;
	}

	function selectAppointmentCard(appointmentId, options = {}) {
		const rowSelector = options.rowSelector || '.qlpk-waiting-card';
		const activeClass = options.activeClass || 'selected';
		const cards = Array.from(document.querySelectorAll(rowSelector));
		cards.forEach(card => {
			card.classList.remove(activeClass);
		});
		const selectedCard = cards.find(card => String(card.dataset.appointmentId || '') === String(appointmentId));
		if (selectedCard) selectedCard.classList.add(activeClass);
		return selectedCard;
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

	async function selectAppointmentPatientFlow(appointmentId, options = {}) {
		selectAppointmentCard(appointmentId, options.cardOptions || {});

		if (typeof options.setLoading === 'function') options.setLoading(true);
		if (typeof options.setSecondaryLoading === 'function') options.setSecondaryLoading(true);
		if (options.setAppointmentIdOnStart && typeof options.setCurrentAppointmentId === 'function') {
			options.setCurrentAppointmentId(appointmentId);
		}

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
				if (typeof options.onMissingAppointment === 'function') options.onMissingAppointment(appointmentId);
				return { status: 'missingAppointment', appointment: null };
			}

			if (typeof options.showHistoryButton === 'function') {
				options.showHistoryButton();
			} else {
				showHistoryButton();
			}

			if (!options.setAppointmentIdOnStart && typeof options.setCurrentAppointmentId === 'function') {
				options.setCurrentAppointmentId(appointmentId);
			}

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

			if (!shouldContinue()) return { status: 'stale', appointment, patient, examination };

			const loadContext = typeof options.getLoadContext === 'function'
				? options.getLoadContext(appointmentId, appointment)
				: undefined;

			if (patient && typeof options.loadPatient === 'function') {
				await options.loadPatient(patient, examination, appointment, loadContext);
			}

			if (!shouldContinue()) return { status: 'stale', appointment, patient, examination };

			if (typeof options.loadExaminationFormData === 'function') {
				try {
					await options.loadExaminationFormData(appointmentId, loadContext);
				} catch (error) {
					console.error(options.examinationFormErrorMessage || 'Error loading examination form data:', error);
					if (typeof options.clearExaminationFormOnError === 'function') {
						options.clearExaminationFormOnError();
					}
				}
			}
			if (typeof options.afterExaminationFormLoad === 'function') {
				options.afterExaminationFormLoad();
			}

			if (!shouldContinue()) return { status: 'stale', appointment, patient, examination };

			if (typeof options.unlockIfNeeded === 'function') options.unlockIfNeeded();

			await runSafeAsyncCallback(options.loadAppointmentServices, {
				message: options.serviceErrorMessage || 'Không thể tải danh sách dịch vụ cho lịch hẹn:'
			});

			if (!shouldContinue()) return { status: 'stale', appointment, patient, examination };

			await runSafeAsyncCallback(options.loadPrescriptionData, {
				message: options.prescriptionErrorMessage || 'Không thể tải đơn thuốc cho lịch hẹn:'
			});

			return { status: 'loaded', appointment, patient, examination };
		} finally {
			const shouldFinalize = typeof options.shouldFinalize === 'function'
				? options.shouldFinalize()
				: true;
			if (shouldFinalize) {
				if (typeof options.setLoading === 'function') options.setLoading(false);
				if (typeof options.setSecondaryLoading === 'function') options.setSecondaryLoading(false);
			}
		}
	}

	function applySelectedPatientUi(index, options = {}) {
		const row = setActivePatientRow(index, options);
		const button = setSelectButtonEnabled(true, options.selectButton || 'selectPatientFromModal');
		return { row, button };
	}

	function applyNoSearchResultsUi(options = {}) {
		const historyHtml = renderHistoryNoPatient(options.medicalHistory || 'modalMedicalHistory');
		const button = setSelectButtonEnabled(false, options.selectButton || 'selectPatientFromModal');
		return { historyHtml, button };
	}

	function applySinglePatientSearchUi(patient, options = {}) {
		const searchInput = resolveElement(options.searchInput || 'modalPatientSearch');
		if (searchInput) searchInput.value = getPatientSearchText(patient);
		const button = setSelectButtonEnabled(true, options.selectButton || 'selectPatientFromModal');
		return { searchInput, button };
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

	function showHistoryButton(buttonOrId = 'historyBtn') {
		const button = resolveElement(buttonOrId);
		if (!button) return null;
		button.removeAttribute('style');
		button.classList.add('patient-search-modal__history-button-visible');
		button.classList.remove('d-none', 'visually-hidden');
		return button;
	}

	function resetModalDom(options = {}) {
		setSelectButtonEnabled(false, options.selectButton || 'selectPatientFromModal');

		const searchInput = resolveElement(options.searchInput || 'modalPatientSearch');
		if (searchInput) searchInput.value = '';

		renderState(options.searchResults || 'modalSearchResults', 'emptySearch');
		renderHistoryNoPatient(options.medicalHistory || 'modalMedicalHistory');
	}

	function bindSearchInput(inputOrId, onSearch) {
		const input = resolveElement(inputOrId || 'modalPatientSearch');
		if (!input || typeof onSearch !== 'function') return null;

		input.addEventListener('input', event => {
			onSearch(input.value.trim(), event);
		});
		input.addEventListener('keypress', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				onSearch(input.value.trim(), event);
			}
		});
		return input;
	}

	function bindPatientResultsClick(containerOrId, options = {}) {
		const container = resolveElement(containerOrId || 'modalSearchResults');
		if (!container) return null;

		container.addEventListener('click', event => {
			const target = event.target;
			if (!target || typeof target.closest !== 'function') return;
			const row = target.closest(options.rowSelector || '.modal-patient-item');
			if (!row) return;
			const index = Number(row.dataset.index);
			if (Number.isNaN(index)) return;

			const actionEl = target.closest('[data-action]');
			const action = actionEl ? actionEl.getAttribute('data-action') : null;
			if (action === 'copy') {
				event.stopPropagation();
				if (typeof options.onCopy === 'function') options.onCopy(index, event);
				return;
			}
			if (typeof options.onSelect === 'function') options.onSelect(index, event);
		});
		return container;
	}

	function bindModalHidden(modalOrId, onHidden) {
		const modal = resolveElement(modalOrId || 'patientSearchModal');
		if (!modal || typeof onHidden !== 'function') return null;
		modal.addEventListener('hidden.bs.modal', event => onHidden(event));
		return modal;
	}

	function bindSelectButton(buttonOrId, onSelect) {
		const button = resolveElement(buttonOrId || 'selectPatientFromModal');
		if (!button || typeof onSelect !== 'function') return null;
		button.addEventListener('click', event => onSelect(event));
		return button;
	}

	function bindSelectPatientFromModalButton(buttonOrId, options = {}) {
		return bindSelectButton(buttonOrId, async event => {
			const selectedPatient = typeof options.getSelectedPatient === 'function'
				? options.getSelectedPatient()
				: null;
			if (!selectedPatient) return;

			if (typeof options.loadPatient === 'function') {
				await options.loadPatient(selectedPatient, event);
			}
			hideBootstrapModal(options.modal);

			const locked = typeof options.isFormLocked === 'function'
				? options.isFormLocked()
				: Boolean(options.isFormLocked);
			if (locked && typeof options.unlockForm === 'function') {
				options.unlockForm();
			}

			if (typeof options.showToast === 'function') {
				options.showToast('success', options.successMessage || 'Đã chọn bệnh nhân');
			}
		});
	}

	function bindOpenButtons(options = {}) {
		const bound = {};
		const searchButton = resolveElement(options.searchButton);
		if (searchButton && typeof options.onSearchOpen === 'function') {
			searchButton.addEventListener('click', event => options.onSearchOpen(event));
			bound.searchButton = searchButton;
		}

		const historyButton = resolveElement(options.historyButton);
		if (historyButton && typeof options.onHistoryOpen === 'function') {
			historyButton.addEventListener('click', event => options.onHistoryOpen(event));
			bound.historyButton = historyButton;
		}
		return bound;
	}

	function bindSearchModalOpenButtons(options = {}) {
		const setShouldPrefill = value => {
			if (typeof options.setShouldPrefill === 'function') options.setShouldPrefill(value);
		};
		const open = event => {
			if (typeof options.open === 'function') options.open(event);
		};
		return bindOpenButtons({
			searchButton: options.searchButton,
			historyButton: options.historyButton,
			onSearchOpen(event) {
				setShouldPrefill(false);
				open(event);
			},
			onHistoryOpen(event) {
				setShouldPrefill(true);
				open(event);
			}
		});
	}

	function bindPatientSearchModalFlowControls(options = {}) {
		const bound = {};
		bound.openButtons = bindSearchModalOpenButtons({
			searchButton: options.searchButton,
			historyButton: options.historyButton,
			setShouldPrefill: options.setShouldPrefill,
			open: options.open
		});

		bound.searchInput = bindSearchInput(options.searchInput, (query, event) => {
			if (typeof options.fetchSearch === 'function') options.fetchSearch(query, event);
		});
		bound.resultsClick = bindPatientResultsClick(options.resultsContainer, {
			onCopy: options.copyPatient,
			onSelect: options.selectPatient
		});

		const historyListUi = getHistoryListUi(options);
		if (historyListUi && typeof historyListUi.bindHistoryListActions === 'function') {
			bound.historyList = historyListUi.bindHistoryListActions(options.historyContainer, {
				onSelect: options.selectHistory,
				copyHistory: options.copyHistory,
				deleteHistory: options.deleteHistory,
				showToast: options.showToast
			});
		}

		bound.selectButton = bindSelectPatientFromModalButton(options.selectButton, {
			getSelectedPatient: options.getSelectedPatient,
			loadPatient: options.loadPatient,
			modal: options.modal,
			isFormLocked: options.isFormLocked,
			unlockForm: options.unlockForm,
			showToast: options.showToast
		});
		bound.hidden = bindModalHidden(options.modal, options.resetModal);

		const tabsUi = getTabsUi(options);
		if (tabsUi && typeof tabsUi.bindShownTabEvents === 'function') {
			bound.tabs = tabsUi.bindShownTabEvents(options.tabs, options.updateContent);
		}

		bound.relativeResolver = bindRelativeLinkResolver(options.openLinkedRelative);
		return bound;
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

	function bindRelativeLinkResolver(openLinkedRelative) {
		if (!window.RelativeLinkHandler || typeof window.RelativeLinkHandler.registerResolver !== 'function') {
			return false;
		}
		if (typeof openLinkedRelative !== 'function') return false;
		window.RelativeLinkHandler.registerResolver(patientId => openLinkedRelative(patientId));
		return true;
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
		resolveAuthToken,
		buildAuthHeaders,
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
