(function (window) {
	'use strict';

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
		setActiveHistoryRow(selectedHistoryState.selectedHistoryIndex, options);
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
			quickDeleteConfirmState: buildQuickDeleteConfirmState(appointment, {
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

	function buildQuickDeleteConfirmState(appointment, options = {}) {
		return {
			examinationDate: formatVisitDateText(appointment && appointment.appointment_date, options),
			patientName: getAppointmentPatientName(appointment)
		};
	}

	function formatVisitDateText(value, options = {}) {
		if (!value) return options.fallbackText || 'lượt khám này';
		const formatDate = typeof options.formatDate === 'function' ? options.formatDate : null;
		return formatDate ? formatDate(value) : String(value);
	}

	function buildHistoryDeleteConfirmState(histories, index, options = {}) {
		const examination = resolveHistoryAtIndex(histories, index).history;
		return {
			examination,
			examinationDate: formatVisitDateText(examination && examination.appointment_date, options),
			appointmentId: resolveHistoryAppointmentId(examination)
		};
	}

	function buildHistoryDeleteFlowState(examinationId, histories, index, options = {}) {
		if (!examinationId) {
			return {
				status: 'missingExaminationId',
				message: 'Không tìm thấy ID lượt khám',
				examinationId: null
			};
		}

		return {
			status: 'ready',
			message: '',
			examinationId,
			historyDeleteConfirmState: buildHistoryDeleteConfirmState(histories, index, options)
		};
	}

	async function deleteHistoryExaminationFlow(examinationId, index, options = {}) {
		const historyDeleteFlowState = buildHistoryDeleteFlowState(examinationId, options.histories, index, {
			formatDate: options.formatDate
		});
		if (historyDeleteFlowState.status !== 'ready') {
			if (typeof options.showToast === 'function') {
				options.showToast('error', historyDeleteFlowState.message);
			}
			return { status: historyDeleteFlowState.status, historyDeleteFlowState };
		}

		if (typeof options.deleteExamination !== 'function') {
			return { status: 'missingDeleteHandler', historyDeleteFlowState };
		}

		const deleteResult = await options.deleteExamination(historyDeleteFlowState.examinationId, {
			examinationDate: historyDeleteFlowState.historyDeleteConfirmState.examinationDate,
			checkCurrentAppointment: () => isCurrentAppointmentMatch(
				options.currentAppointmentId,
				historyDeleteFlowState.historyDeleteConfirmState.appointmentId
			),
			onSuccess: options.onSuccess
		});

		return { status: 'ready', historyDeleteFlowState, deleteResult };
	}

	function resolveAdapterValue(getter, fallbackValue) {
		return typeof getter === 'function' ? getter() : fallbackValue;
	}

	function createExaminationDeleteFlowAdapter(options = {}) {
		const getFormatDate = () => resolveAdapterValue(options.getFormatDate, options.formatDate);
		const getCurrentAppointmentId = () => resolveAdapterValue(options.getCurrentAppointmentId, options.currentAppointmentId);
		const getAppointments = () => resolveAdapterValue(options.getAppointments, options.appointments);
		const getHistories = () => resolveAdapterValue(options.getHistories, options.histories);

		async function deleteCore(examinationId, deleteOptions = {}) {
			return deleteExaminationCore(examinationId, {
				...deleteOptions,
				apiCall: options.apiCall,
				showToast: options.showToast,
				showConfirmationDialog: options.showConfirmationDialog,
				onCurrentAppointmentDeleted() {
					if (typeof options.resetFormToDefault === 'function') options.resetFormToDefault();
					if (typeof options.setCurrentAppointmentId === 'function') options.setCurrentAppointmentId(null);
					if (typeof options.setCurrentPatientId === 'function') options.setCurrentPatientId(null);
				}
			});
		}

		async function deleteQuickSearch(appointmentId) {
			return deleteQuickSearchExaminationFlow(appointmentId, {
				appointments: getAppointments(),
				apiCall: options.apiCall,
				formatDate: getFormatDate(),
				showToast: options.showToast,
				deleteExamination: deleteCore,
				currentAppointmentId: getCurrentAppointmentId(),
				onSuccess: async () => {
					if (typeof options.loadAppointments === 'function') await options.loadAppointments();
				}
			});
		}

		async function deleteHistory(examinationId, index) {
			return deleteHistoryExaminationFlow(examinationId, index, {
				histories: getHistories(),
				formatDate: getFormatDate(),
				showToast: options.showToast,
				deleteExamination: deleteCore,
				currentAppointmentId: getCurrentAppointmentId(),
				onSuccess: async () => {
					const patientSearchUi = window.ModalPatientSearchUi;
					const patientId = patientSearchUi && typeof patientSearchUi.resolveModalPatientId === 'function'
						? patientSearchUi.resolveModalPatientId(
							resolveAdapterValue(options.getModalCurrentPatientId, options.modalCurrentPatientId),
							resolveAdapterValue(options.getModalSelectedPatient, options.modalSelectedPatient)
						)
						: null;
					if (patientId && typeof options.loadModalMedicalHistory === 'function') {
						await options.loadModalMedicalHistory(patientId);
					}
				}
			});
		}

		return {
			deleteCore,
			deleteQuickSearch,
			deleteHistory
		};
	}

	function buildDeleteConfirmationText(options = {}) {
		const examinationDate = options.examinationDate || 'lượt khám này';
		const patientText = options.patientName ? ` của ${options.patientName}` : '';
		return `Bạn có chắc chắn muốn xóa lượt khám ngày ${examinationDate}${patientText}?\n Hành động này không thể hoàn tác.`;
	}

	function buildDeleteConfirmationDialogOptions(text) {
		return {
			title: 'Xác nhận xóa lượt khám',
			text,
			icon: 'warning',
			confirmText: 'Xóa',
			cancelText: 'Hủy',
			confirmButtonClass: 'btn btn-danger',
			cancelButtonClass: 'btn btn-outline-secondary'
		};
	}

	function buildDeleteExaminationRequestOptions() {
		return {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			}
		};
	}

	function buildDeleteExaminationUrl(examinationId) {
		return `/examinations/${examinationId}`;
	}

	function resolveDeleteExaminationErrorMessage(payload, fallbackText = 'Không thể xóa lượt khám') {
		return payload && payload.detail ? payload.detail : fallbackText;
	}

	function buildDeleteExaminationCatchMessage() {
		return 'Không thể xóa lượt khám. Vui lòng thử lại.';
	}

	async function deleteExaminationCore(examinationId, options = {}) {
		if (!examinationId) {
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không tìm thấy ID lượt khám');
			}
			return { status: 'missingExaminationId' };
		}

		const confirmText = buildDeleteConfirmationText({
			examinationDate: options.examinationDate || 'lượt khám này',
			patientName: options.patientName
		});
		const dialogOptions = buildDeleteConfirmationDialogOptions(confirmText);
		const confirmed = typeof options.showConfirmationDialog === 'function'
			? await options.showConfirmationDialog(dialogOptions)
			: false;

		cleanupSweetAlertDialog();
		if (!confirmed) return { status: 'cancelled' };

		try {
			if (typeof options.showToast === 'function') {
				options.showToast('info', 'Đang xóa lượt khám...');
			}

			const response = await options.apiCall(
				buildDeleteExaminationUrl(examinationId),
				buildDeleteExaminationRequestOptions()
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
				throw new Error(resolveDeleteExaminationErrorMessage(errorData));
			}

			if (typeof options.showToast === 'function') {
				options.showToast('success', 'Đã xóa lượt khám thành công');
			}

			if (typeof options.checkCurrentAppointment === 'function' && options.checkCurrentAppointment()) {
				if (typeof options.onCurrentAppointmentDeleted === 'function') {
					options.onCurrentAppointmentDeleted();
				}
			}

			if (typeof options.onSuccess === 'function') {
				await options.onSuccess();
			}

			return { status: 'success' };
		} catch (error) {
			console.error(options.errorLogMessage || 'Error deleting examination:', error);
			if (typeof options.showToast === 'function') {
				options.showToast('error', buildDeleteExaminationCatchMessage(error));
			}
			return { status: 'error', error };
		}
	}

	function cleanupSweetAlertDialog() {
		if (typeof Swal === 'undefined') return false;
		try {
			if (Swal.close) {
				Swal.close();
			}
			if (Swal.getContainer && Swal.getContainer()) {
				const container = Swal.getContainer();
				if (container && container.parentNode) {
					container.parentNode.removeChild(container);
				}
			}
			const swalPopup = document.querySelector('.swal2-container');
			if (swalPopup && swalPopup.parentNode) {
				swalPopup.remove();
			}
			const body = document.body;
			if (body) {
				body.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
				body.style.overflow = '';
				body.style.paddingRight = '';
			}
			return true;
		} catch (error) {
			console.warn('Error closing dialog:', error);
			return false;
		}
	}

	function getDisplayDate(exam) {
		return exam.appointment_date
			? new Date(exam.appointment_date)
			: (exam.examination_date ? new Date(exam.examination_date) : null);
	}

	function isSameDate(firstDate, secondDate) {
		return firstDate && secondDate &&
			firstDate.getDate() === secondDate.getDate() &&
			firstDate.getMonth() === secondDate.getMonth() &&
			firstDate.getFullYear() === secondDate.getFullYear();
	}

	function isExaminingStatus(status) {
		return ['DOCTOR_EXAM', 'PSYCHOLOGIST_EXAM'].includes(String(status || '').trim().toUpperCase());
	}

	function buildVisitBadge({ isCurrentExam, isToday, paymentStatus }) {
		if (isCurrentExam) {
			return '<span class="modal-history-visit-label">Lượt hiện tại</span>';
		}
		if (isToday && paymentStatus !== 'PAID') {
			return '<span class="modal-history-visit-label">Hôm nay</span>';
		}
		return '';
	}

	function defaultFormatDate(date) {
		return date ? date.toLocaleDateString('vi-VN') : '';
	}

	function formatDateTime(date, options = {}) {
		if (!date) return '';
		const formatDate = typeof options.formatDate === 'function' ? options.formatDate : defaultFormatDate;
		return `${formatDate(date)} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
	}

	function buildHistoryRowHtml(options = {}) {
		const exam = options.exam || {};
		const index = options.index || 0;
		const selectedIndex = options.selectedIndex;
		const isCurrentExam = isCurrentAppointmentMatch(options.currentAppointmentId, exam.appointment_id);
		const isExamining = isExaminingStatus(exam.status);
		const isWaitingPayment = String(exam.status || '').trim().toUpperCase() === 'WAITING_PAYMENT';
		const displayDate = getDisplayDate(exam);
		const isToday = isSameDate(displayDate, new Date());
		const isPastHistory = !isCurrentExam && !isExamining && !(isToday && exam.payment_status !== 'PAID');
		const statusBadge = buildVisitBadge({ isCurrentExam, isExamining, isToday, paymentStatus: exam.payment_status });
		const getDescription = typeof options.getDescription === 'function'
			? options.getDescription
			: item => item.diagnosis || '';
		const description = getDescription(exam) || '';
		const getStatusText = typeof options.getExaminationStatusText === 'function'
			? options.getExaminationStatusText
			: status => status || '';
		const showCopyAction = options.showCopyAction !== false;
		const showDeleteAction = options.showDeleteAction !== false;
		const actionButtons = [];

		if (showCopyAction) {
			actionButtons.push(`
						<button class="btn btn-sm patient-search-modal__history-copy-button ${isCurrentExam ? 'patient-search-modal__history-copy-button--current' : ''} ${isExamining ? 'patient-search-modal__history-copy-button--examining' : ''}" data-action="copy-history" data-index="${index}" title="${isCurrentExam ? 'Xem lượt khám hiện tại' : 'Xem lịch sử'}">
                            <i class="bi ${isCurrentExam ? 'bi-eye-fill' : 'bi-eye'}"></i>
                        </button>
                    `);
		}
		if (showDeleteAction) {
			actionButtons.push(`
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-danger" data-action="delete-history" data-exam-id="${exam.id}" data-index="${index}" title="Xóa lượt khám">
                            <i class="bi bi-trash"></i>
                        </button>
                    `);
		}

		const rowClasses = [
			'row', 'border-bottom', 'py-2', 'align-items-center',
			'modal-history-row', 'modal-history-item',
			selectedIndex === index ? 'modal-history-item-active' : '',
			isCurrentExam ? 'current-exam-highlight' : '',
			isExamining ? 'modal-history-item--examining' : '',
			isPastHistory ? 'past-exam-history' : ''
		].filter(Boolean).join(' ');

		return `
                <div class="${rowClasses}" data-index="${index}" data-exam-id="${exam.id}" data-appointment-id="${exam.appointment_id}" data-is-current="${isCurrentExam}">
                    <div class="col-3 text-start col-history-date">
                        <span class="modal-history-date-time">${formatDateTime(displayDate, options)}</span>
                        ${statusBadge}
                    </div>
                    <div class="col-5 text-start col-history-diagnosis">
                        <span class="d-block text-truncate" title="${description}">${description}</span>
					</div>
					<div class="col-2 text-center col-history-payment">
						<span class="qlpk-status patient-search-modal__exam-status-badge${isExamining ? ' patient-search-modal__exam-status-badge--examining' : ''}${isWaitingPayment ? ' patient-search-modal__exam-status-badge--waiting-payment' : ''}">
							${getStatusText(exam.status)}
						</span>
                    </div>
                    <div class="col-2 text-center">
                        ${actionButtons.join('')}
                    </div>
                </div>
            `;
	}

	function renderHistoryList(options = {}) {
		const container = resolveElement(options.container || 'modalMedicalHistory');
		if (!container) return { state: 'missingContainer', selectedIndex: options.selectedIndex, html: '' };

		const histories = Array.isArray(options.histories) ? options.histories : [];
		const selectedIndex = resolveSelectedIndex(options);
		if (!histories.length) {
			return { state: 'empty', selectedIndex, html: renderState(container, 'empty') };
		}

		const html = histories.map((exam, index) => buildHistoryRowHtml({
			...options,
			exam,
			index,
			selectedIndex
		})).join('');
		container.innerHTML = html;
		return { state: 'ready', selectedIndex, html };
	}

	function renderHistoryListWithActiveRow(options = {}) {
		const result = renderHistoryList(options);
		if (result.state === 'ready') {
			setActiveHistoryRow(result.selectedIndex, {
				activeClass: options.activeClass,
				rowSelector: options.rowSelector
			});
		}
		return result;
	}

	async function loadAndRenderHistoryList(options = {}) {
		const container = resolveElement(options.container || 'modalMedicalHistory');
		if (!container) return { status: 'missingContainer' };
		const isCurrent = () => typeof options.isCurrent !== 'function' || options.isCurrent();
		if (!isCurrent()) return { status: 'stale' };

		const loadStartState = buildHistoryLoadStartState(options.patientId);
		if (typeof options.onLoadStart === 'function') {
			options.onLoadStart(loadStartState);
		}

		try {
			const url = buildHistoryListUrl(options.patientId, { limit: options.limit });
			let data;
			if (typeof options.fetchJson === 'function') {
				data = await options.fetchJson(url);
			} else if (typeof options.apiCall === 'function') {
				const response = await options.apiCall(url);
				if (!response.ok) throw new Error(await response.text());
				data = await response.json();
			} else {
				throw new Error('apiCall or fetchJson is required');
			}
			if (!isCurrent()) return { status: 'stale' };

			const examinations = extractHistoryExaminations(data);
			const historyRenderResult = renderHistoryListWithActiveRow({
				...options,
				container,
				histories: examinations
			});
			const successState = buildHistoryLoadSuccessState(
				examinations,
				historyRenderResult.selectedIndex
			);
			if (typeof options.onLoadSuccess === 'function') {
				options.onLoadSuccess(successState, historyRenderResult);
			}
			return {
				status: 'success',
				data,
				examinations,
				historyRenderResult,
				successState
			};
		} catch (error) {
			if (!isCurrent()) return { status: 'stale' };
			if (options.logError !== false) {
				console.error('Error loading modal medical history:', error);
			}
			renderState(container, 'error');
			const errorState = buildHistoryLoadErrorState();
			if (typeof options.onLoadError === 'function') {
				options.onLoadError(errorState, error);
			}
			return { status: 'error', error, errorState };
		} finally {
			if (isCurrent()) {
				const finishState = buildHistoryLoadFinishState();
				if (typeof options.onLoadFinish === 'function') {
					options.onLoadFinish(finishState);
				}
				if (typeof options.onAfterLoad === 'function') {
					options.onAfterLoad();
				}
			}
		}
	}

	function setActiveHistoryRow(index, options = {}) {
		const activeClass = options.activeClass || 'modal-history-item-active';
		document.querySelectorAll(options.rowSelector || '.modal-history-item').forEach(item => item.classList.remove(activeClass));
		if (index !== null && index !== undefined) {
			const row = document.querySelector(`${options.rowSelector || '.modal-history-item'}[data-index="${index}"]`);
			if (row) row.classList.add(activeClass);
			return row || null;
		}
		return null;
	}

	function bindHistoryListClick(containerOrId, options = {}) {
		const container = resolveElement(containerOrId || 'modalMedicalHistory');
		if (!container) return null;

		container.addEventListener('click', async event => {
			const target = event.target;
			if (!target || typeof target.closest !== 'function') return;

			const row = target.closest(options.rowSelector || '.modal-history-item');
			if (row) {
				const index = Number(row.dataset.index);
				if (!Number.isNaN(index) && typeof options.onSelect === 'function') {
					container.querySelectorAll('.modal-history-item-user-selected').forEach(item => item.classList.remove('modal-history-item-user-selected'));
					row.classList.add('modal-history-item-user-selected');
					options.onSelect(index, event, row);
				}
			}

			const actionEl = target.closest('[data-action]');
			const action = actionEl ? actionEl.getAttribute('data-action') : null;
			if (action === 'copy-history') {
				event.preventDefault();
				event.stopPropagation();
				if (typeof options.onCopyHistory === 'function') {
					await options.onCopyHistory(actionEl.dataset.index, event, actionEl);
				}
				return;
			}
			if (action === 'delete-history') {
				event.preventDefault();
				event.stopPropagation();
				const examId = actionEl.dataset.examId;
				if (examId && typeof options.onDeleteHistory === 'function') {
					await options.onDeleteHistory(examId, actionEl.dataset.index, event, actionEl);
				}
			}
		});
		return container;
	}

	function bindHistoryListActions(containerOrId, options = {}) {
		return bindHistoryListClick(containerOrId, {
			rowSelector: options.rowSelector,
			onSelect: options.onSelect,
			onCopyHistory: async (historyIndex, event, actionEl) => {
				if (typeof options.copyHistory !== 'function') return;
				try {
					await options.copyHistory(historyIndex, event, actionEl);
				} catch (error) {
					console.error(options.copyErrorLogMessage || 'Không thể sao chép lịch sử khám:', error);
					if (typeof options.showToast === 'function') {
						options.showToast('error', options.copyErrorMessage || 'Không thể sao chép lịch sử khám. Vui lòng thử lại.');
					}
				}
			},
			onDeleteHistory: async (examId, index, event, actionEl) => {
				if (typeof options.deleteHistory === 'function') {
					await options.deleteHistory(examId, index, event, actionEl);
				}
			}
		});
	}

	const api = {
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
		getAppointmentPatientName,
		buildQuickDeleteConfirmState,
		formatVisitDateText,
		buildHistoryDeleteConfirmState,
		buildHistoryDeleteFlowState,
		deleteHistoryExaminationFlow,
		createExaminationDeleteFlowAdapter,
		buildDeleteConfirmationText,
		buildDeleteConfirmationDialogOptions,
		buildDeleteExaminationRequestOptions,
		buildDeleteExaminationUrl,
		resolveDeleteExaminationErrorMessage,
		buildDeleteExaminationCatchMessage,
		deleteExaminationCore,
		cleanupSweetAlertDialog,
		isExaminingStatus,
		buildVisitBadge,
		buildHistoryRowHtml,
		renderHistoryList,
		renderHistoryListWithActiveRow,
		loadAndRenderHistoryList,
		setActiveHistoryRow,
		bindHistoryListClick,
		bindHistoryListActions
	};
	window.ModalMedicalHistoryListUi = Object.freeze(api);
	window.QLPKDoctorModuleRegistry?.register?.('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);
})(window);
