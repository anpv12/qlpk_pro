(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');
	const {
		textOf,
		hasValue,
		setText: runtimeSetText,
		setValue: runtimeSetValue,
		getValue: runtimeGetValue
	} = RUNTIME;

	const DEFAULT_CONFIG = {
		rootId: 'doctorClinicalWorkspace',
		defaultSectionId: 'doctorClinicalDecisionPanel',
		sectionSelector: '.doctor-workspace-section',
		intake: {},
		clinical: {},
		getPrescriptionUi: null,
		getSupportModulesUi: null,
		getMedicalHistoryBridge: null,
		dom: {}
	};

	const DEFAULT_DOM = {
		doctorClinicalWorkspace: 'doctorClinicalWorkspace',
		doctorClinicalForm: 'doctorClinicalForm',
		doctorClinicalHeading: 'doctorClinicalHeading',
		doctorPatientCode: 'doctorPatientCode',
		doctorPatientLatestVisit: 'doctorPatientLatestVisit',
		doctorPatientHistory: 'doctorPatientHistory',
		doctorPatientLastDiagnosis: 'doctorPatientLastDiagnosis',
		doctorPatientLastPrescription: 'doctorPatientLastPrescription',
		doctorClinicalDecisionPanel: 'doctorClinicalDecisionPanel',
		doctorPrescriptionWorkspace: 'doctorPrescriptionWorkspace',
		doctorServicePanel: 'doctorServicePanel',
		doctorHistoryPanel: 'doctorHistoryPanel',
		doctorWorkspaceSaveStatus: 'doctorWorkspaceSaveStatus',
		diagnosis: 'diagnosis',
		benhKemTheo: 'benhKemTheo',
		weight: 'weight',
		height: 'height',
		bmi: 'bmi'
	};

	function create(options = {}) {
		const suppliedConfig = options.config || {};
		const COMPONENT_CONFIG = {
			...DEFAULT_CONFIG,
			...suppliedConfig,
			dom: { ...DEFAULT_DOM, ...(suppliedConfig.dom || {}) },
			intake: { ...(suppliedConfig.intake || {}) },
			clinical: { ...(suppliedConfig.clinical || {}) }
		};
		const dom = COMPONENT_CONFIG.dom;
		const DEFAULT_SECTION_ID = COMPONENT_CONFIG.defaultSectionId;
		const STATE = {
			bound: false,
			contextToken: 0,
			appointment: null,
			patientId: null,
			apiCall: null,
			getAppointmentId: null,
			isLoading: null,
			showToast: null,
			afterSave: null,
			afterComplete: null,
			dirty: false,
			mainDirty: false,
			mainRevision: 0,
			saving: false,
			workspaceSaving: false,
			workspacePhase: 'idle',
			completing: false,
			loadFailed: false,
			loadFailure: null,
			currentData: null,
			context: null
		};
		let clinicalForm = null;

		function resolveDomId(id) {
			return dom[id] || id;
		}

	function getWorkspaceRoot(doc) {
		return doc.getElementById(resolveDomId('doctorClinicalWorkspace')) || doc;
	}

	function resetWorkspaceScrollPositions(doc) {
		const root = getWorkspaceRoot(doc);
		const elements = [root, ...root.querySelectorAll('*')];
		elements.forEach(element => {
			const styles = getComputedStyle(element);
			const scrollable = ['auto', 'scroll'].includes(styles.overflowY)
				|| ['auto', 'scroll'].includes(styles.overflowX);
			if (!scrollable) return;
			element.scrollTop = 0;
			element.scrollLeft = 0;
		});
	}

		function getDocument(options) {
			return options && options.document ? options.document : document;
		}

		function getElement(doc, id) {
			const physicalId = resolveDomId(id);
			const root = getWorkspaceRoot(doc);
			if (root.id === physicalId) return root;
			const scoped = root.querySelector(`#${physicalId}`);
			return scoped || (root === doc ? doc.getElementById(physicalId) : null);
		}

		function valueOf(...values) {
			for (const value of values) {
				if (hasValue(value)) return value;
			}
			return '';
		}

		function setText(doc, id, value, options = {}) {
			return runtimeSetText(doc, id, value, { ...options, resolveElement: getElement });
		}

		function setValue(doc, id, value) {
			return runtimeSetValue(doc, id, value, { resolveElement: getElement });
		}

		function getValue(doc, id) {
			return runtimeGetValue(doc, id, { resolveElement: getElement });
		}

		function updateBmiFromVitals(doc) {
			const weight = Number(getValue(doc, 'weight').replace(',', '.'));
			const heightCm = Number(getValue(doc, 'height').replace(',', '.'));
			if (!weight || !heightCm) return;
			const heightM = heightCm / 100;
			if (heightM) setValue(doc, 'bmi', (weight / (heightM * heightM)).toFixed(2));
		}

	function normalizePayload(payload = {}) {
		const examination = {
			...(payload.examination_info || {})
		};
		return {
			appointment: payload || {},
			patient: payload.patient_info || {},
			examination
		};
	}

	const patientIntakeFactory = options.patientIntakeForm || REGISTRY.require('patientIntakeForm');
	const patientIntakeForm = patientIntakeFactory
		&& typeof patientIntakeFactory.create === 'function'
		? patientIntakeFactory.create({ config: COMPONENT_CONFIG.intake || {} })
		: patientIntakeFactory;
	const getPrescriptionUiInstance = options.getPrescriptionUi || (() => REGISTRY.get('prescriptionForm')?.getOrCreate?.());
	const getSupportModulesInstance = options.getSupportModulesUi || (() => REGISTRY.get('supportModulesUi') || null);
	const getMedicalHistoryInstance = options.getMedicalHistoryBridge || (() => REGISTRY.get('medicalHistoryBridge') || null);

	function getPatientIntakeForm() {
		return patientIntakeForm || null;
	}

	function buildSharedPatientFormPayload(data) {
		return {
			appointment: data.appointment,
			patient_info: data.patient,
			examination_info: data.examination
		};
	}

	function getWorkspaceSaveStatusText(phase) {
		const phaseLabels = {
			main: 'Đang lưu dữ liệu khám',
			details: 'Đang lưu khám chi tiết',
			support: 'Đang lưu đơn thuốc và dịch vụ',
			complete: 'Đang hoàn thành khám'
		};
		return phaseLabels[phase] || '';
	}

	function setBusy(doc, isBusy, phase = 'idle') {
		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		const scope = getWorkspaceRoot(doc);
		if (workspace) workspace.setAttribute('aria-busy', String(Boolean(isBusy)));

		['save', 'complete'].forEach(action => {
			const button = scope.querySelector(`[data-doctor-workspace-action="${action}"]`);
			if (!button) return;
			button.disabled = Boolean(isBusy);
			button.setAttribute('aria-disabled', String(Boolean(isBusy)));
			if (action === 'save') button.setAttribute('aria-busy', String(Boolean(isBusy)));
		});

		const saveButton = scope.querySelector('[data-doctor-workspace-action="save"]');
		const saveIcon = saveButton && saveButton.querySelector('[data-doctor-workspace-save-icon]');
		const saveLabel = saveButton && saveButton.querySelector('[data-doctor-workspace-save-label]');
		if (saveButton) saveButton.classList.toggle('is-saving', Boolean(isBusy));
		if (saveIcon) saveIcon.className = isBusy ? 'bi bi-arrow-repeat doctor-workspace-button__spinner' : 'bi bi-floppy';
		if (saveLabel) saveLabel.textContent = isBusy ? (phase === 'complete' ? 'Đang hoàn tất...' : 'Đang lưu...') : 'Lưu';

		const status = getElement(doc, 'doctorWorkspaceSaveStatus');
		if (status) status.textContent = isBusy ? getWorkspaceSaveStatusText(phase) : '';
	}

	function setWorkspaceSavePhase(doc, phase) {
		STATE.workspacePhase = phase;
		setBusy(doc, true, phase);
	}

	function getSectionTargetId(link) {
		if (!link) return '';
		const explicitTarget = link.dataset ? link.dataset.doctorSectionTarget : '';
		if (explicitTarget) return explicitTarget;
		const href = link.getAttribute('href') || '';
		return href.charAt(0) === '#' ? href.slice(1) : '';
	}

	function activateWorkspaceSection(doc, targetId = DEFAULT_SECTION_ID, options = {}) {
		const scope = getWorkspaceRoot(doc);
		const sections = Array.from(scope.querySelectorAll(COMPONENT_CONFIG.sectionSelector));
		if (!sections.length) return '';

		let nextSection = targetId ? getElement(doc, targetId) : null;
			if (!nextSection || !nextSection.classList.contains('doctor-workspace-section')) {
				nextSection = getElement(doc, DEFAULT_SECTION_ID) || sections[0];
			}
			const nextId = nextSection.id;

			sections.forEach(section => {
			const isActive = section.id === nextId;
			section.hidden = !isActive;
			section.classList.toggle('is-active', isActive);
			if (isActive) {
				section.removeAttribute('aria-hidden');
			} else {
				section.setAttribute('aria-hidden', 'true');
			}
		});

		scope.querySelectorAll(COMPONENT_CONFIG.navSelector || '.doctor-section-edge-nav__item').forEach(link => {
			const isActive = options.trigger
				? link === options.trigger
				: getSectionTargetId(link) === nextId;
			link.classList.toggle('is-active', isActive);
			if (isActive) {
				link.setAttribute('aria-current', 'true');
			} else {
				link.removeAttribute('aria-current');
			}
		});

		return nextId;
	}

	function syncClinicalDirtyState() {
		STATE.dirty = Boolean(STATE.mainDirty || clinicalForm?.hasUnsavedChanges?.());
	}

	function isWorkspaceOwnedField(target) {
		return Boolean(target) && !target.closest(COMPONENT_CONFIG.externalFieldSelector || '#doctorPrescriptionWorkspace, #doctorServicePanel, #doctorHistoryPanel');
	}

	function getSupportModulesUi() {
		return typeof getSupportModulesInstance === 'function'
			? getSupportModulesInstance() || null
			: getSupportModulesInstance || null;
	}

	function getMedicalHistoryBridge() {
		return typeof getMedicalHistoryInstance === 'function'
			? getMedicalHistoryInstance() || null
			: getMedicalHistoryInstance || null;
	}

		clinicalForm = REGISTRY.get('clinicalExaminationForm').create({
		config: COMPONENT_CONFIG.clinical || {},
		getDocument,
		getElement,
		getValue,
		setValue,
		textOf,
		hasValue,
		syncDirtyState: syncClinicalDirtyState,
		isLoading: () => STATE.isLoading && STATE.isLoading(),
		apiCall: (...args) => STATE.apiCall(...args)
	});

	function hasUnsavedChanges() {
		const supportModules = getSupportModulesUi();
		const medicalHistory = getMedicalHistoryBridge();
		return Boolean(
			STATE.dirty
			|| (supportModules && typeof supportModules.hasUnsavedChanges === 'function' && supportModules.hasUnsavedChanges())
			|| (medicalHistory && typeof medicalHistory.hasPendingChanges === 'function' && medicalHistory.hasPendingChanges())
		);
	}

	function resetClinicalSaveState() {
		STATE.dirty = false;
		STATE.mainDirty = false;
		STATE.mainRevision = 0;
		STATE.saving = false;
		STATE.workspaceSaving = false;
		STATE.workspacePhase = 'idle';
	}

	function clear(options = {}) {
		STATE.context = options.context || STATE.context;
		const doc = getDocument(options);
		STATE.contextToken += 1;
		STATE.appointment = null;
		STATE.patientId = null;
		STATE.currentData = null;
		STATE.loadFailed = false;
		STATE.loadFailure = null;
		resetClinicalSaveState();
		STATE.completing = false;
		resetWorkspaceScrollPositions(doc);

		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		if (workspace) workspace.hidden = true;
		setBusy(doc, false);

		clinicalForm.clear({ document: doc, context: STATE.context });
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.clear !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		patientIntakeForm.clear({ document: doc, context: STATE.context });
		setText(doc, 'doctorClinicalHeading', 'Chưa chọn bệnh nhân');
		setText(doc, 'doctorPatientCode', '', { hideWhenEmpty: true });
		setText(doc, 'doctorPatientLatestVisit', '');
		setText(doc, 'doctorPatientLastDiagnosis', '');
		setText(doc, 'doctorPatientLastPrescription', '');
		const history = getElement(doc, 'doctorPatientHistory');
		if (history) history.hidden = true;
		activateWorkspaceSection(doc, DEFAULT_SECTION_ID);
	}

	function getPreviousVisitSnapshot() {
		const prescriptionUi = typeof getPrescriptionUiInstance === 'function'
			? getPrescriptionUiInstance() || null
			: getPrescriptionUiInstance;
		if (!prescriptionUi || typeof prescriptionUi.getLatestPreviousVisitSnapshot !== 'function') {
			return { status: 'unavailable' };
		}
		return prescriptionUi.getLatestPreviousVisitSnapshot();
	}

	function renderPreviousVisitSummary(doc) {
		const snapshot = getPreviousVisitSnapshot();
		const history = getElement(doc, 'doctorPatientHistory');
		setText(doc, 'doctorPatientLastDiagnosis', '');
		setText(doc, 'doctorPatientLastPrescription', '');
		if (history) history.hidden = true;

		if (snapshot.status === 'loading') {
			setText(doc, 'doctorPatientLatestVisit', 'Đang tải lịch sử...');
			return;
		}
		if (snapshot.status === 'empty') {
			setText(doc, 'doctorPatientLatestVisit', 'Chưa có lần khám trước');
			return;
		}
		if (snapshot.status !== 'ready') {
			setText(doc, 'doctorPatientLatestVisit', 'Không tải được lịch sử trước');
			return;
		}

		setText(doc, 'doctorPatientLatestVisit', `Lần khám gần nhất: ${snapshot.appointmentDate || 'Không rõ ngày'}`);
		setText(doc, 'doctorPatientLastDiagnosis', snapshot.diagnosis || 'Chưa có chẩn đoán');
		setText(doc, 'doctorPatientLastPrescription', snapshot.medicineSummary || 'Chưa kê thuốc');
		if (history) history.hidden = false;
	}

	function renderPatientHeader(doc, data) {
		const patientName = textOf(valueOf(data.patient.full_name, data.appointment.patient_full_name, 'Bệnh nhân chưa có tên'));
		const patientCode = textOf(valueOf(data.patient.patient_code, data.appointment.patient_code));
		setText(doc, 'doctorClinicalHeading', patientName);
		setText(doc, 'doctorPatientCode', patientCode, { hideWhenEmpty: true });
		renderPreviousVisitSummary(doc);
	}

	async function saveClinicalDetails(doc, appointmentId, _token, sections, context = STATE.context) {
		return clinicalForm.saveDetails(doc, appointmentId, clinicalForm.getContextToken(), sections, context);
	}

	function render(payload = {}, options = {}) {
		STATE.context = options.context || STATE.context;
		const doc = getDocument(options);
		const data = normalizePayload(payload);
		STATE.contextToken += 1;
		STATE.appointment = data.appointment;
		STATE.patientId = textOf(valueOf(data.patient.id, data.appointment.patient_id));
		STATE.currentData = data;
		STATE.loadFailed = false;
		STATE.loadFailure = null;
		resetClinicalSaveState();
		setBusy(doc, false);

		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		if (workspace) workspace.hidden = false;

		renderPatientHeader(doc, data);
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.populate !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		const sharedPayload = buildSharedPatientFormPayload(data);
		patientIntakeForm.populate(sharedPayload, { document: doc, context: STATE.context });
		clinicalForm.render(payload, { document: doc, context: STATE.context });
		activateWorkspaceSection(doc, DEFAULT_SECTION_ID);

		return true;
	}

	function collect(options = {}) {
		STATE.context = options.context || STATE.context;
		const doc = getDocument(options);
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.collect !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		const payload = {
			...patientIntakeForm.collect({ document: doc, context: STATE.context }),
			...clinicalForm.collect({ document: doc, context: STATE.context })
		};
		return payload;
	}

	function getDraftControlValue(control) {
		const Input = control?.ownerDocument?.defaultView?.HTMLInputElement;
		if (Input && control instanceof Input && (control.type === 'checkbox' || control.type === 'radio')) {
			return Boolean(control.checked);
		}
		return textOf(control.value);
	}

	function setDraftControlValue(control, value) {
		const Input = control?.ownerDocument?.defaultView?.HTMLInputElement;
		if (Input && control instanceof Input && (control.type === 'checkbox' || control.type === 'radio')) {
			control.checked = Boolean(value);
			return;
		}
		control.value = textOf(value);
	}

	function isClinicalDraftControl(control) {
		const view = control?.ownerDocument?.defaultView;
		if (!view || !(control instanceof view.HTMLInputElement || control instanceof view.HTMLTextAreaElement || control instanceof view.HTMLSelectElement)) return false;
		if (!control.id || control.disabled && control.type === 'hidden') return false;
		if (['button', 'submit', 'reset', 'file'].includes(control.type)) return false;
		return !control.closest(COMPONENT_CONFIG.draftExcludedSelector || '#doctorPrescriptionWorkspace, #doctorServicePanel, #doctorHistoryPanel');
	}

	function getDraftSnapshot(options = {}) {
		STATE.context = options.context || STATE.context;
		const doc = getDocument(options);
		const form = getElement(doc, 'doctorClinicalForm');
		const controls = { ...(clinicalForm.getDraftSnapshot({ document: doc, context: STATE.context }).controls || {}) };
		if (!form) return { controls };
		form.querySelectorAll('input, textarea, select').forEach(control => {
			if (!isClinicalDraftControl(control)) return;
			if (clinicalForm.ownsField(control)) return;
			controls[control.id] = getDraftControlValue(control);
		});
		return { controls };
	}

	async function restoreDraftSnapshot(snapshot = {}, options = {}) {
		STATE.context = options.context || STATE.context;
		const doc = getDocument(options);
		const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
		if (!isCurrent()) return { restored: 0 };
		const controls = snapshot && snapshot.controls && typeof snapshot.controls === 'object' ? snapshot.controls : {};
		const clinicalResult = await clinicalForm.restoreDraftSnapshot(snapshot, {
			document: doc,
			context: STATE.context,
			isCurrent
		});
		if (!isCurrent()) return { restored: 0 };
		let restored = 0;
		let restoredMainControl = false;
		Object.entries(controls).forEach(([id, value]) => {
			if (!isCurrent()) return;
			const control = getElement(doc, id);
			if (!control || !isClinicalDraftControl(control)) return;
			if (clinicalForm.ownsField(control)) return;
			setDraftControlValue(control, value);
			restoredMainControl = true;
			restored += 1;
		});
		if (restored) {
			if (restoredMainControl) {
				STATE.mainDirty = true;
				STATE.mainRevision += 1;
			}
				syncClinicalDirtyState();
		}
		if (!isCurrent()) return { restored: 0 };
		return { restored: restored + (clinicalResult.restored || 0) };
	}

	function whenInitialLoadSettled() {
		return clinicalForm.whenInitialLoadSettled();
	}

	function setLoadFailed(loadFailed, reason = null) {
		STATE.loadFailed = Boolean(loadFailed);
		STATE.loadFailure = STATE.loadFailed ? (reason || 'Không tải đủ dữ liệu ca khám') : null;
		return STATE.loadFailed;
	}

	const saveControllerFactory = options.saveControllerFactory
		|| COMPONENT_CONFIG.saveControllerFactory
		|| REGISTRY.get('workspaceSaveController');
	if (!saveControllerFactory || typeof saveControllerFactory.create !== 'function') {
		throw new Error('Thiếu workspace save controller');
	}
	const workspaceSaveController = saveControllerFactory.create({
		state: STATE,
		getDocument,
		textOf,
		valueOf,
		apiCall: (...args) => STATE.apiCall(...args),
		isLoading: () => STATE.isLoading && STATE.isLoading(),
		collect,
		saveClinicalDetails,
		hasUnsavedChanges,
		syncDirtyState: syncClinicalDirtyState,
		getClinicalForm: () => clinicalForm,
		registry: REGISTRY,
		getDraftRecovery: () => REGISTRY.get('draftRecovery'),
		getContext: () => STATE.context,
		getSupportModules: getSupportModulesUi,
		getMedicalHistory: getMedicalHistoryBridge,
		setWorkspaceSavePhase,
		setBusy,
		showToast: (...args) => STATE.showToast && STATE.showToast(...args),
		afterSave: () => STATE.afterSave && STATE.afterSave(),
		afterComplete: () => STATE.afterComplete && STATE.afterComplete()
	});

	function saveNow(options = {}) {
		return workspaceSaveController.saveNow(options);
	}

	function saveWorkspace(options = {}) {
		return workspaceSaveController.saveWorkspace(options);
	}

	function resolveUnsavedChanges(options = {}) {
		return workspaceSaveController.resolveUnsavedChanges(options);
	}

	function completeNow(options = {}) {
		return workspaceSaveController.completeNow(options);
	}

	function bind(options = {}) {
		STATE.context = options.context || STATE.context;
		const doc = getDocument(options);
		STATE.apiCall = options.apiCall || STATE.apiCall;
		STATE.getAppointmentId = options.getAppointmentId || STATE.getAppointmentId;
		STATE.isLoading = options.isLoading || STATE.isLoading;
		STATE.showToast = options.showToast || STATE.showToast;
		STATE.afterSave = options.afterSave || STATE.afterSave;
		STATE.afterComplete = options.afterComplete || STATE.afterComplete;

		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		if (!workspace) return false;
		if (STATE.bound) return true;
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.bind !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		patientIntakeForm.bind({ document: doc, context: STATE.context, apiCall: STATE.apiCall });
		clinicalForm.bind({ document: doc, context: STATE.context, isLoading: STATE.isLoading });

		const form = getElement(doc, 'doctorClinicalForm');
		if (form) {
			form.addEventListener('submit', event => event.preventDefault());
			const handleFieldMutation = event => {
				const view = event.target?.ownerDocument?.defaultView;
				if (!view || !(event.target instanceof view.HTMLInputElement || event.target instanceof view.HTMLTextAreaElement)) return;
				if (clinicalForm.ownsField(event.target)) return;
				if (!isWorkspaceOwnedField(event.target)) return;
				if (event.target.id === 'weight' || event.target.id === 'height') updateBmiFromVitals(doc);
				STATE.mainDirty = true;
				STATE.mainRevision += 1;
				syncClinicalDirtyState();
			};
			form.addEventListener('input', handleFieldMutation);
			form.addEventListener('change', event => {
				const view = event.target?.ownerDocument?.defaultView;
				if (view && (event.target instanceof view.HTMLInputElement || event.target instanceof view.HTMLTextAreaElement)) {
					handleFieldMutation(event);
					return;
				}
				if (view && event.target instanceof view.HTMLSelectElement && isWorkspaceOwnedField(event.target)) {
					STATE.mainDirty = true;
					STATE.mainRevision += 1;
					syncClinicalDirtyState();
				}
			});
		}

		workspace.addEventListener('click', event => {
			const sectionNavLink = event.target.closest(COMPONENT_CONFIG.navItemSelector || '.doctor-section-edge-nav__item, [data-doctor-section-target]');
			if (sectionNavLink) {
				event.preventDefault();
				activateWorkspaceSection(doc, getSectionTargetId(sectionNavLink), {
					trigger: sectionNavLink
				});
				return;
			}

			const actionButton = event.target.closest('[data-doctor-workspace-action]');
			if (!actionButton) return;
			const action = actionButton.dataset.doctorWorkspaceAction;
			if (action === 'save') saveWorkspace({ document: doc }).catch(() => {});
			if (action === 'complete') completeNow({ document: doc }).catch(() => {});
		});
		doc.addEventListener(COMPONENT_CONFIG.historyEventName || 'qlpk:doctor-prescription-history-loaded', event => {
			const detail = event.detail || {};
			if (!STATE.currentData || String(detail.patientId || '') !== String(STATE.patientId || '')) return;
			renderPreviousVisitSummary(doc);
		});

		STATE.bound = true;
		return true;
	}

	const instance = {
		bind,
		clear,
		render,
		collect,
		getDraftSnapshot,
		restoreDraftSnapshot,
		whenInitialLoadSettled,
		setLoadFailed,
		saveNow,
		saveWorkspace,
		hasUnsavedChanges,
		resolveUnsavedChanges,
		activateSection: activateWorkspaceSection,
		refreshPatientHeader: options => {
			const doc = getDocument(options);
			if (STATE.currentData) renderPatientHeader(doc, STATE.currentData);
		},
		getContext: () => STATE.context,
		normalizePayload
	};
	return instance;
	}

	function getOrCreate(options = {}) {
		const sourceDocument = options.document || document;
		const rootId = options.config?.rootId || DEFAULT_CONFIG.rootId;
		const root = sourceDocument.getElementById(rootId);
		if (!root) return null;
		const existing = root.__qlpkClinicalWorkspaceInstance;
		if (existing) return existing;
		const instance = create(options);
		root.__qlpkClinicalWorkspaceInstance = instance;
		return instance;
	}

	const defaultInstance = getOrCreate({
		config: {
			...(REGISTRY.get('doctorComponentConfig') || {}),
			...(REGISTRY.get('doctorComponentConfig')?.workspace || {})
		},
		getPrescriptionUi: () => REGISTRY.get('prescriptionForm')?.getOrCreate?.(),
		getSupportModulesUi: () => REGISTRY.get('supportModulesUi') || null,
		getMedicalHistoryBridge: () => REGISTRY.get('medicalHistoryBridge') || null,
		saveControllerFactory: REGISTRY.get('workspaceSaveController')
	});
	const api = { create, getOrCreate, ...(defaultInstance || {}) };
	REGISTRY.register('clinicalWorkspace', api, {
		dependencies: ['supportRuntime', 'workspaceSaveController', 'clinicalExaminationForm'],
		owner: 'doctor/workspace'
	});
})(window, document);
