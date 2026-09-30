// Parts (nạp trước file này): form-installers.js
(function (window) {
	'use strict';
	const { installClinicalForm3, installClinicalForm4, installClinicalForm5, installClinicalForm6 } = window.QLPKModuleParts["components/clinical-examination-form"];

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

	function installClinicalForm1(ctx) {
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

	function installClinicalForm2(ctx) {
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

	function runClinicalForm1(ctx) {
		ctx.config = mergeConfig(ctx.options.config);
		ctx.state = {
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
			isLoading: ctx.options.isLoading || (() => false)
		};
		ctx.MAIN_CHANGES = RUNTIME.createChangeTracker(ctx.state, { revisionKey: 'mainRevision', dirtyKey: 'mainDirty' });
		ctx.DETAIL_CHANGES = RUNTIME.createSectionChangeTracker(ctx.state, { revisionsKey: 'detailRevisions', dirtyKey: 'detailDirtySections' });
		ctx.getDocument = ctx.options.getDocument || RUNTIME.getDocument;
		ctx.getElement = ctx.options.getElement || ((doc, id) => doc.getElementById(id));
		ctx.getValue = ctx.options.getValue || ((doc, id) => {
			const element = ctx.getElement(doc, id);
			return element ? String(element.value || '').trim() : '';
		});
		ctx.setValue = ctx.options.setValue || ((doc, id, value) => {
			const element = ctx.getElement(doc, id);
			if (element) element.value = value == null ? '' : String(value);
		});
		ctx.textOf = ctx.options.textOf || (value => value == null ? '' : String(value).trim());
		ctx.hasValue = ctx.options.hasValue || (value => value !== undefined && value !== null && String(value).trim() !== '');
		ctx.syncDirtyState = ctx.options.syncDirtyState || (() => {});
		ctx.apiCall = ctx.options.apiCall || (() => Promise.reject(new Error('missing-api-call')));
		ctx.fieldDefinitions = Object.values(ctx.config.mainFields).concat(ctx.config.detailFields);
		ctx.fieldIds = ctx.fieldDefinitions.flatMap(field => [field.controlId, field.hiddenControlId]).filter(Boolean);
		ctx.fieldByControlId = new Map(ctx.fieldDefinitions.map(field => [field.controlId, field]));
		ctx.fieldByHiddenControlId = new Map(ctx.fieldDefinitions
			.filter(field => field.hiddenControlId)
			.map(field => [field.hiddenControlId, field]));
		ctx.icdInstances = new Map();
		ctx.medicationInstances = new Map();
		ctx.bound = false;
		ctx.detailsPersistence = DETAILS.create({
			fields: ctx.config.detailFields,
			state: ctx.state,
			detailChanges: ctx.DETAIL_CHANGES,
			getElement: ctx.getElement,
			getValue: ctx.getValue,
			setValue: ctx.setValue,
			textOf: ctx.textOf,
			hasValue: ctx.hasValue,
			parseResponseError: (...args) => RUNTIME.readResponseError?.(...args) || Promise.resolve('Không xử lý được phản hồi'),
			syncDirtyState: ctx.syncDirtyState,
			apiCall: (...args) => ctx.apiCall(...args)
		});
	}

	function create(options = {}) {
		const ctx = {};
		ctx.options = options;
		installClinicalForm1(ctx);
		installClinicalForm2(ctx);
		installClinicalForm3(ctx);
		installClinicalForm4(ctx);
		installClinicalForm5(ctx);
		installClinicalForm6(ctx);
		runClinicalForm1(ctx);
		return {
			bind: ctx.bind,
			clear: ctx.clear,
			render: ctx.render,
			populate: ctx.render,
			collect: ctx.collect,
			prepareEmptyDetailDefaults: options => {
				if (ctx.isLoading()) return false;
				return ctx.detailsPersistence.prepareEmptyDefaults(ctx.getDocument(options));
			},
			loadDetails: (doc, appointmentId, token) => ctx.detailsPersistence.load(doc, appointmentId, token),
			saveDetails: (doc, appointmentId, token, sections) => ctx.detailsPersistence.save(doc, appointmentId, token, sections),
			hasUnsavedChanges: () => Boolean(ctx.state.mainDirty || ctx.state.detailDirtySections.size),
			getSaveState: () => ({
				contextToken: ctx.state.contextToken,
				mainDirty: ctx.state.mainDirty,
				mainRevision: ctx.state.mainRevision,
				detailDirtySections: new Set(ctx.state.detailDirtySections),
				detailsLoading: ctx.state.detailsLoading,
				detailsLoaded: ctx.state.detailsLoaded,
				detailsLoadError: ctx.state.detailsLoadError,
				detailsLoadPromise: ctx.state.detailsLoadPromise,
				examinationId: ctx.state.examinationId
			}),
			markMainSaved: revision => {
				ctx.MAIN_CHANGES.settle(revision);
				ctx.syncDirtyState();
			},
			getContextToken: () => ctx.state.contextToken,
			getExaminationId: () => ctx.state.examinationId,
			whenInitialLoadSettled: () => Promise.allSettled([
				ctx.state.detailsLoadPromise || Promise.resolve(true),
				ctx.state.icdLoadPromise || Promise.resolve(true)
			]),
			ownsField: ctx.ownsField,
			handleFieldMutation: ctx.handleFieldMutation,
			getDraftSnapshot: ctx.getDraftSnapshot,
			restoreDraftSnapshot: ctx.restoreDraftSnapshot,
			getFieldIds: () => ctx.fieldIds.slice(),
			getConfig: () => ({ ...ctx.config, mainFields: { ...ctx.config.mainFields }, detailFields: ctx.config.detailFields.slice() })
		};
	}

	REGISTRY.register('clinicalExaminationForm', { create, defaults: mergeConfig() });
})(window);
