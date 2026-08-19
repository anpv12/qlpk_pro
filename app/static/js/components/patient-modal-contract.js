(function (window, document) {
	'use strict';

	/**
	 * One contract for patient search/history modals.
	 * Doctor consumes this contract directly. Legacy receptionist/psychologist
	 * pages can keep their old globals while they are moved to the same factory.
	 */
	function resolveDependencies(options = {}) {
		const registry = options.registry || window.QLPKDoctorModuleRegistry;
		return {
			modalUi: options.modalUi || registry?.get?.('modalPatientSearchUi'),
			historyModal: options.historyModal || registry?.get?.('patientHistoryModal'),
			tabsUi: options.tabsUi || registry?.get?.('modalFunctionTabsUi'),
			historyListUi: options.historyListUi || registry?.get?.('modalMedicalHistoryListUi')
		};
	}

	function assertDependencies(dependencies) {
		const missing = Object.entries(dependencies)
			.filter(([, dependency]) => !dependency)
			.map(([name]) => name);
		if (missing.length) throw new Error(`Thiếu Patient Modal dependencies: ${missing.join(', ')}`);
		return dependencies;
	}

	function create(options = {}) {
		const dependencies = assertDependencies(resolveDependencies(options));
		if (!dependencies.historyModal?.getOrCreate) {
			throw new Error('Patient History Modal chưa hỗ trợ getOrCreate');
		}
		return dependencies.historyModal.getOrCreate({
			...options,
			modalUi: dependencies.modalUi,
			tabsUi: dependencies.tabsUi,
			historyListUi: dependencies.historyListUi,
			document: options.document || document
		});
	}

	function getOrCreate(options = {}) {
		return create(options);
	}

	function installLegacyBridge(options = {}) {
		const dependencies = resolveDependencies(options);
		return Object.freeze({
			modalUi: dependencies.modalUi,
			historyModal: dependencies.historyModal,
			open: (...args) => dependencies.historyModal?.getOrCreate?.(options)?.open?.(...args),
			reset: (...args) => dependencies.historyModal?.getInstance?.(options.modal || 'patientSearchModal', options.document || document)?.reset?.(...args)
		});
	}

	const api = Object.freeze({ create, getOrCreate, resolveDependencies, assertDependencies, installLegacyBridge });
	window.QLPKPatientModalContract = api;
	if (window.QLPKDoctorModuleRegistry?.register) {
		window.QLPKDoctorModuleRegistry.register('patientModalContract', api, {
			dependencies: ['modalPatientSearchUi', 'patientHistoryModal'],
			owner: 'shared/patient-modal'
		});
	}
})(window, document);
