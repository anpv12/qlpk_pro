import { moduleState } from './state.js';
import { buildLinkedRelativePatientState, buildPatientSelectionFlowState, callIfFunction, runAppointmentPatientFlow, runSafeCallback, setFlowLoading } from './copy-flow.js';

async function selectAppointmentPatientFlow(appointmentId, options = {}) {
	moduleState.selectAppointmentCard(appointmentId, options.cardOptions || {});
	setFlowLoading(options, true);
	if (options.setAppointmentIdOnStart) callIfFunction(options.setCurrentAppointmentId, appointmentId);

	const shouldContinue = typeof options.isCurrentLoad === 'function'
		? options.isCurrentLoad
		: () => true;

	try {
		runSafeCallback(options.clearBeforeLoad, {
			message: options.clearErrorMessage || 'Error clearing examination fields:'
		});

		const historyUi = moduleState.getHistoryListUi(options);
		const appointment = historyUi && typeof historyUi.resolveAppointmentById === 'function'
			? historyUi.resolveAppointmentById(options.appointments || [], appointmentId)
			: null;
		if (!appointment) {
			callIfFunction(options.onMissingAppointment, appointmentId);
			return { status: 'missingAppointment', appointment: null };
		}

		if (typeof options.showHistoryButton === 'function') {
			options.showHistoryButton();
		} else {
			moduleState.showHistoryButton();
		}
		if (!options.setAppointmentIdOnStart) callIfFunction(options.setCurrentAppointmentId, appointmentId);

		return await runAppointmentPatientFlow(appointmentId, appointment, options, shouldContinue);
	} finally {
		const shouldFinalize = typeof options.shouldFinalize === 'function'
			? options.shouldFinalize()
			: true;
		if (shouldFinalize) setFlowLoading(options, false);
	}
}
function selectPatientForModalFlow(patients, index, options = {}) {
	const selectionState = buildPatientSelectionFlowState(patients, index);
	if (!selectionState) return null;

	if (typeof options.applySelectionState === 'function') {
		options.applySelectionState(selectionState);
	}
	if (typeof options.syncState === 'function') options.syncState(selectionState);

	const selectedPatientIdentity = selectionState.identity;
	moduleState.applySelectedPatientUi(index, options);
	let vitalSignsLoadedByActiveTab = false;

	if (typeof options.renderActiveTabLoading === 'function') {
		options.renderActiveTabLoading({
			onVitalSigns() {
				vitalSignsLoadedByActiveTab = true;
				if (typeof options.loadVitalSigns === 'function') {
					options.loadVitalSigns(selectedPatientIdentity.id, selectedPatientIdentity.fullName);
				}
			}
		});
	}

	if (typeof options.loadHistory === 'function') options.loadHistory(selectedPatientIdentity.id, selectionState);
	if (typeof options.updateContent === 'function') options.updateContent(selectionState);
	if (!vitalSignsLoadedByActiveTab && typeof options.loadVitalSigns === 'function') {
		options.loadVitalSigns(selectedPatientIdentity.id, selectedPatientIdentity.fullName);
	}
	return selectionState;
}
async function openLinkedRelativePatientSearch(options = {}) {
	if (!options.patientId) return { status: 'missingPatientId' };
	if (!moduleState.showBootstrapModal(options.modal, { missingMessage: options.missingMessage })) {
		return { status: 'missingModal' };
	}

	if (typeof options.setShouldPrefill === 'function') options.setShouldPrefill(false);
	if (typeof options.reset === 'function') options.reset();

	try {
		const response = await options.apiCall(moduleState.buildPatientDetailUrl(options.patientId));
		if (!response.ok) throw new Error(await response.text());
		const payload = await response.json();
		const patient = moduleState.extractPatientPayload(payload);
		if (!patient) throw new Error('Không có dữ liệu bệnh nhân');

		const linkedPatientState = buildLinkedRelativePatientState(patient);
		if (typeof options.applyLoadedState === 'function') {
			options.applyLoadedState(linkedPatientState, patient);
		}
		if (typeof options.renderResults === 'function') options.renderResults();
		if (typeof options.selectPatient === 'function') options.selectPatient(linkedPatientState.selectIndex);
		if (typeof options.loadHistory === 'function') {
			await options.loadHistory(linkedPatientState.historyPatientId);
		}
		moduleState.applySinglePatientSearchUi(patient, {
			searchInput: options.searchInput,
			selectButton: options.selectButton
		});
		return { status: 'success', patient, linkedPatientState };
	} catch (error) {
		console.error(options.logMessage || 'Không thể mở modal người thân liên kết:', error);
		if (typeof options.fetchFallback === 'function') options.fetchFallback('');
		return { status: 'error', error };
	}
}

export { openLinkedRelativePatientSearch, selectAppointmentPatientFlow, selectPatientForModalFlow };
