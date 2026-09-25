(function (window, document) {
	'use strict';

	const PAGE_RUNTIME = window.QLPKDoctorPageRuntime;
	if (!PAGE_RUNTIME) throw new Error('Thiếu Doctor page runtime');
	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const COMPONENT_CONFIG = REGISTRY.get('doctorComponentConfig') || {};
	const SUPPORT_RUNTIME = REGISTRY.get('supportRuntime');
	if (!SUPPORT_RUNTIME) throw new Error('Thiếu Doctor support runtime');
	const COMPONENT_CONTEXT_API = window.QLPKDoctorComponentContext;
	if (!COMPONENT_CONTEXT_API?.create) throw new Error('Thiếu Doctor component context');
	const {
		apiCall,
		ensureToken,
		formatDateDisplay,
		getAuthHeader,
		showCustomToast
	} = PAGE_RUNTIME;

	const state = {
		appointments: [],
		currentPage: 1,
		perPage: 50,
		totalPages: 1,
		patientSearchQuery: '',
		currentAppointmentId: null,
		currentPatientId: null,
		currentPatientData: null,
		currentAppointmentDate: null,
		loadToken: 0,
		isLoadingExaminationData: false,
		loadFailed: false,
		loadFailure: null,
		historyView: {
			active: false,
			sourceAppointmentId: null,
			sourceAppointmentDate: null
		},
		relativeTableInstance: null
	};
	const COMPONENT_CONTEXT = COMPONENT_CONTEXT_API.create({
		document,
		runtime: PAGE_RUNTIME,
		registry: REGISTRY,
		config: COMPONENT_CONFIG,
		stateObject: state
	});
	const DOM = COMPONENT_CONTEXT.document;
	COMPONENT_CONTEXT_API.setCurrent?.(COMPONENT_CONTEXT);
	const getModule = name => COMPONENT_CONTEXT.getModule(name);
	const requireModule = name => COMPONENT_CONTEXT.getModule(name, true);
	window.QLPKDoctorPageContext = COMPONENT_CONTEXT;
	let waitingListAdapter = null;
	let patientHistoryModal = null;

	function renderAppointmentsTable() {
		if (!waitingListAdapter) return [];
		return waitingListAdapter.renderAppointmentsTable();
	}

	function setSelectedAppointment(appointmentId) {
		DOM.querySelectorAll('.qlpk-waiting-card.is-selected').forEach(card => {
			card.classList.remove('is-selected');
		});
		const selectedCard = DOM.querySelector(`.qlpk-waiting-card[data-appointment-id="${appointmentId}"]`);
		if (selectedCard) selectedCard.classList.add('is-selected');

		const examSurface = DOM.getElementById('doctorExamSurface');
		if (examSurface) {
			examSurface.dataset.selectedAppointmentId = String(appointmentId);
		}
	}

	function setLoadingState(isLoading) {
		state.isLoadingExaminationData = Boolean(isLoading);
		getModule('clinicalWorkspace')?.syncTransferActionState?.({ document: DOM });
	}

	function canTransferCurrentAppointment() {
		return Boolean(state.currentAppointmentId && state.currentPatientData
			&& !state.isLoadingExaminationData && !state.loadFailed && !state.historyView.active);
	}

	function openCurrentAppointmentTransfer() {
		if (!canTransferCurrentAppointment()) return;
		const appointmentId = state.currentAppointmentId;
		const token = state.loadToken;
		const isCurrent = () => canTransferCurrentAppointment()
			&& state.currentAppointmentId === appointmentId && state.loadToken === token;
		requireModule('transferModal').open([appointmentId], 'doctor', () => {
			if (isCurrent()) {
				state.loadToken += 1;
				state.currentAppointmentId = null;
				clearPatientSurface();
			}
			loadAppointments('doctor_exam', state.currentPage);
		}, {
			isCurrent,
			beforeTransfer: async () => {
				if (!isCurrent()) return false;
				const result = await requireModule('clinicalWorkspace').saveWorkspace({ document: DOM, silent: true });
				if (result?.status !== 'success') {
					showCustomToast('error', 'Chưa lưu đủ dữ liệu khám. Vui lòng đóng cửa sổ chuyển khám, kiểm tra và lưu lại.');
					return false;
				}
				return isCurrent();
			}
		});
	}

	function isHistoryViewExemptControl(control) {
		return control.matches([
			'#doctorClinicalHistoryButton',
			'[data-doctor-history-view-exit]',
			'[data-doctor-section-target]',
			'[data-prescription-navigation]',
			'[data-prescription-history-action="toggle"]',
			'[data-prescription-history-action="close"]',
			'[data-prescription-history-action="select"]'
		].join(','));
	}

	function setHistoryViewMode(enabled, payload = {}) {
		const workspace = DOM.getElementById('doctorClinicalWorkspace');
		const label = DOM.getElementById('doctorHistoryViewLabel');
		const labelText = label?.querySelector('[data-doctor-history-view-label-text]');
		const exitButton = workspace?.querySelector('[data-doctor-history-view-exit]');
		if (!workspace) return;

		if (!enabled) {
			workspace.classList.remove('is-history-view');
			workspace.removeAttribute('data-history-view');
			workspace.removeAttribute('aria-readonly');
			if (label) label.hidden = true;
			if (exitButton) exitButton.hidden = true;
			workspace.querySelectorAll('[data-history-view-previous-disabled]').forEach(control => {
				control.disabled = control.dataset.historyViewPreviousDisabled === 'true';
				const previousAriaDisabled = control.dataset.historyViewPreviousAriaDisabled;
				if (previousAriaDisabled === '__missing__') control.removeAttribute('aria-disabled');
				else if (previousAriaDisabled != null) control.setAttribute('aria-disabled', previousAriaDisabled);
				delete control.dataset.historyViewPreviousDisabled;
				delete control.dataset.historyViewPreviousAriaDisabled;
			});
			return;
		}

		workspace.classList.add('is-history-view');
		workspace.dataset.historyView = 'true';
		workspace.setAttribute('aria-readonly', 'true');
		if (label) label.hidden = false;
		if (labelText) {
			const date = getAppointmentDateFromPayload(payload);
			labelText.textContent = date ? `Đang xem lịch sử · ${formatDateDisplay(date)}` : 'Đang xem lịch sử';
		}
		if (exitButton) exitButton.hidden = false;
		workspace.querySelectorAll('button, input, select, textarea, fieldset').forEach(control => {
			if (isHistoryViewExemptControl(control) || control.dataset.historyViewPreviousDisabled != null) return;
			control.dataset.historyViewPreviousDisabled = String(Boolean(control.disabled));
			control.dataset.historyViewPreviousAriaDisabled = control.hasAttribute('aria-disabled')
				? control.getAttribute('aria-disabled')
				: '__missing__';
			control.disabled = true;
			control.setAttribute('aria-disabled', 'true');
		});
	}

	function isLoadGroupSuccessful(value) {
		if (Array.isArray(value)) {
			return value.every(result => result
				&& result.status === 'fulfilled'
				&& result.value !== false);
		}
		return value !== false;
	}

	function setCurrentPatientId(value) {
		const patientId = value ? Number(value) : null;
		state.currentPatientId = Number.isFinite(patientId) && patientId > 0 ? patientId : null;
	}

	function setDoctorHistoryButtonAvailability(enabled) {
		const button = DOM.getElementById('doctorClinicalHistoryButton');
		if (!button) return;
		button.disabled = !enabled;
		button.setAttribute('aria-disabled', String(!enabled));
	}

	function getPatientIdFromPayload(payload = {}) {
		const patient = payload.patient_info || {};
		const patientId = patient.id;
		const numericPatientId = Number(patientId);
		return Number.isFinite(numericPatientId) && numericPatientId > 0 ? numericPatientId : null;
	}

	function getAppointmentDateFromPayload(payload = {}) {
		const appointment = payload.appointment || payload;
		return appointment.appointment_date || payload.appointment_date || null;
	}

	function getDocumentAttachments() {
		return getModule('documentAttachments');
	}

	function clearPatientSupportSections() {
		patientHistoryModal?.reset();
		setCurrentPatientId(null);
		state.currentPatientData = null;
		state.currentAppointmentDate = null;
		setDoctorHistoryButtonAvailability(false);
		const attachments = getDocumentAttachments();
		if (attachments && typeof attachments.clear === 'function') attachments.clear();

		const relativesTable = getModule('patientRelativesTable');
		if (relativesTable && typeof relativesTable.clear === 'function') {
			state.relativeTableInstance = relativesTable.clear(state.relativeTableInstance);
		}
	}

	function syncPatientSupportSections(payload = {}) {
		const patientId = getPatientIdFromPayload(payload);
		state.currentPatientData = payload.patient_info || null;
		state.currentAppointmentDate = getAppointmentDateFromPayload(payload);
		setCurrentPatientId(patientId);
		setDoctorHistoryButtonAvailability(Boolean(patientId));

		const attachments = getDocumentAttachments();
		if (attachments && typeof attachments.syncPatient === 'function') {
			attachments.syncPatient(state.currentPatientId, { appointmentDate: state.currentAppointmentDate });
		}
	}

	function initializePatientSupportSections() {
		const attachments = getDocumentAttachments();
		if (attachments && typeof attachments.initialize === 'function') {
			attachments.initialize({
				apiCall,
				getAuthHeader,
				showToast: showCustomToast,
				showConfirmationDialog: getModule('confirmationDialog')?.confirm,
				formatDateDisplay,
				getCurrentPatientId: () => state.currentPatientId,
				getRelativeTableInstance: () => state.relativeTableInstance,
				setRelativeTableInstance: value => { state.relativeTableInstance = value; }
			});
		}
	}

	function getDoctorHistoryStatusClass(status) {
		const statusMap = {
			WAITING_TRANSFER: 'is-waiting',
			DOCTOR_EXAM: 'is-examining',
			CONCLUSION: 'is-conclusion',
			WAITING_PAYMENT: 'is-payment',
			COMPLETED: 'is-completed'
		};
		return statusMap[String(status || '').toUpperCase()] || 'is-waiting';
	}

	function getDoctorHistoryStatusText(status) {
		const statusMap = {
			WAITING_TRANSFER: 'Chờ chuyển khám',
			DOCTOR_EXAM: 'Đang khám',
			PSYCHOLOGIST_EXAM: 'Tâm lý gia khám',
			CONCLUSION: 'Kết luận',
			WAITING_PAYMENT: 'Chờ thanh toán',
			COMPLETED: 'Hoàn thành'
		};
		return statusMap[String(status || '').toUpperCase()] || status || '';
	}

	function getHistoryAppointmentId(index) {
		const histories = patientHistoryModal?.getState?.()?.medicalHistoryData;
		const history = Array.isArray(histories) ? histories[Number(index)] : null;
		const appointmentId = Number(history?.appointment_id);
		return Number.isFinite(appointmentId) && appointmentId > 0 ? appointmentId : null;
	}

	async function selectHistoryResult(index) {
		const appointmentId = getHistoryAppointmentId(index);
		if (!appointmentId) {
			showCustomToast('warning', 'Không tìm thấy lượt khám lịch sử.');
			return false;
		}

		const loaded = await viewHistoryAppointment(appointmentId);
		if (!loaded) return false;

		patientHistoryModal?.close?.();
		return true;
	}

	function initializePatientHistoryBridge() {
		const historyBridge = requireModule('patientHistoryBridge');
		patientHistoryModal = historyBridge.create({
			document: DOM,
			context: COMPONENT_CONTEXT,
			apiCall,
			showToast: showCustomToast,
			formatDateDisplay,
			getCurrentPatientData: () => state.currentPatientData,
			getCurrentAppointmentId: () => state.currentAppointmentId,
			setCurrentPatientId,
			getAppointments: () => state.appointments,
			getSelectedAppointmentId: () => state.currentAppointmentId,
			selectPatientCard,
			getExaminationStatusBadgeClass: getDoctorHistoryStatusClass,
			getExaminationStatusText: getDoctorHistoryStatusText,
			copyHistory: selectHistoryResult,
			beforeOpen: () => Boolean(state.currentPatientId && !state.isLoadingExaminationData)
		});
		return patientHistoryModal;
	}

	function bindHistoryViewControls() {
		const exitButton = DOM.querySelector('[data-doctor-history-view-exit]');
		if (!exitButton || exitButton.dataset.historyViewBound === 'true') return;
		exitButton.addEventListener('click', () => {
			exitHistoryView().catch(() => {
				showCustomToast('error', 'Không thể quay lại lượt khám hiện tại.');
			});
		});
		exitButton.dataset.historyViewBound = 'true';
	}

	async function loadAppointmentDetail(appointmentId, token) {
		const response = await apiCall(`/api/appointments/${appointmentId}/edit`);
		if (!response || !response.ok) {
			throw new Error('appointment-detail-load-failed');
		}
		const payload = await response.json();
		if (token !== state.loadToken) return null;
		return payload;
	}

	function clearPatientSurface() {
		setHistoryViewMode(false);
		state.historyView = {
			active: false,
			sourceAppointmentId: null,
			sourceAppointmentDate: null
		};
		COMPONENT_CONTEXT.emit('patient:clearing', { appointmentId: state.currentAppointmentId });
		const draftRecovery = getModule('draftRecovery');
		if (draftRecovery && typeof draftRecovery.clearContext === 'function') {
			draftRecovery.clearContext({ document: DOM, context: COMPONENT_CONTEXT });
		}
		const examSurface = DOM.getElementById('doctorExamSurface');
		if (examSurface) {
			examSurface.classList.remove('has-selected-appointment');
			delete examSurface.dataset.selectedAppointmentId;
			delete examSurface.dataset.loadState;
		}

		clearPatientSupportSections();

		const clinicalWorkspace = getModule('clinicalWorkspace');
		if (clinicalWorkspace && typeof clinicalWorkspace.clear === 'function') {
			clinicalWorkspace.clear({ document: DOM, context: COMPONENT_CONTEXT });
		}
		const medicalHistoryBridge = getModule('medicalHistoryBridge');
		if (medicalHistoryBridge && typeof medicalHistoryBridge.clear === 'function') {
			medicalHistoryBridge.clear({ document: DOM, context: COMPONENT_CONTEXT });
		}
		const supportModulesUi = getModule('supportModulesUi');
		if (supportModulesUi && typeof supportModulesUi.clear === 'function') {
			supportModulesUi.clear({ document: DOM, context: COMPONENT_CONTEXT });
		}
		COMPONENT_CONTEXT.emit('patient:cleared', { appointmentId: state.currentAppointmentId });
	}

	async function renderPatientSurface(payload, loadToken, options = {}) {
		const examSurface = DOM.getElementById('doctorExamSurface');
		if (examSurface) {
			examSurface.classList.add('has-selected-appointment');
			if (!options.historyView && payload && payload.id) {
				examSurface.dataset.selectedAppointmentId = String(payload.id);
			}
		}

		const clinicalWorkspace = getModule('clinicalWorkspace');
		const medicalHistoryBridge = getModule('medicalHistoryBridge');
		const supportModulesUi = getModule('supportModulesUi');
		const draftRecovery = getModule('draftRecovery');
		if (!clinicalWorkspace || typeof clinicalWorkspace.render !== 'function') {
			throw new Error('missing-clinical-workspace-module');
		}

		clinicalWorkspace.render(payload, { document: DOM, context: COMPONENT_CONTEXT });
		const clinicalLoad = typeof clinicalWorkspace.whenInitialLoadSettled === 'function'
			? clinicalWorkspace.whenInitialLoadSettled()
			: Promise.resolve(true);
		let medicalHistoryLoad = Promise.resolve(true);
		if (medicalHistoryBridge && typeof medicalHistoryBridge.populate === 'function') {
			medicalHistoryLoad = medicalHistoryBridge.populate(payload).catch(() => false);
		}
		syncPatientSupportSections(payload);
		let supportLoad = Promise.resolve(true);
		if (supportModulesUi && typeof supportModulesUi.load === 'function') {
			supportLoad = supportModulesUi.load({
				document: DOM,
				context: COMPONENT_CONTEXT,
				payload,
				appointmentId: payload && payload.id ? payload.id : state.currentAppointmentId,
				patientId: getPatientIdFromPayload(payload)
			}).catch(() => false);
		}
		const loadLabels = ['Khám chi tiết', 'Tiền sử', 'Đơn thuốc, Dịch vụ và Chỉ định'];
		const loadResults = await Promise.allSettled([clinicalLoad, medicalHistoryLoad, supportLoad]);
		if (loadToken !== state.loadToken) return false;
		const failedLoads = loadResults
			.map((result, index) => ({ result, label: loadLabels[index] }))
			.filter(({ result }) => result.status !== 'fulfilled' || !isLoadGroupSuccessful(result.value));
		if (failedLoads.length) {
			const reason = `Chưa tải đủ dữ liệu: ${failedLoads.map(item => item.label).join(', ')}.`;
			state.loadFailed = true;
			state.loadFailure = reason;
			if (clinicalWorkspace && typeof clinicalWorkspace.setLoadFailed === 'function') {
				clinicalWorkspace.setLoadFailed(true, reason);
			}
			if (examSurface) examSurface.dataset.loadState = 'error';
			showCustomToast('error', `${reason} Chưa thể lưu ca khám; hãy tải lại ca để thử lại.`);
			COMPONENT_CONTEXT.emit('patient:load-failed', { appointmentId: state.currentAppointmentId, reason });
			return false;
		}
		state.loadFailed = false;
		state.loadFailure = null;
		if (clinicalWorkspace && typeof clinicalWorkspace.setLoadFailed === 'function') {
			clinicalWorkspace.setLoadFailed(false);
		}
		if (examSurface) delete examSurface.dataset.loadState;
		if (!options.historyView && draftRecovery && typeof draftRecovery.setContext === 'function') {
			await draftRecovery.setContext({
				document: DOM,
				context: COMPONENT_CONTEXT,
				appointmentId: payload && payload.id ? payload.id : state.currentAppointmentId,
				patientId: getPatientIdFromPayload(payload)
			});
		}
		COMPONENT_CONTEXT.emit('patient:loaded', {
			appointmentId: state.currentAppointmentId,
			patientId: state.currentPatientId,
			historyView: Boolean(options.historyView),
			payload
		});
		return loadToken === state.loadToken;
	}

	async function viewHistoryAppointment(appointmentId) {
		const currentAppointmentId = state.currentAppointmentId;
		if (!currentAppointmentId) {
			showCustomToast('warning', 'Chưa có lượt khám hiện tại để hiển thị lịch sử.');
			return false;
		}
		const canLeave = await requestWorkspaceLeave({ reason: 'history-view' });
		if (!canLeave) return false;

		const numericAppointmentId = Number(appointmentId);
		if (!Number.isFinite(numericAppointmentId) || numericAppointmentId <= 0) return false;
		const token = state.loadToken + 1;
		state.loadToken = token;
		setLoadingState(true);
		let surfaceCleared = false;

		try {
			const payload = await loadAppointmentDetail(numericAppointmentId, token);
			if (!payload || token !== state.loadToken) return false;
			clearPatientSurface();
			surfaceCleared = true;
			setSelectedAppointment(currentAppointmentId);
			const rendered = await renderPatientSurface(payload, token, { historyView: true });
			if (!rendered || token !== state.loadToken) return false;
			state.historyView = {
				active: true,
				sourceAppointmentId: numericAppointmentId,
				sourceAppointmentDate: getAppointmentDateFromPayload(payload)
			};
			setHistoryViewMode(true, payload);
			const workflowTwoPane = requireModule('workflowTwoPane');
			if (workflowTwoPane && typeof workflowTwoPane.activate === 'function') {
				workflowTwoPane.activate('main', { document: DOM, context: COMPONENT_CONTEXT });
			}
			return true;
		} catch (error) {
			if (token !== state.loadToken) return false;
			if (!surfaceCleared) {
				showCustomToast('warning', 'Không thể nạp lịch sử lên form khám.');
				return false;
			}
			state.loadFailed = true;
			state.loadFailure = error?.message || 'Không tải được lịch sử khám';
			const clinicalWorkspace = getModule('clinicalWorkspace');
			if (clinicalWorkspace && typeof clinicalWorkspace.setLoadFailed === 'function') {
				clinicalWorkspace.setLoadFailed(true, state.loadFailure);
			}
			const examSurface = DOM.getElementById('doctorExamSurface');
			if (examSurface) examSurface.dataset.loadState = 'error';
			showCustomToast('error', 'Không tải được lịch sử lên form khám.');
			COMPONENT_CONTEXT.emit('patient:load-failed', {
				appointmentId: currentAppointmentId,
				historyAppointmentId: numericAppointmentId,
				reason: state.loadFailure
			});
			return false;
		} finally {
			if (token === state.loadToken) setLoadingState(false);
		}
	}

	async function exitHistoryView() {
		if (!state.historyView.active || !state.currentAppointmentId) return true;
		return selectPatientCard(state.currentAppointmentId, {
			skipUnsavedGuard: true,
			reload: true
		});
	}

	async function reloadCurrentAppointment() {
		if (!state.currentAppointmentId) return true;
		return selectPatientCard(state.currentAppointmentId, {
			skipUnsavedGuard: true,
			reload: true
		});
	}

	async function requestWorkspaceLeave(options = {}) {
		const guard = getModule('workspaceLeaveGuard');
		if (!guard || typeof guard.requestLeave !== 'function') return true;
		return guard.requestLeave(options);
	}

	async function selectPatientCard(appointmentId, options = {}) {
		if (!appointmentId) return;
		const numericAppointmentId = Number(appointmentId);
		if (!Number.isFinite(numericAppointmentId)) return false;
		if (state.currentAppointmentId === numericAppointmentId && !options.reload && !state.loadFailed && !state.historyView.active) return true;
		if (!options.skipUnsavedGuard && state.currentAppointmentId) {
			const canLeave = await requestWorkspaceLeave({ reason: 'patient-switch' });
			if (!canLeave) return false;
		}
		const token = state.loadToken + 1;
		state.loadToken = token;
		setLoadingState(true);
		let surfaceCleared = false;

		try {
			const payload = options.payload || await loadAppointmentDetail(numericAppointmentId, token);
			if (!payload || token !== state.loadToken) return false;
			state.currentAppointmentId = numericAppointmentId;
			state.loadFailed = false;
			state.loadFailure = null;
			clearPatientSurface();
			surfaceCleared = true;
			setSelectedAppointment(appointmentId);
			const rendered = await renderPatientSurface(payload, token);
			if (!rendered || token !== state.loadToken) return false;
			const workflowTwoPane = requireModule('workflowTwoPane');
			if (workflowTwoPane && typeof workflowTwoPane.activate === 'function') {
				workflowTwoPane.activate('main', { document: DOM, context: COMPONENT_CONTEXT });
			}
			return true;
		} catch (error) {
			if (token !== state.loadToken) return false;
			if (!surfaceCleared) {
				showCustomToast('warning', options.loadFailureMessage || 'Không thể nạp lượt khám lịch sử vào form.');
				return false;
			}
			state.loadFailed = true;
			state.loadFailure = error?.message || 'Không tải được chi tiết lịch hẹn';
			const clinicalWorkspace = getModule('clinicalWorkspace');
			if (clinicalWorkspace && typeof clinicalWorkspace.setLoadFailed === 'function') {
				clinicalWorkspace.setLoadFailed(true, state.loadFailure);
			}
			const examSurface = DOM.getElementById('doctorExamSurface');
			if (examSurface) examSurface.dataset.loadState = 'error';
			showCustomToast('error', 'Không tải được chi tiết lịch hẹn');
			COMPONENT_CONTEXT.emit('patient:load-failed', {
				appointmentId: numericAppointmentId,
				reason: state.loadFailure
			});
			return false;
		} finally {
			if (token === state.loadToken) setLoadingState(false);
		}
	}

	function createWaitingListAdapter() {
		if (waitingListAdapter) return waitingListAdapter;
		const waitingUi = requireModule('examinationWaitingListUi');
		if (!waitingUi || typeof waitingUi.createWaitingListAdapter !== 'function') {
			return null;
		}
		waitingListAdapter = waitingUi.createWaitingListAdapter({
			document: DOM,
			context: COMPONENT_CONTEXT,
			apiCall,
			statuses: ['doctor_queue'],
			loadAllPages: true,
			preserveServerOrder: true,
			roleQueryParam: 'doctor=true',
			defaultStatus: 'doctor_exam',
			getPerPage: () => state.perPage,
			getAppointments: () => state.appointments,
			getPatientSearchQuery: () => state.patientSearchQuery,
			getCurrentPage: () => state.currentPage,
			getSelectedAppointmentId: () => state.currentAppointmentId,
			setAppointments: appointments => {
				state.appointments = Array.isArray(appointments) ? appointments : [];
			},
			setCurrentPage: nextPage => {
				state.currentPage = Number(nextPage) || 1;
			},
			setTotalPages: nextTotalPages => {
				state.totalPages = Number(nextTotalPages) || 1;
			},
			formatDateDisplay,
			calculateAge: SUPPORT_RUNTIME.calculateAge,
			variant: 'timeline',
			patientCodeLabel: '',
			showActions: false,
			includeAge: true,
			includeGender: true,
			includePhone: false,
			includeStatus: false,
			includePractitioner: false,
			showError: () => showCustomToast('error', 'Lỗi khi tải danh sách chờ khám')
		});
		return waitingListAdapter;
	}

	function loadAppointments(status = 'doctor_exam', page = 1) {
		if (!ensureToken()) return Promise.resolve(null);
		const adapter = createWaitingListAdapter();
		if (!adapter) {
			showCustomToast('error', 'Không thể tải danh sách chờ khám. Vui lòng tải lại trang.');
			return Promise.resolve(null);
		}
		return adapter.loadAppointments(status, page);
	}

	function initializeWaitingQueue() {
		try {
			REGISTRY.validateGraph?.();
			COMPONENT_CONTEXT.validate([
				'supportRuntime',
				'clinicalWorkspace',
				'supportModulesUi',
				'medicalHistoryBridge',
				'draftRecovery',
				'workspaceLeaveGuard',
				'patientModalContract',
				'patientHistoryBridge',
				'modalPatientSearchUi',
				'modalFunctionTabsUi',
				'modalMedicalHistoryListUi',
				'modalHistoryDataRuntime',
				'modalHistoryPrintController',
				'patientRelativesTable',
				'confirmationDialog',
				'prescriptionModalPreview',
				'prescriptionDocumentTemplate',
				'examinationWaitingListUi',
				'waitingQueueCardUi',
				'workflowTwoPane',
				'realtimePageHooks'
			]);
		} catch (error) {
			console.error('[Doctor] Component contract validation failed:', error);
			showCustomToast('error', 'Màn khám chưa tải đầy đủ. Vui lòng tải lại trang.');
			return;
		}
		['clinicalWorkspace', 'supportModulesUi', 'medicalHistoryBridge', 'draftRecovery', 'workspaceLeaveGuard', 'patientHistoryModal']
			.forEach(name => {
				const module = name === 'patientHistoryModal' ? patientHistoryModal : getModule(name);
				if (module) COMPONENT_CONTEXT.mount(name, module);
			});
		const waitingUi = requireModule('examinationWaitingListUi');
		const queueCardUi = requireModule('waitingQueueCardUi');
		if (!waitingUi || !queueCardUi) {
			showCustomToast('error', 'Không thể tải danh sách chờ khám. Vui lòng tải lại trang.');
			return;
		}
		createWaitingListAdapter();
		const clinicalWorkspace = getModule('clinicalWorkspace');
		if (clinicalWorkspace && typeof clinicalWorkspace.bind === 'function') {
			clinicalWorkspace.bind({
				document: DOM,
				context: COMPONENT_CONTEXT,
				apiCall,
				getAppointmentId: () => state.currentAppointmentId,
				isLoading: () => state.isLoadingExaminationData,
				showToast: showCustomToast,
				canTransfer: canTransferCurrentAppointment,
				onTransfer: openCurrentAppointmentTransfer,
				afterSave: () => {
					const draftRecovery = getModule('draftRecovery');
					if (draftRecovery && typeof draftRecovery.rebaseAfterSave === 'function') {
						return draftRecovery.rebaseAfterSave();
					}
					return false;
				},
				afterComplete: () => {
					state.currentAppointmentId = null;
					clearPatientSurface();
					loadAppointments('doctor_exam', state.currentPage);
				}
			});
		}
		const supportModulesUi = getModule('supportModulesUi');
		if (supportModulesUi && typeof supportModulesUi.bind === 'function') {
			supportModulesUi.bind({
				document: DOM,
				context: COMPONENT_CONTEXT,
				apiCall,
				getAppointmentId: () => state.currentAppointmentId,
				getPatientId: () => state.currentPatientId,
				isLoading: () => state.isLoadingExaminationData,
				showToast: showCustomToast
			});
		}
		const medicalHistoryBridge = getModule('medicalHistoryBridge');
		if (medicalHistoryBridge && typeof medicalHistoryBridge.init === 'function') {
			medicalHistoryBridge.init();
		}
		const draftRecovery = getModule('draftRecovery');
		if (draftRecovery && typeof draftRecovery.bind === 'function') {
			draftRecovery.bind({
				document: DOM,
				context: COMPONENT_CONTEXT,
				showToast: showCustomToast,
				reloadContext: reloadCurrentAppointment
			});
		}

		const workflowTwoPane = requireModule('workflowTwoPane');
		if (workflowTwoPane && typeof workflowTwoPane.bind === 'function') {
			workflowTwoPane.bind({ document: DOM, context: COMPONENT_CONTEXT, defaultPane: 'main' });
		}

		initializePatientSupportSections();
		initializePatientHistoryBridge();
		bindHistoryViewControls();
		if (patientHistoryModal) COMPONENT_CONTEXT.mount('patientHistoryModal', patientHistoryModal);

		waitingUi.bindPatientSearchInput({
			document: DOM,
			context: COMPONENT_CONTEXT,
			inputId: 'patientSearch',
			setPatientSearchQuery: nextQuery => {
				state.patientSearchQuery = nextQuery || '';
			},
			renderAppointmentsTable
		});

		loadAppointments();
	}

	function bindRealtimeRefresh() {
		const realtimeHooks = requireModule('realtimePageHooks');
		if (!realtimeHooks || typeof realtimeHooks.register !== 'function') return;
		realtimeHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'document.changed', 'order.changed', 'survey.changed', 'realtime.resynced'],
			debounceMs: 500,
			batch: true,
			handler: events => {
				let refreshQueue = false;
				let refreshOrders = false;
				for (const event of events) {
					const payload = event && event.payload ? event.payload : {};
					if (['order.changed', 'survey.changed', 'realtime.resynced'].includes(event.type)) {
						if (!payload.appointment_id || Number(payload.appointment_id) === Number(state.currentAppointmentId)) refreshOrders = true;
						if (event.type !== 'realtime.resynced') continue;
					}
					const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;
					const attachments = getDocumentAttachments();
					if (attachments && typeof attachments.handleRealtimeEvent === 'function'
						&& attachments.handleRealtimeEvent(event, state.currentPatientId)) {
						continue;
					}
					if (event.type === 'patient.changed' && eventPatientId && state.currentPatientId && eventPatientId === Number(state.currentPatientId) && state.relativeTableInstance) {
						const handledRelativeUpdate = typeof state.relativeTableInstance.applyPatientChanged === 'function'
							? state.relativeTableInstance.applyPatientChanged(payload)
							: false;
						if (!handledRelativeUpdate && payload.action !== 'family_member_updated' && typeof state.relativeTableInstance.reload === 'function') {
							state.relativeTableInstance.reload();
						}
					}
					refreshQueue = true;
				}
				if (refreshQueue) loadAppointments('doctor_exam', 1);
				if (refreshOrders) getModule('supportModulesUi')?.refreshIndications?.({ document: DOM });
			}
		});
	}

	DOM.addEventListener('DOMContentLoaded', () => {
		initializeWaitingQueue();
		const leaveGuard = getModule('workspaceLeaveGuard');
		if (leaveGuard && typeof leaveGuard.initialize === 'function') {
			leaveGuard.initialize({
				showToast: showCustomToast,
				reloadCurrentAppointment
			});
		}
		bindRealtimeRefresh();
	});
	DOM.defaultView?.addEventListener('pagehide', () => {
		COMPONENT_CONTEXT.listMounted().slice().reverse().forEach(name => COMPONENT_CONTEXT.unmount(name));
		COMPONENT_CONTEXT_API.clearCurrent?.(COMPONENT_CONTEXT);
	});

	window.QLPKCurrentAppointment = {
		getId: () => state.currentAppointmentId,
		getPatientId: () => state.currentPatientId,
		isLoading: () => state.isLoadingExaminationData,
		apiCall
	};
	window.QLPKDoctorPage = Object.freeze({
		context: COMPONENT_CONTEXT,
		state: COMPONENT_CONTEXT.state,
		getState: () => state,
		selectPatientCard,
		exitHistoryView,
		loadAppointments,
		reloadCurrentAppointment,
		requestWorkspaceLeave
	});
	window.selectPatientCard = selectPatientCard;
	window.loadAppointments = loadAppointments;
})(window, document);
