// Parts (nạp trước file này): part-1.js, part-2.js, part-3.js
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

	function create(options = {}) {
		// Functions of create() live in prescription-ui-parts/ (installed per instance, like the original closures).
		const inst = {};
		inst.options = options;
		const outer = { createReExaminationCalendar };
		moduleParts.installers.forEach(install => install(inst, outer));
		inst.config = options.config || {};
		inst.registry = window.QLPKDoctorModuleRegistry;
		({ RUNTIME: inst.RUNTIME, model: inst.MODEL, rows: inst.ROWS, history: inst.HISTORY, reExam: inst.REEXAM, medicineSearch: inst.MEDICINE_SEARCH } = resolveDependencies(options));

		inst.dom = { ...DEFAULT_DOM, ...(inst.config.dom || {}) };
		inst.endpoints = { ...DEFAULT_ENDPOINTS, ...(inst.config.endpoints || {}) };
		inst.runtimeGetElement = inst.RUNTIME.getElement;
		inst.runtimeSetText = inst.RUNTIME.setText;
		inst.runtimeSetValue = inst.RUNTIME.setValue;
		inst.runtimeGetValue = inst.RUNTIME.getValue;
		inst.resolveDomId = id => {
			const key = Object.keys(DEFAULT_DOM).find(name => DEFAULT_DOM[name] === id);
			return key ? inst.dom[key] : id;
		};
		inst.getElement = (doc, id) => inst.runtimeGetElement(doc, inst.resolveDomId(id));
		inst.setText = (doc, id, value, options = {}) => inst.runtimeSetText(doc, inst.resolveDomId(id), value, options);
		inst.setValue = (doc, id, value) => inst.runtimeSetValue(doc, inst.resolveDomId(id), value);
		inst.getValue = (doc, id) => inst.runtimeGetValue(doc, inst.resolveDomId(id));
		({ getDocument: inst.getDocument, textOf: inst.textOf, toNumber: inst.toNumber, normalizeId: inst.normalizeId, formatCurrency: inst.formatCurrency, draftRowsWithoutRuntimeIds: inst.draftRowsWithoutRuntimeIds, getRowUidFromTarget: inst.getRowUidFromTarget } = inst.RUNTIME);
		({ PRESCRIPTION_USAGE_MODES: inst.PRESCRIPTION_USAGE_MODES, PRESCRIPTION_USAGE_NOTE_MODES: inst.PRESCRIPTION_USAGE_NOTE_MODES, normalizePrescriptionType: inst.normalizePrescriptionType, ensurePrescriptionUsageMode: inst.ensurePrescriptionUsageMode, normalizeUsageNoteMode: inst.normalizeUsageNoteMode, parseDoseValue: inst.parseDoseValue, parseMedicineDays: inst.parseMedicineDays, formatDoseValue: inst.formatDoseValue, roundPrescriptionQuantity: inst.roundPrescriptionQuantity, normalizeSchedulePayload: inst.normalizeSchedulePayload, calculatePrescriptionQuantity: inst.calculatePrescriptionQuantity, buildMedicineUsageNote: inst.buildMedicineUsageNote, parseMedicineUsage: inst.parseMedicineUsage, buildMedicineUsagePayload: inst.buildMedicineUsagePayload, parseGlobalUsageInstructions: inst.parseGlobalUsageInstructions, buildGlobalUsageInstructions: inst.buildGlobalUsageInstructions, calculateReExaminationDateTime: inst.calculateReExaminationDateTime, buildDateTimeInputValue: inst.buildDateTimeInputValue, parseDateTimeInputValue: inst.parseDateTimeInputValue } = inst.MODEL);

	inst.reExaminationCalendar = null;
	inst.STATE = {
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
	inst.CHANGES = inst.RUNTIME.createChangeTracker(inst.STATE, { revisionKey: 'prescriptionRevision', dirtyKey: 'prescriptionDirty' });
	inst.SEARCH = inst.MEDICINE_SEARCH.create({
		requestJson: inst.requestJson,
		getEndpoint: query => (typeof inst.endpoints.medicines === 'function'
			? inst.endpoints.medicines(query)
			: (inst.endpoints.medicines || `/api/medicines/?search=${encodeURIComponent(query)}&per_page=8`)),
		getDocument: () => inst.STATE.document || document,
		isRowCurrent: row => inst.findPrescriptionRow(row.uid) === row
	});

	inst.printController = null;
	inst.PRESCRIPTION_TIME_SLOT_FIELDS = ['morning', 'noon', 'afternoon', 'evening'];
	inst.PRESCRIPTION_SCHEDULE_FIELDS = ['qtyPerTime', 'timesPerDay', ...inst.PRESCRIPTION_TIME_SLOT_FIELDS];

	inst.PRESCRIPTION_FIELD_HANDLERS = new Map([
		['name', inst.applyPrescriptionNameInput],
		['quantity', () => false],
		['unit', (doc, row, target) => {
			if (!row.isExternal) return false;
			row.unit = target.value.trim();
			return true;
		}],
		['unitPrice', (doc, row, target) => {
			row.unitPrice = Math.max(0, inst.toNumber(target.value, 0));
			inst.updatePrescriptionRowTotal(doc, row);
			return true;
		}],
		['prescriptionType', (doc, row, target) => {
			row.prescriptionType = inst.normalizePrescriptionType(target.value);
			return true;
		}],
		['qtyPerTime', (doc, row, target) => {
			inst.ensureRowSchedule(doc, row).times_per_day.qty_per_time = Math.max(0.001, inst.parseDoseValue(target.value, 1) || 1);
			return true;
		}],
		['timesPerDay', (doc, row, target) => {
			inst.ensureRowSchedule(doc, row).times_per_day.times_per_day = Math.max(1, inst.toNumber(target.value, 1));
			return true;
		}],
		['usageNote', (doc, row, target) => {
			row.usageNote = target.value;
			row.usageNoteMode = inst.PRESCRIPTION_USAGE_NOTE_MODES.MANUAL;
			return true;
		}]
	]);

	return {
		bind: inst.bind,
		clear: inst.clear,
		load: inst.load,
		save: inst.savePrescription,
		getDraftSnapshot: inst.getDraftSnapshot,
		restoreDraftSnapshot: inst.restoreDraftSnapshot,
		hasUnsavedChanges: inst.hasUnsavedChanges,
		isLoading: () => Boolean(inst.STATE.isLoading && inst.STATE.isLoading()),
		getLatestPreviousVisitSnapshot: inst.getLatestPreviousVisitSnapshot,
		isReExaminationLocked: inst.isReExaminationLocked,
		getPrescriptionCodesByType: () => ({ ...inst.STATE.prescriptionCodesByType }),
		getConfig: () => ({ ...inst.config, dom: { ...inst.dom }, endpoints: { ...inst.endpoints } }),
		getState: () => inst.STATE
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
