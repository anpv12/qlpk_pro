// Psychologist page state shared by the workspace runtime, the component config and the page entry.
export const state = {
	bound: false,
	isLoadingExaminationData: false,
	loadFailed: false,
	currentAppointmentId: null,
	currentPatientId: null,
	currentPatientData: null,
	contextToken: 0,
	payload: null,
	saving: false,
	completing: false
};
