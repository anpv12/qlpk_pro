// components/modal-patient-search-state.js: phần 2/2 (nạp trước modal-patient-search-state.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/modal-patient-search-state'] || (window.QLPKModuleParts['components/modal-patient-search-state'] = { state: {} });
	const moduleState = moduleParts.state;

	async function selectAppointmentPatientFlow(appointmentId, options = {}) {
		moduleState.selectAppointmentCard(appointmentId, options.cardOptions || {});
		moduleParts.setFlowLoading(options, true);
		if (options.setAppointmentIdOnStart) moduleParts.callIfFunction(options.setCurrentAppointmentId, appointmentId);

		const shouldContinue = typeof options.isCurrentLoad === 'function'
			? options.isCurrentLoad
			: () => true;

		try {
			moduleParts.runSafeCallback(options.clearBeforeLoad, {
				message: options.clearErrorMessage || 'Error clearing examination fields:'
			});

			const historyUi = moduleState.getHistoryListUi(options);
			const appointment = historyUi && typeof historyUi.resolveAppointmentById === 'function'
				? historyUi.resolveAppointmentById(options.appointments || [], appointmentId)
				: null;
			if (!appointment) {
				moduleParts.callIfFunction(options.onMissingAppointment, appointmentId);
				return { status: 'missingAppointment', appointment: null };
			}

			if (typeof options.showHistoryButton === 'function') {
				options.showHistoryButton();
			} else {
				moduleState.showHistoryButton();
			}
			if (!options.setAppointmentIdOnStart) moduleParts.callIfFunction(options.setCurrentAppointmentId, appointmentId);

			return await moduleParts.runAppointmentPatientFlow(appointmentId, appointment, options, shouldContinue);
		} finally {
			const shouldFinalize = typeof options.shouldFinalize === 'function'
				? options.shouldFinalize()
				: true;
			if (shouldFinalize) moduleParts.setFlowLoading(options, false);
		}
	}
	function selectPatientForModalFlow(patients, index, options = {}) {
		const selectionState = moduleParts.buildPatientSelectionFlowState(patients, index);
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

			const linkedPatientState = moduleParts.buildLinkedRelativePatientState(patient);
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

	Object.assign(moduleParts, {
		selectAppointmentPatientFlow,
		selectPatientForModalFlow,
		openLinkedRelativePatientSearch
	});
})(window);
