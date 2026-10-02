import { moduleState } from './form-dom-utils-parts/state.js';
import { bindAgeInputGuard, bindNumericInputGuard, bindPatientFormAutoSaveFields, bindPatientFormAutoSaveSafely, buildAppointmentClinicalUpdatePayload, buildPatientSavePayload, clearPlaceholderValues, collectClinicalAdministrativeFormData, getElementValue, getHiddenOrModalValue, initializeDocumentSectionShell, initializeOccupationAutocomplete, initializeWorkflowFormShell, initializeWorkflowPageShell, resetDomField, resetDomFields, safeSetValue, updateElements } from './form-dom-utils-parts/collect-payloads.js';
import { createFormDomAdapter, resetPsychologistWorkflowFormDomState, resetPsychologistWorkflowPageState, resetWorkflowFormDomState, resetWorkflowPageState } from './form-dom-utils-parts/reset-state.js';

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
	getElementValue: getElementValue,
	safeSetValue: safeSetValue,
	updateElements: updateElements,
	getHiddenOrModalValue: getHiddenOrModalValue,
	collectClinicalAdministrativeFormData: collectClinicalAdministrativeFormData,
	buildPatientSavePayload: buildPatientSavePayload,
	buildAppointmentClinicalUpdatePayload: buildAppointmentClinicalUpdatePayload,
	bindNumericInputGuard: bindNumericInputGuard,
	bindAgeInputGuard: bindAgeInputGuard,
	bindPatientFormAutoSaveFields: bindPatientFormAutoSaveFields,
	bindPatientFormAutoSaveSafely: bindPatientFormAutoSaveSafely,
	initializeOccupationAutocomplete: initializeOccupationAutocomplete,
	initializeDocumentSectionShell: initializeDocumentSectionShell,
	initializeWorkflowFormShell: initializeWorkflowFormShell,
	initializeWorkflowPageShell: initializeWorkflowPageShell,
	resetDomField: resetDomField,
	resetDomFields: resetDomFields,
	clearPlaceholderValues: clearPlaceholderValues,
	resetWorkflowFormDomState: resetWorkflowFormDomState,
	resetPsychologistWorkflowFormDomState: resetPsychologistWorkflowFormDomState,
	resetWorkflowPageState: resetWorkflowPageState,
	resetPsychologistWorkflowPageState: resetPsychologistWorkflowPageState,
	createFormDomAdapter: createFormDomAdapter
};

window.ClinicalFormDomUtils = moduleState.api;
