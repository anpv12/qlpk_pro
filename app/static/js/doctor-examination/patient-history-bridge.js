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
		const getAppointments = options.getAppointments || (() => []);
		const selectPatientCard = options.selectPatientCard || (() => false);

		function hasAppointmentInCurrentList(appointmentId) {
			return Array.isArray(getAppointments())
				&& getAppointments().some(appointment => String(appointment.id) === String(appointmentId));
		}

		const patientHistoryModal = modalContract.getOrCreate({
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

		function openPatientHistory(payload = {}) {
			const patientId = payload.patient_id;
			if (!patientId || typeof patientHistoryModal.openPatient !== 'function') return false;
			return patientHistoryModal.openPatient(patientId);
		}

		function openAppointment(payload = {}) {
			const appointmentId = payload.appointment_id;
			if (appointmentId && hasAppointmentInCurrentList(appointmentId)) {
				return selectPatientCard(appointmentId);
			}
			return openPatientHistory(payload);
		}

		window.QLPKGlobalSearchActions = {
			handleAction(action = {}, item = {}) {
				if (action.kind === 'open_patient_history') {
					return openPatientHistory(action.payload || {}, item);
				}
				if (action.kind === 'open_appointment') {
					return openAppointment(action.payload || {}, item);
				}
				return false;
			},
			openPatientHistory,
			openAppointment
		};

		return patientHistoryModal;
	}

	REGISTRY.register('patientHistoryBridge', { create }, {
		dependencies: ['patientModalContract'],
		owner: 'doctor/patient-history',
		version: 1
	});
})(window, document);
