(function (window) {
	'use strict';

	const registry = window.QLPKDoctorModuleRegistry;
	if (!registry) throw new Error('Thiếu Doctor module registry');

	function register(name, value, options = {}) {
		if (!value || registry.has(name)) return registry.get(name);
		return registry.register(name, value, {
			owner: options.owner,
			version: options.version || 1
		});
	}

	register('confirmationDialog', window.QLPKConfirmationDialog, { owner: 'shared/feedback' });
	register('transferModal', window.TransferModal, { owner: 'shared/transfer-modal' });
	register('iconSystem', window.QLPKIconSystem, { owner: 'shared/icons' });
	register('orderStatusUtils', window.ClinicalOrderStatusUtils, { owner: 'shared/orders' });
	register('orderSelectionStateUtils', window.ClinicalOrderSelectionStateUtils, { owner: 'shared/orders' });
	register('orderAutocompleteUtils', window.ClinicalOrderAutocompleteUtils, { owner: 'shared/orders' });
	register('documentAttachmentUtils', window.ReceptionistDocumentAttachmentUtils, { owner: 'shared/documents' });
	register('documentAttachmentList', window.ReceptionistDocumentAttachmentList, { owner: 'shared/documents' });
	register('documentAttachmentControls', window.ReceptionistDocumentAttachmentControls, { owner: 'shared/documents' });
	register('icdAutocomplete', window.QLPKIcdAutocomplete, { owner: 'shared/icd' });
	register('autocompleteField', window.QLPKAutocompleteField, { owner: 'shared/autocomplete' });
	register('icdDataLoader', window.ClinicalIcdDataLoader, { owner: 'shared/icd' });
	register('prescriptionPrintDocument', window.PrescriptionPrintDocument, { owner: 'shared/prescription-print' });
	register('doctorPrescriptionPrint', window.createDoctorPrescriptionPrint, { owner: 'shared/prescription-print' });
	// The template module registers itself; this only covers a page where it already ran.
	if (typeof window.buildPrescriptionPreviewHTML === 'function') {
		register('prescriptionDocumentTemplate', {
			getClinicInfoConfig: window.getClinicInfoConfig,
			buildPrescriptionPreviewHTML: window.buildPrescriptionPreviewHTML,
			buildPrescriptionScreenHTML: window.buildPrescriptionScreenHTML
		}, { owner: 'shared/prescription-document' });
	}

	window.QLPKDoctorModuleRegistry.register('doctorPlatformBoundaries', Object.freeze({
		register,
		list: () => registry.list().filter(item => String(item.owner || '').startsWith('shared/'))
	}), {
		owner: 'doctor/base',
		version: 1
	});
})(window);
