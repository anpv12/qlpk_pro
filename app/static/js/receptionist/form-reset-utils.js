import { QLPKPatientIntakeForm } from '../components/patient-intake-form.js';
import { ReceptionistPatientRelativesTable } from './patient-relatives-table.js';
import { ReferralSourceControl } from '../referral-source-control.js';

function getDocument(options = {}) {
	return options.document || window.document;
}

function getWindow(options = {}) {
	return options.window || window;
}

function getStorage(options = {}) {
	return options.localStorage || getWindow(options).localStorage;
}

function getElement(fieldId, options = {}) {
	return getDocument(options).getElementById(fieldId);
}

function clearElementValue(fieldId, options = {}) {
	const element = getElement(fieldId, options);
	if (element) {
		if (element.type === 'checkbox') {
			element.checked = false;
			return;
		}
		element.value = '';
	}
}

function clearFieldValues(fieldIds, options = {}) {
	fieldIds.forEach(fieldId => clearElementValue(fieldId, options));
}

function resetElement(fieldId, options = {}) {
	const element = getElement(fieldId, options);
	if (!element) return;

	if (element.type === 'checkbox') {
		element.checked = false;
	} else if (element.tagName === 'SELECT') {
		element.selectedIndex = 0;
	} else {
		element.value = '';
	}
}

function clearAddressSelects(options = {}) {
	['province', 'district', 'ward'].forEach(selectId => {
		const select = getElement(selectId, options);
		if (select && select.tagName === 'SELECT' && select.options && select.options.length > 0) {
			select.selectedIndex = 0;
		} else if (select) {
			select.value = '';
			if (select.dataset) select.dataset.code = '';
		}
	});
}

function clearStaleLocalStorage(options = {}) {
	const storage = getStorage(options);
	if (!storage) return;

	storage.removeItem('currentEditId');
	storage.removeItem('medicalHistoryData');
	storage.removeItem('uploadedDocuments');
}

function setCurrentPatientId(value, options = {}) {
	options.setCurrentPatientId?.(value);
}

function clearRelativeTable(options = {}) {
	const clearTable = options.clearRelativeTable || ReceptionistPatientRelativesTable.clear;
	const clearedInstance = clearTable(options.relativeTableInstance);

	if (typeof options.setRelativeTableInstance === 'function') {
		options.setRelativeTableInstance(clearedInstance);
	}

	return clearedInstance;
}

function resetReceptionistState(options = {}) {
	if (typeof options.setCurrentEditId === 'function') {
		options.setCurrentEditId(null);
	}

	if (typeof options.setSelectedPatient === 'function') {
		options.setSelectedPatient(null);
	}

	if (typeof options.setUploadedDocuments === 'function') {
		options.setUploadedDocuments([]);
	}

	setCurrentPatientId(null, options);
}

function clearSharedFields(options = {}) {
	const opts = options || {};
	const doc = getDocument(opts);
	if (!QLPKPatientIntakeForm || typeof QLPKPatientIntakeForm.clear !== 'function') {
		throw new Error('Shared patient intake component is not available');
	}

	QLPKPatientIntakeForm.clear({ document: doc });
	clearAddressSelects(opts);
	clearElementValue('familyHistory', opts);
	clearElementValue('addressSummary', opts);
}

function clearFormForCopy(options = {}) {
	clearSharedFields(options);
	clearFieldValues(['commonName'], options);

	// Keep appointmentDate intact for copy flow; only appointment time/person/service fields are cleared.
	clearFieldValues(['appointmentTime', 'doctorId', 'serviceType', 'serviceTypeId'], options);

	setCurrentPatientId(null, options);

	if (typeof options.setupAgeCalculation === 'function') {
		options.setupAgeCalculation();
	}
}

function resetFormToDefault(options = {}) {
	clearRelativeTable(options);
	clearSharedFields(options);

	const fieldsToReset = [
		'appointmentDate', 'appointmentTime', 'doctorId', 'serviceType',
		'reminderCheck', 'reminderTime'
	];

	fieldsToReset.forEach(fieldId => resetElement(fieldId, options));

	if (ReferralSourceControl) {
		ReferralSourceControl.setValue('', { document: getDocument(options) });
	}

	clearElementValue('serviceType', options);
	clearElementValue('serviceTypeId', options);

	const reExaminationCheck = getElement('reExaminationCheck', options);
	if (reExaminationCheck) {
		reExaminationCheck.checked = false;
	}

	clearStaleLocalStorage(options);
	resetReceptionistState(options);
}

export const ReceptionistFormResetUtils = {
	clearSharedFields,
	clearFormForCopy,
	resetFormToDefault
};
