import { RelativeLinkHandler } from '../relative-link-handler.js';
import { PsychologistMedicalRecordRealtimeUtils } from './medical-record-realtime-utils.js';
import { getPageDateFormatter } from '../shared/page-date-format.js';
import { ModalPatientSearchUi } from '../components/modal-patient-search-ui.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

function buildHistoryContextOptions(options, accessors) {
	const { formatDisplayDate } = accessors;
	return {
		showConfirmationDialog: options.showConfirmationDialog,
		getAppointments: accessors.getAppointments,
		getCurrentPatientData: accessors.getCurrentPatientData,
		getCurrentAppointmentId: accessors.getCurrentAppointmentId,
		getFormatDateDisplay: accessors.getFormatDateDisplay,
		prepareFormForCopy: accessors.prepareFormForCopy,
		setLoadingState: value => options.setLoadingState?.(value),
		setCurrentAppointmentId: value => options.setCurrentAppointmentId?.(value),
		setCurrentPatientId: options.setCurrentPatientId,
		loadPatient: options.loadPatient,
		loadExaminationFormData: options.loadExaminationFormData,
		lockForm: options.lockForm,
		activeStatuses: ['PSYCHOLOGIST_EXAM', 'WAITING_TRANSFER'],
		getHistoryDescription: exam => exam.psychologist_summary || '',
		formatHistoryDate: date => (getPageDateFormatter()
			? getPageDateFormatter()(date)
			: formatDisplayDate(date)),
		getExaminationStatusBadgeClass: options.getExaminationStatusBadgeClass,
		getExaminationStatusText: options.getExaminationStatusText,
		getFormatDate: () => getPageDateFormatter() || formatDisplayDate,
		resetFormToDefault: options.resetFormToDefault,
		loadAppointments: options.loadAppointments
	};
}

function createGlobalSearchActions(getFlow, hasAppointmentInCurrentList, selectAppointment) {
	return {
		handleAction(action = {}, item = {}) {
			if (action.kind === 'open_patient_history') {
				return this.openPatientHistory(action.payload || {}, item);
			}
			if (action.kind === 'open_appointment') {
				return this.openAppointment(action.payload || {}, item);
			}
			return false;
		},
		openPatientHistory(payload = {}) {
			const patientId = payload.patient_id;
			const flow = getFlow();
			if (!patientId || !flow
				|| typeof flow.openLinkedRelative !== 'function') {
				return false;
			}
			return flow.openLinkedRelative(patientId);
		},
		openAppointment(payload = {}) {
			if (payload.appointment_id
				&& hasAppointmentInCurrentList(payload.appointment_id)
				&& typeof selectAppointment === 'function') {
				return selectAppointment(payload.appointment_id);
			}
			return this.openPatientHistory(payload);
		}
	};
}

function bindRealtimeWhenReady(adapter, document) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => adapter.bindRealtimeUpdates(), { once: true });
	} else {
		window.setTimeout(() => adapter.bindRealtimeUpdates());
	}
}

function create(options = {}) {
	const document = options.document || window.document;
	const getAppointments = options.getAppointments || (() => []);
	const getCurrentPatientData = options.getCurrentPatientData || (() => null);
	const getCurrentAppointmentId = options.getCurrentAppointmentId || (() => null);
	const getFormatDateDisplay = options.getFormatDateDisplay || (() => getPageDateFormatter() || null);
	const formatDisplayDate = options.formatDisplayDate || getFormatDateDisplay();

	let patientHistoryModal = null;
	let modalPatientSearchFlow = null;
	let appointmentCopyFormPreparer = null;

	function hasAppointmentInCurrentList(appointmentId) {
		return Array.isArray(getAppointments())
			&& getAppointments().some(appointment => String(appointment.id) === String(appointmentId));
	}

	function prepareFormForCopy(closeModal = true) {
		return typeof appointmentCopyFormPreparer === 'function'
			? appointmentCopyFormPreparer(closeModal)
			: false;
	}

	function bind() {
		const patientModalContract = QLPKDoctorModuleRegistry.require('patientModalContract');
		patientHistoryModal = patientModalContract.getOrCreate({
			document,
			apiCall: options.apiCall,
			showToast: options.showToast,
			autoBind: false,
			contextOptions: buildHistoryContextOptions(options, {
				getAppointments,
				getCurrentPatientData,
				getCurrentAppointmentId,
				getFormatDateDisplay,
				prepareFormForCopy,
				formatDisplayDate
			})
		});

		const modalSearchContext = patientHistoryModal.context;
		const patientSearchModalElement = modalSearchContext.elements.modal;
		const modalSearchState = modalSearchContext.stateStore;
		modalPatientSearchFlow = modalSearchContext.flow;

		window.QLPKGlobalSearchActions = createGlobalSearchActions(() => modalPatientSearchFlow, hasAppointmentInCurrentList, options.selectPatientCard);

		const medicalRecordRealtimeAdapter = PsychologistMedicalRecordRealtimeUtils.createMedicalRecordRealtimeAdapter({
			document,
			console,
			getSelectedPatient: () => modalSearchState.get('selectedPatient'),
			getClinicInfoConfig: patientHistoryModal.dataRuntime.getClinicInfo,
			buildMedicalRecordHTML: patientHistoryModal.dataRuntime.buildMedicalRecordHTML,
			createBarcodesInElement: patientHistoryModal.dataRuntime.createBarcodesInElement
		});

		bindRealtimeWhenReady(medicalRecordRealtimeAdapter, document);

		appointmentCopyFormPreparer = ModalPatientSearchUi.createAppointmentCopyFormPreparer({
			clearExaminationLayout: options.clearExaminationLayout,
			setCurrentAppointmentId: options.setCurrentAppointmentId,
			modalElement: patientSearchModalElement
		});

		patientHistoryModal.bindControls?.({
			copyPatient: modalPatientSearchFlow?.copyPatientToForm,
			copyHistory: modalPatientSearchFlow?.copyHistoryToForm,
			deleteHistory: modalSearchContext.deleteFlow?.deleteHistory,
			loadPatient: options.loadPatient,
			isFormLocked: options.isFormLocked,
			unlockForm: options.unlockForm,
			relativeLinkHandler: RelativeLinkHandler
		});

		return {
			patientHistoryModal,
			modalSearchContext,
			modalPatientSearchFlow,
			prepareFormForCopy,
			getSelectedPatient: () => modalSearchState.get('selectedPatient'),
			updateMedicalRecordTab: medicalRecordRealtimeAdapter.updateMedicalRecordTab
		};
	}

	return { bind, prepareFormForCopy };
}

export const QLPKPsychologistPatientHistoryBridge = Object.freeze({ create });
