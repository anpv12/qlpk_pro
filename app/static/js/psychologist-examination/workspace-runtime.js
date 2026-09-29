(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const PAGE_RUNTIME = window.QLPKDoctorPageRuntime;
	if (!REGISTRY || !PAGE_RUNTIME) throw new Error('Thiếu runtime dùng chung cho màn Tâm lý gia');

	const config = window.QLPKPsychologistComponentConfig || {};
	const state = {
		bound: false,
		isLoadingExaminationData: false,
		loadFailed: false,
		currentAppointmentId: null,
		currentPatientId: null,
		currentPatientData: null,
		contextToken: 0,
		payload: null,
		saving: false,
		completing: false
	};

	window.QLPKPsychologistPageState = state;

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
		window.QLPKPsychologistSetLoading?.(state.isLoadingExaminationData);
	}

	function setCurrentPatient(patient) {
		state.currentPatientData = patient || null;
		state.currentPatientId = patient?.id ? Number(patient.id) : null;
		window.currentPatientData = state.currentPatientData;
		window.QLPKPsychologistSetCurrentPatientId?.(state.currentPatientId);
	}

	function setCurrentAppointment(appointmentId) {
		state.currentAppointmentId = appointmentId ? Number(appointmentId) : null;
		window.QLPKPsychologistSetCurrentAppointmentId?.(state.currentAppointmentId);
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
		const intakeFactory = window.QLPKPatientIntakeForm;
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

		state.contextToken += 1;
		setLoading(true);
		clear({ document: options.document || document });
		// clear() increments the token deliberately; use a fresh token after reset.
		const loadToken = state.contextToken;
		setCurrentAppointment(numericAppointmentId);
		try {
			const response = await apiCall(`/api/appointments/${numericAppointmentId}/edit`);
			if (!response?.ok) throw new Error('appointment-load-failed');
			const payload = await response.json();
			if (loadToken !== state.contextToken) return { status: 'stale' };

			state.payload = payload;
			setCurrentPatient(payload.patient_info || payload.patient || null);
			setCurrentAppointment(numericAppointmentId);
			createComponents();
			configureSupportRuntime();
			const doc = options.document || document;
			patientIntake.bind({ document: doc, apiCall });
			clinicalForm.bind({ document: doc, isLoading: () => state.isLoadingExaminationData });
			servicesForm.bind({ document: doc, apiCall, isLoading: () => state.isLoadingExaminationData });
			indicationsForm.bind({ document: doc, apiCall, isLoading: () => state.isLoadingExaminationData });

			await populateWorkspace(payload, doc, numericAppointmentId);
			if (loadToken !== state.contextToken) return { status: 'stale' };
			setLoading(false);
			window.PsychologistWorkspaceUi?.showWorkspace?.({
				document: doc,
				patient: state.currentPatientData,
				appointmentId: numericAppointmentId
			});
			return { status: 'loaded', payload };
		} catch (error) {
			if (loadToken !== state.contextToken) return { status: 'stale' };
			state.loadFailed = true;
			setLoading(false);
			showToast('error', 'Không thể tải đầy đủ dữ liệu lượt khám. Vui lòng thử lại.');
			console.error('[Psychologist] workspace load failed:', error);
			return { status: 'error', error };
		}
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

	async function save(options = {}) {
		if (!state.currentAppointmentId || state.isLoadingExaminationData || state.loadFailed) return { status: 'skipped', reason: 'not-ready' };
		if (state.saving) return { status: 'skipped', reason: 'saving' };
		const contextToken = state.contextToken;
		state.saving = true;
		try {
			const baseSave = options.baseSave || window.QLPKPsychologistSaveBase;
			if (typeof baseSave !== 'function') throw new Error('base-save-unavailable');
			const baseResult = await baseSave();
			if (contextToken !== state.contextToken) return { status: 'stale' };
			if (!isSuccessfulSave(baseResult)) {
				if (baseResult?.status && !['saved', 'success'].includes(baseResult.status)) return baseResult;
				throw new Error('base-save-incomplete');
			}
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
					window.QLPKPsychologistPatientHistoryModal?.open?.();
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

	window.QLPKPsychologistWorkspaceRuntime = Object.freeze({
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
})(window, document);
