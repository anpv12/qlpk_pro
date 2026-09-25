(function (window, document) {
	'use strict';

	const INSTANCE_PROPERTY = '_qlpkPatientHistoryModalInstance';
	const TRIGGER_PROPERTY = '_qlpkPatientHistoryModalTrigger';
	const REGISTRY = window.QLPKDoctorModuleRegistry;

	function resolveElement(value, doc = document) {
		if (!value) return null;
		if (typeof value === 'string') return doc.getElementById(value);
		return value;
	}

	function requireDependency(value, label) {
		if (!value) throw new Error(`Thiếu ${label} cho Patient History Modal`);
		return value;
	}

	function createDataRuntime(options = {}) {
		if (options.dataRuntime) return options.dataRuntime;
		if (options.dataRuntime === false) return null;

		const factory = options.dataRuntimeFactory || REGISTRY?.get?.('modalHistoryDataRuntime');
		if (!factory || typeof factory.create !== 'function') return null;
		return factory.create({
			document: options.document || document,
			apiCall: options.apiCall,
			...(options.dataRuntimeOptions || {})
		});
	}

	function buildDefaultContextOptions(options, dependencies) {
		const { dataRuntime, tabsUi } = dependencies;
		const fetchers = dataRuntime?.fetchers || {};
		const defaults = {
			document: options.document || document,
			apiCall: options.apiCall,
			showToast: options.showToast
		};

		if (tabsUi && typeof tabsUi.clearHistoryTabContent === 'function') {
			defaults.clearHistoryTabs = clearOptions => tabsUi.clearHistoryTabContent({
				...clearOptions,
				onVitalSigns: () => dataRuntime?.vitalSigns?.clear?.()
			});
		}
		if (tabsUi && typeof tabsUi.renderActiveTabLoading === 'function') {
			defaults.renderActiveTabLoading = loadingOptions => tabsUi.renderActiveTabLoading(loadingOptions);
		}
		if (dataRuntime) {
			const prescriptionPreview = REGISTRY?.get?.('prescriptionModalPreview');
			const prescriptionTemplate = REGISTRY?.get?.('prescriptionDocumentTemplate');
			const prescriptionController = prescriptionPreview?.create
				? prescriptionPreview.create({
					buildPrescriptionScreenHTML: prescriptionTemplate?.buildPrescriptionScreenHTML,
					createBarcodesInElement: dataRuntime.createBarcodesInElement
				})
				: prescriptionPreview?.getController?.();
			defaults.loadVitalSigns = patientId => dataRuntime.vitalSigns?.load?.(patientId);
			defaults.fetchPatientDetail = fetchers.fetchPatientDetail;
			defaults.fetchExaminationDetail = fetchers.fetchExaminationDetail;
			defaults.fetchSectionDetails = fetchers.fetchSectionDetails;
			defaults.fetchPrescription = fetchers.fetchPrescription;
			defaults.fetchAppointment = fetchers.fetchAppointment;
			defaults.fetchRelatives = fetchers.fetchRelatives;
			defaults.buildHistoryRendererOptions = () => ({
				fetchServicesForAppointment: fetchers.fetchServicesForAppointment,
				buildServiceInvoiceHTML: dataRuntime.buildServiceInvoiceHTML,
				buildMedicalRecordHTML: dataRuntime.buildMedicalRecordHTML,
				setupPrescriptionTabPagination: (...args) => prescriptionController?.setupPrescriptionTabPagination?.(...args),
				getClinicInfoConfig: dataRuntime.getClinicInfo,
				createBarcodesInElement: dataRuntime.createBarcodesInElement
			});
		}

		return defaults;
	}

	function resolveContextOptions(options, dependencies) {
		const defaults = buildDefaultContextOptions(options, dependencies);
		const supplied = typeof options.buildContextOptions === 'function'
			? options.buildContextOptions({ ...dependencies, defaults })
			: (options.contextOptions || {});
		return { ...defaults, ...(supplied || {}) };
	}

	function create(options = {}) {
		const doc = options.document || document;
		const modalUi = requireDependency(
			options.modalUi || REGISTRY?.get?.('modalPatientSearchUi'),
			'ModalPatientSearchUi'
		);
		const tabsUi = requireDependency(
			options.tabsUi || REGISTRY?.get?.('modalFunctionTabsUi'),
			'ModalFunctionTabsUi'
		);
		requireDependency(
			options.historyListUi || REGISTRY?.get?.('modalMedicalHistoryListUi'),
			'ModalMedicalHistoryListUi'
		);
		if (typeof modalUi.createWorkflowModalSearchContext !== 'function') {
			throw new Error('ModalPatientSearchUi không hỗ trợ tạo workflow context');
		}

		const modalElement = resolveElement(options.modal || options.modalId || 'patientSearchModal', doc);
		if (!modalElement) throw new Error('Không tìm thấy #patientSearchModal');
		if (modalElement[INSTANCE_PROPERTY]) return modalElement[INSTANCE_PROPERTY];

		const dataRuntime = createDataRuntime(options);
		const contextOptions = resolveContextOptions(options, { dataRuntime, tabsUi });
		const context = modalUi.createWorkflowModalSearchContext({
			...contextOptions,
			document: doc,
			tabsUi,
			historyListUi: options.historyListUi || REGISTRY?.get?.('modalMedicalHistoryListUi'),
			elements: options.elements,
			ids: options.ids
		});

		let controlBindings = null;
		let printController = null;
		const triggerElements = new Set();
		let destroyed = false;

		function bindControls(controlOptions = {}) {
			if (destroyed) return null;
			if (controlBindings) return controlBindings;
			controlBindings = context.flow.bindControls({
				...(options.controlOptions || {}),
				...controlOptions
			});
			return controlBindings;
		}

		async function open(openOptions = {}) {
			if (destroyed) return null;
			context.flow.setShouldPrefill(Boolean(openOptions.prefillCurrent));
			return context.flow.openSearchModal();
		}

		function openPatient(patientId) {
			return context.flow.openLinkedRelative(patientId);
		}

		function reset() {
			if (destroyed) return null;
			return context.flow.reset();
		}

		function close() {
			return modalUi.hideBootstrapModal(modalElement);
		}

		function getState() {
			return context.stateStore.getState();
		}

		function destroy() {
			if (destroyed) return false;
			destroyed = true;
			triggerElements.forEach(trigger => {
				const binding = trigger[TRIGGER_PROPERTY];
				if (binding?.handler) trigger.removeEventListener('click', binding.handler);
				delete trigger[TRIGGER_PROPERTY];
			});
			triggerElements.clear();
			if (printController && typeof printController.destroy === 'function') printController.destroy();
			if (typeof context.flow.destroy === 'function') context.flow.destroy();
			if (modalElement[INSTANCE_PROPERTY]) delete modalElement[INSTANCE_PROPERTY];
			return true;
		}

		function bindTrigger(triggerOrId, triggerOptions = {}) {
			const trigger = resolveElement(triggerOrId, doc);
			if (!trigger) return null;
			if (trigger[TRIGGER_PROPERTY]) return trigger;
			const handler = async event => {
				if (typeof triggerOptions.beforeOpen === 'function') {
					const result = await triggerOptions.beforeOpen(event);
					if (result === false) return;
				}
				await open({ prefillCurrent: Boolean(triggerOptions.prefillCurrent) });
			};
			trigger.addEventListener('click', handler);
			trigger[TRIGGER_PROPERTY] = { instance, handler };
			triggerElements.add(trigger);
			return trigger;
		}

		const printFactory = options.printFactory || REGISTRY?.get?.('modalHistoryPrintController');
		if (options.print !== false && printFactory && typeof printFactory.create === 'function') {
			printController = printFactory.create({
				document: doc,
				stateStore: context.stateStore,
				renderers: context.historyTabRenderers,
				showToast: options.showToast,
				...(options.printOptions || {})
			});
			printController.bind();
		}

		const instance = Object.freeze({
			element: modalElement,
			context,
			dataRuntime,
			get printController() { return printController; },
			bindControls,
			bindTrigger,
			open,
			openPatient,
			reset,
			close,
			getState,
			destroy,
			getDependencies: () => ({ modalUi, tabsUi })
		});
		modalElement[INSTANCE_PROPERTY] = instance;

		if (options.autoBind !== false) bindControls();
		(options.triggers || []).forEach(trigger => {
			if (trigger && typeof trigger === 'object' && !trigger.nodeType) {
				bindTrigger(trigger.element || trigger.id, trigger);
				return;
			}
			bindTrigger(trigger);
		});

		return instance;
	}

	function getOrCreate(options = {}) {
		const doc = options.document || document;
		const modalElement = resolveElement(options.modal || options.modalId || 'patientSearchModal', doc);
		return modalElement?.[INSTANCE_PROPERTY] || create(options);
	}

	function getInstance(modalOrId = 'patientSearchModal', doc = document) {
		return resolveElement(modalOrId, doc)?.[INSTANCE_PROPERTY] || null;
	}

	const api = Object.freeze({ create, getOrCreate, getInstance });
	window.QLPKPatientHistoryModal = api;
	REGISTRY?.register?.('patientHistoryModal', api, {
		dependencies: ['modalPatientSearchUi', 'modalFunctionTabsUi', 'modalMedicalHistoryListUi'],
		owner: 'shared/patient-modal'
	});
})(window, document);
