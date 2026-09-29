// components/modal-medical-history-list-ui.js: phần 2/3 (nạp trước modal-medical-history-list-ui.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/modal-medical-history-list-ui'] || (window.QLPKModuleParts['components/modal-medical-history-list-ui'] = { state: {} });

	function buildQuickDeleteConfirmState(appointment, options = {}) {
		return {
			examinationDate: formatVisitDateText(appointment && appointment.appointment_date, options),
			patientName: moduleParts.getAppointmentPatientName(appointment)
		};
	}
	function formatVisitDateText(value, options = {}) {
		if (!value) return options.fallbackText || 'lượt khám này';
		const formatDate = typeof options.formatDate === 'function' ? options.formatDate : null;
		return formatDate ? formatDate(value) : String(value);
	}
	function buildHistoryDeleteConfirmState(histories, index, options = {}) {
		const examination = moduleParts.resolveHistoryAtIndex(histories, index).history;
		return {
			examination,
			examinationDate: formatVisitDateText(examination && examination.appointment_date, options),
			appointmentId: moduleParts.resolveHistoryAppointmentId(examination)
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
			checkCurrentAppointment: () => moduleParts.isCurrentAppointmentMatch(
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
			return moduleParts.deleteQuickSearchExaminationFlow(appointmentId, {
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
		const value = exam.appointment_date || exam.examination_date;
		return value ? new Date(value) : null;
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
	function buildHistoryRowFlags(exam, options) {
		const isCurrentExam = moduleParts.isCurrentAppointmentMatch(options.currentAppointmentId, exam.appointment_id);
		const isExamining = isExaminingStatus(exam.status);
		const displayDate = getDisplayDate(exam);
		const isToday = isSameDate(displayDate, new Date());
		return {
			isCurrentExam,
			isExamining,
			isToday,
			displayDate,
			isWaitingPayment: String(exam.status || '').trim().toUpperCase() === 'WAITING_PAYMENT',
			isPastHistory: !isCurrentExam && !isExamining && !(isToday && exam.payment_status !== 'PAID')
		};
	}
	function buildHistoryRowActions(exam, index, flags, options) {
		const actionButtons = [];
		if (options.showCopyAction !== false) {
			actionButtons.push(`
						<button class="btn btn-sm patient-search-modal__history-copy-button ${flags.isCurrentExam ? 'patient-search-modal__history-copy-button--current' : ''} ${flags.isExamining ? 'patient-search-modal__history-copy-button--examining' : ''}" data-action="copy-history" data-index="${index}" title="${flags.isCurrentExam ? 'Xem lượt khám hiện tại' : 'Xem lịch sử'}">
                            <i class="bi ${flags.isCurrentExam ? 'bi-eye-fill' : 'bi-eye'}"></i>
                        </button>
                    `);
		}
		if (options.showDeleteAction !== false) {
			actionButtons.push(`
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-danger" data-action="delete-history" data-exam-id="${exam.id}" data-index="${index}" title="Xóa lượt khám">
                            <i class="bi bi-trash"></i>
                        </button>
                    `);
		}
		return actionButtons.join('');
	}
	function buildHistoryRowClasses(flags, selectedIndex, index) {
		return [
			'row', 'border-bottom', 'py-2', 'align-items-center',
			'modal-history-row', 'modal-history-item',
			selectedIndex === index ? 'modal-history-item-active' : '',
			flags.isCurrentExam ? 'current-exam-highlight' : '',
			flags.isExamining ? 'modal-history-item--examining' : '',
			flags.isPastHistory ? 'past-exam-history' : ''
		].filter(Boolean).join(' ');
	}
	function buildHistoryRowHtml(options = {}) {
		const exam = options.exam || {};
		const index = options.index || 0;
		const flags = buildHistoryRowFlags(exam, options);
		const statusBadge = buildVisitBadge({ isCurrentExam: flags.isCurrentExam, isExamining: flags.isExamining, isToday: flags.isToday, paymentStatus: exam.payment_status });
		const getDescription = typeof options.getDescription === 'function'
			? options.getDescription
			: item => item.diagnosis || '';
		const description = getDescription(exam) || '';
		const getStatusText = typeof options.getExaminationStatusText === 'function'
			? options.getExaminationStatusText
			: status => status || '';
		const rowClasses = buildHistoryRowClasses(flags, options.selectedIndex, index);

		return `
                <div class="${rowClasses}" data-index="${index}" data-exam-id="${exam.id}" data-appointment-id="${exam.appointment_id}" data-is-current="${flags.isCurrentExam}">
                    <div class="col-3 text-start col-history-date">
                        <span class="modal-history-date-time">${formatDateTime(flags.displayDate, options)}</span>
                        ${statusBadge}
                    </div>
                    <div class="col-5 text-start col-history-diagnosis">
                        <span class="d-block text-truncate" title="${description}">${description}</span>
					</div>
					<div class="col-2 text-center col-history-payment">
						<span class="qlpk-status patient-search-modal__exam-status-badge${flags.isExamining ? ' patient-search-modal__exam-status-badge--examining' : ''}${flags.isWaitingPayment ? ' patient-search-modal__exam-status-badge--waiting-payment' : ''}">
							${getStatusText(exam.status)}
						</span>
                    </div>
                    <div class="col-2 text-center">
                        ${buildHistoryRowActions(exam, index, flags, options)}
                    </div>
                </div>
            `;
	}
	function renderHistoryList(options = {}) {
		const container = moduleParts.resolveElement(options.container || 'modalMedicalHistory');
		if (!container) return { state: 'missingContainer', selectedIndex: options.selectedIndex, html: '' };

		const histories = Array.isArray(options.histories) ? options.histories : [];
		const selectedIndex = moduleParts.resolveSelectedIndex(options);
		if (!histories.length) {
			return { state: 'empty', selectedIndex, html: moduleParts.renderState(container, 'empty') };
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
			moduleParts.setActiveHistoryRow(result.selectedIndex, {
				activeClass: options.activeClass,
				rowSelector: options.rowSelector
			});
		}
		return result;
	}
	async function loadAndRenderHistoryList(options = {}) {
		const container = moduleParts.resolveElement(options.container || 'modalMedicalHistory');
		if (!container) return { status: 'missingContainer' };
		const isCurrent = () => typeof options.isCurrent !== 'function' || options.isCurrent();
		if (!isCurrent()) return { status: 'stale' };

		const loadStartState = moduleParts.buildHistoryLoadStartState(options.patientId);
		if (typeof options.onLoadStart === 'function') {
			options.onLoadStart(loadStartState);
		}

		try {
			const url = moduleParts.buildHistoryListUrl(options.patientId, { limit: options.limit });
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

			const examinations = moduleParts.extractHistoryExaminations(data);
			const historyRenderResult = renderHistoryListWithActiveRow({
				...options,
				container,
				histories: examinations
			});
			const successState = moduleParts.buildHistoryLoadSuccessState(
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
			moduleParts.renderState(container, 'error');
			const errorState = moduleParts.buildHistoryLoadErrorState();
			if (typeof options.onLoadError === 'function') {
				options.onLoadError(errorState, error);
			}
			return { status: 'error', error, errorState };
		} finally {
			if (isCurrent()) {
				const finishState = moduleParts.buildHistoryLoadFinishState();
				if (typeof options.onLoadFinish === 'function') {
					options.onLoadFinish(finishState);
				}
				if (typeof options.onAfterLoad === 'function') {
					options.onAfterLoad();
				}
			}
		}
	}

	Object.assign(moduleParts, {
		buildQuickDeleteConfirmState,
		formatVisitDateText,
		buildHistoryDeleteConfirmState,
		buildHistoryDeleteFlowState,
		deleteHistoryExaminationFlow,
		resolveAdapterValue,
		createExaminationDeleteFlowAdapter,
		buildDeleteConfirmationText,
		buildDeleteConfirmationDialogOptions,
		buildDeleteExaminationRequestOptions,
		buildDeleteExaminationUrl,
		resolveDeleteExaminationErrorMessage,
		buildDeleteExaminationCatchMessage,
		deleteExaminationCore,
		cleanupSweetAlertDialog,
		getDisplayDate,
		isSameDate,
		isExaminingStatus,
		buildVisitBadge,
		defaultFormatDate,
		formatDateTime,
		buildHistoryRowFlags,
		buildHistoryRowActions,
		buildHistoryRowClasses,
		buildHistoryRowHtml,
		renderHistoryList,
		renderHistoryListWithActiveRow,
		loadAndRenderHistoryList
	});
})(window);
