(function (window) {
	'use strict';

	function getRecordLabel(options = {}) {
		return options.recordLabel || 'bệnh án';
	}

	function buildStateHtml(state, options = {}) {
		const recordLabel = getRecordLabel(options);

		const states = {
			noPatient: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-file-medical patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Chọn bệnh nhân để xem ${recordLabel}</p>
            </div>
        `,
			historyLoading: `
            <div class="text-center text-muted py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2 mb-0">Đang tải dữ liệu ${recordLabel}...</p>
            </div>
        `,
			emptyHistory: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-clipboard-data patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-1">Chưa có lượt khám nào để hiển thị ${recordLabel}</p>
                <small class="text-muted">Vui lòng chọn hoặc tạo lịch sử khám trước</small>
            </div>
        `,
			missingHistory: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-clipboard-x patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Không tìm thấy dữ liệu lịch sử tương ứng</p>
            </div>
        `,
			recordLoading: `
        <div class="text-center text-muted py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 mb-0">Đang tải ${recordLabel}...</p>
        </div>
    `,
			loadError: `
            <div class="text-center text-danger py-4">
                <i class="bi bi-exclamation-triangle patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Không tải được ${recordLabel}. Vui lòng thử lại.</p>
            </div>
        `
		};

		return states[state] || '';
	}

	function renderState(container, state, options = {}) {
		if (!container) return '';
		const html = buildStateHtml(state, options);
		container.innerHTML = html;
		return html;
	}

	function isCurrent(options) {
		return typeof options.isContextCurrent !== 'function' || options.isContextCurrent();
	}

	function resolveHistoryState(options = {}) {
		if (!options.patient) {
			return { state: 'noPatient', history: null, index: null };
		}

		if (options.isHistoryLoading) {
			return { state: 'historyLoading', history: null, index: null };
		}

		const histories = Array.isArray(options.histories) ? options.histories : [];
		if (!histories.length) {
			return { state: 'emptyHistory', history: null, index: null };
		}

		let index = Number.isInteger(options.selectedIndex) ? options.selectedIndex : 0;
		if (index < 0 || index >= histories.length) {
			index = 0;
		}

		const history = histories[index];
		if (!history) {
			return { state: 'missingHistory', history: null, index };
		}

		return { state: 'ready', history, index };
	}

	function buildRecordHtml(options = {}) {
		if (typeof options.buildMedicalRecordHTML !== 'function') {
			throw new Error('buildMedicalRecordHTML is required');
		}

		const historyWithDetail = options.examinationDetail
			? { ...options.history, ...options.examinationDetail }
			: options.history;
		const appointment = options.appointmentResponse?.data || options.appointmentResponse || options.appointment || null;
		const relatives = options.relativesResponse?.data || options.relatives || [];

		return options.buildMedicalRecordHTML({
			clinicInfo: options.clinicInfo,
			patient: options.patient,
			history: historyWithDetail,
			examinationDetailsBySection: options.examinationDetailsBySection || {},
			prescriptionData: options.prescriptionData || null,
			relatives,
			appointment,
			role: options.role
		});
	}

	function renderRecord(options = {}) {
		const html = buildRecordHtml(options);
		if (options.container) {
			options.container.innerHTML = html;
			if (typeof options.createBarcodesInElement === 'function') {
				options.createBarcodesInElement(options.container);
			}
		}
		return html;
	}

	async function renderTab(options = {}) {
		const contentArea = options.container;
		if (!contentArea) return { state: 'missingContainer' };
		if (!isCurrent(options)) return { state: 'stale' };

		const historyState = resolveHistoryState({
			patient: options.patient,
			isHistoryLoading: options.isHistoryLoading,
			histories: options.histories,
			selectedIndex: options.selectedIndex
		});
		if (historyState.state !== 'ready') {
			renderState(contentArea, historyState.state, options);
			return historyState;
		}

		const history = historyState.history;
		renderState(contentArea, 'recordLoading', options);

		try {
			const requiredFetchers = ['fetchPatientDetail', 'fetchExaminationDetail', 'fetchSectionDetails', 'fetchPrescription', 'fetchAppointment', 'fetchRelatives'];
			const missingFetcher = requiredFetchers.find(name => typeof options[name] !== 'function');
			if (missingFetcher) throw new Error(`Thiếu dependency ${missingFetcher} cho tab bệnh án`);
			const examinationId = history.id;
			const appointmentId = history.appointment_id;
			const [patientDetail, examinationDetail, examinationDetailsBySection, prescriptionData, appointmentResponse, relativesResponse] = await Promise.all([
				options.fetchPatientDetail(options.patient.id).catch(() => null),
				examinationId
					? options.fetchExaminationDetail(examinationId).catch(() => null)
					: Promise.resolve(null),
				examinationId
					? options.fetchSectionDetails(examinationId, true).catch(() => ({}))
					: Promise.resolve({}),
				appointmentId
					? options.fetchPrescription(appointmentId, true).catch(() => null)
					: Promise.resolve(null),
				appointmentId
					? options.fetchAppointment(appointmentId).catch(() => null)
					: Promise.resolve(null),
				appointmentId
					? options.fetchRelatives(appointmentId).catch(() => ({ data: [] }))
					: Promise.resolve({ data: [] })
			]);
			if (!isCurrent(options)) return { state: 'stale' };

			const html = renderRecord({
				container: contentArea,
				buildMedicalRecordHTML: options.buildMedicalRecordHTML,
				clinicInfo: typeof options.getClinicInfoConfig === 'function'
					? options.getClinicInfoConfig()
					: options.clinicInfo,
				patient: patientDetail || options.patient,
				history,
				examinationDetail,
				examinationDetailsBySection,
				prescriptionData,
				appointmentResponse,
				relativesResponse,
				role: options.role,
				createBarcodesInElement: options.createBarcodesInElement
			});

			return { state: 'ready', history, index: historyState.index, html };
		} catch (error) {
			if (typeof options.onError === 'function') {
				options.onError(error);
			}
			renderState(contentArea, 'loadError', options);
			return { state: 'loadError', history, index: historyState.index, error };
		}
	}

	window.MedicalRecordHistoryTabUi = {
		buildStateHtml,
		renderState,
		resolveHistoryState,
		buildRecordHtml,
		renderRecord,
		renderTab
	};
})(window);
