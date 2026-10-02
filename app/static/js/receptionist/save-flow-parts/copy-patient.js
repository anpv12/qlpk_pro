import { JointExamManager } from '../../joint-exam-manager.js';
import { state } from '../page-state.js';
import { safeSetValue } from '../save-flow.js';
import { MEDICAL_DRAFT_KEY, PAGE_LOAD_ID_KEY, allServices, apiCall, beginReceptionistLoad, reEnableAgeCalculation, receptionistLoadState, setCurrentPatientId, setDateOfBirthAndAge, setupAgeCalculation, showCustomToast, temporarilyDisableAgeCalculation } from '../../receptionist-new.js';
import { buildFullAddressFromParts, loadProvinces, loadWards, updateAddressSummary } from '../../receptionist-new-parts/address.js';
import { jointExamManagerInstance, loadAttachmentsForCurrentPatient } from '../medical-data-and-documents.js';
import { ReceptionistAppointmentListControls } from '../appointment-list-controls.js';
import { ReceptionistFormResetUtils } from '../form-reset-utils.js';
import { ReceptionistJointExamOrchestration } from '../joint-exam-orchestration.js';
import { RelativeTableManager } from '../../relative-table.js';
import { QLPKPatientIntakeForm } from '../../components/patient-intake-form.js';
// Patient copy and shared-form population for the receptionist save flow (ES module).

function getPatientPopulateOptions() {
	return {
		safeSetValue,
		setDateOfBirthAndAge,
		temporarilyDisableAgeCalculation,
		reEnableAgeCalculation,
		buildFullAddressFromParts,
		summaryFieldId: 'addressSummary',
		loadProvinces,
		loadWards,
		updateAddressSummary,
		apiCall,
		allServices,
		document,
		RelativeTableManager: RelativeTableManager,
		JointExamManager,
		bootstrap: window.bootstrap,
		window
	};
}

function buildSharedFormPayload({ appointment = {}, patient = {}, examination = {} } = {}) {
	return {
		appointment,
		patient_info: patient,
		examination_info: examination
	};
}

async function populateSharedForms({ appointment = {}, patient = {}, examination = {} } = {}, options = {}) {
	if (options.isCurrentLoad?.() === false) return false;
	const patientIntakeForm = QLPKPatientIntakeForm;
	if (!patientIntakeForm || typeof patientIntakeForm.populate !== 'function') {
		throw new Error('Shared patient intake component is not available');
	}

	const payload = buildSharedFormPayload({ appointment, patient, examination });
	const result = await patientIntakeForm.populate(payload, {
		document,
		isCurrentLoad: options.isCurrentLoad,
		syncAddressHierarchy: options.syncAddressHierarchy !== false,
		addressOptions: getPatientPopulateOptions()
	});
	if (result === false || options.isCurrentLoad?.() === false) return false;
	return payload;
}

function getMedicalDraftOptions() {
	return {
		draftKey: MEDICAL_DRAFT_KEY,
		pageLoadIdKey: PAGE_LOAD_ID_KEY,
		document,
		sessionStorage,
		localStorage
	};
}

// The patient record to copy, or null when a newer load replaced this one.
async function fetchPatientForCopy(patientId, isCurrentLoad) {
	const response = await apiCall(`/api/patients/${patientId}`);
	if (!isCurrentLoad()) return null;
	if (!response.ok) throw new Error(await response.text());
	const responseData = await response.json();
	if (!isCurrentLoad()) return null;
	const patient = responseData.data || responseData;
	if (!patient || !patient.id) throw new Error('Không có dữ liệu bệnh nhân');
	return patient;
}

function resetFormForCopiedPatient() {
	ReceptionistFormResetUtils.clearFormForCopy({
		document,
		window,
		setupAgeCalculation,
		setCurrentPatientId
	});
	state.currentEditId = null;
	state.currentAppointmentId = null;
	ReceptionistJointExamOrchestration.clearPendingList(jointExamManagerInstance);
	localStorage.removeItem('currentEditId');
}

async function copyPatientToReceptionistFormFromGlobalSearch(payload = {}) {
	const patientId = payload.patient_id;
	if (!patientId) {
		showCustomToast('warning', 'Không xác định được bệnh nhân cần sao chép.');
		return false;
	}

	const isCurrentLoad = beginReceptionistLoad();
	try {
		const patient = await fetchPatientForCopy(patientId, isCurrentLoad);
		if (!patient) return false;

		resetFormForCopiedPatient();

		const populated = await populateSharedForms({ patient }, { isCurrentLoad });
		if (!isCurrentLoad()) return false;
		if (populated === false) throw new Error('patient-load-incomplete');

		setCurrentPatientId(patient.id);
		ReceptionistAppointmentListControls?.activateResponsiveWorkspacePane?.('main', { document, window });
		try { await loadAttachmentsForCurrentPatient(); } catch (attachmentError) { console.warn('Không thể tải tệp đính kèm:', attachmentError); }
		if (!isCurrentLoad()) return false;
		receptionistLoadState.failed = false;
		showCustomToast('success', `Đã sao chép thông tin bệnh nhân: ${patient.full_name || ''}`.trim());
		return true;
	} catch (error) {
		if (!isCurrentLoad()) return false;
		console.error('Không thể sao chép bệnh nhân từ global search:', error);
		showCustomToast('error', 'Không thể sao chép thông tin bệnh nhân.');
		return false;
	} finally {
		if (isCurrentLoad()) receptionistLoadState.loading = false;
	}
}

export { copyPatientToReceptionistFormFromGlobalSearch, getMedicalDraftOptions, getPatientPopulateOptions, populateSharedForms };
