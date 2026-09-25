(function (window) {
	'use strict';

	const registry = window.QLPKDoctorModuleRegistry;
	if (!registry) throw new Error('Thiếu Doctor module registry');

	function register(name, value, options = {}) {
		if (!value || registry.has(name)) return registry.get(name);
		return registry.register(name, value, {
			owner: options.owner || 'shared/platform',
			version: options.version || 1
		});
	}

	register('confirmationDialog', window.QLPKConfirmationDialog, { owner: 'shared/feedback' });
	register('transferModal', window.TransferModal, { owner: 'shared/transfer-modal' });
	register('iconSystem', window.QLPKIconSystem, { owner: 'shared/icons' });
	register('orderStatusUtils', window.ClinicalOrderStatusUtils, { owner: 'shared/orders' });
	register('orderSelectionStateUtils', window.ClinicalOrderSelectionStateUtils, { owner: 'shared/orders' });
	register('icdAutocomplete', window.QLPKIcdAutocomplete, { owner: 'shared/icd' });
	register('autocompleteField', window.QLPKAutocompleteField, { owner: 'shared/autocomplete' });
	register('icdDataLoader', window.ClinicalIcdDataLoader, { owner: 'shared/icd' });
	register('prescriptionPrintDocument', window.PrescriptionPrintDocument, { owner: 'shared/prescription-print' });
	register('doctorPrescriptionPrint', window.createDoctorPrescriptionPrint, { owner: 'shared/prescription-print' });
	register('prescriptionDocumentTemplate', {
		getClinicInfoConfig: window.getClinicInfoConfig,
		buildPrescriptionPreviewHTML: window.buildPrescriptionPreviewHTML,
		buildPrescriptionScreenHTML: window.buildPrescriptionScreenHTML
	}, { owner: 'shared/prescription-document' });

	window.QLPKDoctorModuleRegistry.register('doctorPlatformBoundaries', Object.freeze({
		register,
		list: () => registry.list().filter(item => item.owner === 'shared/platform')
	}), {
		owner: 'doctor/base',
		version: 1
	});
})(window);
