// doctor-examination.js: phần 1/2 (nạp trước doctor-examination.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination'] || (window.QLPKModuleParts['doctor-examination'] = { state: {} });
	const moduleState = moduleParts.state;

	function renderAppointmentsTable() {
		if (!moduleState.waitingListAdapter) return [];
		return moduleState.waitingListAdapter.renderAppointmentsTable();
	}
	function setSelectedAppointment(appointmentId) {
		moduleState.DOM.querySelectorAll('.qlpk-waiting-card.is-selected').forEach(card => {
			card.classList.remove('is-selected');
		});
		const selectedCard = moduleState.DOM.querySelector(`.qlpk-waiting-card[data-appointment-id="${appointmentId}"]`);
		if (selectedCard) selectedCard.classList.add('is-selected');

		const examSurface = moduleState.DOM.getElementById('doctorExamSurface');
		if (examSurface) {
			examSurface.dataset.selectedAppointmentId = String(appointmentId);
		}
	}
	function setLoadingState(isLoading) {
		moduleState.state.isLoadingExaminationData = Boolean(isLoading);
		moduleState.getModule('clinicalWorkspace')?.syncTransferActionState?.({ document: moduleState.DOM });
	}
	function canTransferCurrentAppointment() {
		return Boolean(moduleState.state.currentAppointmentId && moduleState.state.currentPatientData
			&& !moduleState.state.isLoadingExaminationData && !moduleState.state.loadFailed && !moduleState.state.historyView.active);
	}
	function openCurrentAppointmentTransfer() {
		if (!canTransferCurrentAppointment()) return;
		const appointmentId = moduleState.state.currentAppointmentId;
		const token = moduleState.state.loadToken;
		const isCurrent = () => canTransferCurrentAppointment()
			&& moduleState.state.currentAppointmentId === appointmentId && moduleState.state.loadToken === token;
		moduleState.requireModule('transferModal').open([appointmentId], 'doctor', () => {
			if (isCurrent()) {
				moduleState.state.loadToken += 1;
				moduleState.state.currentAppointmentId = null;
				clearPatientSurface();
			}
			moduleParts.loadAppointments('doctor_exam', moduleState.state.currentPage);
		}, {
			isCurrent,
			beforeTransfer: async () => {
				if (!isCurrent()) return false;
				const result = await moduleState.requireModule('clinicalWorkspace').saveWorkspace({ document: moduleState.DOM, silent: true });
				if (result?.status !== 'success') {
					moduleState.showCustomToast('error', 'Chưa lưu đủ dữ liệu khám. Vui lòng đóng cửa sổ chuyển khám, kiểm tra và lưu lại.');
					return false;
				}
				return isCurrent();
			}
		});
	}
	function isHistoryViewExemptControl(control) {
		return control.matches([
			'#doctorClinicalHistoryButton',
			'[data-doctor-history-view-exit]',
			'[data-doctor-section-target]',
			'[data-prescription-navigation]',
			'[data-prescription-history-action="toggle"]',
			'[data-prescription-history-action="close"]',
			'[data-prescription-history-action="select"]'
		].join(','));
	}
	function setHistoryViewMode(enabled, payload = {}) {
		const workspace = moduleState.DOM.getElementById('doctorClinicalWorkspace');
		const label = moduleState.DOM.getElementById('doctorHistoryViewLabel');
		const labelText = label?.querySelector('[data-doctor-history-view-label-text]');
		const exitButton = workspace?.querySelector('[data-doctor-history-view-exit]');
		if (!workspace) return;

		if (!enabled) {
			workspace.classList.remove('is-history-view');
			workspace.removeAttribute('data-history-view');
			workspace.removeAttribute('aria-readonly');
			if (label) label.hidden = true;
			if (exitButton) exitButton.hidden = true;
			workspace.querySelectorAll('[data-history-view-previous-disabled]').forEach(control => {
				control.disabled = control.dataset.historyViewPreviousDisabled === 'true';
				const previousAriaDisabled = control.dataset.historyViewPreviousAriaDisabled;
				if (previousAriaDisabled === '__missing__') control.removeAttribute('aria-disabled');
				else if (previousAriaDisabled != null) control.setAttribute('aria-disabled', previousAriaDisabled);
				delete control.dataset.historyViewPreviousDisabled;
				delete control.dataset.historyViewPreviousAriaDisabled;
			});
			return;
		}

		workspace.classList.add('is-history-view');
		workspace.dataset.historyView = 'true';
		workspace.setAttribute('aria-readonly', 'true');
		if (label) label.hidden = false;
		if (labelText) {
			const date = getAppointmentDateFromPayload(payload);
			labelText.textContent = date ? `Đang xem lịch sử · ${moduleState.formatDateDisplay(date)}` : 'Đang xem lịch sử';
		}
		if (exitButton) exitButton.hidden = false;
		workspace.querySelectorAll('button, input, select, textarea, fieldset').forEach(control => {
			if (isHistoryViewExemptControl(control) || control.dataset.historyViewPreviousDisabled != null) return;
			control.dataset.historyViewPreviousDisabled = String(Boolean(control.disabled));
			control.dataset.historyViewPreviousAriaDisabled = control.hasAttribute('aria-disabled')
				? control.getAttribute('aria-disabled')
				: '__missing__';
			control.disabled = true;
			control.setAttribute('aria-disabled', 'true');
		});
	}
	function isLoadGroupSuccessful(value) {
		if (Array.isArray(value)) {
			return value.every(result => result
				&& result.status === 'fulfilled'
				&& result.value !== false);
		}
		return value !== false;
	}
	function setCurrentPatientId(value) {
		const patientId = value ? Number(value) : null;
		moduleState.state.currentPatientId = Number.isFinite(patientId) && patientId > 0 ? patientId : null;
	}
	function setDoctorHistoryButtonAvailability(enabled) {
		const button = moduleState.DOM.getElementById('doctorClinicalHistoryButton');
		if (!button) return;
		button.disabled = !enabled;
		button.setAttribute('aria-disabled', String(!enabled));
	}
	function getPatientIdFromPayload(payload = {}) {
		const patient = payload.patient_info || {};
		const patientId = patient.id;
		const numericPatientId = Number(patientId);
		return Number.isFinite(numericPatientId) && numericPatientId > 0 ? numericPatientId : null;
	}
	function getAppointmentDateFromPayload(payload = {}) {
		const appointment = payload.appointment || payload;
		return appointment.appointment_date || payload.appointment_date || null;
	}
	function getDocumentAttachments() {
		return moduleState.getModule('documentAttachments');
	}
	function clearPatientSupportSections() {
		moduleState.patientHistoryModal?.reset();
		setCurrentPatientId(null);
		moduleState.state.currentPatientData = null;
		moduleState.state.currentAppointmentDate = null;
		setDoctorHistoryButtonAvailability(false);
		const attachments = getDocumentAttachments();
		if (attachments && typeof attachments.clear === 'function') attachments.clear();

		const relativesTable = moduleState.getModule('patientRelativesTable');
		if (relativesTable && typeof relativesTable.clear === 'function') {
			moduleState.state.relativeTableInstance = relativesTable.clear(moduleState.state.relativeTableInstance);
		}
	}
	function syncPatientSupportSections(payload = {}) {
		const patientId = getPatientIdFromPayload(payload);
		moduleState.state.currentPatientData = payload.patient_info || null;
		moduleState.state.currentAppointmentDate = getAppointmentDateFromPayload(payload);
		setCurrentPatientId(patientId);
		setDoctorHistoryButtonAvailability(Boolean(patientId));

		const attachments = getDocumentAttachments();
		if (attachments && typeof attachments.syncPatient === 'function') {
			attachments.syncPatient(moduleState.state.currentPatientId, { appointmentDate: moduleState.state.currentAppointmentDate });
		}
	}
	function initializePatientSupportSections() {
		const attachments = getDocumentAttachments();
		if (attachments && typeof attachments.initialize === 'function') {
			attachments.initialize({
				apiCall: moduleState.apiCall,
				getAuthHeader: moduleState.getAuthHeader,
				showToast: moduleState.showCustomToast,
				formatDateDisplay: moduleState.formatDateDisplay,
				getCurrentPatientId: () => moduleState.state.currentPatientId,
				getRelativeTableInstance: () => moduleState.state.relativeTableInstance,
				setRelativeTableInstance: value => { moduleState.state.relativeTableInstance = value; }
			});
		}
	}
	function getDoctorHistoryStatusClass(status) {
		const statusMap = {
			WAITING_TRANSFER: 'is-waiting',
			DOCTOR_EXAM: 'is-examining',
			CONCLUSION: 'is-conclusion',
			WAITING_PAYMENT: 'is-payment',
			COMPLETED: 'is-completed'
		};
		return statusMap[String(status || '').toUpperCase()] || 'is-waiting';
	}
	function getDoctorHistoryStatusText(status) {
		const statusMap = {
			WAITING_TRANSFER: 'Chờ chuyển khám',
			DOCTOR_EXAM: 'Đang khám',
			PSYCHOLOGIST_EXAM: 'Tâm lý gia khám',
			CONCLUSION: 'Kết luận',
			WAITING_PAYMENT: 'Chờ thanh toán',
			COMPLETED: 'Hoàn thành'
		};
		return statusMap[String(status || '').toUpperCase()] || status || '';
	}
	function getHistoryAppointmentId(index) {
		const histories = moduleState.patientHistoryModal?.getState?.()?.medicalHistoryData;
		const history = Array.isArray(histories) ? histories[Number(index)] : null;
		const appointmentId = Number(history?.appointment_id);
		return Number.isFinite(appointmentId) && appointmentId > 0 ? appointmentId : null;
	}
	async function selectHistoryResult(index) {
		const appointmentId = getHistoryAppointmentId(index);
		if (!appointmentId) {
			moduleState.showCustomToast('warning', 'Không tìm thấy lượt khám lịch sử.');
			return false;
		}

		const loaded = await viewHistoryAppointment(appointmentId);
		if (!loaded) return false;

		moduleState.patientHistoryModal?.close?.();
		return true;
	}
	function initializePatientHistoryBridge() {
		const historyBridge = moduleState.requireModule('patientHistoryBridge');
		moduleState.patientHistoryModal = historyBridge.create({
			document: moduleState.DOM,
			context: moduleState.COMPONENT_CONTEXT,
			apiCall: moduleState.apiCall,
			showToast: moduleState.showCustomToast,
			formatDateDisplay: moduleState.formatDateDisplay,
			getCurrentPatientData: () => moduleState.state.currentPatientData,
			getCurrentAppointmentId: () => moduleState.state.currentAppointmentId,
			setCurrentPatientId,
			getAppointments: () => moduleState.state.appointments,
			getSelectedAppointmentId: () => moduleState.state.currentAppointmentId,
			selectPatientCard: moduleParts.selectPatientCard,
			getExaminationStatusBadgeClass: getDoctorHistoryStatusClass,
			getExaminationStatusText: getDoctorHistoryStatusText,
			copyHistory: selectHistoryResult,
			beforeOpen: () => Boolean(moduleState.state.currentPatientId && !moduleState.state.isLoadingExaminationData)
		});
		return moduleState.patientHistoryModal;
	}
	function bindHistoryViewControls() {
		const exitButton = moduleState.DOM.querySelector('[data-doctor-history-view-exit]');
		if (!exitButton || exitButton.dataset.historyViewBound === 'true') return;
		exitButton.addEventListener('click', () => {
			exitHistoryView().catch(() => {
				moduleState.showCustomToast('error', 'Không thể quay lại lượt khám hiện tại.');
			});
		});
		exitButton.dataset.historyViewBound = 'true';
	}
	async function loadAppointmentDetail(appointmentId, token) {
		const response = await moduleState.apiCall(`/api/appointments/${appointmentId}/edit`);
		if (!response || !response.ok) {
			throw new Error('appointment-detail-load-failed');
		}
		const payload = await response.json();
		if (token !== moduleState.state.loadToken) return null;
		return payload;
	}
	function clearPatientSurface() {
		setHistoryViewMode(false);
		moduleState.state.historyView = {
			active: false,
			sourceAppointmentId: null,
			sourceAppointmentDate: null
		};
		moduleState.COMPONENT_CONTEXT.emit('patient:clearing', { appointmentId: moduleState.state.currentAppointmentId });
		const draftRecovery = moduleState.getModule('draftRecovery');
		if (draftRecovery && typeof draftRecovery.clearContext === 'function') {
			draftRecovery.clearContext({ document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT });
		}
		const examSurface = moduleState.DOM.getElementById('doctorExamSurface');
		if (examSurface) {
			examSurface.classList.remove('has-selected-appointment');
			delete examSurface.dataset.selectedAppointmentId;
			delete examSurface.dataset.loadState;
		}

		clearPatientSupportSections();

		const clinicalWorkspace = moduleState.getModule('clinicalWorkspace');
		if (clinicalWorkspace && typeof clinicalWorkspace.clear === 'function') {
			clinicalWorkspace.clear({ document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT });
		}
		const medicalHistoryBridge = moduleState.getModule('medicalHistoryBridge');
		if (medicalHistoryBridge && typeof medicalHistoryBridge.clear === 'function') {
			medicalHistoryBridge.clear({ document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT });
		}
		const supportModulesUi = moduleState.getModule('supportModulesUi');
		if (supportModulesUi && typeof supportModulesUi.clear === 'function') {
			supportModulesUi.clear({ document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT });
		}
		moduleState.COMPONENT_CONTEXT.emit('patient:cleared', { appointmentId: moduleState.state.currentAppointmentId });
	}
	function markPatientLoadFailed(reason, toastMessage, eventDetail) {
		moduleState.state.loadFailed = true;
		moduleState.state.loadFailure = reason;
		const clinicalWorkspace = moduleState.getModule('clinicalWorkspace');
		if (clinicalWorkspace && typeof clinicalWorkspace.setLoadFailed === 'function') {
			clinicalWorkspace.setLoadFailed(true, reason);
		}
		const examSurface = moduleState.DOM.getElementById('doctorExamSurface');
		if (examSurface) examSurface.dataset.loadState = 'error';
		moduleState.showCustomToast('error', toastMessage);
		moduleState.COMPONENT_CONTEXT.emit('patient:load-failed', { ...eventDetail, reason });
		return false;
	}
	function activateMainPane() {
		const workflowTwoPane = moduleState.requireModule('workflowTwoPane');
		if (workflowTwoPane && typeof workflowTwoPane.activate === 'function') {
			workflowTwoPane.activate('main', { document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT });
		}
	}
	function startPatientSurfaceLoads(payload, clinicalWorkspace) {
		const medicalHistoryBridge = moduleState.getModule('medicalHistoryBridge');
		const supportModulesUi = moduleState.getModule('supportModulesUi');
		const clinicalLoad = typeof clinicalWorkspace.whenInitialLoadSettled === 'function'
			? clinicalWorkspace.whenInitialLoadSettled()
			: Promise.resolve(true);
		const medicalHistoryLoad = medicalHistoryBridge && typeof medicalHistoryBridge.populate === 'function'
			? medicalHistoryBridge.populate(payload).catch(() => false)
			: Promise.resolve(true);
		syncPatientSupportSections(payload);
		const supportLoad = supportModulesUi && typeof supportModulesUi.load === 'function'
			? supportModulesUi.load({
				document: moduleState.DOM,
				context: moduleState.COMPONENT_CONTEXT,
				payload,
				appointmentId: payload && payload.id ? payload.id : moduleState.state.currentAppointmentId,
				patientId: getPatientIdFromPayload(payload)
			}).catch(() => false)
			: Promise.resolve(true);
		return [clinicalLoad, medicalHistoryLoad, supportLoad];
	}
	async function renderPatientSurface(payload, loadToken, options = {}) {
		const examSurface = moduleState.DOM.getElementById('doctorExamSurface');
		if (examSurface) {
			examSurface.classList.add('has-selected-appointment');
			if (!options.historyView && payload && payload.id) {
				examSurface.dataset.selectedAppointmentId = String(payload.id);
			}
		}

		const clinicalWorkspace = moduleState.getModule('clinicalWorkspace');
		const draftRecovery = moduleState.getModule('draftRecovery');
		if (!clinicalWorkspace || typeof clinicalWorkspace.render !== 'function') {
			throw new Error('missing-clinical-workspace-module');
		}

		clinicalWorkspace.render(payload, { document: moduleState.DOM, context: moduleState.COMPONENT_CONTEXT });
		const loadLabels = ['Khám chi tiết', 'Tiền sử', 'Đơn thuốc, Dịch vụ và Chỉ định'];
		const loadResults = await Promise.allSettled(startPatientSurfaceLoads(payload, clinicalWorkspace));
		if (loadToken !== moduleState.state.loadToken) return false;
		const failedLoads = loadResults
			.map((result, index) => ({ result, label: loadLabels[index] }))
			.filter(({ result }) => result.status !== 'fulfilled' || !isLoadGroupSuccessful(result.value));
		if (failedLoads.length) {
			const reason = `Chưa tải đủ dữ liệu: ${failedLoads.map(item => item.label).join(', ')}.`;
			return markPatientLoadFailed(reason, `${reason} Chưa thể lưu ca khám; hãy tải lại ca để thử lại.`, { appointmentId: moduleState.state.currentAppointmentId });
		}
		moduleState.state.loadFailed = false;
		moduleState.state.loadFailure = null;
		if (clinicalWorkspace && typeof clinicalWorkspace.setLoadFailed === 'function') {
			clinicalWorkspace.setLoadFailed(false);
		}
		if (examSurface) delete examSurface.dataset.loadState;
		if (!options.historyView && draftRecovery && typeof draftRecovery.setContext === 'function') {
			await draftRecovery.setContext({
				document: moduleState.DOM,
				context: moduleState.COMPONENT_CONTEXT,
				appointmentId: payload && payload.id ? payload.id : moduleState.state.currentAppointmentId,
				patientId: getPatientIdFromPayload(payload)
			});
		}
		moduleState.COMPONENT_CONTEXT.emit('patient:loaded', {
			appointmentId: moduleState.state.currentAppointmentId,
			patientId: moduleState.state.currentPatientId,
			historyView: Boolean(options.historyView),
			payload
		});
		return loadToken === moduleState.state.loadToken;
	}
	async function viewHistoryAppointment(appointmentId) {
		const currentAppointmentId = moduleState.state.currentAppointmentId;
		if (!currentAppointmentId) {
			moduleState.showCustomToast('warning', 'Chưa có lượt khám hiện tại để hiển thị lịch sử.');
			return false;
		}
		const canLeave = await requestWorkspaceLeave({ reason: 'history-view' });
		if (!canLeave) return false;

		const numericAppointmentId = Number(appointmentId);
		if (!Number.isFinite(numericAppointmentId) || numericAppointmentId <= 0) return false;
		const token = moduleState.state.loadToken + 1;
		moduleState.state.loadToken = token;
		setLoadingState(true);
		let surfaceCleared = false;

		try {
			const payload = await loadAppointmentDetail(numericAppointmentId, token);
			if (!payload || token !== moduleState.state.loadToken) return false;
			clearPatientSurface();
			surfaceCleared = true;
			setSelectedAppointment(currentAppointmentId);
			const rendered = await renderPatientSurface(payload, token, { historyView: true });
			if (!rendered || token !== moduleState.state.loadToken) return false;
			moduleState.state.historyView = {
				active: true,
				sourceAppointmentId: numericAppointmentId,
				sourceAppointmentDate: getAppointmentDateFromPayload(payload)
			};
			setHistoryViewMode(true, payload);
			activateMainPane();
			return true;
		} catch (error) {
			if (token !== moduleState.state.loadToken) return false;
			if (!surfaceCleared) {
				moduleState.showCustomToast('warning', 'Không thể nạp lịch sử lên form khám.');
				return false;
			}
			return markPatientLoadFailed(error?.message || 'Không tải được lịch sử khám', 'Không tải được lịch sử lên form khám.', {
				appointmentId: currentAppointmentId,
				historyAppointmentId: numericAppointmentId
			});
		} finally {
			if (token === moduleState.state.loadToken) setLoadingState(false);
		}
	}
	async function exitHistoryView() {
		if (!moduleState.state.historyView.active || !moduleState.state.currentAppointmentId) return true;
		return moduleParts.selectPatientCard(moduleState.state.currentAppointmentId, {
			skipUnsavedGuard: true,
			reload: true
		});
	}
	async function reloadCurrentAppointment() {
		if (!moduleState.state.currentAppointmentId) return true;
		return moduleParts.selectPatientCard(moduleState.state.currentAppointmentId, {
			skipUnsavedGuard: true,
			reload: true
		});
	}
	async function requestWorkspaceLeave(options = {}) {
		const guard = moduleState.getModule('workspaceLeaveGuard');
		if (!guard || typeof guard.requestLeave !== 'function') return true;
		return guard.requestLeave(options);
	}
	function isAppointmentAlreadyShown(numericAppointmentId, options) {
		return moduleState.state.currentAppointmentId === numericAppointmentId
			&& !options.reload && !moduleState.state.loadFailed && !moduleState.state.historyView.active;
	}

	Object.assign(moduleParts, {
		renderAppointmentsTable,
		setSelectedAppointment,
		setLoadingState,
		canTransferCurrentAppointment,
		openCurrentAppointmentTransfer,
		isHistoryViewExemptControl,
		setHistoryViewMode,
		isLoadGroupSuccessful,
		setCurrentPatientId,
		setDoctorHistoryButtonAvailability,
		getPatientIdFromPayload,
		getAppointmentDateFromPayload,
		getDocumentAttachments,
		clearPatientSupportSections,
		syncPatientSupportSections,
		initializePatientSupportSections,
		getDoctorHistoryStatusClass,
		getDoctorHistoryStatusText,
		getHistoryAppointmentId,
		selectHistoryResult,
		initializePatientHistoryBridge,
		bindHistoryViewControls,
		loadAppointmentDetail,
		clearPatientSurface,
		markPatientLoadFailed,
		activateMainPane,
		startPatientSurfaceLoads,
		renderPatientSurface,
		viewHistoryAppointment,
		exitHistoryView,
		reloadCurrentAppointment,
		requestWorkspaceLeave,
		isAppointmentAlreadyShown
	});
})(window);
