import { bindCompleteExaminationButton, bindDocumentModalButton, bindEditHistoryButton, bindExaminationFormShell, bindPersonalDetailEditButtons, bindReExaminationSourceReset, bindSaveInfoButton, bindSaveMedicalHistoryButton, bindTabPrintButtons, buildDefaultExaminationFormFieldEvents } from './transfer-actions.js';

function createExaminationFormInitializer(options = {}) {
	const variant = options.variant || 'doctor';
	const detailUtils = options.detailModalUtils;

	function loadDetailModalData(appointmentId) {
		if (typeof options.loadModalData === 'function') {
			return options.loadModalData(appointmentId);
		}
		if (!detailUtils) return false;
		const loader = variant === 'psychologist'
			? detailUtils.loadPsychologistDetailModalSections
			: detailUtils.loadDoctorDetailModalSections;
		if (typeof loader !== 'function') return false;
		return loader({
			appointmentId,
			apiCall: options.apiCall,
			$: options.$,
			setTextareaValue: options.textareaAdapter?.setTextareaValue
		});
	}

	function prefillDetailModal() {
		if (typeof options.prefillModal === 'function') {
			return options.prefillModal();
		}
		if (detailUtils && typeof detailUtils.prefillDetailModalFromMainForm === 'function') {
			return detailUtils.prefillDetailModalFromMainForm({ $: options.$ });
		}
		return false;
	}

	function buildFieldEvents() {
		if (Array.isArray(options.fieldEvents)) return options.fieldEvents;
		return buildDefaultExaminationFormFieldEvents(variant, options.handlers || {});
	}

	function buildDetailModalOptions() {
		const detailModalOptions = {
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			isFormLocked: options.isFormLocked,
			loadModalData: loadDetailModalData,
			prefillModal: prefillDetailModal,
			autoSaveOnClose: options.autoSaveOnClose,
			showToast: options.showToast
		};
		if (typeof options.afterDataReady === 'function') {
			detailModalOptions.afterDataReady = options.afterDataReady;
		}
		return { ...detailModalOptions, ...(options.detailModalOptions || {}) };
	}

	function initialize() {
		const feedbackAdapter = options.feedbackAdapter || (
			options.getFeedbackAdapter ? null : createExaminationFeedbackAdapter({
				showToast: options.showToast,
				...(options.feedbackAdapterOptions || {})
			})
		);
		return bindExaminationFormShell({
			$: options.$,
			textareaAdapter: options.textareaAdapter,
			fieldEvents: buildFieldEvents(),
			detailModalOptions: buildDetailModalOptions(),
			getFeedbackAdapter: options.getFeedbackAdapter,
			feedbackAdapter,
			autoResizeOptions: options.autoResizeOptions,
			detailButton: options.detailButton,
			feedbackOptions: options.feedbackOptions
		});
	}

	return {
		buildFieldEvents,
		loadDetailModalData,
		buildDetailModalOptions,
		initialize
	};
}
function bindExaminationActionButtons(options = {}) {
	return {
		editHistoryButton: bindEditHistoryButton(options.editHistoryButton, {
			unlockForm: options.unlockForm,
			showToast: options.showToast,
			message: options.editMessage
		}),
		completeExaminationButton: bindCompleteExaminationButton(options.completeExaminationButton, options),
		saveInfoButton: bindSaveInfoButton(options.saveInfoButton, {
			save: options.saveInfo,
			reenableDelayMs: options.saveInfoReenableDelayMs
		}),
		reExaminationSourceReset: bindReExaminationSourceReset(options.reExaminationCheck, {
			originalAppointmentInput: options.originalAppointmentInput
		}),
		personalDetailEditButtons: bindPersonalDetailEditButtons(options.personalDetailEdit || {}),
		tabPrintButtons: bindTabPrintButtons({
			document: options.document,
			printModalTabContent: options.printModalTabContent
		}),
		documentButton: bindDocumentModalButton(options.documentButton, {
			loadModalData: options.loadDocumentModalData,
			modal: options.documentModal,
			setupAutoSave: options.setupDocumentAutoSave,
			documentsTab: options.documentsTab,
			bootstrapApi: options.bootstrapApi,
			tabDelayMs: options.documentTabDelayMs
		}),
		saveMedicalHistoryButton: bindSaveMedicalHistoryButton(
			options.saveMedicalHistoryButton,
			options.saveMedicalHistory
		)
	};
}
function createExaminationFeedbackAdapter(options = {}) {
	const showToast = typeof options.showToast === 'function' ? options.showToast : function () {};
	return {
		handleSummary() {
			showToast('success', options.summaryMessage || 'Tổng kết đã được tạo');
		},
		handleGuidance() {
			showToast('info', options.guidanceMessage || 'Tính năng hướng dẫn đang được phát triển');
		}
	};
}

export { bindExaminationActionButtons, createExaminationFeedbackAdapter, createExaminationFormInitializer };
