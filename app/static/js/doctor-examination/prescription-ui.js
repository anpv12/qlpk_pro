// Parts (nạp trước file này): state-and-quantities.js, rendering-and-load.js, input-and-binding.js
import { createReExaminationCalendar } from './re-examination-calendar.js';

(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/prescription-ui#create'] || (window.QLPKModuleParts['doctor-examination/prescription-ui#create'] = { installers: [] });

	const DEFAULT_DOM = {
		workspace: 'doctorClinicalWorkspace',
		usageMode: 'doctorPrescriptionUsageMode',
		medicineDays: 'doctorPrescriptionMedicineDays',
		reExamButton: 'doctorPrescriptionReExamButton',
		reExamDateTime: 'doctorPrescriptionReExamDateTime',
		reExamStatus: 'doctorPrescriptionReExamStatus',
		reExamHint: 'doctorPrescriptionReExamHint',
		saveStatus: 'doctorPrescriptionSaveStatus',
		code: 'doctorPrescriptionCode',
		totalQuantity: 'doctorPrescriptionTotalQuantity',
		grandTotal: 'doctorPrescriptionGrandTotal',
		itemsCount: 'doctorPrescriptionItemsCount',
		jumpCount: 'doctorPrescriptionJumpCount',
		tableHead: 'doctorPrescriptionTableHead',
		list: 'doctorPrescriptionList',
		table: 'doctorPrescriptionTable',
		empty: 'doctorPrescriptionEmptyState',
		historyPanel: 'doctorPrescriptionHistoryPanel',
		historyList: 'doctorPrescriptionHistoryList',
		historyCount: 'doctorPrescriptionHistoryCount',
		diagnosis: 'diagnosis'
	};

	const DEFAULT_ENDPOINTS = {
		prescription: appointmentId => `/api/prescription/appointment/${appointmentId}`,
		history: patientId => `/api/prescription/patient/${patientId}/history`,
		save: () => '/api/prescription/save',
		printViewModel: appointmentId => `/api/prescription/appointment/${appointmentId}/print-view-model`,
		appointmentEdit: appointmentId => `/api/appointments/${appointmentId}/edit`
	};
	const instances = new WeakMap();

	const DEPENDENCY_MODULES = {
		model: 'prescriptionModel',
		rows: 'prescriptionRows',
		history: 'prescriptionHistory',
		reExam: 'prescriptionReExam',
		medicineSearch: 'prescriptionMedicineSearch'
	};

	function resolveDependencies(options) {
		const registry = window.QLPKDoctorModuleRegistry;
		const RUNTIME = options.runtime || registry.require('supportRuntime');
		if (!RUNTIME) throw new Error('Thiếu prescription support runtime');
		const resolved = Object.fromEntries(Object.entries(DEPENDENCY_MODULES).map(([key, name]) => [key, options[key] || registry?.get(name)]));
		if (Object.values(resolved).some(module => !module)) throw new Error('Thiếu prescription dependencies');
		return { RUNTIME, ...resolved };
	}

	function runPrescriptionUiSetup1(ctx) {
		// Functions of create() live in prescription-ui-parts/ (installed per instance, like the original closures).
		ctx.inst = {};
		ctx.inst.options = ctx.options;
		const outer = { createReExaminationCalendar };
		moduleParts.installers.forEach(install => install(ctx.inst, outer));
		ctx.inst.config = ctx.options.config || {};
		ctx.inst.registry = window.QLPKDoctorModuleRegistry;
		({ RUNTIME: ctx.inst.RUNTIME, model: ctx.inst.MODEL, rows: ctx.inst.ROWS, history: ctx.inst.HISTORY, reExam: ctx.inst.REEXAM, medicineSearch: ctx.inst.MEDICINE_SEARCH } = resolveDependencies(ctx.options));
		ctx.inst.dom = { ...DEFAULT_DOM, ...(ctx.inst.config.dom || {}) };
		ctx.inst.endpoints = { ...DEFAULT_ENDPOINTS, ...(ctx.inst.config.endpoints || {}) };
		ctx.inst.runtimeGetElement = ctx.inst.RUNTIME.getElement;
		ctx.inst.runtimeSetText = ctx.inst.RUNTIME.setText;
		ctx.inst.runtimeSetValue = ctx.inst.RUNTIME.setValue;
		ctx.inst.runtimeGetValue = ctx.inst.RUNTIME.getValue;
		ctx.inst.resolveDomId = id => {
			const key = Object.keys(DEFAULT_DOM).find(name => DEFAULT_DOM[name] === id);
			return key ? ctx.inst.dom[key] : id;
		};
		ctx.inst.getElement = (doc, id) => ctx.inst.runtimeGetElement(doc, ctx.inst.resolveDomId(id));
		ctx.inst.setText = (doc, id, value, options = {}) => ctx.inst.runtimeSetText(doc, ctx.inst.resolveDomId(id), value, options);
		ctx.inst.setValue = (doc, id, value) => ctx.inst.runtimeSetValue(doc, ctx.inst.resolveDomId(id), value);
		ctx.inst.getValue = (doc, id) => ctx.inst.runtimeGetValue(doc, ctx.inst.resolveDomId(id));
		({ getDocument: ctx.inst.getDocument, textOf: ctx.inst.textOf, toNumber: ctx.inst.toNumber, normalizeId: ctx.inst.normalizeId, formatCurrency: ctx.inst.formatCurrency, draftRowsWithoutRuntimeIds: ctx.inst.draftRowsWithoutRuntimeIds, getRowUidFromTarget: ctx.inst.getRowUidFromTarget } = ctx.inst.RUNTIME);
		({ PRESCRIPTION_USAGE_MODES: ctx.inst.PRESCRIPTION_USAGE_MODES, PRESCRIPTION_USAGE_NOTE_MODES: ctx.inst.PRESCRIPTION_USAGE_NOTE_MODES, normalizePrescriptionType: ctx.inst.normalizePrescriptionType, ensurePrescriptionUsageMode: ctx.inst.ensurePrescriptionUsageMode, normalizeUsageNoteMode: ctx.inst.normalizeUsageNoteMode, parseDoseValue: ctx.inst.parseDoseValue, parseMedicineDays: ctx.inst.parseMedicineDays, formatDoseValue: ctx.inst.formatDoseValue, roundPrescriptionQuantity: ctx.inst.roundPrescriptionQuantity, normalizeSchedulePayload: ctx.inst.normalizeSchedulePayload, calculatePrescriptionQuantity: ctx.inst.calculatePrescriptionQuantity, buildMedicineUsageNote: ctx.inst.buildMedicineUsageNote, parseMedicineUsage: ctx.inst.parseMedicineUsage, buildMedicineUsagePayload: ctx.inst.buildMedicineUsagePayload, parseGlobalUsageInstructions: ctx.inst.parseGlobalUsageInstructions, buildGlobalUsageInstructions: ctx.inst.buildGlobalUsageInstructions, calculateReExaminationDateTime: ctx.inst.calculateReExaminationDateTime, buildDateTimeInputValue: ctx.inst.buildDateTimeInputValue, parseDateTimeInputValue: ctx.inst.parseDateTimeInputValue } = ctx.inst.MODEL);
		ctx.inst.reExaminationCalendar = null;
		ctx.inst.STATE = {
		reExaminationDraftDateTime: '',
		reExaminationDraftSelection: null,
		bound: false,
		contextToken: 0,
		appointmentId: null,
		appointmentDate: null,
		patientId: null,
		document: null,
		isLoading: null,
		prescriptionRows: [],
		prescriptionLoaded: false,
		prescriptionDirty: false,
		prescriptionRevision: 0,
		prescriptionSaving: false,
		prescriptionUsageMode: 'time_slots',
		preservedGlobalUsage: '',
		prescriptionCodesByType: {},
		reExaminationAppointmentId: null,
		reExaminationDateTime: '',
		reExaminationStatus: null,
		reExaminationSnapshot: null,
		reExaminationError: '',
		prescriptionHistory: [],
		prescriptionHistoryLoaded: false,
		prescriptionHistoryPanelOpen: false,
		prescriptionHistorySelectedIndex: 0,
		nextPrescriptionRowId: 1
	};
		ctx.inst.CHANGES = ctx.inst.RUNTIME.createChangeTracker(ctx.inst.STATE, { revisionKey: 'prescriptionRevision', dirtyKey: 'prescriptionDirty' });
		ctx.inst.SEARCH = ctx.inst.MEDICINE_SEARCH.create({
		requestJson: ctx.inst.requestJson,
		getEndpoint: query => (typeof ctx.inst.endpoints.medicines === 'function'
			? ctx.inst.endpoints.medicines(query)
			: (ctx.inst.endpoints.medicines || `/api/medicines/?search=${encodeURIComponent(query)}&per_page=8`)),
		getDocument: () => ctx.inst.STATE.document || document,
		isRowCurrent: row => ctx.inst.findPrescriptionRow(row.uid) === row
	});
		ctx.inst.printController = null;
		ctx.inst.PRESCRIPTION_TIME_SLOT_FIELDS = ['morning', 'noon', 'afternoon', 'evening'];
		ctx.inst.PRESCRIPTION_SCHEDULE_FIELDS = ['qtyPerTime', 'timesPerDay', ...ctx.inst.PRESCRIPTION_TIME_SLOT_FIELDS];
	}

	function runPrescriptionUiSetup2(ctx) {
		ctx.inst.PRESCRIPTION_FIELD_HANDLERS = new Map([
		['name', ctx.inst.applyPrescriptionNameInput],
		['quantity', () => false],
		['unit', (doc, row, target) => {
			if (!row.isExternal) return false;
			row.unit = target.value.trim();
			return true;
		}],
		['unitPrice', (doc, row, target) => {
			row.unitPrice = Math.max(0, ctx.inst.toNumber(target.value, 0));
			ctx.inst.updatePrescriptionRowTotal(doc, row);
			return true;
		}],
		['prescriptionType', (doc, row, target) => {
			row.prescriptionType = ctx.inst.normalizePrescriptionType(target.value);
			return true;
		}],
		['qtyPerTime', (doc, row, target) => {
			ctx.inst.ensureRowSchedule(doc, row).times_per_day.qty_per_time = Math.max(0.001, ctx.inst.parseDoseValue(target.value, 1) || 1);
			return true;
		}],
		['timesPerDay', (doc, row, target) => {
			ctx.inst.ensureRowSchedule(doc, row).times_per_day.times_per_day = Math.max(1, ctx.inst.toNumber(target.value, 1));
			return true;
		}],
		['usageNote', (doc, row, target) => {
			row.usageNote = target.value;
			row.usageNoteMode = ctx.inst.PRESCRIPTION_USAGE_NOTE_MODES.MANUAL;
			return true;
		}]
	]);
	}

	function create(options = {}) {
		const ctx = {};
		ctx.options = options;
		runPrescriptionUiSetup1(ctx);
		runPrescriptionUiSetup2(ctx);
		return {
		bind: ctx.inst.bind,
		clear: ctx.inst.clear,
		load: ctx.inst.load,
		save: ctx.inst.savePrescription,
		getDraftSnapshot: ctx.inst.getDraftSnapshot,
		restoreDraftSnapshot: ctx.inst.restoreDraftSnapshot,
		hasUnsavedChanges: ctx.inst.hasUnsavedChanges,
		isLoading: () => Boolean(ctx.inst.STATE.isLoading && ctx.inst.STATE.isLoading()),
		getLatestPreviousVisitSnapshot: ctx.inst.getLatestPreviousVisitSnapshot,
		isReExaminationLocked: ctx.inst.isReExaminationLocked,
		getPrescriptionCodesByType: () => ({ ...ctx.inst.STATE.prescriptionCodesByType }),
		getConfig: () => ({ ...ctx.inst.config, dom: { ...ctx.inst.dom }, endpoints: { ...ctx.inst.endpoints } }),
		getState: () => ctx.inst.STATE
	};
	}

	const doctorConfig = window.QLPKDoctorModuleRegistry.require('doctorComponentConfig');
	const doctorInstance = create({
		config: doctorConfig.prescription || {}
	});

	function getOrCreate(options = {}) {
		const rootId = options.config?.rootId;
		if (!rootId) return doctorInstance;
		const root = (options.document || document).getElementById(rootId);
		if (!root) return null;
		const existing = instances.get(root);
		if (existing) return existing;
		const instance = create(options);
		instances.set(root, instance);
		return instance;
	}

	const doctorRoot = document.getElementById(doctorConfig.prescription?.rootId || DEFAULT_DOM.workspace);
	if (doctorRoot) instances.set(doctorRoot, doctorInstance);
	window.QLPKDoctorModuleRegistry.register('prescriptionForm', { create, getOrCreate }, {
		owner: 'doctor/prescription',
		version: 2
	});
})(window, document);
