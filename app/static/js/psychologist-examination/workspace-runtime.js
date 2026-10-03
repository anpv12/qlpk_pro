import { QLPKDoctorPageRuntime } from '../doctor-examination/page-runtime.js';
import { PsychologistWorkspaceUi } from './workspace-ui.js';
import { QLPKPsychologistComponentConfig } from '../components/psychologist-component-config.js';
import { QLPKPatientIntakeForm } from '../components/patient-intake-form.js';
import { state } from './page-state.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

const REGISTRY = QLPKDoctorModuleRegistry;
const PAGE_RUNTIME = QLPKDoctorPageRuntime;
if (!REGISTRY || !PAGE_RUNTIME) throw new Error('Thiếu runtime dùng chung cho màn Tâm lý gia');

const config = QLPKPsychologistComponentConfig || {};
// Page callbacks set by bind({ page }): setLoading, setCurrentPatient, setCurrentPatientId,
// setCurrentAppointmentId, baseSave, openHistory.
let pageHooks = {};

let patientIntake = null;
let clinicalForm = null;
let servicesForm = null;
let indicationsForm = null;
let historyComponent = null;

function apiCall(url, options = {}) {
	return PAGE_RUNTIME.apiCall(url, options);
}

function showToast(type, message) {
	return PAGE_RUNTIME.showCustomToast(type, message);
}

function setLoading(value) {
	state.isLoadingExaminationData = Boolean(value);
	pageHooks.setLoading?.(state.isLoadingExaminationData);
}

function setCurrentPatient(patient) {
	state.currentPatientData = patient || null;
	state.currentPatientId = patient?.id ? Number(patient.id) : null;
	pageHooks.setCurrentPatient?.(state.currentPatientData);
	pageHooks.setCurrentPatientId?.(state.currentPatientId);
}

function setCurrentAppointment(appointmentId) {
	state.currentAppointmentId = appointmentId ? Number(appointmentId) : null;
	pageHooks.setCurrentAppointmentId?.(state.currentAppointmentId);
}

function getHistoryComponent() {
	return REGISTRY.get('medicalHistoryForm')?.getActive?.() || historyComponent;
}

function getClinicalFields() {
	return (config.clinicalFields || []).map(field => ({
		section: field.section,
		field: field.field,
		controlId: field.id
	}));
}

function createComponents() {
	if (patientIntake && clinicalForm && servicesForm && indicationsForm) return true;

	patientIntake = createPatientIntake();
	clinicalForm = createClinicalForm();

	const servicesFactory = REGISTRY.get('servicesForm');
	const indicationsFactory = REGISTRY.get('indicationsForm');
	if (!servicesFactory?.create || !indicationsFactory?.create) {
		throw new Error('Thiếu component Dịch vụ hoặc Chỉ định dùng chung');
	}
	servicesForm = servicesFactory.create({ config: config.services || {} });
	indicationsForm = indicationsFactory.create({ config: config.indications || {} });
	historyComponent = getHistoryComponent();
	if (!historyComponent) throw new Error('Thiếu component Tiền sử dùng chung');
	historyComponent.init?.();
	return true;
}

function createPatientIntake() {
	const intakeFactory = QLPKPatientIntakeForm;
	if (!intakeFactory?.create) throw new Error('Thiếu component Hành chính dùng chung');
	const intake = config.intake || {};
	return intakeFactory.create({
		config: {
			...intake,
			patient: { ...(intake.patient || {}) },
			visit: { ...(intake.visit || {}) }
		}
	});
}

function textOfValue(value) {
	return value == null ? '' : String(value).trim();
}

function createClinicalForm() {
	const clinicalFactory = REGISTRY.get('clinicalExaminationForm');
	if (!clinicalFactory?.create) throw new Error('Thiếu component Khám dùng chung');
	return clinicalFactory.create({
		config: {
			rootId: config.clinical?.rootId || 'psychologistClinicalDecisionPanel',
			mainFields: {},
			detailFields: getClinicalFields()
		},
		getDocument: options => options?.document || document,
		getElement: (doc, id) => doc.getElementById(id),
		getValue: (doc, id) => String(doc.getElementById(id)?.value || '').trim(),
		setValue: (doc, id, value) => {
			const element = doc.getElementById(id);
			if (element) element.value = value == null ? '' : String(value);
		},
		textOf: textOfValue,
		hasValue: value => value !== undefined && value !== null && String(value).trim() !== '',
		isLoading: () => state.isLoadingExaminationData,
		apiCall
	});
}

function configureSupportRuntime() {
	const runtime = REGISTRY.get('supportRuntime');
	runtime?.configure?.({
		apiCall,
		showToast,
		getAppointmentId: () => state.currentAppointmentId,
		getPatientId: () => state.currentPatientId
	});
}

