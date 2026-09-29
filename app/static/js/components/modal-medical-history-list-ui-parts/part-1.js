// components/modal-medical-history-list-ui.js: phần 1/3 (nạp trước modal-medical-history-list-ui.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/modal-medical-history-list-ui'] || (window.QLPKModuleParts['components/modal-medical-history-list-ui'] = { state: {} });

	function resolveElement(elementOrId) {
		if (!elementOrId) return null;
		return typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
	}
	function buildStateHtml(state) {
		const states = {
			empty: `
                <div class="patient-search-modal__empty-state patient-search-modal__empty-state--history">
                    <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                        <i class="bi bi-clipboard patient-search-modal__empty-icon--sm"></i>
                    </span>
                    <p class="patient-search-modal__empty-title">Chưa có lịch sử khám</p>
                    <small class="patient-search-modal__empty-description">Bệnh nhân chưa có lượt khám trước đó</small>
                </div>
            `,
			error: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--history patient-search-modal__empty-state--error">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-exclamation-triangle patient-search-modal__empty-icon--sm"></i>
                </span>
                <p class="patient-search-modal__empty-title">Lỗi tải lịch sử khám</p>
                <small class="patient-search-modal__empty-description">Vui lòng thử lại sau</small>
            </div>
        `
		};

		return states[state] || '';
	}
	function renderState(containerOrId, state) {
		const container = resolveElement(containerOrId || 'modalMedicalHistory');
		if (!container) return '';
		const html = buildStateHtml(state);
		container.innerHTML = html;
		return html;
	}
	function extractHistoryExaminations(payload) {
		return payload && Array.isArray(payload.examinations) ? payload.examinations : [];
	}
	function buildHistoryListUrl(patientId, options = {}) {
		const limit = options.limit || 20;
		return `/api/patients/${patientId}/examinations?limit=${limit}`;
	}
	function buildHistoryLoadStartState(patientId) {
		return {
			medicalHistoryLoading: true,
			currentPatientId: patientId
		};
	}
	function buildHistoryLoadSuccessState(histories, selectedIndex) {
		return {
			medicalHistoryData: Array.isArray(histories) ? histories : [],
			selectedHistoryIndex: selectedIndex
		};
	}
	function buildHistoryLoadErrorState() {
		return {
			medicalHistoryData: [],
			selectedHistoryIndex: null
		};
	}
	function buildHistoryLoadFinishState() {
		return {
			medicalHistoryLoading: false
		};
	}
	function buildHistoryLoadStateHandlers(options = {}) {
		const assign = (setter, value) => {
			if (typeof setter === 'function') setter(value);
		};
		const syncState = () => {
			if (typeof options.syncState === 'function') options.syncState();
		};

		return {
			onLoadStart(loadStartState) {
				assign(options.setMedicalHistoryLoading, loadStartState.medicalHistoryLoading);
				syncState();
				assign(options.setCurrentPatientId, loadStartState.currentPatientId);
			},
			onLoadSuccess(successState) {
				assign(options.setMedicalHistoryData, successState.medicalHistoryData);
				assign(options.setSelectedHistoryIndex, successState.selectedHistoryIndex);
				syncState();
			},
			onLoadError(errorState) {
				assign(options.setMedicalHistoryData, errorState.medicalHistoryData);
				assign(options.setSelectedHistoryIndex, errorState.selectedHistoryIndex);
			},
			onLoadFinish(finishState) {
				assign(options.setMedicalHistoryLoading, finishState.medicalHistoryLoading);
				syncState();
			},
			onAfterLoad() {
				if (typeof options.onAfterLoad === 'function') options.onAfterLoad();
			}
		};
	}
	function resolveSelectedIndex(options = {}) {
		const histories = Array.isArray(options.histories) ? options.histories : [];
		if (!histories.length) return null;

		let selectedIndex = Number.isInteger(options.selectedIndex) ? options.selectedIndex : null;
		if (selectedIndex === null) {
			let currentExamIndex = -1;
			if (options.currentAppointmentId) {
				currentExamIndex = histories.findIndex(exam => exam.appointment_id === options.currentAppointmentId);
			}

			if (currentExamIndex === -1) {
				const activeStatuses = Array.isArray(options.activeStatuses) ? options.activeStatuses : [];
				currentExamIndex = histories.findIndex(exam => activeStatuses.includes(exam.status));
			}

			selectedIndex = currentExamIndex !== -1 ? currentExamIndex : 0;
		} else if (selectedIndex >= histories.length) {
			selectedIndex = histories.length - 1;
		} else if (selectedIndex < 0) {
			selectedIndex = 0;
		}

		return selectedIndex;
	}
	function resolveSelectableHistoryIndex(index) {
		const resolvedIndex = Number(index);
		if (Number.isNaN(resolvedIndex) || resolvedIndex < 0) return null;
		return resolvedIndex;
	}
	function buildSelectedHistoryState(index) {
		const selectedHistoryIndex = resolveSelectableHistoryIndex(index);
		if (selectedHistoryIndex === null) return null;
		return { selectedHistoryIndex };
	}
	function selectHistoryRow(index, options = {}) {
		const selectedHistoryState = buildSelectedHistoryState(index);
		if (!selectedHistoryState) return null;
		moduleParts.setActiveHistoryRow(selectedHistoryState.selectedHistoryIndex, options);
		return selectedHistoryState;
	}
	function selectHistoryForModalFlow(index, options = {}) {
		const selectedHistoryState = selectHistoryRow(index, options);
		if (!selectedHistoryState) return null;

		if (typeof options.setSelectedHistoryIndex === 'function') {
			options.setSelectedHistoryIndex(selectedHistoryState.selectedHistoryIndex);
		}
		if (typeof options.applySelectedHistoryState === 'function') {
			options.applySelectedHistoryState(selectedHistoryState);
		}
		if (typeof options.syncState === 'function') options.syncState(selectedHistoryState);
		if (typeof options.dispatchContent === 'function') {
			options.dispatchContent(selectedHistoryState);
		} else if (window.ModalFunctionTabsUi && typeof window.ModalFunctionTabsUi.dispatchActiveTabRender === 'function') {
			const renderers = typeof options.getRenderers === 'function' ? options.getRenderers() : options.renderers;
			if (renderers) {
				window.ModalFunctionTabsUi.dispatchActiveTabRender({ renderers });
			}
		}
		return selectedHistoryState;
	}
	function resolveHistoryAtIndex(histories, index, fallbackIndex) {
		const list = Array.isArray(histories) ? histories : [];
		let resolvedIndex = index;
		if (resolvedIndex === null || resolvedIndex === undefined || Number.isNaN(Number(resolvedIndex))) {
			resolvedIndex = fallbackIndex !== null ? fallbackIndex : 0;
		}
		resolvedIndex = Number(resolvedIndex);
		if (resolvedIndex < 0 || resolvedIndex >= list.length) {
			return { index: resolvedIndex, history: null, status: 'outOfRange' };
		}
		const history = list[resolvedIndex] || null;
		return { index: resolvedIndex, history, status: history ? 'ready' : 'missing' };
	}
	function resolveCopyHistorySelection(options = {}) {
		const histories = Array.isArray(options.histories) ? options.histories : [];
		if (!options.selectedPatient) {
			return {
				status: 'missingPatient',
				message: 'Vui lòng chọn bệnh nhân trước khi sao chép lịch sử',
				history: null
			};
		}
		if (!histories.length) {
			return {
				status: 'emptyHistory',
				message: 'Không có dữ liệu lịch sử khám để sao chép',
				history: null
			};
		}

		const historySelection = resolveHistoryAtIndex(
			histories,
			options.historyIndex,
			options.selectedHistoryIndex
		);
		if (historySelection.status === 'outOfRange') {
			return {
				status: 'outOfRange',
				message: 'Không tìm thấy lịch sử khám tương ứng',
				history: null,
				historySelection
			};
		}
		if (!historySelection.history) {
			return {
				status: 'missingHistory',
				message: 'Không tìm thấy dữ liệu lịch sử khám',
				history: null,
				historySelection
			};
		}
		return {
			status: 'ready',
			message: '',
			history: historySelection.history,
			historySelection
		};
	}
	function resolveAppointmentById(appointments, appointmentId) {
		const list = Array.isArray(appointments) ? appointments : [];
		return list.find(appointment => appointment.id === appointmentId) || null;
	}
	function resolveAppointmentExaminationId(appointment) {
		if (!appointment) return null;
		return appointment.examination_id ||
			(appointment.examinations && appointment.examinations.length > 0 ? appointment.examinations[0].id : null);
	}
	function resolveQuickDeleteSelection(appointments, appointmentId) {
		if (!appointmentId) {
			return {
				status: 'missingAppointmentId',
				message: 'Không tìm thấy ID lịch hẹn',
				appointment: null,
				examinationId: null
			};
		}
		const appointment = resolveAppointmentById(appointments, appointmentId);
		if (!appointment) {
			return {
				status: 'missingAppointment',
				message: 'Không tìm thấy lịch hẹn',
				appointment: null,
				examinationId: null
			};
		}
		return {
			status: 'ready',
			message: '',
			appointment,
			examinationId: resolveAppointmentExaminationId(appointment)
		};
	}
	function resolveQuickDeleteExaminationId(selection, fallbackPayload) {
		if (selection && selection.examinationId) return selection.examinationId;
		return extractExaminationId(fallbackPayload);
	}
	async function buildQuickDeleteFlowState(appointments, appointmentId, options = {}) {
		const quickDeleteSelection = resolveQuickDeleteSelection(appointments, appointmentId);
		if (quickDeleteSelection.status !== 'ready') {
			return quickDeleteSelection;
		}

		const appointment = quickDeleteSelection.appointment;
		let examinationId = resolveQuickDeleteExaminationId(quickDeleteSelection);

		if (!examinationId && typeof options.apiCall === 'function') {
			try {
				const examResponse = await options.apiCall(buildExaminationIdUrl(appointmentId));
				if (examResponse && examResponse.ok) {
					const examData = await examResponse.json();
					examinationId = resolveQuickDeleteExaminationId(quickDeleteSelection, examData);
				}
			} catch (error) {
				console.warn(options.examinationIdWarningMessage || 'Không thể lấy examination_id từ API:', error);
			}
		}

		if (!examinationId) {
			return {
				status: 'missingExaminationId',
				message: 'Không tìm thấy lượt khám để xóa',
				appointment,
				examinationId: null,
				quickDeleteSelection
			};
		}

		return {
			status: 'ready',
			message: '',
			appointment,
			examinationId,
			quickDeleteSelection,
			quickDeleteConfirmState: moduleParts.buildQuickDeleteConfirmState(appointment, {
				formatDate: options.formatDate
			})
		};
	}
	async function deleteQuickSearchExaminationFlow(appointmentId, options = {}) {
		const quickDeleteFlowState = await buildQuickDeleteFlowState(options.appointments, appointmentId, {
			apiCall: options.apiCall,
			formatDate: options.formatDate,
			examinationIdWarningMessage: options.examinationIdWarningMessage
		});
		if (quickDeleteFlowState.status !== 'ready') {
			if (typeof options.showToast === 'function') {
				options.showToast('error', quickDeleteFlowState.message);
			}
			return { status: quickDeleteFlowState.status, quickDeleteFlowState };
		}

		if (typeof options.deleteExamination !== 'function') {
			return { status: 'missingDeleteHandler', quickDeleteFlowState };
		}

		const deleteResult = await options.deleteExamination(quickDeleteFlowState.examinationId, {
			examinationDate: quickDeleteFlowState.quickDeleteConfirmState.examinationDate,
			patientName: quickDeleteFlowState.quickDeleteConfirmState.patientName,
			checkCurrentAppointment: () => isCurrentAppointmentMatch(options.currentAppointmentId, appointmentId),
			onSuccess: options.onSuccess
		});

		return { status: 'ready', quickDeleteFlowState, deleteResult };
	}
	function resolveHistoryAppointmentId(history) {
		return history && history.appointment_id ? history.appointment_id : null;
	}
	function buildHistoryCopyLoadState(history) {
		const appointmentId = resolveHistoryAppointmentId(history);
		return {
			appointmentId,
			hasAppointmentContext: Boolean(appointmentId)
		};
	}
	async function loadCopiedHistoryWithPatient(history, patient, options = {}) {
		const historyCopyLoadState = options.historyCopyLoadState || buildHistoryCopyLoadState(history);
		const appointmentId = options.appointmentId || historyCopyLoadState.appointmentId;
		const hasAppointmentContext = Boolean(historyCopyLoadState.hasAppointmentContext && appointmentId);

		if (typeof options.loadPatient === 'function') {
			await options.loadPatient(patient, history);
		}

		if (hasAppointmentContext) {
			if (typeof options.loadExaminationFormData === 'function') {
				try {
					await options.loadExaminationFormData(appointmentId);
				} catch (error) {
					console.error(options.formErrorMessage || 'Không thể tải form khám từ lịch sử:', error);
				}
			}

			if (typeof options.loadAppointmentServices === 'function') {
				try {
					await options.loadAppointmentServices();
				} catch (error) {
					console.error(options.serviceErrorMessage || 'Không thể tải dịch vụ cho lịch sử:', error);
				}
			}

			if (typeof options.loadPrescriptionData === 'function') {
				try {
					await options.loadPrescriptionData();
				} catch (error) {
					console.error(options.prescriptionErrorMessage || 'Không thể tải đơn thuốc cho lịch sử:', error);
				}
			}
		}

		if (typeof options.lockForm === 'function') options.lockForm();
		return {
			...historyCopyLoadState,
			appointmentId,
			hasAppointmentContext
		};
	}
	async function copyHistoryToFormFlow(options = {}) {
		const copySelection = resolveCopyHistorySelection({
			selectedPatient: options.selectedPatient,
			histories: options.histories,
			historyIndex: options.historyIndex,
			selectedHistoryIndex: options.selectedHistoryIndex
		});
		if (copySelection.status !== 'ready') {
			if (typeof options.showToast === 'function') {
				options.showToast('warning', copySelection.message);
			}
			return { status: copySelection.status, copySelection };
		}

		const history = copySelection.history;
		if (typeof options.setLoadingState === 'function') options.setLoadingState(true);

		try {
			if (typeof options.prepareFormForCopy === 'function') options.prepareFormForCopy();

			const historyCopyLoadState = buildHistoryCopyLoadState(history);
			if (typeof options.setCurrentAppointmentId === 'function') {
				options.setCurrentAppointmentId(historyCopyLoadState.appointmentId);
			}

			const patientSearchUi = window.ModalPatientSearchUi;
			const historyPatientLoadState = patientSearchUi && typeof patientSearchUi.loadCopyHistoryPatient === 'function'
				? await patientSearchUi.loadCopyHistoryPatient(options.selectedPatient, { apiCall: options.apiCall })
				: { fullPatient: options.selectedPatient || null };

			const copiedHistoryState = await loadCopiedHistoryWithPatient(history, historyPatientLoadState.fullPatient, {
				historyCopyLoadState,
				appointmentId: historyCopyLoadState.appointmentId,
				loadPatient: options.loadPatient,
				loadExaminationFormData: options.loadExaminationFormData,
				loadAppointmentServices: options.loadAppointmentServices,
				loadPrescriptionData: options.loadPrescriptionData,
				lockForm: options.lockForm,
				formErrorMessage: options.formErrorMessage,
				serviceErrorMessage: options.serviceErrorMessage,
				prescriptionErrorMessage: options.prescriptionErrorMessage
			});

			return {
				status: 'success',
				copySelection,
				history,
				historyCopyLoadState,
				historyPatientLoadState,
				copiedHistoryState
			};
		} finally {
			if (typeof options.setLoadingState === 'function') options.setLoadingState(false);
		}
	}
	function buildExaminationIdUrl(appointmentId) {
		return `/api/examination-id/${appointmentId}`;
	}
	function buildExaminationDetailUrl(examinationId) {
		return `/api/examination-detail/${examinationId}`;
	}
	function extractExaminationId(payload) {
		return payload && payload.examination_id ? payload.examination_id : null;
	}
	function isCurrentAppointmentMatch(currentAppointmentId, appointmentId) {
		return Boolean(currentAppointmentId && appointmentId === currentAppointmentId);
	}
	function getAppointmentPatientName(appointment) {
		return appointment && appointment.patient_full_name ? appointment.patient_full_name : 'bệnh nhân';
	}

	Object.assign(moduleParts, {
		resolveElement,
		buildStateHtml,
		renderState,
		extractHistoryExaminations,
		buildHistoryListUrl,
		buildHistoryLoadStartState,
		buildHistoryLoadSuccessState,
		buildHistoryLoadErrorState,
		buildHistoryLoadFinishState,
		buildHistoryLoadStateHandlers,
		resolveSelectedIndex,
		resolveSelectableHistoryIndex,
		buildSelectedHistoryState,
		selectHistoryRow,
		selectHistoryForModalFlow,
		resolveHistoryAtIndex,
		resolveCopyHistorySelection,
		resolveAppointmentById,
		resolveAppointmentExaminationId,
		resolveQuickDeleteSelection,
		resolveQuickDeleteExaminationId,
		buildQuickDeleteFlowState,
		deleteQuickSearchExaminationFlow,
		resolveHistoryAppointmentId,
		buildHistoryCopyLoadState,
		loadCopiedHistoryWithPatient,
		copyHistoryToFormFlow,
		buildExaminationIdUrl,
		buildExaminationDetailUrl,
		extractExaminationId,
		isCurrentAppointmentMatch,
		getAppointmentPatientName
	});
})(window);
