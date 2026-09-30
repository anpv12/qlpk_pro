// Parts (nạp trước file này): collect-payloads.js, reset-state.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/form-dom-utils'] || (window.QLPKModuleParts['components/form-dom-utils'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.DEFAULT_PATIENT_AUTOSAVE_FIELDS = [
		{ selector: '#fullName', fieldName: 'full_name' },
		{ selector: '#nickname', fieldName: 'nickname' },
		{ selector: '#dateOfBirth', fieldName: 'date_of_birth', events: 'change.patientAutoSave' },
		{ selector: '#gender', fieldName: 'gender', events: 'change.patientAutoSave' },
		{ selector: '#idCard', fieldName: 'id_number' },
		{ selector: '#phoneNumber', fieldName: 'phone' },
		{ selector: '#occupation', fieldName: 'occupation', events: 'blur.patientAutoSave change.patientAutoSave', valueResolver: 'occupation' },
		{ selector: '#maritalStatus', fieldName: 'marital_status', events: 'change.patientAutoSave' },
		{ selector: '#referralSource', fieldName: 'referral_source', events: 'change.patientAutoSave', valueResolver: 'referralSource' },
		{ selector: '#breathing', fieldName: 'breathing' },
		{ selector: '#pulse', fieldName: 'pulse' },
		{ selector: '#bloodPressure', fieldName: 'blood_pressure' },
		{ selector: '#temperature', fieldName: 'temperature' },
		{ selector: '#weight', fieldName: 'weight' },
		{ selector: '#height', fieldName: 'height' },
		{ selector: '#bmi', fieldName: 'bmi', events: 'blur.patientAutoSave input.patientAutoSave', skipEmpty: true },
		{ selector: '#notes', fieldName: 'notes' }
	];

	moduleState.PSYCHOLOGIST_WORKFLOW_RESET_FIELDS = [
		'fullName', 'nickname', 'dateOfBirth', 'gender', 'idCard', 'phoneNumber',
		'occupation', 'donViCongTac', 'diaChiCongTy', 'maritalStatus', 'sexualOrientation', 'address', 'addressDetail',
		'province', 'provinceHidden', 'district', 'ward', 'nationality', 'religion', 'ethnicity',
		'educationLevel', 'mainReason', 'referralSource', 'problemStartTime',
		'symptomProgression', 'psychiatricHistory', 'substanceHistory', 'familyHistory',
		'familyRelationship', 'livingEnvironment', 'socialSupport', 'mainSymptoms',
		'currentBehavior', 'notes', 'age', 'physicalHistory', 'severityLevel',
		'examinationMainReason', 'examDetailMedicalHistory', 'diagnosis', 'treatmentPlan', 'benhKemTheo',
		'reminderCheck', 'reminderTime'
	];
	moduleState.PSYCHOLOGIST_WORKFLOW_PLACEHOLDER_FIELDS = [
		'dateOfBirth', 'occupation', 'address', 'phoneNumber', 'sexualOrientation',
		'maritalStatus', 'nationality', 'religion', 'ethnicity', 'educationLevel'
	];

	moduleState.api = {
		getElementValue: moduleParts.getElementValue,
		safeSetValue: moduleParts.safeSetValue,
		safeSetInnerHTML: moduleParts.safeSetInnerHTML,
		updateElements: moduleParts.updateElements,
		getHiddenOrModalValue: moduleParts.getHiddenOrModalValue,
		collectClinicalAdministrativeFormData: moduleParts.collectClinicalAdministrativeFormData,
		buildPatientSavePayload: moduleParts.buildPatientSavePayload,
		buildAppointmentClinicalUpdatePayload: moduleParts.buildAppointmentClinicalUpdatePayload,
		bindNumericInputGuard: moduleParts.bindNumericInputGuard,
		bindAgeInputGuard: moduleParts.bindAgeInputGuard,
		bindPatientFormAutoSaveFields: moduleParts.bindPatientFormAutoSaveFields,
		bindPatientFormAutoSaveSafely: moduleParts.bindPatientFormAutoSaveSafely,
		initializeOccupationAutocomplete: moduleParts.initializeOccupationAutocomplete,
		initializeDocumentSectionShell: moduleParts.initializeDocumentSectionShell,
		initializeWorkflowFormShell: moduleParts.initializeWorkflowFormShell,
		initializeWorkflowPageShell: moduleParts.initializeWorkflowPageShell,
		resetDomField: moduleParts.resetDomField,
		resetDomFields: moduleParts.resetDomFields,
		clearPlaceholderValues: moduleParts.clearPlaceholderValues,
		resetWorkflowFormDomState: moduleParts.resetWorkflowFormDomState,
		resetPsychologistWorkflowFormDomState: moduleParts.resetPsychologistWorkflowFormDomState,
		resetWorkflowPageState: moduleParts.resetWorkflowPageState,
		resetPsychologistWorkflowPageState: moduleParts.resetPsychologistWorkflowPageState,
		createFormDomAdapter: moduleParts.createFormDomAdapter
	};

	window.ClinicalFormDomUtils = moduleState.api;
})(window);
