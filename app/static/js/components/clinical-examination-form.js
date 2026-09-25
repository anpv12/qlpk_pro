(function (window, document) {
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
		return {
			...DEFAULT_CONFIG,
			...config,
			mainFields: config.mainFields || DEFAULT_MAIN_FIELDS,
			detailFields: Array.isArray(config.detailFields) ? config.detailFields : DETAILS.fields
		};
	}

	function create(options = {}) {
		const config = mergeConfig(options.config);
		const state = {
			contextToken: 0,
			appointment: null,
			patientId: null,
			examinationId: null,
			currentData: null,
			revision: 0,
			mainDirty: false,
			mainRevision: 0,
			detailDirtySections: new Set(),
			detailRevisions: {},
			detailsLoading: false,
			detailsLoaded: false,
			detailsLoadError: null,
			detailsLoadPromise: null,
			icdLoadPromise: null,
			isLoading: options.isLoading || (() => false)
		};
		const getDocument = options.getDocument || (context => context && context.document ? context.document : document);
		const getElement = options.getElement || ((doc, id) => doc.getElementById(id));
		const getValue = options.getValue || ((doc, id) => {
			const element = getElement(doc, id);
			return element ? String(element.value || '').trim() : '';
		});
		const setValue = options.setValue || ((doc, id, value) => {
			const element = getElement(doc, id);
			if (element) element.value = value == null ? '' : String(value);
		});
		const textOf = options.textOf || (value => value == null ? '' : String(value).trim());
		const hasValue = options.hasValue || (value => value !== undefined && value !== null && String(value).trim() !== '');
		const syncDirtyState = options.syncDirtyState || (() => {});
		const apiCall = options.apiCall || (() => Promise.reject(new Error('missing-api-call')));
		const fieldDefinitions = Object.values(config.mainFields).concat(config.detailFields);
		const fieldIds = fieldDefinitions.flatMap(field => [field.controlId, field.hiddenControlId]).filter(Boolean);
		const fieldByControlId = new Map(fieldDefinitions.map(field => [field.controlId, field]));
		const fieldByHiddenControlId = new Map(fieldDefinitions
			.filter(field => field.hiddenControlId)
			.map(field => [field.hiddenControlId, field]));
		const icdInstances = new Map();
		const medicationInstances = new Map();
		let bound = false;

		function getMedicationInstance(doc, field) {
			const root = getElement(doc, field.autocompleteRootId);
			if (!root || !config.medicationSearchEndpoint) return null;
			if (medicationInstances.has(root)) return medicationInstances.get(root);
			const control = getElement(doc, field.controlId);
			const label = item => item.label || [item.name, item.strength].filter(Boolean).join(' · ');
			const Autocomplete = REGISTRY.require('autocompleteField');
			const instance = new Autocomplete(root, {
				limit: 12, emptyQueryLimit: 12,
				getKey: label,
				getLabel: label,
				getDescription: item => [item.registration_number && `SĐK: ${item.registration_number}`,
					item.manufacturer_name].filter(Boolean).join(' · '),
				isEnabled: () => !isLoading() && Boolean(state.appointment?.id) && !control.disabled,
				loadOptions: async (query, { skip, limit, signal }) => {
					const params = new URLSearchParams({ mode: 'autocomplete', status: 'all',
						search: query, page: Math.floor(skip / limit) + 1, per_page: limit });
					const response = await apiCall(`${config.medicationSearchEndpoint}?${params}`, { signal });
					if (!response.ok) throw new Error('dav-search-failed');
					const payload = await response.json();
					if (!payload.success || !Array.isArray(payload.data)) throw new Error('dav-search-invalid');
					return { data: payload.data, pagination: { per_page: limit, has_next: payload.has_more } };
				},
				onChange: values => {
					if (isLoading()) return;
					const names = values.map(label);
					control.value = names.length ? JSON.stringify(names) : '';
					markDirty(control);
				}
			});
			const adapter = {
				reset: () => instance.setSelected(parseMedicationText(control.value).map(name => ({ label: name })), { silent: true })
			};
			medicationInstances.set(root, adapter);
			return adapter;
		}

		function getIcdAuthHeader() {
			return config.getAuthHeader?.()
				|| REGISTRY.get('pageRuntime')?.getAuthHeader?.()
				|| null;
		}

		function getIcdInstance(doc, field) {
			const IcdAutocomplete = REGISTRY.get('icdAutocomplete');
			if (!field?.autocompleteRootId || !IcdAutocomplete) return null;
			const root = getElement(doc, field.autocompleteRootId);
			if (!root) return null;
			if (icdInstances.has(root)) return icdInstances.get(root);
			const instance = new IcdAutocomplete(root, {
				multiple: true,
				selectionKey: 'id',
				getAuthHeader: getIcdAuthHeader,
				onChange: selected => {
					if (isLoading()) return;
					const ids = selected.map(item => Number(item?.id)).filter(id => Number.isInteger(id) && id > 0);
					setValue(doc, field.hiddenControlId, JSON.stringify(ids));
					markDirty(getElement(doc, field.controlId));
				}
			});
			icdInstances.set(root, instance);
			return instance;
		}

		async function hydrateIcdField(doc, field, examination, token) {
			const instance = getIcdInstance(doc, field);
			if (!instance) return;
			const ids = parseIdList(examination[field.idSourceKey]);
			if (!ids.length) {
				instance.clear({ silent: true });
				setValue(doc, field.controlId, '');
				return;
			}

			const loader = REGISTRY.get('icdDataLoader')?.loadICDData;
			if (typeof loader !== 'function') {
				instance.clear({ silent: true });
				setValue(doc, field.controlId, '');
				return;
			}
			const selected = await loader('', {
				ids,
				limit: ids.length,
				getAuthHeader: getIcdAuthHeader
			});
			if (token !== state.contextToken) return;
			instance.setSelected(Array.isArray(selected) ? selected : [], { silent: true });
			setValue(doc, field.controlId, '');
			setValue(doc, field.hiddenControlId, JSON.stringify(ids));
		}

		function serializeIcdDraftValue(doc, field) {
			return JSON.stringify(serializeIcdField(doc, field.hiddenControlId));
		}

		async function restoreIcdDraftField(doc, field, rawValue, token) {
			const instance = getIcdInstance(doc, field);
			if (!instance) return;
			const ids = parseIdList(rawValue);
			setValue(doc, field.hiddenControlId, JSON.stringify(ids));
			if (!ids.length) {
				instance.clear({ silent: true });
				setValue(doc, field.controlId, '');
				return;
			}

			const loader = REGISTRY.get('icdDataLoader')?.loadICDData;
			if (typeof loader !== 'function') {
				instance.clear({ silent: true });
				setValue(doc, field.controlId, '');
				return;
			}
			try {
				const selected = await loader('', {
					ids,
					limit: ids.length,
					getAuthHeader: getIcdAuthHeader
				});
				if (token !== state.contextToken) return;
				instance.setSelected(Array.isArray(selected) ? selected : [], { silent: true });
			} catch (error) {
				if (token !== state.contextToken) return;
				instance.clear({ silent: true });
			}
			setValue(doc, field.controlId, '');
		}

		function bindIcdFields(doc) {
			Object.values(config.mainFields)
				.filter(field => field.kind === 'icd')
				.forEach(field => getIcdInstance(doc, field));
		}

		function parseIdList(raw) {
			if (!hasValue(raw)) return [];
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

		function parseMedicationText(raw) {
			const value = textOf(raw);
			if (!value) return [];
			try {
				const parsed = JSON.parse(value);
				if (Array.isArray(parsed)) {
					return parsed.map(item => typeof item === 'string'
						? item.trim()
						: textOf(item && (item.name || item.medicine_name || item.label || item.value)))
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
			return parseIdList(getValue(doc, hiddenId));
		}

		function readPayloadValue(field, examination, patient) {
			if (!field) return '';
			const source = field.source === 'patient' ? patient : examination;
			return source[field.sourceKey || field.payloadKey];
		}

		function isLoading() {
			return typeof state.isLoading === 'function' && state.isLoading();
		}

		function ownsField(target) {
			const root = target && target.closest ? target.closest(`#${config.rootId}`) : null;
			return Boolean(root && fieldIds.includes(target.id));
		}

		function markDirty(control) {
			if (isLoading()) return;
			state.revision += 1;
			const config = detailsPersistence.getConfig(control);
			if (config) {
				state.detailDirtySections.add(config.section);
				state.detailRevisions[config.section] = (state.detailRevisions[config.section] || 0) + 1;
			} else {
				state.mainDirty = true;
				state.mainRevision += 1;
			}
			syncDirtyState();
		}

		function handleFieldMutation(event) {
			const target = event && event.target;
			if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !ownsField(target)) return false;
			markDirty(target);
			return true;
		}

		function clear(options = {}) {
			const doc = getDocument(options);
			state.contextToken += 1;
			state.appointment = null;
			state.patientId = null;
			state.examinationId = null;
			state.currentData = null;
			state.detailsLoading = false;
			state.detailsLoaded = false;
			state.detailsLoadError = null;
			state.detailsLoadPromise = null;
			state.icdLoadPromise = null;
			state.revision = 0;
			state.mainDirty = false;
			state.mainRevision = 0;
			state.detailDirtySections.clear();
			state.detailRevisions = {};
			icdInstances.forEach(instance => instance.clear({ silent: true }));
			fieldIds.forEach(id => setValue(doc, id, ''));
			medicationInstances.forEach(instance => instance.reset());
			syncDirtyState();
		}

		function renderClinicalFields(doc, payload = {}, token = state.contextToken) {
			const examination = payload.examination_info || {};
			const patient = payload.patient_info || {};
			Object.entries(config.mainFields).forEach(([name, field]) => {
				let value = readPayloadValue(field, examination, patient);
				if (field.kind === 'medication') value = serializeMedicationInput(value);
				if (field.kind === 'icd') value = '';
				setValue(doc, field.controlId, value);
				if (field.kind === 'medication') getMedicationInstance(doc, field)?.reset();
				if (field.hiddenControlId) {
					const ids = examination[field.idSourceKey];
					setValue(doc, field.hiddenControlId, JSON.stringify(parseIdList(ids)));
				}
			});
			config.detailFields.forEach(field => setValue(doc, field.controlId, ''));
			state.icdLoadPromise = Promise.all(
				Object.values(config.mainFields)
					.filter(field => field.kind === 'icd')
					.map(field => hydrateIcdField(doc, field, examination, token))
			).finally(() => {
				if (token === state.contextToken) state.icdLoadPromise = null;
			});
		}

		function render(payload = {}, options = {}) {
			const doc = getDocument(options);
			const appointment = payload || {};
			state.contextToken += 1;
			const token = state.contextToken;
			const examination = payload.examination_info || {};
			const patient = payload.patient_info || {};
			state.appointment = appointment;
			state.patientId = textOf(patient.id || appointment.patient_id);
			state.examinationId = textOf(examination.id || appointment.examination_id);
			state.currentData = payload;
			state.revision = 0;
			state.mainDirty = false;
			state.mainRevision = 0;
			state.detailDirtySections.clear();
			state.detailRevisions = {};
			state.detailsLoaded = false;
			state.detailsLoadError = null;
			renderClinicalFields(doc, payload, token);
			const appointmentId = textOf(appointment.id);
			if (!appointmentId) return Promise.resolve(false);
			const detailsLoadPromise = detailsPersistence.load(doc, appointmentId, token);
			state.detailsLoadPromise = detailsLoadPromise;
			detailsLoadPromise.catch(() => {});
			return detailsLoadPromise;
		}

		function collect(options = {}) {
			const doc = getDocument(options);
			return Object.values(config.mainFields).reduce((payload, field) => {
				if (!field.payloadKey) return payload;
				const value = field.kind === 'icd'
					? serializeIcdField(doc, field.hiddenControlId)
					: field.kind === 'medication'
						? serializeMedicationInput(getValue(doc, field.controlId))
						: getValue(doc, field.controlId);
				payload[field.payloadKey] = value;
				return payload;
			}, {});
		}

		function getDraftSnapshot(options = {}) {
			const doc = getDocument(options);
			const controls = {};
			fieldDefinitions.forEach(field => {
				const controlId = field.kind === 'icd' ? field.hiddenControlId : field.controlId;
				if (!controlId) return;
				const control = getElement(doc, controlId);
				if (!control) return;
				controls[controlId] = field.kind === 'icd'
					? serializeIcdDraftValue(doc, field)
					: control.type === 'checkbox' ? Boolean(control.checked) : textOf(control.value);
			});
			return { controls };
		}

		async function restoreDraftSnapshot(snapshot = {}, options = {}) {
			const doc = getDocument(options);
			const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
			if (!isCurrent()) return { restored: 0 };
			const controls = snapshot && snapshot.controls && typeof snapshot.controls === 'object' ? snapshot.controls : {};
			let restored = 0;
			const detailSections = new Set();
			let mainRestored = false;
			Object.entries(controls).forEach(([id, value]) => {
				if (!isCurrent()) return;
				if (!fieldIds.includes(id)) return;
				const field = fieldByControlId.get(id) || fieldByHiddenControlId.get(id);
				if (field?.kind === 'icd' && id === field.controlId) return;
				const control = getElement(doc, id);
				if (!control) return;
				if (control.type === 'checkbox') control.checked = Boolean(value);
				else control.value = field?.kind === 'icd' ? JSON.stringify(parseIdList(value)) : textOf(value);
				if (field?.kind === 'medication') {
					control.value = serializeMedicationInput(value);
					getMedicationInstance(doc, field)?.reset();
				}
				const config = detailsPersistence.getConfig(control);
				if (config) detailSections.add(config.section);
				else mainRestored = true;
				restored += 1;
			});
			const token = state.contextToken;
			await Promise.all(Object.values(config.mainFields)
				.filter(field => field.kind === 'icd' && field.hiddenControlId && Object.prototype.hasOwnProperty.call(controls, field.hiddenControlId))
				.map(field => restoreIcdDraftField(doc, field, controls[field.hiddenControlId], token)));
			if (!isCurrent()) return { restored: 0 };
			if (restored) {
				state.revision += 1;
				if (mainRestored) {
					state.mainDirty = true;
					state.mainRevision += 1;
				}
				detailSections.forEach(section => {
					state.detailDirtySections.add(section);
					state.detailRevisions[section] = (state.detailRevisions[section] || 0) + 1;
				});
				syncDirtyState();
			}
			return { restored };
		}

		const detailsPersistence = DETAILS.create({
			fields: config.detailFields,
			state,
			getElement,
			getValue,
			setValue,
			textOf,
			hasValue,
			parseResponseError: (...args) => RUNTIME.readResponseError?.(...args) || Promise.resolve('Không xử lý được phản hồi'),
			syncDirtyState,
			apiCall: (...args) => apiCall(...args)
		});

		function bind(options = {}) {
			const doc = getDocument(options);
			state.isLoading = options.isLoading || state.isLoading;
			const root = getElement(doc, config.rootId);
			if (!root || bound) return Boolean(root);
			bindIcdFields(doc);
			Object.values(config.mainFields).filter(field => field.kind === 'medication')
				.forEach(field => getMedicationInstance(doc, field));
			root.addEventListener('input', handleFieldMutation);
			root.addEventListener('change', handleFieldMutation);
			bound = true;
			return true;
		}

		return {
			bind,
			clear,
			render,
			populate: render,
			collect,
			prepareEmptyDetailDefaults: options => {
				if (isLoading()) return false;
				return detailsPersistence.prepareEmptyDefaults(getDocument(options));
			},
			loadDetails: (doc, appointmentId, token) => detailsPersistence.load(doc, appointmentId, token),
			saveDetails: (doc, appointmentId, token, sections) => detailsPersistence.save(doc, appointmentId, token, sections),
			hasUnsavedChanges: () => Boolean(state.mainDirty || state.detailDirtySections.size),
			getSaveState: () => ({
				contextToken: state.contextToken,
				mainDirty: state.mainDirty,
				mainRevision: state.mainRevision,
				detailDirtySections: new Set(state.detailDirtySections),
				detailsLoading: state.detailsLoading,
				detailsLoaded: state.detailsLoaded,
				detailsLoadError: state.detailsLoadError,
				detailsLoadPromise: state.detailsLoadPromise,
				examinationId: state.examinationId
			}),
			markMainSaved: revision => {
				if (revision === state.mainRevision) state.mainDirty = false;
				syncDirtyState();
			},
			getContextToken: () => state.contextToken,
			getExaminationId: () => state.examinationId,
			whenInitialLoadSettled: () => Promise.allSettled([
				state.detailsLoadPromise || Promise.resolve(true),
				state.icdLoadPromise || Promise.resolve(true)
			]),
			ownsField,
			handleFieldMutation,
			getDraftSnapshot,
			restoreDraftSnapshot,
			getFieldIds: () => fieldIds.slice(),
			getConfig: () => ({ ...config, mainFields: { ...config.mainFields }, detailFields: config.detailFields.slice() })
		};
	}

	REGISTRY.register('clinicalExaminationForm', { create, defaults: mergeConfig() });
})(window, document);
