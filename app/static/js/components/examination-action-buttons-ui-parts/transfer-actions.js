// components/examination-action-buttons-ui.js: phần 1/2 (nạp trước examination-action-buttons-ui.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/examination-action-buttons-ui'] || (window.QLPKModuleParts['components/examination-action-buttons-ui'] = { state: {} });

	function resolveElement(elementOrId, fallbackId) {
		const target = elementOrId || fallbackId;
		if (!target) return null;
		return typeof target === 'string' ? document.getElementById(target) : target;
	}
	function getDocument(options = {}) {
		return options.document || window.document;
	}
	function buildExaminationIdUrl(appointmentId) {
		return `/api/examination-id/${appointmentId}`;
	}
	function extractExaminationId(payload) {
		return payload && payload.examination_id ? payload.examination_id : null;
	}
	function buildTransitionRequestOptions() {
		return {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' }
		};
	}
	function showTransferMenuFlow(appointmentId, event, options = {}) {
		if (event && typeof event.stopPropagation === 'function') {
			event.stopPropagation();
		}

		const transferModal = options.transferModal || window.TransferModal;
		const role = options.role || 'doctor';
		const onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null;

		if (transferModal && typeof transferModal.openWithErrorHandling === 'function') {
			transferModal.openWithErrorHandling([appointmentId], role, onSuccess);
			return { status: 'opened', method: 'openWithErrorHandling', role };
		}

		if (transferModal && typeof transferModal.open === 'function') {
			transferModal.open([appointmentId], role, onSuccess);
			return { status: 'opened', method: 'open', role };
		}

		console.error('TransferModal module chưa được load.');
		if (typeof options.showToast === 'function') {
			options.showToast('error', options.missingModuleMessage || 'Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
		}
		return { status: 'missingModule', role };
	}
	function createTransferMenuHandler(options = {}) {
		return function handleTransferMenu(appointmentId, event) {
			return showTransferMenuFlow(appointmentId, event, options);
		};
	}
	function notify(options, type, message) {
		if (typeof options.showToast === 'function') options.showToast(type, message);
	}
	async function completeExaminationFlow(options = {}) {
		const appointmentId = getCurrentAppointmentId(options);

		if (!appointmentId) {
			notify(options, 'warning', options.missingAppointmentMessage || 'Vui lòng chọn lịch hẹn để hoàn thành khám');
			return { status: 'missingAppointment' };
		}

		try {
			const examinationId = await fetchCompletionExaminationId(appointmentId, options);
			await transitionExaminationForCompletion(examinationId, options);
			notify(options, 'success', options.successMessage || 'Đã chuyển lượt khám sang trạng thái "Chờ thanh toán"');
			scheduleCompletionReload(options);
			return { status: 'success', appointmentId, examinationId };
		} catch (error) {
			console.error(options.errorLogMessage || 'Error completing examination:', error);
			notify(options, 'error', options.fallbackErrorMessage || 'Không thể hoàn thành lượt khám. Vui lòng thử lại.');
			return { status: 'error', appointmentId, error };
		}
	}
	async function fetchCompletionExaminationId(appointmentId, options) {
		const examResponse = await options.apiCall(buildExaminationIdUrl(appointmentId));
		if (!examResponse || !examResponse.ok) {
			throw new Error(options.missingExaminationMessage || 'Không tìm thấy lượt khám');
		}
		const examinationId = extractExaminationId(await examResponse.json());
		if (!examinationId) {
			throw new Error(options.missingExaminationIdMessage || 'Không tìm thấy ID lượt khám');
		}
		return examinationId;
	}
	async function transitionExaminationForCompletion(examinationId, options) {
		const transitionUrl = typeof options.buildTransitionUrl === 'function'
			? options.buildTransitionUrl(examinationId)
			: `/examinations/${examinationId}/${options.transitionPath || 'transfer-to-payment'}`;
		const response = await options.apiCall(transitionUrl, buildTransitionRequestOptions());
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(errorData.detail || options.transitionErrorMessage || 'Lỗi chuyển trạng thái');
		}
	}
	function scheduleCompletionReload(options) {
		const reloadDelayMs = Number.isFinite(options.reloadDelayMs) ? options.reloadDelayMs : 500;
		const reload = typeof options.reload === 'function'
			? options.reload
			: () => window.location.reload();
		setTimeout(reload, reloadDelayMs);
	}
	function bindEditHistoryButton(buttonOrId, options = {}) {
		const button = resolveElement(buttonOrId, 'editHistoryBtn');
		if (!button) return null;
		button.addEventListener('click', () => {
			if (typeof options.unlockForm === 'function') options.unlockForm();
			if (typeof options.showToast === 'function') {
				options.showToast('info', options.message || 'Đã mở khóa chỉnh sửa. Bạn có thể chỉnh sửa thông tin bệnh nhân.');
			}
		});
		return button;
	}
	function bindCompleteExaminationButton(buttonOrId, options = {}) {
		const button = resolveElement(buttonOrId, 'completeExaminationBtn');
		if (!button) return null;
		button.addEventListener('click', () => completeExaminationFlow(options));
		return button;
	}
	function getBootstrapApi() {
		if (window.bootstrap) return window.bootstrap;
		if (typeof bootstrap !== 'undefined') return bootstrap;
		return null;
	}
	function bindDocumentModalButton(buttonOrId, options = {}) {
		const button = resolveElement(buttonOrId, 'documentBtn');
		if (!button) return null;
		button.addEventListener('click', function () {
			if (typeof options.loadModalData === 'function') options.loadModalData();

			const modalEl = resolveElement(options.modal, 'medicalHistoryModal');
			const bootstrapApi = options.bootstrapApi || getBootstrapApi();
			if (modalEl && bootstrapApi && bootstrapApi.Modal) {
				const modal = new bootstrapApi.Modal(modalEl);
				modal.show();
			}

			if (typeof options.setupAutoSave === 'function') options.setupAutoSave();

			const delayMs = Number.isFinite(options.tabDelayMs) ? options.tabDelayMs : 100;
			setTimeout(() => {
				const tabEl = resolveElement(options.documentsTab, 'documents-tab');
				if (tabEl && bootstrapApi && bootstrapApi.Tab) {
					const tab = new bootstrapApi.Tab(tabEl);
					tab.show();
				}
			}, delayMs);
		});
		return button;
	}
	function bindSaveMedicalHistoryButton(buttonOrId, onSave) {
		const button = resolveElement(buttonOrId, 'saveMedicalHistoryBtn');
		if (!button || typeof onSave !== 'function') return null;
		button.addEventListener('click', () => onSave());
		return button;
	}
	function bindSaveInfoButton(buttonOrId, options = {}) {
		const button = resolveElement(buttonOrId, 'saveInfoBtn');
		if (!button || typeof options.save !== 'function') return null;
		button.addEventListener('click', function () {
			if (button.disabled) return;
			button.disabled = true;

			const reenableDelayMs = Number.isFinite(options.reenableDelayMs) ? options.reenableDelayMs : 2000;
			Promise.resolve(options.save()).finally(() => {
				setTimeout(() => {
					button.disabled = false;
				}, reenableDelayMs);
			});
		});
		return button;
	}
	function bindReExaminationSourceReset(checkboxOrId, options = {}) {
		const checkbox = resolveElement(checkboxOrId, 'reExaminationCheck');
		if (!checkbox) return null;
		checkbox.addEventListener('change', function () {
			if (this.checked) return;
			const originalAppointmentInput = resolveElement(options.originalAppointmentInput, 'originalAppointmentId');
			if (originalAppointmentInput) originalAppointmentInput.value = '';
		});
		return checkbox;
	}
	function openPersonalDetailSection(section, options = {}) {
		const openPersonalDetailModal = options.openPersonalDetailModal || window.openPersonalDetailModal;
		if (typeof openPersonalDetailModal === 'function') {
			openPersonalDetailModal(section);
			return { status: 'opened', section, method: 'openPersonalDetailModal' };
		}

		if (section !== 'address') {
			return { status: 'missingOpener', section };
		}

		const loadAddressDataIntoModal = options.loadAddressDataIntoModal || window.loadAddressDataIntoModal;
		if (typeof loadAddressDataIntoModal === 'function') {
			loadAddressDataIntoModal();
		}

		const modalEl = resolveElement(options.personalDetailModal, 'personalDetailModal');
		const bootstrapApi = options.bootstrapApi || getBootstrapApi();
		if (modalEl && bootstrapApi && bootstrapApi.Modal) {
			const modal = new bootstrapApi.Modal(modalEl);
			modal.show();
			return { status: 'opened', section, method: 'addressFallback' };
		}

		return { status: 'missingModal', section };
	}
	function bindPersonalDetailEditButtons(options = {}) {
		const bindings = options.bindings || {
			addressEditBtn: 'address',
			occupationEditBtn: 'occupation',
			genderEditBtn: 'gender',
			idCardEditBtn: 'identity'
		};
		return Object.keys(bindings).reduce((result, buttonId) => {
			const button = resolveElement(buttonId);
			if (!button || button._personalDetailEditBound) {
				result[buttonId] = button || null;
				return result;
			}
			const section = bindings[buttonId];
			button.addEventListener('click', () => openPersonalDetailSection(section, options));
			button._personalDetailEditBound = true;
			result[buttonId] = button;
			return result;
		}, {});
	}
	function initRelativeTable(options = {}) {
		const doc = getDocument(options);
		const container = resolveElement(options.container, null) || doc.querySelector(options.selector || '.relative-table-component');
		const manager = options.relativeTableManager || window.RelativeTableManager;
		if (!container || !manager || typeof manager.init !== 'function') return null;

		const instance = manager.init(container, {
			readOnly: false,
			...(options.tableOptions || {})
		});

		if (options.exposeGlobal !== false) {
			(options.window || window).relativeTableInstance = instance;
		}
		return instance;
	}
	function bindTabPrintButtons(options = {}) {
		const doc = getDocument(options);
		const printModalTab = options.printModalTabContent || window.printModalTabContent;
		if (typeof printModalTab !== 'function') return [];

		const buttons = Array.from(doc.querySelectorAll(options.selector || '.tab-print-btn'));
		buttons.forEach(button => {
			const boundFlag = options.boundFlag || '_tabPrintBound';
			if (button[boundFlag]) return;
			button.addEventListener('click', () => {
				const targetId = button.getAttribute(options.targetAttribute || 'data-print-target');
				if (targetId) printModalTab(targetId);
			});
			button[boundFlag] = true;
		});
		return buttons;
	}
	function getCurrentAppointmentId(options = {}) {
		if (typeof options.getCurrentAppointmentId === 'function') {
			return options.getCurrentAppointmentId();
		}
		return options.currentAppointmentId || null;
	}
	function isFormLocked(options = {}) {
		if (typeof options.isFormLocked === 'function') {
			return Boolean(options.isFormLocked());
		}
		return Boolean(options.isFormLocked);
	}
	function applyDetailModalLock(modalOrId, options = {}) {
		const delayMs = Number.isFinite(options.lockDelayMs) ? options.lockDelayMs : 100;
		setTimeout(() => {
			const modalEl = resolveElement(modalOrId, options.defaultModalId || 'examinationDetailModal');
			const formLockUtils = options.formLockUtils || window.ClinicalExaminationFormLockUtils;
			if (modalEl && formLockUtils && typeof formLockUtils.applyLockToModal === 'function') {
				formLockUtils.applyLockToModal(modalEl, true);
			}
		}, delayMs);
	}
	async function openDetailExaminationModalFlow(options = {}) {
		const modalEl = resolveElement(options.modal, 'examinationDetailModal');
		if (!modalEl) {
			notify(options, 'error', options.missingModalMessage || 'Không tìm thấy modal Khám chi tiết');
			return { status: 'missingModal' };
		}

		const bootstrapApi = options.bootstrapApi || getBootstrapApi();
		if (bootstrapApi && bootstrapApi.Modal) {
			const modal = new bootstrapApi.Modal(modalEl);
			modal.show();
		}

		if (isFormLocked(options)) {
			applyDetailModalLock(modalEl, options);
		}

		const body = options.body || document.body;
		const openClass = options.openBodyClass || 'examination-detail-modal-open';
		if (body && body.classList) body.classList.add(openClass);

		const appointmentId = getCurrentAppointmentId(options);
		await loadDetailModalData(appointmentId, options);

		if (typeof options.afterDataReady === 'function') {
			options.afterDataReady({ modal: modalEl, appointmentId });
		}

		modalEl.addEventListener('hidden.bs.modal', function () {
			if (body && body.classList) body.classList.remove(openClass);
			if (typeof options.autoSaveOnClose === 'function') options.autoSaveOnClose();
		});

		return { status: 'opened', appointmentId };
	}
	async function loadDetailModalData(appointmentId, options) {
		const prefill = () => { if (typeof options.prefillModal === 'function') options.prefillModal(); };
		if (!appointmentId || typeof options.loadModalData !== 'function') {
			prefill();
			return;
		}
		try {
			await options.loadModalData(appointmentId);
		} catch (error) {
			console.error(options.loadErrorMessage || 'Error loading examination modal data:', error);
			prefill();
		}
	}
	function bindDetailExaminationModalButton(buttonOrId, options = {}) {
		const button = resolveElement(buttonOrId, 'detailedExaminationBtn');
		if (!button) return null;
		button.addEventListener('click', () => openDetailExaminationModalFlow(options));
		return button;
	}
	function resolveFeedbackAdapter(options = {}) {
		if (typeof options.getFeedbackAdapter === 'function') {
			return options.getFeedbackAdapter();
		}
		return options.feedbackAdapter || null;
	}
	function bindFeedbackButtons(options = {}) {
		const summaryButton = resolveElement(options.summaryButton, 'summaryBtn');
		const guidanceButton = resolveElement(options.guidanceButton, 'guidanceBtn');
		if (summaryButton) {
			summaryButton.addEventListener('click', function () {
				const adapter = resolveFeedbackAdapter(options);
				if (adapter && typeof adapter.handleSummary === 'function') adapter.handleSummary();
			});
		}
		if (guidanceButton) {
			guidanceButton.addEventListener('click', function () {
				const adapter = resolveFeedbackAdapter(options);
				if (adapter && typeof adapter.handleGuidance === 'function') adapter.handleGuidance();
			});
		}
		return { summaryButton, guidanceButton };
	}
	function bindExaminationFormShell(options = {}) {
		const jquery = options.$ || window.$;
		const bindings = { fieldEvents: [] };
		const fieldEvents = Array.isArray(options.fieldEvents) ? options.fieldEvents : [];

		if (jquery) {
			fieldEvents.forEach((fieldEvent, index) => {
				if (!fieldEvent || !fieldEvent.selector || typeof fieldEvent.handler !== 'function') return;
				const collection = jquery(fieldEvent.selector);
				collection.on(fieldEvent.events || 'blur', function () {
					fieldEvent.handler.call(this, this);
				});
				bindings.fieldEvents.push({
					name: fieldEvent.name || fieldEvent.selector || `fieldEvent${index}`,
					selector: fieldEvent.selector,
					events: fieldEvent.events || 'blur',
					collection
				});
			});
		}

		const textareaAdapter = options.textareaAdapter;
		if (textareaAdapter && typeof textareaAdapter.bindAutoResizeTextareas === 'function') {
			bindings.autoResizeObserver = textareaAdapter.bindAutoResizeTextareas(options.autoResizeOptions || {});
		}

		bindings.detailExaminationButton = bindDetailExaminationModalButton(
			options.detailButton || 'detailedExaminationBtn',
			options.detailModalOptions || {}
		);
		bindings.feedbackButtons = bindFeedbackButtons({
			getFeedbackAdapter: options.getFeedbackAdapter,
			feedbackAdapter: options.feedbackAdapter,
			...(options.feedbackOptions || {})
		});

		return bindings;
	}
	function addFieldEvent(events, selector, eventName, handler) {
		if (typeof handler !== 'function') return;
		events.push({ selector, events: eventName, handler });
	}
	function buildDefaultExaminationFormFieldEvents(variant, handlers = {}) {
		const fieldEvents = [];
		const saveBasicInfo = handlers.saveBasicExaminationInfo || handlers.saveBasicInfo;
		const saveFormData = handlers.saveExaminationFormData || handlers.saveFormData;
		const saveDiagnosisAndTreatment = handlers.saveDiagnosisAndTreatment || handlers.saveDiagnosis;

		addFieldEvent(fieldEvents, '#examinationMainReason', 'blur', saveBasicInfo);
		if (variant === 'psychologist') {
			addFieldEvent(fieldEvents, '#diagnosis', 'blur change', saveFormData);
			addFieldEvent(fieldEvents, '#benhKemTheo', 'blur change', saveFormData);
			addFieldEvent(fieldEvents, '#treatmentPlan', 'blur', saveFormData);
			return fieldEvents;
		}

		addFieldEvent(fieldEvents, '#examinationAllergies', 'blur', saveFormData);
		addFieldEvent(fieldEvents, '#treatmentPlan', 'blur', saveFormData);
		addFieldEvent(fieldEvents, '#examinationNotes', 'blur', saveFormData);
		addFieldEvent(fieldEvents, '#diagnosis, #treatmentMethod', 'blur change', saveDiagnosisAndTreatment);
		return fieldEvents;
	}

	Object.assign(moduleParts, {
		resolveElement,
		getDocument,
		buildExaminationIdUrl,
		extractExaminationId,
		buildTransitionRequestOptions,
		showTransferMenuFlow,
		createTransferMenuHandler,
		notify,
		completeExaminationFlow,
		fetchCompletionExaminationId,
		transitionExaminationForCompletion,
		scheduleCompletionReload,
		bindEditHistoryButton,
		bindCompleteExaminationButton,
		getBootstrapApi,
		bindDocumentModalButton,
		bindSaveMedicalHistoryButton,
		bindSaveInfoButton,
		bindReExaminationSourceReset,
		openPersonalDetailSection,
		bindPersonalDetailEditButtons,
		initRelativeTable,
		bindTabPrintButtons,
		getCurrentAppointmentId,
		isFormLocked,
		applyDetailModalLock,
		openDetailExaminationModalFlow,
		loadDetailModalData,
		bindDetailExaminationModalButton,
		resolveFeedbackAdapter,
		bindFeedbackButtons,
		bindExaminationFormShell,
		addFieldEvent,
		buildDefaultExaminationFormFieldEvents
	});
})(window);
