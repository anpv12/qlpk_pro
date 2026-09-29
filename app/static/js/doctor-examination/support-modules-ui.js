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

	function installSupportModulesFns1(ctx) {
		function getPrescriptionUi() {
			const provider = ctx.options.getPrescriptionUi || ctx.config.getPrescriptionUi;
			if (typeof provider === 'function') return provider() || null;
			return provider || REGISTRY.get('prescriptionForm')?.getOrCreate?.() || null;
		}

		function getServicesForm() {
			if (ctx.state.servicesForm) return ctx.state.servicesForm;
			const factory = ctx.options.servicesFactory || ctx.config.servicesFactory || REGISTRY.get('servicesForm');
			if (!factory || typeof factory.create !== 'function') {
				throw new Error('Thiếu component Dịch vụ');
			}
			ctx.state.servicesForm = factory.create({ config: ctx.config.services, runtime: ctx.runtime });
			return ctx.state.servicesForm;
		}

		function getIndicationsForm() {
			if (ctx.state.indicationsForm) return ctx.state.indicationsForm;
			const factory = ctx.options.indicationsFactory || ctx.config.indicationsFactory || REGISTRY.get('indicationsForm');
			if (!factory || typeof factory.create !== 'function') {
				throw new Error('Thiếu component Chỉ định');
			}
			ctx.state.indicationsForm = factory.create({ config: ctx.config.indications, runtime: ctx.runtime });
			return ctx.state.indicationsForm;
		}

		function bind(bindOptions = {}) {
			ctx.state.context = bindOptions.context || ctx.state.context;
			const doc = ctx.runtime.getDocument(bindOptions);
			ctx.state.isLoading = bindOptions.isLoading || ctx.state.isLoading;
			if (typeof ctx.runtime.configure === 'function') ctx.runtime.configure(bindOptions);
			const prescription = getPrescriptionUi();
			if (!prescription || typeof prescription.bind !== 'function') {
				throw new Error('Thiếu component Đơn thuốc');
			}
			prescription.bind({ ...bindOptions, context: ctx.state.context, document: doc });
			getServicesForm().bind({ ...bindOptions, context: ctx.state.context, document: doc });
			getIndicationsForm().bind({ ...bindOptions, context: ctx.state.context, document: doc });
			ctx.state.bound = true;
			return Boolean(doc.getElementById(ctx.config.rootId));
		}

		function clear(optionsForClear = {}) {
			ctx.state.context = optionsForClear.context || ctx.state.context;
			const doc = ctx.runtime.getDocument(optionsForClear);
			const prescription = getPrescriptionUi();
			if (prescription && typeof prescription.clear === 'function') prescription.clear({ document: doc, context: ctx.state.context });
			getServicesForm().clear({ document: doc, context: ctx.state.context });
			getIndicationsForm().clear({ document: doc, context: ctx.state.context });
		}

		Object.assign(ctx, { getPrescriptionUi, getServicesForm, getIndicationsForm, bind, clear });
	}

	function installSupportModulesFns2(ctx) {
		async function load(context = {}) {
			ctx.state.context = context.context || ctx.state.context;
			const doc = ctx.runtime.getDocument(context);
			const appointment = context.payload || context.appointment || {};
			const appointmentId = context.appointmentId || appointment.id || appointment.appointment?.id;
			const patient = appointment.patient_info || appointment.patient || {};
			const patientId = context.patientId || patient.id || appointment.patient_id;
			const prescription = ctx.getPrescriptionUi();
			const services = ctx.getServicesForm();
			const indications = ctx.getIndicationsForm();
			if (!appointmentId || !prescription) return Promise.resolve(false);
			const results = await Promise.allSettled([
				prescription.load({ ...context, context: ctx.state.context, document: doc, appointmentId, patientId }),
				services.load({ ...context, context: ctx.state.context, document: doc, appointmentId, patientId }),
				indications.load({ ...context, context: ctx.state.context, document: doc, appointmentId, patientId })
			]);
			return results.every(result => result.status === 'fulfilled' && result.value !== false);
		}

		Object.assign(ctx, { load });
	}

	function installSupportModulesFns3(ctx) {
		async function saveAll(saveOptions = {}) {
			ctx.state.context = saveOptions.context || ctx.state.context;
			const doc = ctx.runtime.getDocument(saveOptions);
			const onlyDirty = saveOptions.onlyDirty !== false;
			const prescription = ctx.getPrescriptionUi();
			const services = ctx.getServicesForm();
			const indications = ctx.getIndicationsForm();
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

			const settled = await Promise.allSettled(modules.map(module => module.save({ document: doc, context: ctx.state.context, silent: true })));
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

		Object.assign(ctx, { saveAll });
	}

	function installSupportModulesFns4(ctx) {
		function isIndicationStateLoaded(indicationState) {
			return Boolean(indicationState?.ordersLoaded && indicationState.surveyLoaded && indicationState.performersLoaded);
		}

		function getSaveReadiness() {
			const prescription = ctx.getPrescriptionUi();
			const services = ctx.getServicesForm();
			const indications = ctx.getIndicationsForm();
			const indicationState = indications.getState?.();
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
					isLoaded: isIndicationStateLoaded(indicationState)
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
			const prescription = ctx.getPrescriptionUi();
			return Boolean(
				prescription?.hasUnsavedChanges?.()
				|| ctx.getServicesForm().hasUnsavedChanges()
				|| ctx.getIndicationsForm().hasUnsavedChanges()
			);
		}

		function isReExaminationLocked() {
			const prescription = ctx.getPrescriptionUi();
			return Boolean(prescription?.isReExaminationLocked?.());
		}

		function getDraftSnapshot(snapshotOptions = {}) {
			const prescription = ctx.getPrescriptionUi();
			const indications = ctx.getIndicationsForm();
			return {
				prescription: prescription ? prescription.getDraftSnapshot(snapshotOptions) : {},
				services: ctx.getServicesForm().getDraftSnapshot(snapshotOptions),
				indications: indications.getDraftSnapshot(snapshotOptions)
			};
		}

		Object.assign(ctx, { getSaveReadiness, hasUnsavedChanges, isReExaminationLocked, getDraftSnapshot });
	}

	function installSupportModulesFns5(ctx) {
		function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
			ctx.state.context = restoreOptions.context || ctx.state.context;
			const doc = ctx.runtime.getDocument(restoreOptions);
			const prescription = ctx.getPrescriptionUi();
			const services = ctx.getServicesForm();
			const indications = ctx.getIndicationsForm();
			const dirty = restoreOptions.dirty || {};
			const base = restoreOptions.base || {};
			if (prescription) restorePrescriptionDraft(prescription, doc, snapshot, base, Boolean(dirty.prescription));
			restoreFormDraft(services, doc, snapshot.services, base.services, Boolean(dirty.services));
			restoreFormDraft(indications, doc, snapshot.indications, base.indications, Boolean(dirty.indications));
			return true;
		}

		function restorePrescriptionDraft(prescription, doc, snapshot, base, dirty) {
			prescription.restoreDraftSnapshot(snapshot.prescription || {}, { document: doc, context: ctx.state.context, dirty });
			if (typeof ctx.runtime.markRestoredRows !== 'function') return;
			// Each prescription row renders as two <tr>s (medicine + note) with
			// the same row id. Mark only the medicine row so the row indexes stay
			// aligned with the prescription snapshot and restore focus can target
			// the medicine name input rather than the note input.
			ctx.runtime.markRestoredRows(doc, '#doctorPrescriptionWorkspace .doctor-prescription-table__body-row', ctx.runtime.changedRowIndexes(
				base.prescription?.rows,
				snapshot.prescription?.rows
			));
		}

		function restoreFormDraft(form, doc, formSnapshot, formBase, dirty) {
			form.restoreDraftSnapshot(formSnapshot || {}, { document: doc, context: ctx.state.context, dirty });
			form.markRestoredRows(doc, formBase?.rows, formSnapshot?.rows);
		}

		Object.assign(ctx, { restoreDraftSnapshot });
	}

	function create(options = {}) {
		const ctx = {};
		ctx.options = options;
		installSupportModulesFns1(ctx);
		installSupportModulesFns2(ctx);
		installSupportModulesFns3(ctx);
		installSupportModulesFns4(ctx);
		installSupportModulesFns5(ctx);

		ctx.runtime = ctx.options.runtime || REGISTRY.require('supportRuntime');
		if (!ctx.runtime) throw new Error('Thiếu support runtime');

		ctx.config = {
			...DEFAULT_CONFIG,
			...(ctx.options.config || {}),
			services: { ...DEFAULT_CONFIG.services, ...((ctx.options.config || {}).services || {}) },
			indications: { ...DEFAULT_CONFIG.indications, ...((ctx.options.config || {}).indications || {}) }
		};
		ctx.state = {
			bound: false,
			isLoading: null,
			context: null,
			servicesForm: null,
			indicationsForm: null
		};

		return {
			bind: ctx.bind,
			clear: ctx.clear,
			load: ctx.load,
			saveAll: ctx.saveAll,
			getSaveReadiness: ctx.getSaveReadiness,
			hasUnsavedChanges: ctx.hasUnsavedChanges,
			isReExaminationLocked: ctx.isReExaminationLocked,
			saveServices: saveOptions => ctx.getServicesForm().save(saveOptions),
			getDraftSnapshot: ctx.getDraftSnapshot,
			restoreDraftSnapshot: ctx.restoreDraftSnapshot,
			getServicesForm: ctx.getServicesForm,
			getIndicationsForm: ctx.getIndicationsForm,
			refreshIndications: refreshOptions => ctx.getIndicationsForm().refreshCurrent(refreshOptions),
			getContext: () => ctx.state.context,
			getConfig: () => ({ ...ctx.config, services: { ...ctx.config.services }, indications: { ...ctx.config.indications } })
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
		config: REGISTRY.require('doctorComponentConfig').support || {},
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