function clear(options = {}) {
	state.contextToken += 1;
	state.payload = null;
	state.loadFailed = false;
	setCurrentAppointment(null);
	setCurrentPatient(null);
	createComponents();
	const context = { document: options.document || document };
	try { historyComponent?.clear?.(); } catch (error) { console.warn('[Psychologist] clear history failed', error); }
	clinicalForm?.clear?.(context);
	patientIntake?.clear?.(context);
	servicesForm?.clear?.(context);
	indicationsForm?.clear?.(context);
	return true;
}

async function populateWorkspace(payload, doc, appointmentId) {
	const context = { document: doc, payload, appointmentId, patientId: state.currentPatientId };
	const loaders = [
		() => patientIntake.populate(payload, { document: doc }),
		() => clinicalForm.render(payload, { document: doc }),
		() => historyComponent.populate(historyComponent.config?.normalizePayload
			? historyComponent.config.normalizePayload(payload) : payload),
		() => servicesForm.load(context),
		() => indicationsForm.load(context)
	];
	const results = await Promise.allSettled(loaders.map(load => Promise.resolve().then(load)));
	const failure = results.find(result => result.status === 'rejected' || result.value === false);
	if (failure) throw failure.reason || new Error('workspace-load-incomplete');
}

async function loadAppointment(appointmentId, options = {}) {
	const numericAppointmentId = Number(appointmentId);
	if (!Number.isFinite(numericAppointmentId) || numericAppointmentId <= 0) return { status: 'missingAppointment' };
	const doc = options.document || document;

	state.contextToken += 1;
	setLoading(true);
	clear({ document: doc });
	// clear() increments the token deliberately; use a fresh token after reset.
	const loadToken = state.contextToken;
	setCurrentAppointment(numericAppointmentId);
	try {
		const response = await apiCall(`/api/appointments/${numericAppointmentId}/edit`);
		if (!response?.ok) throw new Error('appointment-load-failed');
		const payload = await response.json();
		if (loadToken !== state.contextToken) return { status: 'stale' };

		prepareLoadedAppointment(payload, numericAppointmentId, doc);

		await populateWorkspace(payload, doc, numericAppointmentId);
		if (loadToken !== state.contextToken) return { status: 'stale' };
		setLoading(false);
		PsychologistWorkspaceUi?.showWorkspace?.({
			document: doc,
			patient: state.currentPatientData,
			appointmentId: numericAppointmentId
		});
		return { status: 'loaded', payload };
	} catch (error) {
		if (loadToken !== state.contextToken) return { status: 'stale' };
		return failAppointmentLoad(error);
	}
}

function prepareLoadedAppointment(payload, appointmentId, doc) {
	state.payload = payload;
	setCurrentPatient(payload.patient_info || payload.patient || null);
	setCurrentAppointment(appointmentId);
	createComponents();
	configureSupportRuntime();
	bindWorkspaceComponents(doc);
}

function bindWorkspaceComponents(doc) {
	const isLoading = () => state.isLoadingExaminationData;
	patientIntake.bind({ document: doc, apiCall });
	clinicalForm.bind({ document: doc, isLoading });
	servicesForm.bind({ document: doc, apiCall, isLoading });
	indicationsForm.bind({ document: doc, apiCall, isLoading });
}

function failAppointmentLoad(error) {
	state.loadFailed = true;
	setLoading(false);
	showToast('error', 'Không thể tải đầy đủ dữ liệu lượt khám. Vui lòng thử lại.');
	console.error('[Psychologist] workspace load failed:', error);
	return { status: 'error', error };
}

