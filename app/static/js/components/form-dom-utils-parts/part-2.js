// components/form-dom-utils.js: phần 2/2 (nạp trước form-dom-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/form-dom-utils'] || (window.QLPKModuleParts['components/form-dom-utils'] = { state: {} });
	const moduleState = moduleParts.state;

	function resetWorkflowVisitFields(doc, options) {
		const scope = { document: doc };
		moduleParts.resetDomFields(options.vitalFields || ['pulse', 'bloodPressure', 'temperature', 'weight', 'height', 'bmi', 'breathing'], scope);
		moduleParts.setDomValue(options.respiratoryRateField || 'respiratoryRate', '', scope);
		moduleParts.setDomValue(options.notesField || 'notes', '', scope);
		moduleParts.clearAgeField(options.ageField || 'age', scope);
		moduleParts.setDomValue(options.appointmentTypeField || 'appointmentType', options.defaultAppointmentType || 'SERVICE', scope);
		moduleParts.setDomValue(options.serviceTypeField || 'serviceType', '', scope);
		moduleParts.setDomValue(options.packageField || 'packageId', '', scope);
		moduleParts.resetDomField(doc.getElementById(options.reExaminationField || 'reExaminationCheck'));
		moduleParts.setDomValue(options.addressSummaryField || 'addressSummary', '', scope);
	}

	function resetWorkflowFormDomState(options = {}) {
		const doc = moduleParts.getDocument(options);
		moduleParts.resetDomFields(options.fieldsToReset || [], { document: doc });

		const referralSourceControl = getReferralSourceControl(options);
		if (referralSourceControl && typeof referralSourceControl.setValue === 'function') {
			referralSourceControl.setValue('', { document: doc });
		}

		resetWorkflowVisitFields(doc, options);
		moduleParts.clearPlaceholderValues(options.placeholderFields || [], { document: doc });

		const storage = options.localStorage || window.localStorage;
		(options.storageKeys || ['currentEditId', 'medicalHistoryData', 'uploadedDocuments']).forEach(key => {
			if (storage && typeof storage.removeItem === 'function') storage.removeItem(key);
		});

		moduleParts.resetAutocompleteValues(options.autocompleteNames || []);
		return true;
	}
	function resetPsychologistWorkflowFormDomState(options = {}) {
		return resetWorkflowFormDomState({
			...options,
			fieldsToReset: options.fieldsToReset || moduleState.PSYCHOLOGIST_WORKFLOW_RESET_FIELDS,
			placeholderFields: options.placeholderFields || moduleState.PSYCHOLOGIST_WORKFLOW_PLACEHOLDER_FIELDS,
			autocompleteNames: options.autocompleteNames || ['occupationAutocomplete', 'sexualOrientationAutocomplete']
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
		return context.referralSourceControl || window.ReferralSourceControl;
	}
	function createFormDomAdapter(context = {}) {
		function isReferralSourceField(elementId) {
			return elementId === (context.referralSourceFieldId || 'referralSource');
		}

		return {
			getElementValue(elementId, defaultValue = '') {
				const referralSourceControl = getReferralSourceControl(context);
				if (isReferralSourceField(elementId) && referralSourceControl) {
					return referralSourceControl.getValue({ document: moduleParts.getDocument(context) }) || defaultValue;
				}
				return moduleParts.getElementValue(elementId, defaultValue, context);
			},
			safeSetValue(elementId, value) {
				const referralSourceControl = getReferralSourceControl(context);
				if (isReferralSourceField(elementId) && referralSourceControl) {
					return referralSourceControl.setValue(value, { document: moduleParts.getDocument(context) });
				}
				return moduleParts.safeSetValue(elementId, value, context);
			},
			safeSetInnerHTML(elementId, html) {
				return moduleParts.safeSetInnerHTML(elementId, html, context);
			},
			updateElements(elements) {
				return moduleParts.updateElements(elements, context);
			}
		};
	}

	Object.assign(moduleParts, {
		resetWorkflowFormDomState,
		resetPsychologistWorkflowFormDomState,
		resetWorkflowPageState,
		resetPsychologistWorkflowPageState,
		getReferralSourceControl,
		createFormDomAdapter
	});
})(window);
