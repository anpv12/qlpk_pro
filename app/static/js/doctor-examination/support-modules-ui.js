(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');

	const DEFAULT_CONFIG = {
		rootId: 'doctorClinicalWorkspace',
		services: {},
		indications: {},
		getPrescriptionUi: null,
		servicesFactory: null,
		indicationsFactory: null
	};
	const instances = new WeakMap();

	function create(options = {}) {
		const runtime = options.runtime || REGISTRY.require('supportRuntime');
		if (!runtime) throw new Error('Thiếu support runtime');

		const config = {
			...DEFAULT_CONFIG,
			...(options.config || {}),
			services: { ...DEFAULT_CONFIG.services, ...((options.config || {}).services || {}) },
			indications: { ...DEFAULT_CONFIG.indications, ...((options.config || {}).indications || {}) }
		};
		const state = {
			bound: false,
			isLoading: null,
			context: null,
			servicesForm: null,
			indicationsForm: null
		};

		function getPrescriptionUi() {
			const provider = options.getPrescriptionUi || config.getPrescriptionUi;
			if (typeof provider === 'function') return provider() || null;
			return provider || REGISTRY.get('prescriptionForm')?.getOrCreate?.() || null;
		}

		function getServicesForm() {
			if (state.servicesForm) return state.servicesForm;
			const factory = options.servicesFactory || config.servicesFactory || REGISTRY.get('servicesForm');
			if (!factory || typeof factory.create !== 'function') {
				throw new Error('Thiếu component Dịch vụ');
			}
			state.servicesForm = factory.create({ config: config.services, runtime });
			return state.servicesForm;
		}

		function getIndicationsForm() {
			if (state.indicationsForm) return state.indicationsForm;
			const factory = options.indicationsFactory || config.indicationsFactory || REGISTRY.get('indicationsForm');
			if (!factory || typeof factory.create !== 'function') {
				throw new Error('Thiếu component Chỉ định');
			}
			state.indicationsForm = factory.create({ config: config.indications, runtime });
			return state.indicationsForm;
		}

		function bind(bindOptions = {}) {
			state.context = bindOptions.context || state.context;
			const doc = runtime.getDocument(bindOptions);
			state.isLoading = bindOptions.isLoading || state.isLoading;
			if (typeof runtime.configure === 'function') runtime.configure(bindOptions);
			const prescription = getPrescriptionUi();
			if (!prescription || typeof prescription.bind !== 'function') {
				throw new Error('Thiếu component Đơn thuốc');
			}
			prescription.bind({ ...bindOptions, context: state.context, document: doc });
			getServicesForm().bind({ ...bindOptions, context: state.context, document: doc });
			getIndicationsForm().bind({ ...bindOptions, context: state.context, document: doc });
			state.bound = true;
			return Boolean(doc.getElementById(config.rootId));
		}

		function clear(optionsForClear = {}) {
			state.context = optionsForClear.context || state.context;
			const doc = runtime.getDocument(optionsForClear);
			const prescription = getPrescriptionUi();
			if (prescription && typeof prescription.clear === 'function') prescription.clear({ document: doc, context: state.context });
			getServicesForm().clear({ document: doc, context: state.context });
			getIndicationsForm().clear({ document: doc, context: state.context });
		}

		async function load(context = {}) {
			state.context = context.context || state.context;
			const doc = runtime.getDocument(context);
			const appointment = context.payload || context.appointment || {};
			const appointmentId = context.appointmentId || appointment.id || appointment.appointment?.id;
			const patient = appointment.patient_info || appointment.patient || {};
			const patientId = context.patientId || patient.id || appointment.patient_id;
			const prescription = getPrescriptionUi();
			const services = getServicesForm();
			const indications = getIndicationsForm();
			if (!appointmentId || !prescription) return Promise.resolve(false);
			const results = await Promise.allSettled([
				prescription.load({ ...context, context: state.context, document: doc, appointmentId, patientId }),
				services.load({ ...context, context: state.context, document: doc, appointmentId, patientId }),
				indications.load({ ...context, context: state.context, document: doc, appointmentId, patientId })
			]);
			return results.every(result => result.status === 'fulfilled' && result.value !== false);
		}

		async function saveAll(saveOptions = {}) {
			state.context = saveOptions.context || state.context;
			const doc = runtime.getDocument(saveOptions);
			const onlyDirty = saveOptions.onlyDirty !== false;
			const prescription = getPrescriptionUi();
			const services = getServicesForm();
			const indications = getIndicationsForm();
			const modules = [
				{
					key: 'prescription',
					label: 'Đơn thuốc',
					isDirty: Boolean(prescription?.hasUnsavedChanges?.()),
					save: optionsForSave => prescription.save(optionsForSave)
				},
				{
					key: 'services',
					label: 'Dịch vụ',
					isDirty: services.hasUnsavedChanges(),
					save: optionsForSave => services.save(optionsForSave)
				},
				{
					key: 'indications',
					label: 'Chỉ định',
					isDirty: indications.hasUnsavedChanges(),
					save: optionsForSave => indications.save(optionsForSave)
				}
			].filter(module => !onlyDirty || module.isDirty);
			if (!modules.length) return { status: 'skipped', reason: 'clean', modules: [] };

			const settled = await Promise.allSettled(modules.map(module => module.save({ document: doc, context: state.context, silent: true })));
			const results = settled.map((result, index) => {
				const module = modules[index];
				if (result.status === 'fulfilled') {
					const value = result.value || {};
					const originalStatus = value.status || (value.skipped ? 'skipped' : 'success');
					if (originalStatus === 'success') {
						return { ...module, status: 'success', originalStatus, result: value };
					}
					const reason = value.reason || value.message || `${module.label} chưa lưu thành công.`;
					return {
						...module,
						status: 'error',
						originalStatus,
						reason,
						error: new Error(reason),
						result: value
					};
				}
				return {
					...module,
					status: 'error',
					originalStatus: 'error',
					reason: result.reason?.message || `${module.label} chưa lưu thành công.`,
					error: result.reason
				};
			});
			const failedModules = results.filter(result => result.status === 'error');
			const skippedModules = results.filter(result => result.originalStatus === 'skipped');
			const successMessages = results
				.filter(result => result.status === 'success' && result.result?.inventoryMessage)
				.map(result => result.result.inventoryMessage);
			const status = failedModules.length ? 'error' : 'success';
			return { status, modules: results, failedModules, skippedModules, successMessages };
		}

		function getSaveReadiness() {
			const prescription = getPrescriptionUi();
			const services = getServicesForm();
			const indications = getIndicationsForm();
			const modules = [
				{
					key: 'prescription',
					label: 'Đơn thuốc',
					isDirty: Boolean(prescription?.hasUnsavedChanges?.()),
					isLoaded: Boolean(prescription?.getState?.()?.prescriptionLoaded)
				},
				{
					key: 'services',
					label: 'Dịch vụ',
					isDirty: services.hasUnsavedChanges(),
					isLoaded: Boolean(services.getState?.()?.servicesLoaded)
				},
				{
					key: 'indications',
					label: 'Chỉ định',
					isDirty: indications.hasUnsavedChanges(),
					isLoaded: Boolean(indications.getState?.()?.ordersLoaded
						&& indications.getState?.()?.surveyLoaded
						&& indications.getState?.()?.performersLoaded)
				}
			];
			const failures = modules
				.filter(module => module.isDirty && !module.isLoaded)
				.map(module => ({
					key: module.key,
					label: module.label,
					reason: `Chưa tải đủ dữ liệu ${module.label.toLowerCase()}.`
				}));
			return { ready: failures.length === 0, modules, failures };
		}

		function hasUnsavedChanges() {
			const prescription = getPrescriptionUi();
			return Boolean(
				prescription?.hasUnsavedChanges?.()
				|| getServicesForm().hasUnsavedChanges()
				|| getIndicationsForm().hasUnsavedChanges()
			);
		}

		function isReExaminationLocked() {
			const prescription = getPrescriptionUi();
			return Boolean(prescription?.isReExaminationLocked?.());
		}

		function getDraftSnapshot(snapshotOptions = {}) {
			const prescription = getPrescriptionUi();
			const indications = getIndicationsForm();
			return {
				prescription: prescription ? prescription.getDraftSnapshot(snapshotOptions) : {},
				services: getServicesForm().getDraftSnapshot(snapshotOptions),
				indications: indications.getDraftSnapshot(snapshotOptions)
			};
		}

		function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
			state.context = restoreOptions.context || state.context;
			const doc = runtime.getDocument(restoreOptions);
			const prescription = getPrescriptionUi();
			const services = getServicesForm();
			const indications = getIndicationsForm();
			const dirty = restoreOptions.dirty || {};
			if (prescription) {
				prescription.restoreDraftSnapshot(snapshot.prescription || {}, {
					document: doc,
					context: state.context,
					dirty: Boolean(dirty.prescription)
				});
				if (typeof runtime.markRestoredRows === 'function') {
					// Each prescription row renders as two <tr>s (medicine + note) with
					// the same row id. Mark only the medicine row so the row indexes stay
					// aligned with the prescription snapshot and restore focus can target
					// the medicine name input rather than the note input.
					runtime.markRestoredRows(doc, '#doctorPrescriptionWorkspace .doctor-prescription-table__body-row', runtime.changedRowIndexes(
						restoreOptions.base?.prescription?.rows,
						snapshot.prescription?.rows
					));
				}
			}
			services.restoreDraftSnapshot(snapshot.services || {}, {
				document: doc,
				context: state.context,
				dirty: Boolean(dirty.services)
			});
			services.markRestoredRows(
				doc,
				restoreOptions.base?.services?.rows,
				snapshot.services?.rows
			);
			indications.restoreDraftSnapshot(snapshot.indications || {}, {
				document: doc,
				context: state.context,
				dirty: Boolean(dirty.indications)
			});
			indications.markRestoredRows(
				doc,
				restoreOptions.base?.indications?.rows,
				snapshot.indications?.rows
			);
			return true;
		}

		return {
			bind,
			clear,
			load,
			saveAll,
			getSaveReadiness,
			hasUnsavedChanges,
			isReExaminationLocked,
			saveServices: saveOptions => getServicesForm().save(saveOptions),
			getDraftSnapshot,
			restoreDraftSnapshot,
			getServicesForm,
			getIndicationsForm,
			refreshIndications: refreshOptions => getIndicationsForm().refreshCurrent(refreshOptions),
			getContext: () => state.context,
			getConfig: () => ({ ...config, services: { ...config.services }, indications: { ...config.indications } })
		};
	}

	function getOrCreate(options = {}) {
		const sourceDocument = options.document || document;
		const rootId = options.config?.rootId || DEFAULT_CONFIG.rootId;
		const root = sourceDocument.getElementById(rootId);
		if (!root) return null;
		const existing = instances.get(root);
		if (existing) return existing;
		const instance = create(options);
		instances.set(root, instance);
		return instance;
	}

	const defaultInstance = getOrCreate({
		config: REGISTRY.get('doctorComponentConfig')?.support || {},
		getPrescriptionUi: () => REGISTRY.get('prescriptionForm')?.getOrCreate?.(),
		servicesFactory: REGISTRY.get('servicesForm'),
		indicationsFactory: REGISTRY.get('indicationsForm')
	});
	const api = { create, getOrCreate, ...(defaultInstance || {}) };
	window.QLPKDoctorModuleRegistry.register('supportModulesUi', api, {
		dependencies: ['supportRuntime', 'prescriptionForm', 'servicesForm', 'indicationsForm'],
		owner: 'doctor/support'
	});
})(window, document);