async function saveHistory() {
	const history = getHistoryComponent();
	if (!history?.hasPendingChanges?.()) return { status: 'skipped', module: 'history' };
	const revision = history.getSaveRevision?.();
	const contextToken = state.contextToken;
	const response = await apiCall(`/api/appointments/${state.currentAppointmentId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(history.getSavePayload?.() || {})
	});
	if (!response?.ok) throw new Error('history-save-failed');
	if (contextToken !== state.contextToken) throw new Error('history-save-stale');
	if (revision !== history.getSaveRevision?.()) throw new Error('history-save-new-changes');
	history.markSaved?.(revision);
	return { status: 'success', module: 'history' };
}

function isSuccessfulSave(result) {
	return ['saved', 'success'].includes(result?.status) && !result.skipped && !result.hasNewChanges;
}

async function saveClinicalDetails() {
	if (!clinicalForm?.hasUnsavedChanges?.()) return { status: 'skipped', module: 'clinical' };
	const saveState = clinicalForm.getSaveState?.();
	const sections = saveState?.detailDirtySections || new Set();
	if (!sections.size) throw new Error('clinical-save-missing-sections');
	const result = await clinicalForm.saveDetails(
		document,
		state.currentAppointmentId,
		clinicalForm.getContextToken?.(),
		sections
	);
	if (!isSuccessfulSave(result) || clinicalForm.hasUnsavedChanges?.()) throw new Error('clinical-save-incomplete');
	return result;
}

async function saveSupport() {
	const modules = [
		{ module: 'services', instance: servicesForm },
		{ module: 'indications', instance: indicationsForm }
	].filter(item => item.instance?.hasUnsavedChanges?.());
	if (!modules.length) return { status: 'skipped', modules: [] };
	const settled = await Promise.allSettled(modules.map(item => item.instance.save({ document, silent: true })));
	const failed = settled.filter(result => result.status === 'rejected' || !isSuccessfulSave(result.value));
	if (failed.length) throw failed[0].reason || new Error('support-save-failed');
	return { status: 'success', modules: settled.map(result => result.value) };
}

function saveSkipReason() {
	if (!state.currentAppointmentId || state.isLoadingExaminationData || state.loadFailed) return 'not-ready';
	return state.saving ? 'saving' : '';
}

function runBaseSave(options) {
	const baseSave = options.baseSave || pageHooks.baseSave;
	if (typeof baseSave !== 'function') throw new Error('base-save-unavailable');
	return baseSave();
}

// A base save that reported its own status is returned as-is; anything else is incomplete.
function unsuccessfulBaseResult(baseResult) {
	if (baseResult?.status && !['saved', 'success'].includes(baseResult.status)) return baseResult;
	throw new Error('base-save-incomplete');
}

async function save(options = {}) {
	const skipped = saveSkipReason();
	if (skipped) return { status: 'skipped', reason: skipped };
	const contextToken = state.contextToken;
	state.saving = true;
	try {
		const baseResult = await runBaseSave(options);
		if (contextToken !== state.contextToken) return { status: 'stale' };
		if (!isSuccessfulSave(baseResult)) return unsuccessfulBaseResult(baseResult);
		const settled = await Promise.allSettled([saveHistory(), saveClinicalDetails(), saveSupport()]);
		if (contextToken !== state.contextToken) return { status: 'stale' };
		const failed = settled.find(result => result.status === 'rejected');
		if (failed) throw failed.reason;
		const results = settled.map(result => result.value);
		showToast('success', 'Đã lưu dữ liệu khám Tâm lý gia.');
		return { status: 'saved', results };
	} catch (error) {
		if (contextToken !== state.contextToken) return { status: 'stale', error };
		console.error('[Psychologist] workspace save failed:', error);
		showToast('error', 'Chưa lưu được đầy đủ dữ liệu. Vui lòng kiểm tra lại.');
		return { status: 'error', error };
	} finally {
		state.saving = false;
	}
}

async function complete() {
	if (state.completing) return { status: 'skipped', reason: 'completing' };
	const appointmentId = state.currentAppointmentId;
	const contextToken = state.contextToken;
	state.completing = true;
	try {
		const saved = await save();
		if (saved.status !== 'saved') return saved;
		if (contextToken !== state.contextToken) return { status: 'stale' };
		const examResponse = await apiCall(`/api/examination-id/${appointmentId}`);
		if (!examResponse?.ok) throw new Error('examination-lookup-failed');
		const examData = await examResponse.json();
		if (contextToken !== state.contextToken) return { status: 'stale' };
		if (!examData.examination_id) throw new Error('missing-examination-id');
		const response = await apiCall(`/examinations/${examData.examination_id}/complete-psychologist-exam`, { method: 'PUT' });
		if (contextToken !== state.contextToken) return { status: 'stale' };
		if (!response?.ok) throw new Error('complete-failed');
		showToast('success', 'Đã hoàn thành lượt khám.');
		return { status: 'completed' };
	} catch (error) {
		if (contextToken !== state.contextToken) return { status: 'stale', error };
		showToast('error', 'Không thể hoàn thành lượt khám.');
		return { status: 'error', error };
	} finally {
		state.completing = false;
	}
}

function bind(options = {}) {
	if (options.page) pageHooks = options.page;
	createComponents();
	configureSupportRuntime();
	const doc = options.document || document;
	if (!state.bound) {
		patientIntake.bind({ document: doc, apiCall });
		clinicalForm.bind({ document: doc, isLoading: () => state.isLoadingExaminationData });
		servicesForm.bind({ document: doc, apiCall, isLoading: () => state.isLoadingExaminationData });
		indicationsForm.bind({ document: doc, apiCall, isLoading: () => state.isLoadingExaminationData });
		const root = doc.getElementById('psychologistClinicalWorkspace');
		root?.addEventListener('click', event => {
			if (event.target.closest('#historyBtn')) {
				event.preventDefault();
				pageHooks.openHistory?.();
			}
			if (event.target.closest('#completeExaminationBtn')) {
				event.preventDefault();
				complete();
			}
		});
		state.bound = true;
	}
	return true;
}

export const QLPKPsychologistWorkspaceRuntime = Object.freeze({
	bind,
	clear,
	loadAppointment,
	save,
	complete,
	getState: () => state,
	getHistory: getHistoryComponent,
	getClinicalForm: () => clinicalForm,
	getServicesForm: () => servicesForm,
	getIndicationsForm: () => indicationsForm
});
