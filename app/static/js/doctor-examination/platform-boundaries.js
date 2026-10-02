import { ClinicalOrderAutocompleteUtils } from '../orders/order-autocomplete-utils.js';
import { ClinicalOrderSelectionStateUtils } from '../orders/order-selection-state-utils.js';
import { ClinicalOrderStatusUtils } from '../orders/order-status-utils.js';
import { PrescriptionPrintDocument } from '../prescriptions/components/prescription-print-document.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';
import { QLPKIcdAutocomplete } from '../components/icd-autocomplete.js';
import { ReceptionistDocumentAttachmentList } from '../receptionist/document-attachment-list.js';
import { ReceptionistDocumentAttachmentUtils } from '../receptionist/document-attachment-utils.js';
import { ClinicalIcdDataLoader } from '../components/icd-data-loader.js';
import { ReceptionistDocumentAttachmentControls } from '../receptionist/document-attachment-controls.js';

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

	register('confirmationDialog', QLPKConfirmationDialog, { owner: 'shared/feedback' });
	register('transferModal', window.TransferModal, { owner: 'shared/transfer-modal' });
	register('iconSystem', window.QLPKIconSystem, { owner: 'shared/icons' });
	register('orderStatusUtils', ClinicalOrderStatusUtils, { owner: 'shared/orders' });
	register('orderSelectionStateUtils', ClinicalOrderSelectionStateUtils, { owner: 'shared/orders' });
	register('orderAutocompleteUtils', ClinicalOrderAutocompleteUtils, { owner: 'shared/orders' });
	register('documentAttachmentUtils', ReceptionistDocumentAttachmentUtils, { owner: 'shared/documents' });
	register('documentAttachmentList', ReceptionistDocumentAttachmentList, { owner: 'shared/documents' });
	register('documentAttachmentControls', ReceptionistDocumentAttachmentControls, { owner: 'shared/documents' });
	register('icdAutocomplete', QLPKIcdAutocomplete, { owner: 'shared/icd' });
	register('autocompleteField', window.QLPKAutocompleteField, { owner: 'shared/autocomplete' });
	register('icdDataLoader', ClinicalIcdDataLoader, { owner: 'shared/icd' });
	register('prescriptionPrintDocument', PrescriptionPrintDocument, { owner: 'shared/prescription-print' });
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
