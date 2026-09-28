(function (window) {
	'use strict';

	const STATE_HTML = {
		noPatient: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-person patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Chọn bệnh nhân để xem toa thuốc</p>
            </div>
        `,
		historyLoading: `
            <div class="text-center text-muted py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2 mb-0">Đang tải lịch sử khám...</p>
            </div>
        `,
		emptyHistory: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-clipboard patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Chưa có lịch sử khám cho bệnh nhân này</p>
            </div>
        `,
		missingHistory: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-clipboard-x patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Không tìm thấy dữ liệu lịch sử tương ứng</p>
            </div>
        `,
		prescriptionLoading: `
        <div class="text-center text-muted py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 mb-0">Đang tải toa thuốc...</p>
        </div>
    `,
		loadError: `
            <div class="text-center text-danger py-4">
                <i class="bi bi-exclamation-triangle patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Không tải được toa thuốc. Vui lòng thử lại.</p>
            </div>
        `
	};

	function buildStateHtml(state) {
		return STATE_HTML[state] || '';
	}

	function renderState(container, state) {
		return window.QLPKHistoryTabCore.renderHtml(container, buildStateHtml(state));
	}

	const historyTabCore = window.QLPKHistoryTabCore;
	const isCurrent = historyTabCore.isContextCurrent;
	const resolveHistoryState = historyTabCore.resolveHistoryState;

	function buildPaginationOptions(options = {}) {
		return {
			prescriptionData: options.prescriptionData,
			clinicInfo: options.clinicInfo,
			patient: options.patient,
			history: options.history,
			examinationDetail: options.examinationDetail,
			examinationDetailsBySection: options.examinationDetailsBySection || {},
			relatives: options.relatives || []
		};
	}

	function setupPreview(options = {}) {
		const setupPrescriptionTabPagination = options.setupPrescriptionTabPagination || window.setupPrescriptionTabPagination;
		if (typeof setupPrescriptionTabPagination !== 'function') {
			throw new Error('setupPrescriptionTabPagination is required');
		}

		const paginationOptions = buildPaginationOptions(options);
		setupPrescriptionTabPagination(paginationOptions);
		return paginationOptions;
	}

	async function renderTab(options = {}) {
		const tab = historyTabCore.resolveTabContext(options, renderState);
		if (tab.done) return tab.done;
		const { contentArea, historyState } = tab;

		const history = historyState.history;
		renderState(contentArea, 'prescriptionLoading');

		try {
			const requiredFetchers = ['fetchPatientDetail', 'fetchExaminationDetail', 'fetchSectionDetails', 'fetchPrescription', 'fetchRelatives'];
			const missingFetcher = requiredFetchers.find(name => typeof options[name] !== 'function');
			if (missingFetcher) throw new Error(`Thiếu dependency ${missingFetcher} cho tab toa thuốc`);
			const examinationId = history.id;
			const appointmentId = history.appointment_id;
			const fetches = [
				options.fetchPatientDetail(options.patient.id).catch(() => null),
				examinationId
					? options.fetchExaminationDetail(examinationId, true).catch(() => null)
					: Promise.resolve(null),
				examinationId
					? options.fetchSectionDetails(examinationId, true).catch(() => ({}))
					: Promise.resolve({}),
				appointmentId
					? options.fetchPrescription(appointmentId, true).catch(() => null)
					: Promise.resolve(null),
				appointmentId
					? options.fetchRelatives(appointmentId).catch(() => ({ data: [] }))
					: Promise.resolve({ data: [] })
			];

			if (typeof options.fetchAppointment === 'function') {
				fetches.push(
					appointmentId
						? options.fetchAppointment(appointmentId).catch(() => null)
						: Promise.resolve(null)
				);
			}

			const [patientDetail, examinationDetail, examinationDetailsBySection, prescriptionData, relativesResponse, appointmentResponse] = await Promise.all(fetches);
			if (!isCurrent(options)) return { state: 'stale' };
			const relatives = relativesResponse?.data || [];
			const paginationOptions = setupPreview({
				setupPrescriptionTabPagination: options.setupPrescriptionTabPagination,
				prescriptionData,
				clinicInfo: typeof options.getClinicInfoConfig === 'function'
					? options.getClinicInfoConfig()
					: options.clinicInfo,
				patient: patientDetail || options.patient,
				history,
				examinationDetail,
				examinationDetailsBySection,
				relatives
			});

			return { state: 'ready', history, index: historyState.index, paginationOptions, appointmentResponse };
		} catch (error) {
			if (typeof options.onError === 'function') {
				options.onError(error);
			}
			renderState(contentArea, 'loadError');
			return { state: 'loadError', history, index: historyState.index, error };
		}
	}

	window.PrescriptionHistoryTabUi = {
		buildStateHtml,
		renderState,
		resolveHistoryState,
		buildPaginationOptions,
		setupPreview,
		renderTab
	};
})(window);
