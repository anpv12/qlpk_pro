import { moduleState } from './state.js';
import { activateMainPane, bindHistoryViewControls, canTransferCurrentAppointment, clearPatientSurface, getDocumentAttachments, initializePatientHistoryBridge, initializePatientSupportSections, isAppointmentAlreadyShown, loadAppointmentDetail, markPatientLoadFailed, openCurrentAppointmentTransfer, reloadCurrentAppointment, renderAppointmentsTable, renderPatientSurface, requestWorkspaceLeave, setLoadingState, setSelectedAppointment } from './queue-and-view-mode.js';

async function canLeaveCurrentAppointment(options) {
	if (options.skipUnsavedGuard || !moduleState.state.currentAppointmentId) return true;
	return requestWorkspaceLeave({ reason: 'patient-switch' });
}
function reportPatientCardLoadError(error, surfaceCleared, appointmentId, options) {
	if (!surfaceCleared) {
		moduleState.showCustomToast('warning', options.loadFailureMessage || 'Không thể nạp lượt khám lịch sử vào form.');
		return false;
	}
	return markPatientLoadFailed(error?.message || 'Không tải được chi tiết lịch hẹn', 'Không tải được chi tiết lịch hẹn', {
		appointmentId
	});
}

async function selectPatientCard(appointmentId, options = {}) {
	if (!appointmentId) return;
	const numericAppointmentId = Number(appointmentId);
	if (!Number.isFinite(numericAppointmentId)) return false;
	if (isAppointmentAlreadyShown(numericAppointmentId, options)) return true;
	if (!await canLeaveCurrentAppointment(options)) return false;
	const token = moduleState.state.loadToken + 1;
	moduleState.state.loadToken = token;
	setLoadingState(true);
	let surfaceCleared = false;

	try {
		const payload = options.payload || await loadAppointmentDetail(numericAppointmentId, token);
		if (!payload || token !== moduleState.state.loadToken) return false;
		moduleState.state.currentAppointmentId = numericAppointmentId;
		moduleState.state.loadFailed = false;
		moduleState.state.loadFailure = null;
		clearPatientSurface();
		surfaceCleared = true;
		setSelectedAppointment(appointmentId);
		const rendered = await renderPatientSurface(payload, token);
		if (!rendered || token !== moduleState.state.loadToken) return false;
		activateMainPane();
		return true;
	} catch (error) {
		if (token !== moduleState.state.loadToken) return false;
		return reportPatientCardLoadError(error, surfaceCleared, numericAppointmentId, options);
	} finally {
		if (token === moduleState.state.loadToken) setLoadingState(false);
	}
}
function createWaitingListAdapter() {
	if (moduleState.waitingListAdapter) return moduleState.waitingListAdapter;
	const waitingUi = moduleState.requireModule('examinationWaitingListUi');
	if (!waitingUi || typeof waitingUi.createWaitingListAdapter !== 'function') {
		return null;
	}
	moduleState.waitingListAdapter = waitingUi.createWaitingListAdapter({
		document: moduleState.DOM,
		context: moduleState.COMPONENT_CONTEXT,
		apiCall: moduleState.apiCall,
		statuses: ['doctor_queue'],
		loadAllPages: true,
		preserveServerOrder: true,
		roleQueryParam: 'doctor=true',
		defaultStatus: 'doctor_exam',
		getPerPage: () => moduleState.state.perPage,
		getAppointments: () => moduleState.state.appointments,
		getPatientSearchQuery: () => moduleState.state.patientSearchQuery,
		getCurrentPage: () => moduleState.state.currentPage,
		getSelectedAppointmentId: () => moduleState.state.currentAppointmentId,
		setAppointments: appointments => {
			moduleState.state.appointments = Array.isArray(appointments) ? appointments : [];
		},
		setCurrentPage: nextPage => {
			moduleState.state.currentPage = Number(nextPage) || 1;
		},
		setTotalPages: nextTotalPages => {
			moduleState.state.totalPages = Number(nextTotalPages) || 1;
		},
		formatDateDisplay: moduleState.formatDateDisplay,
		calculateAge: moduleState.SUPPORT_RUNTIME.calculateAge,
		variant: 'timeline',
		patientCodeLabel: '',
		showActions: false,
		includeAge: true,
		includeGender: true,
		includePhone: false,
		includeStatus: false,
		includePractitioner: false,
		showError: () => moduleState.showCustomToast('error', 'Lỗi khi tải danh sách chờ khám')
	});
	return moduleState.waitingListAdapter;
}
async function loadAppointments(status = 'doctor_exam', page = 1) {
	if (!await moduleState.ensureSession()) return null;
	const adapter = createWaitingListAdapter();
	if (!adapter) {
		moduleState.showCustomToast('error', 'Không thể tải danh sách chờ khám. Vui lòng tải lại trang.');
		return Promise.resolve(null);
	}
	return adapter.loadAppointments(status, page);
}
function validateDoctorComponents() {
	try {
		moduleState.REGISTRY.validateGraph?.();
		moduleState.COMPONENT_CONTEXT.validate([
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
		moduleState.showCustomToast('error', 'Màn khám chưa tải đầy đủ. Vui lòng tải lại trang.');
		return false;
	}
	return true;
}

function bindClinicalWorkspace() {
	const clinicalWorkspace = moduleState.getModule('clinicalWorkspace');
	if (!clinicalWorkspace || typeof clinicalWorkspace.bind !== 'function') return;
	clinicalWorkspace.bind({
		document: moduleState.DOM,
		context: moduleState.COMPONENT_CONTEXT,
		apiCall: moduleState.apiCall,
		getAppointmentId: () => moduleState.state.currentAppointmentId,
		isLoading: () => moduleState.state.isLoadingExaminationData,
		showToast: moduleState.showCustomToast,
		canTransfer: canTransferCurrentAppointment,
		onTransfer: openCurrentAppointmentTransfer,
		afterSave: () => {
			const draftRecovery = moduleState.getModule('draftRecovery');
			if (draftRecovery && typeof draftRecovery.rebaseAfterSave === 'function') {
				return draftRecovery.rebaseAfterSave();
			}
			return false;
		},
		afterComplete: () => {
			moduleState.state.currentAppointmentId = null;
			clearPatientSurface();
			loadAppointments('doctor_exam', moduleState.state.currentPage);
		}
	});
}

function bindSupportAndRecovery() {
	const supportModulesUi = moduleState.getModule('supportModulesUi');
	if (supportModulesUi && typeof supportModulesUi.bind === 'function') {
		supportModulesUi.bind({
			document: moduleState.DOM,
			context: moduleState.COMPONENT_CONTEXT,
			apiCall: moduleState.apiCall,
			getAppointmentId: () => moduleState.state.currentAppointmentId,
			getPatientId: () => moduleState.state.currentPatientId,
			isLoading: () => moduleState.state.isLoadingExaminationData,
			showToast: moduleState.showCustomToast
		});
	}
	const medicalHistoryBridge = moduleState.getModule('medicalHistoryBridge');
	if (medicalHistoryBridge && typeof medicalHistoryBridge.init === 'function') {
		medicalHistoryBridge.init();
	}
	const draftRecovery = moduleState.getModule('draftRecovery');
	if (draftRecovery && typeof draftRecovery.bind === 'function') {
		draftRecovery.bind({
			document: moduleState.DOM,
			context: moduleState.COMPONENT_CONTEXT,
			showToast: moduleState.showCustomToast,
			reloadContext: reloadCurrentAppointment
		});
	}
}

function initializeWaitingQueue() {
	if (!validateDoctorComponents()) return;
	['clinicalWorkspace', 'supportModulesUi', 'medicalHistoryBridge', 'draftRecovery', 'workspaceLeaveGuard', 'patientHistoryModal']
		.forEach(name => {
			const module = name === 'patientHistoryModal' ? moduleState.patientHistoryModal : moduleState.getModule(name);
			if (module) moduleState.COMPONENT_CONTEXT.mount(name, module);
		});
	const waitingUi = moduleState.requireModule('examinationWaitingListUi');
	const queueCardUi = moduleState.requireModule('waitingQueueCardUi');
	if (!waitingUi || !queueCardUi) {
		moduleState.showCustomToast('error', 'Không thể tải danh sách chờ khám. Vui lòng tải lại trang.');
		return;
	}
	createWaitingListAdapter();
	bindClinicalWorkspace();
	bindSupportAndRecovery();

	const workflowTwoPane = moduleState.requireModule('workflowTwoPane');
	if (workflowTwoPane && typeof workflowTwoPane.bind === 'function') {
		workflowTwoPane.bind({ document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT, defaultPane: 'main' });
	}

	initializePatientSupportSections();
	initializePatientHistoryBridge();
	bindHistoryViewControls();
	if (moduleState.patientHistoryModal) moduleState.COMPONENT_CONTEXT.mount('patientHistoryModal', moduleState.patientHistoryModal);

	waitingUi.bindPatientSearchInput({
		document: moduleState.DOM,
		context: moduleState.COMPONENT_CONTEXT,
		inputId: 'patientSearch',
		setPatientSearchQuery: nextQuery => {
			moduleState.state.patientSearchQuery = nextQuery || '';
		},
		renderAppointmentsTable: renderAppointmentsTable
	});

	loadAppointments();
}
function isCurrentAppointmentEvent(payload) {
	return !payload.appointment_id || Number(payload.appointment_id) === Number(moduleState.state.currentAppointmentId);
}
function isCurrentPatientEvent(payload) {
	const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;
	return Boolean(eventPatientId && moduleState.state.currentPatientId && eventPatientId === Number(moduleState.state.currentPatientId));
}
function syncRelativesFromRealtime(payload) {
	const relatives = moduleState.state.relativeTableInstance;
	if (!relatives) return;
	const handled = typeof relatives.applyPatientChanged === 'function' ? relatives.applyPatientChanged(payload) : false;
	if (!handled && payload.action !== 'family_member_updated' && typeof relatives.reload === 'function') relatives.reload();
}
function applyRealtimeEvent(plan, event) {
	const payload = event && event.payload ? event.payload : {};
	if (moduleState.ORDER_REALTIME_TYPES.includes(event.type)) {
		if (isCurrentAppointmentEvent(payload)) plan.refreshOrders = true;
		if (event.type !== 'realtime.resynced') return plan;
	}
	const attachments = getDocumentAttachments();
	if (typeof attachments?.handleRealtimeEvent === 'function' && attachments.handleRealtimeEvent(event, moduleState.state.currentPatientId)) return plan;
	if (event.type === 'patient.changed' && isCurrentPatientEvent(payload)) syncRelativesFromRealtime(payload);
	plan.refreshQueue = true;
	return plan;
}
function bindRealtimeRefresh() {
	const realtimeHooks = moduleState.requireModule('realtimePageHooks');
	if (!realtimeHooks || typeof realtimeHooks.register !== 'function') return;
	realtimeHooks.register({
		types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'document.changed', 'order.changed', 'survey.changed', 'realtime.resynced'],
		debounceMs: 500,
		batch: true,
		handler: events => {
			const plan = events.reduce((result, event) => applyRealtimeEvent(result, event), { refreshQueue: false, refreshOrders: false });
			if (plan.refreshQueue) loadAppointments('doctor_exam', 1);
			if (plan.refreshOrders) moduleState.getModule('supportModulesUi')?.refreshIndications?.({ document: moduleState.DOM });
		}
	});
}

export { applyRealtimeEvent, bindRealtimeRefresh, canLeaveCurrentAppointment, createWaitingListAdapter, initializeWaitingQueue, isCurrentAppointmentEvent, isCurrentPatientEvent, loadAppointments, selectPatientCard, syncRelativesFromRealtime };
