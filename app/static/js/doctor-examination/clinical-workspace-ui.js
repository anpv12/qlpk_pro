// Parts (nạp trước file này): dom-and-state.js, event-binding.js
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/clinical-workspace-ui#create'] || (window.QLPKModuleParts['doctor-examination/clinical-workspace-ui#create'] = { installers: [] });

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');
	const {
		getDocument,
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

	function buildWorkspaceComponentConfig(supplied) {
		return {
			...DEFAULT_CONFIG,
			...supplied,
			dom: { ...DEFAULT_DOM, ...(supplied.dom || {}) },
			intake: { ...(supplied.intake || {}) },
			clinical: { ...(supplied.clinical || {}) }
		};
	}

	function assignWorkspaceCollaborators(inst, options) {
		inst.patientIntakeFactory = options.patientIntakeForm || REGISTRY.require('patientIntakeForm');
		inst.patientIntakeForm = inst.patientIntakeFactory
			&& typeof inst.patientIntakeFactory.create === 'function'
			? inst.patientIntakeFactory.create({ config: inst.COMPONENT_CONFIG.intake || {} })
			: inst.patientIntakeFactory;
		inst.getPrescriptionUiInstance = options.getPrescriptionUi || (() => REGISTRY.get('prescriptionForm')?.getOrCreate?.());
		inst.getSupportModulesInstance = options.getSupportModulesUi || (() => REGISTRY.get('supportModulesUi') || null);
		inst.getMedicalHistoryInstance = options.getMedicalHistoryBridge || (() => REGISTRY.get('medicalHistoryBridge') || null);
	}

	function resolveSaveControllerFactory(options, componentConfig) {
		return options.saveControllerFactory
			|| componentConfig.saveControllerFactory
			|| REGISTRY.get('workspaceSaveController');
	}

	function createWorkspaceState() {
		return {
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
			onTransfer: null,
			canTransfer: null,
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
	}

	function createWorkspaceSaveController(inst) {
		return inst.saveControllerFactory.create({
			state: inst.STATE,
			mainChanges: inst.MAIN_CHANGES,
			getDocument,
			textOf,
			valueOf: inst.valueOf,
			apiCall: (...args) => inst.STATE.apiCall(...args),
			isLoading: () => inst.STATE.isLoading && inst.STATE.isLoading(),
			collect: inst.collect,
			saveClinicalDetails: inst.saveClinicalDetails,
			hasUnsavedChanges: inst.hasUnsavedChanges,
			syncDirtyState: inst.syncClinicalDirtyState,
			getClinicalForm: () => inst.clinicalForm,
			registry: REGISTRY,
			getDraftRecovery: () => REGISTRY.get('draftRecovery'),
			getContext: () => inst.STATE.context,
			getSupportModules: inst.getSupportModulesUi,
			getMedicalHistory: inst.getMedicalHistoryBridge,
			setWorkspaceSavePhase: inst.setWorkspaceSavePhase,
			setBusy: inst.setBusy,
			showToast: (...args) => inst.STATE.showToast && inst.STATE.showToast(...args),
			afterSave: () => inst.STATE.afterSave && inst.STATE.afterSave(),
			afterComplete: () => inst.STATE.afterComplete && inst.STATE.afterComplete()
		});
	}

	function buildWorkspaceInstance(inst) {
		return {
			bind: inst.bind,
			clear: inst.clear,
			render: inst.render,
			collect: inst.collect,
			getDraftSnapshot: inst.getDraftSnapshot,
			restoreDraftSnapshot: inst.restoreDraftSnapshot,
			whenInitialLoadSettled: inst.whenInitialLoadSettled,
			setLoadFailed: inst.setLoadFailed,
			saveNow: inst.saveNow,
			saveWorkspace: inst.saveWorkspace,
			hasUnsavedChanges: inst.hasUnsavedChanges,
			resolveUnsavedChanges: inst.resolveUnsavedChanges,
			syncTransferActionState: inst.syncTransferActionState,
			activateSection: inst.activateWorkspaceSection,
			refreshPatientHeader: options => {
				const doc = getDocument(options);
				if (inst.STATE.currentData) inst.renderPatientHeader(doc, inst.STATE.currentData);
			},
			getContext: () => inst.STATE.context,
			normalizePayload: inst.normalizePayload
		};
	}

	function create(options = {}) {
		// Functions of create() live in clinical-workspace-ui-parts/ (installed per instance, like the original closures).
		const inst = {};
		inst.options = options;
		const outer = { getDocument, hasValue, runtimeGetValue, runtimeSetText, runtimeSetValue, textOf };
		moduleParts.installers.forEach(install => install(inst, outer));
		inst.suppliedConfig = options.config || {};
		inst.COMPONENT_CONFIG = buildWorkspaceComponentConfig(inst.suppliedConfig);
		inst.dom = inst.COMPONENT_CONFIG.dom;
		inst.DEFAULT_SECTION_ID = inst.COMPONENT_CONFIG.defaultSectionId;
		inst.STATE = createWorkspaceState();
		inst.MAIN_CHANGES = RUNTIME.createChangeTracker(inst.STATE, { revisionKey: 'mainRevision', dirtyKey: 'mainDirty' });
		inst.clinicalForm = null;

	assignWorkspaceCollaborators(inst, options);

		inst.clinicalForm = REGISTRY.get('clinicalExaminationForm').create({
		config: inst.COMPONENT_CONFIG.clinical || {},
		getDocument,
		getElement: inst.getElement,
		getValue: inst.getValue,
		setValue: inst.setValue,
		textOf,
		hasValue,
		syncDirtyState: inst.syncClinicalDirtyState,
		isLoading: () => inst.STATE.isLoading && inst.STATE.isLoading(),
		apiCall: (...args) => inst.STATE.apiCall(...args)
	});

	inst.saveControllerFactory = resolveSaveControllerFactory(options, inst.COMPONENT_CONFIG);
	if (!inst.saveControllerFactory || typeof inst.saveControllerFactory.create !== 'function') {
		throw new Error('Thiếu workspace save controller');
	}
	inst.workspaceSaveController = createWorkspaceSaveController(inst);

	inst.instance = buildWorkspaceInstance(inst);
	return inst.instance;
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

	const doctorConfig = REGISTRY.require('doctorComponentConfig');
	const defaultInstance = getOrCreate({
		config: {
			...doctorConfig,
			...(doctorConfig.workspace || {})
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
