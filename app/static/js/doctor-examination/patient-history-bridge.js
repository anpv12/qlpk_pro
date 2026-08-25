(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');

	function create(options = {}) {
		const doc = options.document || document;
		const modalContract = options.modalContract || REGISTRY.require('patientModalContract');
		const formatDateDisplay = options.formatDateDisplay;
		const getCurrentPatientData = options.getCurrentPatientData || (() => null);
		const getCurrentAppointmentId = options.getCurrentAppointmentId || (() => null);
		const setCurrentPatientId = options.setCurrentPatientId || (() => {});

		return modalContract.getOrCreate({
			document: doc,
			context: options.context,
			apiCall: options.apiCall,
			showToast: options.showToast,
			buildContextOptions: () => ({
				exposeLegacyWindowState: false,
				getCurrentPatientData,
				getCurrentAppointmentId,
				getFormatDateDisplay: () => formatDateDisplay,
				showPatientAction: false,
				setCurrentPatientId,
				activeStatuses: ['doctor_exam', 'conclusion'],
				getHistoryDescription: exam => exam.diagnosis || exam.main_symptoms || '',
				formatHistoryDate: formatDateDisplay,
				getExaminationStatusBadgeClass: options.getExaminationStatusBadgeClass,
				getExaminationStatusText: options.getExaminationStatusText,
				showCopyAction: true,
				showDeleteAction: false
			}),
			controlOptions: { copyHistory: options.copyHistory },
			triggers: [{
				id: 'doctorClinicalHistoryButton',
				prefillCurrent: true,
				beforeOpen: options.beforeOpen
			}]
		});
	}

	REGISTRY.register('patientHistoryBridge', { create }, {
		dependencies: ['patientModalContract'],
		owner: 'doctor/patient-history',
		version: 1
	});
})(window, document);
