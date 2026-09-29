// components/page-core-utils.js: phần 1/2 (nạp trước page-core-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/page-core-utils'] || (window.QLPKModuleParts['components/page-core-utils'] = { state: {} });

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}
	function getFetch(options) {
		return options && options.fetch ? options.fetch : window.fetch.bind(window);
	}
	function addButtonAnimationCSS(options = {}) {
		// CSS is owned by custom-animations.css; keep this function for legacy callers.
	}
	function ensureSession() {
		return window.QLPKApiTransport.ensureSession();
	}
	function getAuthHeader() {
		return window.QLPKApiTransport.getAuthHeader();
	}
	function apiCall(url, options = {}, coreOptions = {}) {
		const defaultOptions = {
			headers: {
				'Content-Type': 'application/json'
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

		return getFetch(coreOptions)(url, finalOptions);
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
	function shouldSkipAutoSave(options) {
		return typeof options.shouldSkip === 'function' && Boolean(options.shouldSkip());
	}
	function notifyAutoSaveIndicator(options, type) {
		if (typeof options.showAutoSaveIndicator === 'function') {
			options.showAutoSaveIndicator(type);
		}
	}
	async function resolveAutoSaveAppointmentId(options) {
		const hasAppointment = typeof options.ensureCurrentAppointmentIdForAutoSave === 'function'
			? await options.ensureCurrentAppointmentIdForAutoSave()
			: true;
		if (!hasAppointment) return null;
		return typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
	}
	async function autoSavePatientFormFieldShell(fieldName, value, options = {}) {
		if (shouldSkipAutoSave(options)) {
			return { status: 'skipped' };
		}

		const appointmentId = await resolveAutoSaveAppointmentId(options);
		if (!appointmentId) return { status: 'missingAppointment' };
		if (options.recheckSkipBeforeSave && shouldSkipAutoSave(options)) {
			return { status: 'skipped', appointmentId };
		}

		try {
			notifyAutoSaveIndicator(options, 'saving');

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
				notifyAutoSaveIndicator(options, 'success');
				return { status: 'saved', appointmentId, response, payload };
			}

			notifyAutoSaveIndicator(options, 'error');
			return { status: 'responseNotOk', appointmentId, response, payload };
		} catch (error) {
			if (typeof options.isCurrentAppointment === 'function' && !options.isCurrentAppointment(appointmentId)) {
				return { status: 'stale', appointmentId, error };
			}
			notifyAutoSaveIndicator(options, 'error');
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
	function isPatientSaveContextCurrent(options) {
		return typeof options.isCurrentContext !== 'function' || options.isCurrentContext();
	}
	function reportPatientSaveFailure(error, options) {
		if (!isPatientSaveContextCurrent(options)) return { status: 'stale', error };
		const logger = options.console || window.console;
		if (logger && typeof logger.error === 'function') {
			logger.error(options.errorLogMessage || 'savePatientDataInternal: Error saving patient data:', error);
		}
		if (typeof options.showToast === 'function') {
			options.showToast('error', options.errorToastMessage || 'Chưa lưu được đầy đủ thông tin và tài liệu. Vui lòng kiểm tra rồi lưu lại.');
		}
		return { status: 'error', error };
	}
	async function savePatientAppointmentStep(options, savedPatient) {
		const { formData, patientData, patient: patientResult } = savedPatient;
		const appointmentSaveResult = await saveAppointmentClinicalUpdate({
			apiCall: options.apiCall,
			console: options.console || window.console,
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			currentAppointmentId: options.currentAppointmentId,
			patientId: patientResult.id,
			buildPayload: () => typeof options.buildAppointmentPayload === 'function'
				? options.buildAppointmentPayload(formData, patientResult, patientData)
				: (options.appointmentPayload || {})
		});
		if (!isPatientSaveContextCurrent(options)) return { status: 'stale' };
		if (appointmentSaveResult.status !== 'saved') {
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Đã lưu thông tin bệnh nhân nhưng chưa lưu được lịch hẹn. Vui lòng thử lưu lại.');
			}
			return { status: 'appointmentError', ...savedPatient, appointmentSaveResult };
		}
		if (typeof options.setCurrentPatientId === 'function') options.setCurrentPatientId(patientResult.id);
		if (typeof options.afterPatientSaved === 'function') {
			await options.afterPatientSaved(patientResult, patientData, formData);
		}
		return { status: 'saved', ...savedPatient };
	}
	async function runPatientDataInternalSave(options = {}) {
		const logger = options.console || window.console;
		try {
			if (!isPatientSaveContextCurrent(options)) return { status: 'stale' };
			if (typeof options.syncModalDataIfNeeded === 'function') {
				await Promise.resolve(options.syncModalDataIfNeeded());
			}
			if (!isPatientSaveContextCurrent(options)) return { status: 'stale' };

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
			if (!isPatientSaveContextCurrent(options)) return { status: 'stale' };

			if (patientSaveResult.status !== 'saved') {
				return { status: 'patientError', formData, patientData, patientSaveResult };
			}

			const patientResult = patientSaveResult.patient;
			if (typeof options.uploadDraftDocumentsForPatient === 'function') {
				await options.uploadDraftDocumentsForPatient(patientResult.id, { isCurrentContext: options.isCurrentContext });
			}
			if (!isPatientSaveContextCurrent(options)) return { status: 'stale' };

			return await savePatientAppointmentStep(options, { formData, patientData, patient: patientResult });
		} catch (error) {
			return reportPatientSaveFailure(error, options);
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

	Object.assign(moduleParts, {
		getDocument,
		getFetch,
		addButtonAnimationCSS,
		ensureSession,
		getAuthHeader,
		apiCall,
		updatePagination,
		showAutoSaveIndicator,
		setCurrentPatientId,
		ensureCurrentAppointmentIdForAutoSave,
		resolveAppointmentIdForPatientSave,
		saveAppointmentClinicalUpdate,
		shouldSkipAutoSave,
		notifyAutoSaveIndicator,
		resolveAutoSaveAppointmentId,
		autoSavePatientFormFieldShell,
		savePatientRecord,
		isPatientSaveContextCurrent,
		reportPatientSaveFailure,
		savePatientAppointmentStep,
		runPatientDataInternalSave,
		reloadPage,
		isRefreshButtonInReloadHeader,
		bindRefreshButtons,
		bindPaginationControls,
		resolveOptionValue
	});
})(window);
