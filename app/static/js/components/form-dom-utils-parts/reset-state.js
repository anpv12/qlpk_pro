import { moduleState } from './state.js';
import { clearAgeField, clearPlaceholderValues, getDocument, getElementValue, resetOccupationAutocomplete, resetDomField, resetDomFields, safeSetValue, setDomValue, updateElements } from './collect-payloads.js';
import { ReferralSourceControl } from '../../referral-source-control.js';

function resetWorkflowVisitFields(doc, options) {
	const scope = { document: doc };
	resetDomFields(options.vitalFields || ['pulse', 'bloodPressure', 'temperature', 'weight', 'height', 'bmi', 'breathing'], scope);
	setDomValue(options.respiratoryRateField || 'respiratoryRate', '', scope);
	setDomValue(options.notesField || 'notes', '', scope);
	clearAgeField(options.ageField || 'age', scope);
	setDomValue(options.appointmentTypeField || 'appointmentType', options.defaultAppointmentType || 'SERVICE', scope);
	setDomValue(options.serviceTypeField || 'serviceType', '', scope);
	setDomValue(options.packageField || 'packageId', '', scope);
	resetDomField(doc.getElementById(options.reExaminationField || 'reExaminationCheck'));
	setDomValue(options.addressSummaryField || 'addressSummary', '', scope);
}

function resetWorkflowFormDomState(options = {}) {
	const doc = getDocument(options);
	resetDomFields(options.fieldsToReset || [], { document: doc });

	const referralSourceControl = getReferralSourceControl(options);
	if (referralSourceControl && typeof referralSourceControl.setValue === 'function') {
		referralSourceControl.setValue('', { document: doc });
	}

	resetWorkflowVisitFields(doc, options);
	clearPlaceholderValues(options.placeholderFields || [], { document: doc });

	const storage = options.localStorage || window.localStorage;
	(options.storageKeys || ['currentEditId', 'medicalHistoryData', 'uploadedDocuments']).forEach(key => {
		if (storage && typeof storage.removeItem === 'function') storage.removeItem(key);
	});

	if (options.resetOccupationAutocomplete) resetOccupationAutocomplete();
	return true;
}
function resetPsychologistWorkflowFormDomState(options = {}) {
	return resetWorkflowFormDomState({
		...options,
		fieldsToReset: options.fieldsToReset || moduleState.PSYCHOLOGIST_WORKFLOW_RESET_FIELDS,
		placeholderFields: options.placeholderFields || moduleState.PSYCHOLOGIST_WORKFLOW_PLACEHOLDER_FIELDS,
		resetOccupationAutocomplete: true
	});
}
function resetWorkflowPageState(options = {}) {
	const relativeTable = typeof options.getRelativeTable === 'function'
		? options.getRelativeTable()
		: options.relativeTable;
	if (relativeTable && typeof relativeTable.clear === 'function') {
		relativeTable.clear();
	}

	if (typeof options.resetDomState === 'function') {
		options.resetDomState();
	}

	if (typeof options.setCurrentEditId === 'function') {
		options.setCurrentEditId(null);
	}
	if (typeof options.setUploadedDocuments === 'function') {
		options.setUploadedDocuments([]);
	}
	if (typeof options.setCurrentPatientId === 'function') {
		options.setCurrentPatientId(null);
	}

	return true;
}
function resetPsychologistWorkflowPageState(options = {}) {
	return resetWorkflowPageState({
		...options,
		resetDomState: () => resetPsychologistWorkflowFormDomState(options)
	});
}
function getReferralSourceControl(context = {}) {
	if (typeof context.getReferralSourceControl === 'function') {
		return context.getReferralSourceControl();
	}
	return context.referralSourceControl || ReferralSourceControl;
}
function createFormDomAdapter(context = {}) {
	function isReferralSourceField(elementId) {
		return elementId === (context.referralSourceFieldId || 'referralSource');
	}

	return {
		getElementValue(elementId, defaultValue = '') {
			const referralSourceControl = getReferralSourceControl(context);
			if (isReferralSourceField(elementId) && referralSourceControl) {
				return referralSourceControl.getValue({ document: getDocument(context) }) || defaultValue;
			}
			return getElementValue(elementId, defaultValue, context);
		},
		safeSetValue(elementId, value) {
			const referralSourceControl = getReferralSourceControl(context);
			if (isReferralSourceField(elementId) && referralSourceControl) {
				return referralSourceControl.setValue(value, { document: getDocument(context) });
			}
			return safeSetValue(elementId, value, context);
		},
		updateElements(elements) {
			return updateElements(elements, context);
		}
	};
}

export { createFormDomAdapter, getReferralSourceControl, resetPsychologistWorkflowFormDomState, resetPsychologistWorkflowPageState, resetWorkflowFormDomState, resetWorkflowPageState };
