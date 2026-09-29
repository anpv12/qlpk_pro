(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const DETAILS = REGISTRY.get('clinicalDetails');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!DETAILS) throw new Error('Thiếu persistence component của vùng Khám');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const DEFAULT_MAIN_FIELDS = {
		diagnosis: { controlId: 'diagnosis', hiddenControlId: 'diagnosisIds', autocompleteRootId: 'diagnosisIcdField', payloadKey: 'diagnosis', kind: 'icd', idSourceKey: 'diagnosis_ids' },
		benhKemTheo: { controlId: 'benhKemTheo', hiddenControlId: 'benhKemTheoIds', autocompleteRootId: 'benhKemTheoIcdField', payloadKey: 'benh_kem_theo', kind: 'icd', idSourceKey: 'benh_kem_theo_ids' },
		treatmentPlan: { controlId: 'treatmentPlan', payloadKey: 'treatment_plan', source: 'examination' },
		currentMedications: { controlId: 'currentMedications', autocompleteRootId: 'currentMedicationField', payloadKey: 'current_medications', source: 'examination', kind: 'medication' },
		examinationNotes: { controlId: 'examinationNotes', payloadKey: 'loi_dan', source: 'examination' }
	};
	const DEFAULT_CONFIG = {
		rootId: 'doctorClinicalDecisionPanel',
		mainFields: DEFAULT_MAIN_FIELDS,
		detailFields: null
	};

	function mergeConfig(config = {}) {
		const merged = RUNTIME.mergeConfig(DEFAULT_CONFIG, config);
		return {
			...merged,
			mainFields: merged.mainFields || DEFAULT_MAIN_FIELDS,
			detailFields: Array.isArray(merged.detailFields) ? merged.detailFields : DETAILS.fields
		};
	}

	function installClinicalFormFns1(ctx) {
		function getMedicationInstance(doc, field) {
			const root = ctx.getElement(doc, field.autocompleteRootId);
			if (!root || !ctx.config.medicationSearchEndpoint) return null;
			if (ctx.medicationInstances.has(root)) return ctx.medicationInstances.get(root);
			const control = ctx.getElement(doc, field.controlId);
			const label = item => item.label || [item.name, item.strength].filter(Boolean).join(' · ');
			const Autocomplete = REGISTRY.require('autocompleteField');
			const instance = new Autocomplete(root, {
				limit: 12, emptyQueryLimit: 12,
				getKey: label,
				getLabel: label,
				getDescription: item => [item.registration_number && `SĐK: ${item.registration_number}`,
					item.manufacturer_name].filter(Boolean).join(' · '),
				isEnabled: () => !ctx.isLoading() && Boolean(ctx.state.appointment?.id) && !control.disabled,
				loadOptions: async (query, { skip, limit, signal }) => {
					const params = new URLSearchParams({ mode: 'autocomplete', status: 'all',
						search: query, page: Math.floor(skip / limit) + 1, per_page: limit });
					const response = await ctx.apiCall(`${ctx.config.medicationSearchEndpoint}?${params}`, { signal });
					if (!response.ok) throw new Error('dav-search-failed');
					const payload = await response.json();
					if (!payload.success || !Array.isArray(payload.data)) throw new Error('dav-search-invalid');
					return { data: payload.data, pagination: { per_page: limit, has_next: payload.has_more } };
				},
				onChange: values => {
					if (ctx.isLoading()) return;
					const names = values.map(label);
					control.value = names.length ? JSON.stringify(names) : '';
					ctx.markDirty(control);
				}
			});
			const adapter = {
				reset: () => instance.setSelected(ctx.parseMedicationText(control.value).map(name => ({ label: name })), { silent: true })
			};
			ctx.medicationInstances.set(root, adapter);
			return adapter;
		}

		function getIcdAuthHeader() {
			return ctx.config.getAuthHeader?.()
				|| REGISTRY.get('pageRuntime')?.getAuthHeader?.()
				|| null;
		}

		function getIcdInstance(doc, field) {
			const IcdAutocomplete = REGISTRY.get('icdAutocomplete');
			if (!field?.autocompleteRootId || !IcdAutocomplete) return null;
			const root = ctx.getElement(doc, field.autocompleteRootId);
			if (!root) return null;
			if (ctx.icdInstances.has(root)) return ctx.icdInstances.get(root);
			const instance = new IcdAutocomplete(root, {
				multiple: true,
				selectionKey: 'id',
				getAuthHeader: getIcdAuthHeader,
				onChange: selected => {
					if (ctx.isLoading()) return;
					const ids = selected.map(item => Number(item?.id)).filter(id => Number.isInteger(id) && id > 0);
					ctx.setValue(doc, field.hiddenControlId, JSON.stringify(ids));
					ctx.markDirty(ctx.getElement(doc, field.controlId));
				}
			});
			ctx.icdInstances.set(root, instance);
			return instance;
		}

		Object.assign(ctx, { getMedicationInstance, getIcdAuthHeader, getIcdInstance });
	}

	function installClinicalFormFns2(ctx) {
		async function applyIcdSelection(doc, field, ids, token) {
			const instance = ctx.getIcdInstance(doc, field);
			if (!instance) return false;
			const loader = REGISTRY.get('icdDataLoader')?.loadICDData;
			if (!ids.length || typeof loader !== 'function') {
				instance.clear({ silent: true });
				ctx.setValue(doc, field.controlId, '');
				return false;
			}
			const selected = await loader('', {
				ids,
				limit: ids.length,
				getAuthHeader: ctx.getIcdAuthHeader
			});
			if (token !== ctx.state.contextToken) return false;
			instance.setSelected(Array.isArray(selected) ? selected : [], { silent: true });
			ctx.setValue(doc, field.controlId, '');
			return true;
		}

		async function hydrateIcdField(doc, field, examination, token) {
			const ids = parseIdList(examination[field.idSourceKey]);
			if (await applyIcdSelection(doc, field, ids, token)) {
				ctx.setValue(doc, field.hiddenControlId, JSON.stringify(ids));
			}
		}

		function serializeIcdDraftValue(doc, field) {
			return JSON.stringify(ctx.serializeIcdField(doc, field.hiddenControlId));
		}

		async function restoreIcdDraftField(doc, field, rawValue, token) {
			const instance = ctx.getIcdInstance(doc, field);
			if (!instance) return;
			const ids = parseIdList(rawValue);
			ctx.setValue(doc, field.hiddenControlId, JSON.stringify(ids));
			try {
				await applyIcdSelection(doc, field, ids, token);
			} catch (error) {
				if (token !== ctx.state.contextToken) return;
				instance.clear({ silent: true });
				ctx.setValue(doc, field.controlId, '');
			}
		}

		function bindIcdFields(doc) {
			Object.values(ctx.config.mainFields)
				.filter(field => field.kind === 'icd')
				.forEach(field => ctx.getIcdInstance(doc, field));
		}

		function parseIdList(raw) {
			if (!ctx.hasValue(raw)) return [];
			try {
				const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
				const values = Array.isArray(parsed) ? parsed : [parsed];
				return values
					.map(item => (typeof item === 'object' && item ? item.id : item))
					.filter(item => item !== null && item !== undefined && String(item).trim() !== '')
					.map(item => Number(item))
					.filter(item => Number.isInteger(item) && item > 0);
			} catch (error) {
				return [];
			}
		}

		Object.assign(ctx, { hydrateIcdField, serializeIcdDraftValue, restoreIcdDraftField, bindIcdFields, parseIdList });
	}

	function installClinicalFormFns3(ctx) {
		function parseMedicationText(raw) {
			const value = ctx.textOf(raw);
			if (!value) return [];
			try {
				const parsed = JSON.parse(value);
				if (Array.isArray(parsed)) {
					return parsed.map(item => typeof item === 'string'
						? item.trim()
						: ctx.textOf(item && (item.name || item.medicine_name || item.label || item.value)))
						.filter(Boolean);
				}
			} catch (error) {
				// Plain text remains valid for the existing examination payload.
			}
			return value.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
		}

		function serializeMedicationInput(raw) {
			const items = parseMedicationText(raw);
			return items.length ? JSON.stringify(items) : '';
		}

		function serializeIcdField(doc, hiddenId) {
			if (!hiddenId) return [];
			return ctx.parseIdList(ctx.getValue(doc, hiddenId));
		}

		function readPayloadValue(field, examination, patient) {
			if (!field) return '';
			const source = field.source === 'patient' ? patient : examination;
			return source[field.sourceKey || field.payloadKey];
		}

		function isLoading() {
			return typeof ctx.state.isLoading === 'function' && ctx.state.isLoading();
		}

		function ownsField(target) {
			const root = target && target.closest ? target.closest(`#${ctx.config.rootId}`) : null;
			return Boolean(root && ctx.fieldIds.includes(target.id));
		}

		function markDirty(control) {
			if (isLoading()) return;
			const config = ctx.detailsPersistence.getConfig(control);
			if (config) ctx.DETAIL_CHANGES.mark(config.section);
			else ctx.MAIN_CHANGES.mark();
			ctx.syncDirtyState();
		}

		function handleFieldMutation(event) {
			const target = event && event.target;
			if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !ownsField(target)) return false;
			markDirty(target);
			return true;
		}

		Object.assign(ctx, {
			parseMedicationText, serializeMedicationInput, serializeIcdField, readPayloadValue, isLoading, ownsField,
			markDirty, handleFieldMutation
		});
	}

	function installClinicalFormFns4(ctx) {
		function clear(options = {}) {
			const doc = ctx.getDocument(options);
			ctx.state.contextToken += 1;
			ctx.state.appointment = null;
			ctx.state.patientId = null;
			ctx.state.examinationId = null;
			ctx.state.currentData = null;
			ctx.state.detailsLoading = false;
			ctx.state.detailsLoaded = false;
			ctx.state.detailsLoadError = null;
			ctx.state.detailsLoadPromise = null;
			ctx.state.icdLoadPromise = null;
			ctx.MAIN_CHANGES.reset();
			ctx.DETAIL_CHANGES.reset();
			ctx.icdInstances.forEach(instance => instance.clear({ silent: true }));
			ctx.fieldIds.forEach(id => ctx.setValue(doc, id, ''));
			ctx.medicationInstances.forEach(instance => instance.reset());
			ctx.syncDirtyState();
		}

		function renderClinicalFields(doc, payload = {}, token = ctx.state.contextToken) {
			const examination = payload.examination_info || {};
			const patient = payload.patient_info || {};
			Object.values(ctx.config.mainFields).forEach(field => {
				let value = ctx.readPayloadValue(field, examination, patient);
				if (field.kind === 'medication') value = ctx.serializeMedicationInput(value);
				if (field.kind === 'icd') value = '';
				ctx.setValue(doc, field.controlId, value);
				if (field.kind === 'medication') ctx.getMedicationInstance(doc, field)?.reset();
				if (field.hiddenControlId) {
					const ids = examination[field.idSourceKey];
					ctx.setValue(doc, field.hiddenControlId, JSON.stringify(ctx.parseIdList(ids)));
				}
			});
			ctx.config.detailFields.forEach(field => ctx.setValue(doc, field.controlId, ''));
			ctx.state.icdLoadPromise = Promise.all(
				Object.values(ctx.config.mainFields)
					.filter(field => field.kind === 'icd')
					.map(field => ctx.hydrateIcdField(doc, field, examination, token))
			).finally(() => {
				if (token === ctx.state.contextToken) ctx.state.icdLoadPromise = null;
			});
		}

		Object.assign(ctx, { clear, renderClinicalFields });
	}

	function installClinicalFormFns5(ctx) {
		function render(payload = {}, options = {}) {
			const doc = ctx.getDocument(options);
			const appointment = payload || {};
			ctx.state.contextToken += 1;
			const token = ctx.state.contextToken;
			const examination = payload.examination_info || {};
			const patient = payload.patient_info || {};
			ctx.state.appointment = appointment;
			ctx.state.patientId = ctx.textOf(patient.id || appointment.patient_id);
			ctx.state.examinationId = ctx.textOf(examination.id || appointment.examination_id);
			ctx.state.currentData = payload;
			ctx.MAIN_CHANGES.reset();
			ctx.DETAIL_CHANGES.reset();
			ctx.state.detailsLoaded = false;
			ctx.state.detailsLoadError = null;
			ctx.renderClinicalFields(doc, payload, token);
			const appointmentId = ctx.textOf(appointment.id);
			if (!appointmentId) return Promise.resolve(false);
			const detailsLoadPromise = ctx.detailsPersistence.load(doc, appointmentId, token);
			ctx.state.detailsLoadPromise = detailsLoadPromise;
			detailsLoadPromise.catch(() => {});
			return detailsLoadPromise;
		}

		function collect(options = {}) {
			const doc = ctx.getDocument(options);
			return Object.values(ctx.config.mainFields).reduce((payload, field) => {
				if (!field.payloadKey) return payload;
				if (field.kind === 'icd') payload[field.payloadKey] = ctx.serializeIcdField(doc, field.hiddenControlId);
				else if (field.kind === 'medication') payload[field.payloadKey] = ctx.serializeMedicationInput(ctx.getValue(doc, field.controlId));
				else payload[field.payloadKey] = ctx.getValue(doc, field.controlId);
				return payload;
			}, {});
		}

		function getDraftSnapshot(options = {}) {
			const doc = ctx.getDocument(options);
			const controls = {};
			ctx.fieldDefinitions.forEach(field => {
				const controlId = field.kind === 'icd' ? field.hiddenControlId : field.controlId;
				if (!controlId) return;
				const control = ctx.getElement(doc, controlId);
				if (!control) return;
				if (field.kind === 'icd') controls[controlId] = ctx.serializeIcdDraftValue(doc, field);
				else controls[controlId] = control.type === 'checkbox' ? Boolean(control.checked) : ctx.textOf(control.value);
			});
			return { controls };
		}

		Object.assign(ctx, { render, collect, getDraftSnapshot });
	}

	function installClinicalFormFns6(ctx) {
		async function restoreDraftSnapshot(snapshot = {}, options = {}) {
			const doc = ctx.getDocument(options);
			const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
			if (!isCurrent()) return { restored: 0 };
			const controls = snapshot && snapshot.controls && typeof snapshot.controls === 'object' ? snapshot.controls : {};
			let restored = 0;
			const detailSections = new Set();
			let mainRestored = false;
			Object.entries(controls).forEach(([id, value]) => {
				if (!isCurrent()) return;
				if (!ctx.fieldIds.includes(id)) return;
				const field = ctx.fieldByControlId.get(id) || ctx.fieldByHiddenControlId.get(id);
				if (field?.kind === 'icd' && id === field.controlId) return;
				const control = ctx.getElement(doc, id);
				if (!control) return;
				if (control.type === 'checkbox') control.checked = Boolean(value);
				else control.value = field?.kind === 'icd' ? JSON.stringify(ctx.parseIdList(value)) : ctx.textOf(value);
				if (field?.kind === 'medication') {
					control.value = ctx.serializeMedicationInput(value);
					ctx.getMedicationInstance(doc, field)?.reset();
				}
				const config = ctx.detailsPersistence.getConfig(control);
				if (config) detailSections.add(config.section);
				else mainRestored = true;
				restored += 1;
			});
			const token = ctx.state.contextToken;
			await Promise.all(Object.values(ctx.config.mainFields)
				.filter(field => field.kind === 'icd' && field.hiddenControlId && Object.prototype.hasOwnProperty.call(controls, field.hiddenControlId))
				.map(field => ctx.restoreIcdDraftField(doc, field, controls[field.hiddenControlId], token)));
			if (!isCurrent()) return { restored: 0 };
			if (restored) {
				if (mainRestored) ctx.MAIN_CHANGES.mark();
				detailSections.forEach(section => ctx.DETAIL_CHANGES.mark(section));
				ctx.syncDirtyState();
			}
			return { restored };
		}

		function bind(options = {}) {
			const doc = ctx.getDocument(options);
			ctx.state.isLoading = options.isLoading || ctx.state.isLoading;
			const root = ctx.getElement(doc, ctx.config.rootId);
			if (!root || ctx.bound) return Boolean(root);
			ctx.bindIcdFields(doc);
			Object.values(ctx.config.mainFields).filter(field => field.kind === 'medication')
				.forEach(field => ctx.getMedicationInstance(doc, field));
			root.addEventListener('input', ctx.handleFieldMutation);
			root.addEventListener('change', ctx.handleFieldMutation);
			ctx.bound = true;
			return true;
		}

		Object.assign(ctx, { restoreDraftSnapshot, bind });
	}

	function runClinicalFormSetup1(closureCtx) {
		closureCtx.ctx = {};
		installClinicalFormFns1(closureCtx.ctx);
		installClinicalFormFns2(closureCtx.ctx);
		installClinicalFormFns3(closureCtx.ctx);
		installClinicalFormFns4(closureCtx.ctx);
		installClinicalFormFns5(closureCtx.ctx);
		installClinicalFormFns6(closureCtx.ctx);
		closureCtx.ctx.config = mergeConfig(closureCtx.options.config);
		closureCtx.ctx.state = {
			contextToken: 0,
			appointment: null,
			patientId: null,
			examinationId: null,
			currentData: null,
			mainDirty: false,
			mainRevision: 0,
			detailDirtySections: new Set(),
			detailRevisions: {},
			detailsLoading: false,
			detailsLoaded: false,
			detailsLoadError: null,
			detailsLoadPromise: null,
			icdLoadPromise: null,
			isLoading: closureCtx.options.isLoading || (() => false)
		};
		closureCtx.ctx.MAIN_CHANGES = RUNTIME.createChangeTracker(closureCtx.ctx.state, { revisionKey: 'mainRevision', dirtyKey: 'mainDirty' });
		closureCtx.ctx.DETAIL_CHANGES = RUNTIME.createSectionChangeTracker(closureCtx.ctx.state, { revisionsKey: 'detailRevisions', dirtyKey: 'detailDirtySections' });
		closureCtx.ctx.getDocument = closureCtx.options.getDocument || RUNTIME.getDocument;
		closureCtx.ctx.getElement = closureCtx.options.getElement || ((doc, id) => doc.getElementById(id));
		closureCtx.ctx.getValue = closureCtx.options.getValue || ((doc, id) => {
			const element = closureCtx.ctx.getElement(doc, id);
			return element ? String(element.value || '').trim() : '';
		});
		closureCtx.ctx.setValue = closureCtx.options.setValue || ((doc, id, value) => {
			const element = closureCtx.ctx.getElement(doc, id);
			if (element) element.value = value == null ? '' : String(value);
		});
		closureCtx.ctx.textOf = closureCtx.options.textOf || (value => value == null ? '' : String(value).trim());
		closureCtx.ctx.hasValue = closureCtx.options.hasValue || (value => value !== undefined && value !== null && String(value).trim() !== '');
		closureCtx.ctx.syncDirtyState = closureCtx.options.syncDirtyState || (() => {});
		closureCtx.ctx.apiCall = closureCtx.options.apiCall || (() => Promise.reject(new Error('missing-api-call')));
		closureCtx.ctx.fieldDefinitions = Object.values(closureCtx.ctx.config.mainFields).concat(closureCtx.ctx.config.detailFields);
		closureCtx.ctx.fieldIds = closureCtx.ctx.fieldDefinitions.flatMap(field => [field.controlId, field.hiddenControlId]).filter(Boolean);
		closureCtx.ctx.fieldByControlId = new Map(closureCtx.ctx.fieldDefinitions.map(field => [field.controlId, field]));
		closureCtx.ctx.fieldByHiddenControlId = new Map(closureCtx.ctx.fieldDefinitions
			.filter(field => field.hiddenControlId)
			.map(field => [field.hiddenControlId, field]));
		closureCtx.ctx.icdInstances = new Map();
		closureCtx.ctx.medicationInstances = new Map();
		closureCtx.ctx.bound = false;
		closureCtx.ctx.detailsPersistence = DETAILS.create({
			fields: closureCtx.ctx.config.detailFields,
			state: closureCtx.ctx.state,
			detailChanges: closureCtx.ctx.DETAIL_CHANGES,
			getElement: closureCtx.ctx.getElement,
			getValue: closureCtx.ctx.getValue,
			setValue: closureCtx.ctx.setValue,
			textOf: closureCtx.ctx.textOf,
			hasValue: closureCtx.ctx.hasValue,
			parseResponseError: (...args) => RUNTIME.readResponseError?.(...args) || Promise.resolve('Không xử lý được phản hồi'),
			syncDirtyState: closureCtx.ctx.syncDirtyState,
			apiCall: (...args) => closureCtx.ctx.apiCall(...args)
		});
	}

	function create(options = {}) {
		const closureCtx = {};
		closureCtx.options = options;
		runClinicalFormSetup1(closureCtx);
		return {
			bind: closureCtx.ctx.bind,
			clear: closureCtx.ctx.clear,
			render: closureCtx.ctx.render,
			populate: closureCtx.ctx.render,
			collect: closureCtx.ctx.collect,
			prepareEmptyDetailDefaults: options => {
				if (closureCtx.ctx.isLoading()) return false;
				return closureCtx.ctx.detailsPersistence.prepareEmptyDefaults(closureCtx.ctx.getDocument(options));
			},
			loadDetails: (doc, appointmentId, token) => closureCtx.ctx.detailsPersistence.load(doc, appointmentId, token),
			saveDetails: (doc, appointmentId, token, sections) => closureCtx.ctx.detailsPersistence.save(doc, appointmentId, token, sections),
			hasUnsavedChanges: () => Boolean(closureCtx.ctx.state.mainDirty || closureCtx.ctx.state.detailDirtySections.size),
			getSaveState: () => ({
				contextToken: closureCtx.ctx.state.contextToken,
				mainDirty: closureCtx.ctx.state.mainDirty,
				mainRevision: closureCtx.ctx.state.mainRevision,
				detailDirtySections: new Set(closureCtx.ctx.state.detailDirtySections),
				detailsLoading: closureCtx.ctx.state.detailsLoading,
				detailsLoaded: closureCtx.ctx.state.detailsLoaded,
				detailsLoadError: closureCtx.ctx.state.detailsLoadError,
				detailsLoadPromise: closureCtx.ctx.state.detailsLoadPromise,
				examinationId: closureCtx.ctx.state.examinationId
			}),
			markMainSaved: revision => {
				closureCtx.ctx.MAIN_CHANGES.settle(revision);
				closureCtx.ctx.syncDirtyState();
			},
			getContextToken: () => closureCtx.ctx.state.contextToken,
			getExaminationId: () => closureCtx.ctx.state.examinationId,
			whenInitialLoadSettled: () => Promise.allSettled([
				closureCtx.ctx.state.detailsLoadPromise || Promise.resolve(true),
				closureCtx.ctx.state.icdLoadPromise || Promise.resolve(true)
			]),
			ownsField: closureCtx.ctx.ownsField,
			handleFieldMutation: closureCtx.ctx.handleFieldMutation,
			getDraftSnapshot: closureCtx.ctx.getDraftSnapshot,
			restoreDraftSnapshot: closureCtx.ctx.restoreDraftSnapshot,
			getFieldIds: () => closureCtx.ctx.fieldIds.slice(),
			getConfig: () => ({ ...closureCtx.ctx.config, mainFields: { ...closureCtx.ctx.config.mainFields }, detailFields: closureCtx.ctx.config.detailFields.slice() })
		};
	}

	REGISTRY.register('clinicalExaminationForm', { create, defaults: mergeConfig() });
})(window);
