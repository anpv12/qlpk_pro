import { mountJointExamPage } from './components/joint-exam-page-bootstrap.js';
import { QLPKDoctorPageRuntime } from './doctor-examination/page-runtime.js';
import { moduleState } from './doctor-examination-parts/state.js';
import { bindRealtimeRefresh, initializeWaitingQueue } from './doctor-examination-parts/patient-load-and-init.js';
import { reloadCurrentAppointment } from './doctor-examination-parts/queue-and-view-mode.js';
import { QLPKDoctorComponentContext } from './doctor-examination/component-context.js';

moduleState.PAGE_RUNTIME = QLPKDoctorPageRuntime;
if (!moduleState.PAGE_RUNTIME) throw new Error('Thiếu Doctor page runtime');
moduleState.REGISTRY = window.QLPKDoctorModuleRegistry;
if (!moduleState.REGISTRY) throw new Error('Thiếu Doctor module registry');
moduleState.COMPONENT_CONFIG = moduleState.REGISTRY.require('doctorComponentConfig');
moduleState.SUPPORT_RUNTIME = moduleState.REGISTRY.get('supportRuntime');
if (!moduleState.SUPPORT_RUNTIME) throw new Error('Thiếu Doctor support runtime');
moduleState.COMPONENT_CONTEXT_API = QLPKDoctorComponentContext;
if (!moduleState.COMPONENT_CONTEXT_API?.create) throw new Error('Thiếu Doctor component context');
({ apiCall: moduleState.apiCall, ensureSession: moduleState.ensureSession, formatDateDisplay: moduleState.formatDateDisplay, getAuthHeader: moduleState.getAuthHeader, showCustomToast: moduleState.showCustomToast } = moduleState.PAGE_RUNTIME);

moduleState.state = {
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
moduleState.COMPONENT_CONTEXT = moduleState.COMPONENT_CONTEXT_API.create({
	document,
	runtime: moduleState.PAGE_RUNTIME,
	registry: moduleState.REGISTRY,
	config: moduleState.COMPONENT_CONFIG,
	stateObject: moduleState.state
});
moduleState.DOM = moduleState.COMPONENT_CONTEXT.document;
moduleState.COMPONENT_CONTEXT_API.setCurrent?.(moduleState.COMPONENT_CONTEXT);
moduleState.getModule = name => moduleState.COMPONENT_CONTEXT.getModule(name);
moduleState.requireModule = name => moduleState.COMPONENT_CONTEXT.getModule(name, true);
moduleState.waitingListAdapter = null;
moduleState.patientHistoryModal = null;

moduleState.ORDER_REALTIME_TYPES = ['order.changed', 'survey.changed', 'realtime.resynced'];

mountJointExamPage({
	getAppointmentId: () => moduleState.state.currentAppointmentId,
	getContextToken: () => moduleState.state.loadToken
});
moduleState.DOM.addEventListener('DOMContentLoaded', async () => {
	if (!await moduleState.ensureSession()) return;
	initializeWaitingQueue();
	const leaveGuard = moduleState.getModule('workspaceLeaveGuard');
	if (leaveGuard && typeof leaveGuard.initialize === 'function') {
		leaveGuard.initialize({
			showToast: moduleState.showCustomToast,
			reloadCurrentAppointment: reloadCurrentAppointment
		});
	}
	bindRealtimeRefresh();
});
moduleState.DOM.defaultView?.addEventListener('pagehide', () => {
	moduleState.COMPONENT_CONTEXT.listMounted().slice().reverse().forEach(name => moduleState.COMPONENT_CONTEXT.unmount(name));
	moduleState.COMPONENT_CONTEXT_API.clearCurrent?.(moduleState.COMPONENT_CONTEXT);
});

