// Parts (nạp trước file này): part-1.js, part-2.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/doctor-indications-form#create'] || (window.QLPKModuleParts['components/doctor-indications-form#create'] = { installers: [] });

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const ORDER_STATE_UTILS = REGISTRY.require('orderSelectionStateUtils');
	const STATUS_UTILS = REGISTRY.require('orderStatusUtils');
	const AUTOCOMPLETE_UTILS = REGISTRY.require('orderAutocompleteUtils');
	const CONFIRMATION_DIALOG = REGISTRY.require('confirmationDialog');

	const DEFAULT_DOM = {
		root: 'doctorIndicationsPanel',
		name: 'doctorIndicationName',
		nameDropdown: 'doctorIndicationNameDropdown',
		locationFieldset: 'doctorIndicationLocationFieldset',
		performerGroup: 'doctorIndicationPerformerGroup',
		performer: 'doctorIndicationPerformer',
		outFacilityGroup: 'doctorIndicationOutFacilityGroup',
		outFacility: 'doctorIndicationOutFacility',
		date: 'doctorIndicationDate',
		submit: 'doctorIndicationSubmit',
		cancelEdit: 'doctorIndicationCancelEdit',
		message: 'doctorIndicationsMessage',
		count: 'doctorIndicationsCount',
		list: 'doctorIndicationsList'
	};

	const DEFAULT_ENDPOINTS = {
		appointment: ({ appointmentId }) => `/api/chi-dinh/appointment/${appointmentId}`,
		surveyTemplates: '/api/survey-templates-for-orders',
		performers: '/users/doctors'
	};
	const MAX_ORDER_NAME_LENGTH = 255;
	const VALID_SOURCES = Object.freeze(['custom', 'survey']);

	const DEFAULT_CONFIG = {
		rootId: DEFAULT_DOM.root,
		strictRoot: true,
		dom: DEFAULT_DOM,
		endpoints: DEFAULT_ENDPOINTS
	};

	const mergeConfig = config => RUNTIME.mergeConfig(DEFAULT_CONFIG, config, ['dom', 'endpoints']);

	function create(options = {}) {
		// Functions of create() live in doctor-indications-form-parts/ (installed per instance, like the original closures).
		const inst = {};
		inst.options = options;
		const outer = { AUTOCOMPLETE_UTILS, CONFIRMATION_DIALOG, MAX_ORDER_NAME_LENGTH, ORDER_STATE_UTILS, REGISTRY, RUNTIME, STATUS_UTILS, VALID_SOURCES };
		moduleParts.installers.forEach(install => install(inst, outer));
		inst.config = mergeConfig(options.config);
		({ getElement: inst.getElement, textOf: inst.textOf, normalizeId: inst.normalizeId, escapeHtml: inst.escapeHtml, escapeAttr: inst.escapeAttr, requestJson: inst.requestJson, showToast: inst.showToast, isCurrentToken: inst.isCurrentToken, cloneDraftValue: inst.cloneDraftValue, draftRowsWithoutRuntimeIds: inst.draftRowsWithoutRuntimeIds, markRestoredRows: inst.markRestoredRows, changedRowIndexes: inst.changedRowIndexes } = RUNTIME);

		inst.STATE = {
			bound: false,
			apiCall: null,
			contextToken: 0,
			appointmentId: null,
			patientId: null,
			defaultDate: '',
			isLoading: null,
			rows: [],
			surveyTemplates: [],
			surveyIndex: new Map(),
			selectedSurvey: null,
			surveyLoaded: false,
			autocomplete: null,
			performers: [],
			performersLoaded: false,
			ordersLoaded: false,
			ordersDirty: false,
			ordersRevision: 0,
			realtimePending: false,
			realtimeRequest: 0,
			saving: false,
			editingTempId: null
		};
		inst.CHANGES = RUNTIME.createChangeTracker(inst.STATE, { revisionKey: 'ordersRevision', dirtyKey: 'ordersDirty' });

		return {
			bind: inst.bind,
			clear: inst.clear,
			load: inst.load,
			refreshCurrent: inst.refreshCurrent,
			populate: inst.load,
			render: inst.render,
			collect: inst.buildSavePayload,
			save: inst.save,
			hasUnsavedChanges: () => Boolean(inst.STATE.ordersDirty),
			getDraftSnapshot: inst.getDraftSnapshot,
			restoreDraftSnapshot: inst.restoreDraftSnapshot,
			markRestoredRows: (doc, baseRows, draftRows) => inst.markRestoredRows(inst.getDocument({ document: doc }), '[data-doctor-indication-row]', inst.changedRowIndexes(baseRows, draftRows)),
			getState: () => inst.STATE,
			readForm: doc => inst.readForm(inst.getDocument({ document: doc })),
			getConfig: () => ({ ...inst.config, dom: { ...inst.config.dom }, endpoints: { ...inst.config.endpoints } })
		};
	}

	REGISTRY.register('indicationsForm', { create, defaults: mergeConfig() }, {
		dependencies: ['supportRuntime', 'componentDomScope', 'iconSystem', 'confirmationDialog', 'orderSelectionStateUtils', 'orderStatusUtils', 'orderAutocompleteUtils'],
		owner: 'doctor/indications'
	});
})(window);
