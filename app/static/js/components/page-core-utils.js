(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getLocalStorage(options) {
		return options && options.localStorage ? options.localStorage : window.localStorage;
	}

	function getSessionStorage(options) {
		return options && options.sessionStorage ? options.sessionStorage : window.sessionStorage;
	}

	function getFetch(options) {
		return options && options.fetch ? options.fetch : window.fetch.bind(window);
	}

	function addButtonAnimationCSS(options = {}) {
		// CSS is owned by custom-animations.css; keep this function for legacy callers.
	}

	function ensureToken(options = {}) {
		const token = getLocalStorage(options).getItem('qlpk_token');
		if (!token) {
			(options.window || window).location.href = '/login';
			return false;
		}
		return true;
	}

	function getAuthHeader(options = {}) {
		try {
			let raw = getLocalStorage(options).getItem('qlpk_token') || getLocalStorage(options).getItem('token') || getSessionStorage(options).getItem('qlpk_token');
			if (!raw) return null;
			if (raw.trim().startsWith('{')) {
				const obj = JSON.parse(raw);
				const token = obj.access_token || obj.token || obj.Authorization || obj.authorization;
				return token ? `Bearer ${token.replace(/^Bearer\s+/i, '')}` : null;
			}
			return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
		} catch (e) {
			return null;
		}
	}

	function apiCall(url, options = {}, coreOptions = {}) {
		const auth = getAuthHeader(coreOptions);
		const defaultOptions = {
			headers: {
				'Content-Type': 'application/json',
				...(auth ? { 'Authorization': auth } : {})
			}
		};

		const finalOptions = {
			...defaultOptions,
			...options,
			headers: {
				...(defaultOptions.headers || {}),
				...(options.headers || {})
			}
		};

		return getFetch(coreOptions)(url, finalOptions)
			.then(response => {
				if (response.status === 401) {
					// Preserve legacy no-op behavior.
				}
				return response;
			});
	}

	function updatePagination(options = {}) {
		const doc = getDocument(options);
		const currentPage = Number(options.currentPage || 1);
		const perPage = Number(options.perPage || 0);
		const totalPages = Number(options.totalPages || 1);
		const totalItems = Number(options.totalItems || 0);
		const start = (currentPage - 1) * perPage + 1;
		const end = Math.min(currentPage * perPage, totalItems);

		const paginationStart = doc.getElementById('paginationStart');
		const paginationEnd = doc.getElementById('paginationEnd');
		const paginationTotal = doc.getElementById('paginationTotal');

		if (paginationStart) paginationStart.textContent = start;
		if (paginationEnd) paginationEnd.textContent = end;
		if (paginationTotal) paginationTotal.textContent = totalItems;

		const firstPage = doc.getElementById('firstPage');
		const prevPage = doc.getElementById('prevPage');
		const nextPage = doc.getElementById('nextPage');
		const lastPage = doc.getElementById('lastPage');

		if (firstPage) firstPage.disabled = currentPage === 1;
		if (prevPage) prevPage.disabled = currentPage === 1;
		if (nextPage) nextPage.disabled = currentPage === totalPages;
		if (lastPage) lastPage.disabled = currentPage === totalPages;
	}

	function showAutoSaveIndicator(type = 'success', options = {}) {
		const doc = getDocument(options);
		const indicator = doc.getElementById(options.indicatorId || 'autoSaveIndicator');
		if (!indicator) return;

		indicator.classList.remove('show', 'saving', 'error');

		const savingIconClass = options.savingIconClass || 'bi-arrow-clockwise';
		if (type === 'saving') {
			indicator.innerHTML = `<i class="bi ${savingIconClass} me-1"></i>Đang lưu...`;
			indicator.classList.add('saving');
		} else if (type === 'error') {
			indicator.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i>Lỗi lưu';
			indicator.classList.add('error');
		} else {
			indicator.innerHTML = '<i class="bi bi-check-circle me-1"></i>Đã lưu';
		}

		indicator.classList.add('show');

		const delay = Number.isFinite(options.hideDelayMs) ? options.hideDelayMs : 2000;
		(options.setTimeout || window.setTimeout)(() => {
			indicator.classList.remove('show');
		}, delay);
	}

	function setCurrentPatientId(value, options = {}) {
		if (typeof options.setLocalPatientId === 'function') {
			options.setLocalPatientId(value);
		}
		const targetWindow = options.window || window;
		targetWindow.currentPatientId = value;
		if (typeof options.updateNotesAttachmentCount === 'function') {
			options.updateNotesAttachmentCount();
		}
		if (typeof options.loadAttachmentsForCurrentPatient === 'function') {
			Promise.resolve(options.loadAttachmentsForCurrentPatient()).catch(() => { });
		}
		return value;
	}

	async function ensureCurrentAppointmentIdForAutoSave(options = {}) {
		if (typeof options.getCurrentAppointmentId === 'function' && options.getCurrentAppointmentId()) {
			return true;
		}
		try {
			const currentPatientId = typeof options.getCurrentPatientId === 'function'
				? options.getCurrentPatientId()
				: null;
			if (!currentPatientId) return false;
			const response = await options.apiCall(`/api/appointments/?patient_id=${currentPatientId}&per_page=1`);
			if (response && response.ok) {
				const data = await response.json();
				if (data.appointments && data.appointments.length > 0) {
					if (typeof options.setCurrentAppointmentId === 'function') {
						options.setCurrentAppointmentId(data.appointments[0].id);
					}
					return true;
				}
			}
		} catch (e) { }
		return false;
	}

	async function resolveAppointmentIdForPatientSave(options = {}) {
		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		if (appointmentId) return appointmentId;

		const patientId = typeof options.getPatientId === 'function' ? options.getPatientId() : options.patientId;
		if (!patientId || typeof options.apiCall !== 'function') return null;

		try {
			const response = await options.apiCall(`/api/appointments?patient_id=${patientId}&per_page=1`);
			if (response && response.ok) {
				const data = await response.json();
				return data.appointments && data.appointments.length > 0 ? data.appointments[0].id : null;
			}
		} catch (error) {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error(options.findErrorMessage || 'Error finding appointment:', error);
			}
		}

		return null;
	}

	async function saveAppointmentClinicalUpdate(options = {}) {
		const targetAppointmentId = await resolveAppointmentIdForPatientSave(options);
		const logger = options.console || window.console;

		if (!targetAppointmentId) {
			if (logger && typeof logger.warn === 'function') {
				logger.warn(options.missingAppointmentMessage || 'No appointment found for patient, skipping vital signs update');
			}
			return { status: 'missingAppointment', appointmentId: null, response: null };
		}

		try {
			const payload = typeof options.buildPayload === 'function'
				? options.buildPayload(targetAppointmentId)
				: (options.payload || {});
			const response = await options.apiCall(`/api/appointments/${targetAppointmentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errorText = await response.text();
				if (logger && typeof logger.error === 'function') {
					logger.error(options.updateErrorMessage || 'Error updating appointment with vital signs:', response.status, errorText);
				}
				return { status: 'error', appointmentId: targetAppointmentId, response, errorText };
			}
			return { status: 'saved', appointmentId: targetAppointmentId, response };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error(options.updateErrorMessage || 'Error updating appointment with vital signs:', error);
			}
			return { status: 'exception', appointmentId: targetAppointmentId, error };
		}
	}

	async function saveExaminationFormDataShell(options = {}) {
		if (typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped' };
		}

		const resolvedAppointmentId = typeof options.resolveAppointmentId === 'function'
			? await options.resolveAppointmentId()
			: (typeof options.getCurrentAppointmentId === 'function' ? options.getCurrentAppointmentId() : options.currentAppointmentId);
		if (!resolvedAppointmentId) return { status: 'missingAppointment' };

		const appointmentId = (typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: null) || resolvedAppointmentId;
		const formData = typeof options.collectFormData === 'function' ? options.collectFormData() : (options.formData || {});
		const logger = options.console || window.console;

		try {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('saving');
			}

			const payload = typeof options.buildPayload === 'function'
				? options.buildPayload(formData, appointmentId)
				: (options.payload || {});
			const response = await options.apiCall(`/api/appointments/${appointmentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (typeof options.isCurrentAppointment === 'function' && !options.isCurrentAppointment(appointmentId)) {
				return { status: 'stale', appointmentId, response, formData, payload };
			}

			if (!response.ok) {
				const errorText = await response.text();
				if (logger && typeof logger.error === 'function') {
					logger.error(options.responseErrorLogMessage || 'Error saving examination form data:', response.status, errorText);
				}
				throw new Error(`Failed to save examination form data: ${errorText}`);
			}

			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('success');
			}
			return { status: 'saved', appointmentId, response, formData, payload };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'Error saving examination form data:', error);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', options.errorToastMessage || 'Không thể lưu thông tin khám bệnh. Vui lòng thử lại.');
			}
			return { status: 'error', appointmentId, error, formData };
		}
	}

	function createExaminationFormSaveAdapter(options = {}) {
		const detailUtils = options.detailModalUtils || window.ClinicalExaminationDetailModalUtils;
		const formDomUtils = options.formDomUtils || window.ClinicalFormDomUtils;
		const saveShell = typeof options.saveShell === 'function'
			? options.saveShell
			: saveOptions => saveExaminationFormDataShell({
				apiCall: options.apiCall,
				console: options.console || window.console,
				...(saveOptions || {})
			});

		function resolveAppointmentId() {
			if (typeof options.resolveAppointmentId === 'function') return options.resolveAppointmentId();
			if (!detailUtils || typeof detailUtils.resolveCurrentAppointmentId !== 'function') {
				return typeof options.getCurrentAppointmentId === 'function'
					? options.getCurrentAppointmentId()
					: options.currentAppointmentId;
			}
			return detailUtils.resolveCurrentAppointmentId({
				apiCall: options.apiCall,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				setCurrentAppointmentId: options.setCurrentAppointmentId,
				getCurrentPatientId: options.getCurrentPatientId
			});
		}

		function collectFormData() {
			if (typeof options.collectFormData === 'function') return options.collectFormData();
			if (formDomUtils && typeof formDomUtils.collectPsychologistExaminationFormData === 'function') {
				return formDomUtils.collectPsychologistExaminationFormData({
					$: options.$,
					...(options.collectOptions || {})
				});
			}
			return options.formData || {};
		}

		function buildPayload(formData, appointmentId) {
			if (typeof options.buildPayload === 'function') return options.buildPayload(formData, appointmentId);
			if (formDomUtils && typeof formDomUtils.buildPsychologistExaminationUpdatePayload === 'function') {
				return formDomUtils.buildPsychologistExaminationUpdatePayload(formData, options.payloadOptions || {});
			}
			return {};
		}

		return {
			resolveAppointmentId,
			collectFormData,
			buildPayload,
			save: () => saveShell({
				shouldSkip: options.shouldSkip,
				resolveAppointmentId,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				collectFormData,
				buildPayload,
				isCurrentAppointment: options.isCurrentAppointment,
				showAutoSaveIndicator: options.showAutoSaveIndicator,
				showToast: options.showToast
			})
		};
	}

	async function saveDiagnosisAndTreatmentShell(options = {}) {
		if (typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped' };
		}

		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		if (!appointmentId) return { status: 'missingAppointment' };

		const logger = options.console || window.console;
		const diagnosisValue = typeof options.getDiagnosisValue === 'function'
			? options.getDiagnosisValue()
			: '';
		const payload = typeof options.buildPayload === 'function'
			? options.buildPayload(diagnosisValue)
			: { diagnosis: diagnosisValue };

		try {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('saving');
			}

			const response = await options.apiCall(`/api/appointments/${appointmentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (response && response.ok === false) {
				const errorText = typeof response.text === 'function' ? await response.text() : '';
				throw new Error(errorText || `HTTP ${response.status || ''}`.trim());
			}

			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('success');
			}
			return { status: 'saved', appointmentId, response, payload };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'Error saving diagnosis and treatment:', error);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'error', appointmentId, error, payload };
		}
	}

	async function autoSavePatientFormFieldShell(fieldName, value, options = {}) {
		if (typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped' };
		}

		const hasAppointment = typeof options.ensureCurrentAppointmentIdForAutoSave === 'function'
			? await options.ensureCurrentAppointmentIdForAutoSave()
			: true;
		if (!hasAppointment) return { status: 'missingAppointment' };

		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		if (!appointmentId) return { status: 'missingAppointment' };
		if (options.recheckSkipBeforeSave && typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped', appointmentId };
		}

		try {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('saving');
			}

			const payload = {};
			payload[fieldName] = value || '';
			const response = await options.apiCall(`/api/appointments/${appointmentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (typeof options.isCurrentAppointment === 'function' && !options.isCurrentAppointment(appointmentId)) {
				return { status: 'stale', appointmentId, response, payload };
			}

			if (response && response.ok) {
				if (typeof options.showAutoSaveIndicator === 'function') {
					options.showAutoSaveIndicator('success');
				}
				return { status: 'saved', appointmentId, response, payload };
			}

			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'responseNotOk', appointmentId, response, payload };
		} catch (error) {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'error', appointmentId, error };
		}
	}

	async function savePatientRecord(options = {}) {
		const patientId = typeof options.getCurrentPatientId === 'function'
			? options.getCurrentPatientId()
			: options.currentPatientId;
		const method = patientId ? 'PUT' : 'POST';
		const url = patientId ? `/api/patients/${patientId}` : '/api/patients/';
		const response = await options.apiCall(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options.patientData || {})
		});

		if (!response.ok) {
			const errorText = await response.text();
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'savePatientDataInternal: Patient API Error:', response.status, errorText);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', options.errorToastMessage || 'Không thể lưu thông tin bệnh nhân. Vui lòng kiểm tra lại.');
			}
			return { status: 'error', patient: null, response, errorText, method, url };
		}

		return { status: 'saved', patient: await response.json(), response, method, url };
	}

	function validatePatientFormData(formData, options = {}) {
		if (formData && formData.full_name && formData.gender) {
			return true;
		}
		if (typeof options.showToast === 'function') {
			options.showToast('error', options.requiredMessage || 'Vui lòng nhập đầy đủ thông tin bắt buộc');
		}
		return false;
	}

	function reenableSaveButtonLater(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function') return false;
		const delay = Number.isFinite(options.delayMs) ? options.delayMs : 2000;
		const setTimeoutFn = options.setTimeout || window.setTimeout;
		setTimeoutFn(() => {
			$(options.saveButtonSelector || '#saveInfoBtn').prop('disabled', false);
		}, delay);
		return true;
	}

	async function runPatientSaveWithoutDuplicateCheck(options = {}) {
		const logger = options.console || window.console;
		try {
			if (typeof options.syncModalDataIfNeeded === 'function') {
				await Promise.resolve(options.syncModalDataIfNeeded());
			}
			const formData = typeof options.collectFormData === 'function' ? options.collectFormData() : null;
			if (!validatePatientFormData(formData, options)) return { status: 'invalid', formData };

			if (typeof options.savePatientDataInternal === 'function') {
				await options.savePatientDataInternal(formData);
			}
			if (typeof options.saveExaminationFormData === 'function') {
				await options.saveExaminationFormData();
			}
			return { status: 'saved', formData };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'savePatientDataWithoutDuplicateCheck: Error saving patient data:', error);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', options.errorToastMessage || 'Không thể lưu bệnh nhân và lịch hẹn. Vui lòng kiểm tra lại.');
			}
			return { status: 'error', error };
		} finally {
			reenableSaveButtonLater(options);
		}
	}

	async function runPatientSaveWithDuplicateCheck(options = {}) {
		const logger = options.console || window.console;
		try {
			if (typeof options.syncModalDataIfNeeded === 'function') {
				await Promise.resolve(options.syncModalDataIfNeeded());
			}
			const formData = typeof options.collectFormData === 'function' ? options.collectFormData() : null;
			if (!validatePatientFormData(formData, options)) return { status: 'invalid', formData };

			const duplicateAdapter = options.duplicatePatientModalAdapter;
			if (duplicateAdapter && typeof duplicateAdapter.showDuplicateIfNeeded === 'function') {
				const duplicateShown = await duplicateAdapter.showDuplicateIfNeeded(formData, {
					getCurrentPatientId: options.getCurrentPatientId
				});
				if (duplicateShown) return { status: 'duplicate', formData };
			}

			if (typeof options.savePatientDataInternal === 'function') {
				await options.savePatientDataInternal(formData);
			}
			const currentAppointmentId = typeof options.getCurrentAppointmentId === 'function'
				? options.getCurrentAppointmentId()
				: options.currentAppointmentId;
			if (currentAppointmentId && typeof options.saveExaminationFormData === 'function') {
				await options.saveExaminationFormData();
			}

			if (typeof options.showToast === 'function') {
				options.showToast('success', options.successMessage || 'Lưu thông tin bệnh nhân thành công');
			}
			const targetWindow = options.window || window;
			const setTimeoutFn = options.setTimeout || targetWindow.setTimeout || window.setTimeout;
			const reloadDelay = Number.isFinite(options.reloadDelayMs) ? options.reloadDelayMs : 1500;
			setTimeoutFn(() => {
				targetWindow.location.reload();
			}, reloadDelay);
			return { status: 'saved', formData };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'Error in savePatientData:', error);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', options.errorToastMessage || 'Không thể lưu thông tin bệnh nhân. Vui lòng kiểm tra lại.');
			}
			return { status: 'error', error };
		}
	}

	async function runPatientDataInternalSave(options = {}) {
		const logger = options.console || window.console;
		try {
			if (typeof options.syncModalDataIfNeeded === 'function') {
				await Promise.resolve(options.syncModalDataIfNeeded());
			}

			const formData = options.formData || {};
			const patientData = typeof options.buildPatientPayload === 'function'
				? options.buildPatientPayload(formData)
				: (options.patientData || {});
			const patientSaveResult = await savePatientRecord({
				apiCall: options.apiCall,
				console: logger,
				getCurrentPatientId: options.getCurrentPatientId,
				currentPatientId: options.currentPatientId,
				patientData,
				showToast: options.showToast
			});

			if (patientSaveResult.status !== 'saved') {
				return { status: 'patientError', formData, patientData, patientSaveResult };
			}

			const patientResult = patientSaveResult.patient;
			try {
				if (typeof options.uploadDraftDocumentsForPatient === 'function') {
					await options.uploadDraftDocumentsForPatient(patientResult.id);
				}
			} catch (e) { }

			await saveAppointmentClinicalUpdate({
				apiCall: options.apiCall,
				console: logger,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				currentAppointmentId: options.currentAppointmentId,
				patientId: patientResult.id,
				buildPayload: () => typeof options.buildAppointmentPayload === 'function'
					? options.buildAppointmentPayload(formData, patientResult, patientData)
					: (options.appointmentPayload || {})
			});

			if (typeof options.setCurrentPatientId === 'function') {
				options.setCurrentPatientId(patientResult.id);
			}
			if (typeof options.afterPatientSaved === 'function') {
				await options.afterPatientSaved(patientResult, patientData, formData);
			}

			return { status: 'saved', formData, patientData, patient: patientResult };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'savePatientDataInternal: Error saving patient data:', error);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', options.errorToastMessage || 'Không thể lưu bệnh nhân và lịch hẹn. Vui lòng kiểm tra lại.');
			}
			return { status: 'error', error };
		}
	}

	function reloadPage(options = {}) {
		const targetWindow = options.window || window;
		targetWindow.location.reload();
	}

	function isRefreshButtonInReloadHeader(button, options = {}) {
		if (!button || typeof button.closest !== 'function') return false;
		const header = button.closest(options.headerSelector || '.card-header');
		const title = header ? header.querySelector(options.titleSelector || 'h5') : null;
		const titleText = options.reloadTitleText || 'Khám bệnh';
		return Boolean(title && title.textContent.includes(titleText));
	}

	function bindRefreshButtons(options = {}) {
		const doc = getDocument(options);
		doc.querySelectorAll(options.selector || '.bi-arrow-clockwise').forEach(button => {
			const boundFlag = options.boundFlag || '_clinicalRefreshBound';
			if (button[boundFlag]) return;
			button.addEventListener('click', function () {
				if (isRefreshButtonInReloadHeader(this, options)) {
					reloadPage(options);
					return;
				}
				if (typeof options.loadAppointments === 'function') {
					const status = typeof options.getCurrentStatus === 'function' ? options.getCurrentStatus() : options.currentStatus;
					const page = typeof options.getCurrentPage === 'function' ? options.getCurrentPage() : options.currentPage;
					options.loadAppointments(status, page);
				}
			});
			button[boundFlag] = true;
		});
	}

	function bindPaginationControls(options = {}) {
		const doc = getDocument(options);
		const loadAppointments = options.loadAppointments;
		const getCurrentStatus = () => typeof options.getCurrentStatus === 'function'
			? options.getCurrentStatus()
			: options.currentStatus;
		const getCurrentPage = () => typeof options.getCurrentPage === 'function'
			? options.getCurrentPage()
			: options.currentPage;
		const getTotalPages = () => typeof options.getTotalPages === 'function'
			? options.getTotalPages()
			: options.totalPages;

		const bindings = {
			firstPage: () => [getCurrentStatus(), 1],
			prevPage: () => [getCurrentStatus(), getCurrentPage() - 1],
			nextPage: () => [getCurrentStatus(), getCurrentPage() + 1],
			lastPage: () => [getCurrentStatus(), getTotalPages()]
		};

		Object.keys(bindings).forEach(elementId => {
			const element = doc.getElementById(elementId);
			const boundFlag = options.paginationBoundFlag || '_clinicalPaginationBound';
			if (!element || element[boundFlag]) return;
			element.addEventListener('click', () => {
				if (typeof loadAppointments === 'function') {
					loadAppointments.apply(null, bindings[elementId]());
				}
			});
			element[boundFlag] = true;
		});

		const perPageSelect = doc.getElementById(options.perPageSelectId || 'perPageSelect');
		const perPageBoundFlag = options.perPageBoundFlag || '_clinicalPerPageBound';
		if (perPageSelect && !perPageSelect[perPageBoundFlag]) {
			perPageSelect.addEventListener('change', function () {
				if (typeof options.setPerPage === 'function') {
					options.setPerPage(parseInt(this.value));
				}
				if (typeof loadAppointments === 'function') {
					loadAppointments(getCurrentStatus(), 1);
				}
			});
			perPageSelect[perPageBoundFlag] = true;
		}
	}

	function resolveOptionValue(value, fallback) {
		if (typeof value === 'function') return value();
		return value === undefined ? fallback : value;
	}

	function createPageCoreAdapter(options = {}) {
		const coreOptions = () => ({
			document: options.document,
			window: options.window || window,
			localStorage: options.localStorage,
			sessionStorage: options.sessionStorage,
			fetch: options.fetch
		});
		const adapter = {};

		adapter.addButtonAnimationCSS = () => addButtonAnimationCSS(coreOptions());
		adapter.ensureToken = () => ensureToken(coreOptions());
		adapter.getAuthHeader = () => getAuthHeader(coreOptions());
		adapter.apiCall = (url, requestOptions = {}) => apiCall(url, requestOptions, coreOptions());
		adapter.updatePagination = () => updatePagination({
			...coreOptions(),
			currentPage: resolveOptionValue(options.currentPage, 1),
			perPage: resolveOptionValue(options.perPage, 0),
			totalPages: resolveOptionValue(options.totalPages, 1),
			totalItems: resolveOptionValue(options.totalItems, 0)
		});
		adapter.showAutoSaveIndicator = (type = 'success', indicatorOptions = {}) => showAutoSaveIndicator(type, {
			...coreOptions(),
			...(options.autoSaveIndicatorOptions || {}),
			...indicatorOptions
		});
		adapter.setCurrentPatientId = value => setCurrentPatientId(value, {
			...coreOptions(),
			setLocalPatientId: options.setLocalPatientId,
			updateNotesAttachmentCount: options.updateNotesAttachmentCount,
			loadAttachmentsForCurrentPatient: options.loadAttachmentsForCurrentPatient
		});
		adapter.ensureCurrentAppointmentIdForAutoSave = () => ensureCurrentAppointmentIdForAutoSave({
			apiCall: adapter.apiCall,
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			getCurrentPatientId: options.getCurrentPatientId,
			setCurrentAppointmentId: options.setCurrentAppointmentId
		});
		adapter.saveAppointmentClinicalUpdate = updateOptions => saveAppointmentClinicalUpdate({
			apiCall: adapter.apiCall,
			console: options.console || window.console,
			...(updateOptions || {})
		});
		adapter.saveExaminationFormDataShell = saveOptions => saveExaminationFormDataShell({
			apiCall: adapter.apiCall,
			console: options.console || window.console,
			...(saveOptions || {})
		});
		adapter.createExaminationFormSaveAdapter = saveOptions => createExaminationFormSaveAdapter({
			apiCall: adapter.apiCall,
			console: options.console || window.console,
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			setCurrentAppointmentId: options.setCurrentAppointmentId,
			getCurrentPatientId: options.getCurrentPatientId,
			saveShell: adapter.saveExaminationFormDataShell,
			...(saveOptions || {})
		});
		adapter.saveDiagnosisAndTreatmentShell = saveOptions => saveDiagnosisAndTreatmentShell({
			apiCall: adapter.apiCall,
			console: options.console || window.console,
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			showAutoSaveIndicator: adapter.showAutoSaveIndicator,
			...(saveOptions || {})
		});
		adapter.autoSavePatientFormField = (fieldName, value, saveOptions = {}) => autoSavePatientFormFieldShell(fieldName, value, {
			apiCall: adapter.apiCall,
			ensureCurrentAppointmentIdForAutoSave: adapter.ensureCurrentAppointmentIdForAutoSave,
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			showAutoSaveIndicator: adapter.showAutoSaveIndicator,
			...(saveOptions || {})
		});
		adapter.savePatientRecord = saveOptions => savePatientRecord({
			apiCall: adapter.apiCall,
			console: options.console || window.console,
			...(saveOptions || {})
		});
		adapter.runPatientSaveWithoutDuplicateCheck = saveOptions => runPatientSaveWithoutDuplicateCheck({
			...coreOptions(),
			console: options.console || window.console,
			...(saveOptions || {})
		});
		adapter.runPatientSaveWithDuplicateCheck = saveOptions => runPatientSaveWithDuplicateCheck({
			...coreOptions(),
			console: options.console || window.console,
			...(saveOptions || {})
		});
		adapter.runPatientDataInternalSave = saveOptions => runPatientDataInternalSave({
			apiCall: adapter.apiCall,
			console: options.console || window.console,
			...(saveOptions || {})
		});
		adapter.bindRefreshButtons = refreshOptions => bindRefreshButtons({
			...coreOptions(),
			...(options.refreshOptions || {}),
			...(refreshOptions || {})
		});
		adapter.bindPaginationControls = paginationOptions => bindPaginationControls({
			...coreOptions(),
			getCurrentPage: () => resolveOptionValue(options.currentPage, 1),
			getTotalPages: () => resolveOptionValue(options.totalPages, 1),
			...(options.paginationOptions || {}),
			...(paginationOptions || {})
		});

		return adapter;
	}

	function initializeExaminationPageBootstrap(options = {}) {
		const doc = getDocument(options);
		const targetWindow = options.window || window;
		const pageCoreAdapter = options.pageCoreAdapter || createPageCoreAdapter(options);

		if (options.ensureToken !== false && pageCoreAdapter && typeof pageCoreAdapter.ensureToken === 'function') {
			if (!pageCoreAdapter.ensureToken()) return { status: 'missingToken', relativeTableInstance: null };
		}

		if (pageCoreAdapter && typeof pageCoreAdapter.addButtonAnimationCSS === 'function') {
			pageCoreAdapter.addButtonAnimationCSS();
		}
		if (typeof options.initializePage === 'function') options.initializePage();

		const actionButtonsUi = options.actionButtonsUi || targetWindow.ExaminationActionButtonsUi;
		let relativeTableInstance = null;
		if (actionButtonsUi && typeof actionButtonsUi.initRelativeTable === 'function') {
			relativeTableInstance = actionButtonsUi.initRelativeTable({
				document: doc,
				window: targetWindow,
				...(options.relativeTableOptions || {})
			});
		}
		if (typeof options.setRelativeTableInstance === 'function') {
			options.setRelativeTableInstance(relativeTableInstance);
		}
		if (actionButtonsUi && typeof actionButtonsUi.bindTabPrintButtons === 'function') {
			actionButtonsUi.bindTabPrintButtons({
				document: doc,
				printModalTabContent: options.printModalTabContent
			});
		}

		const waitingListUi = options.waitingListUi || targetWindow.ClinicalExaminationWaitingListUi;
		if (waitingListUi && typeof waitingListUi.bindStatusTabs === 'function') {
			waitingListUi.bindStatusTabs({
				document: doc,
				setCurrentStatus: options.setCurrentStatus,
				loadAppointments: options.loadAppointments
			});
		}
		if (waitingListUi && typeof waitingListUi.bindPatientSearchInput === 'function') {
			waitingListUi.bindPatientSearchInput({
				document: doc,
				setPatientSearchQuery: options.setPatientSearchQuery,
				renderAppointmentsTable: options.renderAppointmentsTable
			});
		}

		if (pageCoreAdapter && typeof pageCoreAdapter.bindPaginationControls === 'function') {
			pageCoreAdapter.bindPaginationControls({
				getCurrentStatus: options.getCurrentStatus,
				setPerPage: options.setPerPage,
				loadAppointments: options.loadAppointments
			});
		}
		if (pageCoreAdapter && typeof pageCoreAdapter.bindRefreshButtons === 'function') {
			pageCoreAdapter.bindRefreshButtons({
				getCurrentStatus: options.getCurrentStatus,
				getCurrentPage: options.getCurrentPage,
				loadAppointments: options.loadAppointments
			});
		}

		if (typeof options.initializeForm === 'function') options.initializeForm();

		const formDomUtils = options.formDomUtils || targetWindow.ClinicalFormDomUtils;
		if (formDomUtils && typeof formDomUtils.bindAgeInputGuard === 'function') {
			formDomUtils.bindAgeInputGuard(options.ageField || 'age');
		}
		if (actionButtonsUi && typeof actionButtonsUi.bindPersonalDetailEditButtons === 'function') {
			actionButtonsUi.bindPersonalDetailEditButtons(options.personalDetailOptions || {});
		}

		const medicalHistoryModalAdapter = options.medicalHistoryModalAdapter;
		if (medicalHistoryModalAdapter && typeof medicalHistoryModalAdapter.bindOpenButton === 'function') {
			medicalHistoryModalAdapter.bindOpenButton({
				isFormLocked: options.isFormLocked,
				loadIntoModal: options.loadMedicalHistoryIntoModal
			});
		}
		if (actionButtonsUi && typeof actionButtonsUi.bindSaveInfoButton === 'function') {
			actionButtonsUi.bindSaveInfoButton(options.saveInfoButton || 'saveInfoBtn', {
				save: options.savePatientData
			});
		}
		if (actionButtonsUi && typeof actionButtonsUi.bindReExaminationSourceReset === 'function') {
			actionButtonsUi.bindReExaminationSourceReset(options.reExaminationCheckbox || 'reExaminationCheck', {
				originalAppointmentInput: options.originalAppointmentInput || 'originalAppointmentId'
			});
		}

		return { status: 'initialized', relativeTableInstance };
	}

	function bindWorkflowInteractionShell(options = {}) {
		const targetWindow = options.window || window;
		const modalSearchContext = options.modalSearchContext || {};
		const elements = options.elements || modalSearchContext.elements || {};
		const modalPatientSearchFlow = options.modalPatientSearchFlow || modalSearchContext.flow;
		const modalHistoryDeleteFlow = options.modalHistoryDeleteFlow || modalSearchContext.deleteFlow;
		const patientHistoryModal = options.patientHistoryModal;
		const bindings = {};

		if (options.bindDeleteQuickSearch !== false
			&& modalHistoryDeleteFlow
			&& typeof modalHistoryDeleteFlow.deleteQuickSearch === 'function') {
			targetWindow.deleteExaminationFromQuickSearch = appointmentId => modalHistoryDeleteFlow.deleteQuickSearch(appointmentId);
		}

		const modalControlOptions = {
				copyPatient: options.copyPatient || modalPatientSearchFlow?.copyPatientToForm,
				copyHistory: options.copyHistory || modalPatientSearchFlow?.copyHistoryToForm,
				deleteHistory: options.deleteHistory || (modalHistoryDeleteFlow && modalHistoryDeleteFlow.deleteHistory),
				loadPatient: options.loadPatient,
				isFormLocked: options.isFormLocked,
				unlockForm: options.unlockForm,
				...(options.modalControlOptions || {})
		};
		if (patientHistoryModal && typeof patientHistoryModal.bindControls === 'function') {
			bindings.modalSearchControls = patientHistoryModal.bindControls(modalControlOptions);
		} else if (modalPatientSearchFlow && typeof modalPatientSearchFlow.bindControls === 'function') {
			bindings.modalSearchControls = modalPatientSearchFlow.bindControls(modalControlOptions);
		}

		const orderPageBridge = options.orderPageBridge;
		if (orderPageBridge && typeof orderPageBridge.bindOrderPageInteractions === 'function') {
			bindings.orderPage = orderPageBridge.bindOrderPageInteractions({
				orderCategoryTreeEl: elements.orderCategoryTree,
				orderSelectionsTableBody: elements.orderSelectionsTableBody,
				orderClearBtn: elements.orderClearButton,
				orderAddNewBtn: elements.orderAddNewButton,
				orderPrintInternalBtn: elements.orderPrintInternalButton,
				orderPrintExternalBtn: elements.orderPrintExternalButton,
				orderBtn: elements.orderButton,
				catalogStateAdapter: options.catalogStateAdapter,
				catalogLoaderAdapter: options.catalogLoaderAdapter,
				formAdapter: options.formAdapter,
				selectionActionsAdapter: options.selectionActionsAdapter,
				performerLoaderAdapter: options.performerLoaderAdapter,
				printAdapter: options.printAdapter,
				formatDateInput: options.formatDateInput,
				hasSelectedOrders: options.hasSelectedOrders || (() => Boolean(options.orderCatalogState && options.orderCatalogState.selectedOrders && options.orderCatalogState.selectedOrders.length)),
				showToast: options.showToast,
				loadChiDinhFromServer: options.loadChiDinhFromServer,
				...(options.orderInteractionOptions || {})
			});
		}

		const actionButtonsUi = options.actionButtonsUi || targetWindow.ExaminationActionButtonsUi;
		if (actionButtonsUi && typeof actionButtonsUi.bindExaminationActionButtons === 'function') {
			bindings.examinationActionButtons = actionButtonsUi.bindExaminationActionButtons({
				editHistoryButton: options.editHistoryButton || 'editHistoryBtn',
				completeExaminationButton: options.completeExaminationButton || 'completeExaminationBtn',
				unlockForm: options.unlockForm,
				showToast: options.showToast,
				apiCall: options.apiCall,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				transitionPath: options.transitionPath,
				documentButton: options.documentButton || elements.documentButton,
				loadDocumentModalData: options.loadDocumentModalData,
				setupDocumentAutoSave: options.setupDocumentAutoSave,
				saveMedicalHistoryButton: options.saveMedicalHistoryButton || 'saveMedicalHistoryBtn',
				saveMedicalHistory: options.saveMedicalHistory,
				...(options.actionButtonOptions || {})
			});
		}

		return bindings;
	}

	const api = {
		addButtonAnimationCSS,
		ensureToken,
		getAuthHeader,
		apiCall,
		updatePagination,
		showAutoSaveIndicator,
		setCurrentPatientId,
		ensureCurrentAppointmentIdForAutoSave,
		resolveAppointmentIdForPatientSave,
		saveAppointmentClinicalUpdate,
		saveExaminationFormDataShell,
		createExaminationFormSaveAdapter,
		saveDiagnosisAndTreatmentShell,
		autoSavePatientFormFieldShell,
		savePatientRecord,
		validatePatientFormData,
		reenableSaveButtonLater,
		runPatientSaveWithoutDuplicateCheck,
		runPatientSaveWithDuplicateCheck,
		runPatientDataInternalSave,
		reloadPage,
		isRefreshButtonInReloadHeader,
		bindRefreshButtons,
		bindPaginationControls,
		initializeExaminationPageBootstrap,
		bindWorkflowInteractionShell,
		createPageCoreAdapter
	};

	window.ClinicalPageCoreUtils = api;
	window.DoctorExaminationPageCoreUtils = api;
})(window);
