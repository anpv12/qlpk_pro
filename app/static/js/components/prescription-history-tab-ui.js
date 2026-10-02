import { QLPKHistoryTabCore } from './history-tab-core.js';

(function (window) {
	'use strict';

	const STATES = {
		noPatient: { icon: 'bi-person', text: 'Chọn bệnh nhân để xem toa thuốc' },
		historyLoading: { spinner: true, text: 'Đang tải lịch sử khám...' },
		emptyHistory: { icon: 'bi-clipboard', text: 'Chưa có lịch sử khám cho bệnh nhân này' },
		missingHistory: { icon: 'bi-clipboard-x', text: 'Không tìm thấy dữ liệu lịch sử tương ứng' },
		prescriptionLoading: { spinner: true, text: 'Đang tải toa thuốc...' },
		loadError: { tone: 'danger', icon: 'bi-exclamation-triangle', text: 'Không tải được toa thuốc. Vui lòng thử lại.' }
	};

	function renderState(container, state) {
		return QLPKHistoryTabCore.renderStateBlock(container, STATES[state]);
	}

	const historyTabCore = QLPKHistoryTabCore;
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
		const setupPrescriptionTabPagination = options.setupPrescriptionTabPagination;
		if (typeof setupPrescriptionTabPagination !== 'function') {
			throw new Error('setupPrescriptionTabPagination is required');
		}

		const paginationOptions = buildPaginationOptions(options);
		setupPrescriptionTabPagination(paginationOptions);
		return paginationOptions;
	}

	// Fetch with the given id, or resolve `fallback` without a request when the id is missing.
	function fetchOr(id, fetcher, fallback) {
		return id ? fetcher(id).catch(() => fallback) : Promise.resolve(fallback);
	}

	function buildPrescriptionTabFetches(options, history) {
		const examinationId = history.id;
		const appointmentId = history.appointment_id;
		const fetches = [
			options.fetchPatientDetail(options.patient.id).catch(() => null),
			fetchOr(examinationId, id => options.fetchExaminationDetail(id, true), null),
			fetchOr(examinationId, id => options.fetchSectionDetails(id, true), {}),
			fetchOr(appointmentId, id => options.fetchPrescription(id, true), null),
			fetchOr(appointmentId, id => options.fetchRelatives(id), { data: [] })
		];
		if (typeof options.fetchAppointment === 'function') {
			fetches.push(fetchOr(appointmentId, id => options.fetchAppointment(id), null));
		}
		return fetches;
	}

	function resolveClinicInfo(options) {
		return typeof options.getClinicInfoConfig === 'function' ? options.getClinicInfoConfig() : options.clinicInfo;
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
			const fetches = buildPrescriptionTabFetches(options, history);
			const [patientDetail, examinationDetail, examinationDetailsBySection, prescriptionData, relativesResponse, appointmentResponse] = await Promise.all(fetches);
			if (!isCurrent(options)) return { state: 'stale' };
			const relatives = relativesResponse?.data || [];
			const paginationOptions = setupPreview({
				setupPrescriptionTabPagination: options.setupPrescriptionTabPagination,
				prescriptionData,
				clinicInfo: resolveClinicInfo(options),
				patient: patientDetail || options.patient,
				history,
				examinationDetail,
				examinationDetailsBySection,
				relatives
			});

			return { state: 'ready', history, index: historyState.index, paginationOptions, appointmentResponse };
		} catch (error) {
			if (typeof options.onError === 'function') options.onError(error);
			renderState(contentArea, 'loadError');
			return { state: 'loadError', history, index: historyState.index, error };
		}
	}

	window.PrescriptionHistoryTabUi = {
		renderState,
		resolveHistoryState,
		buildPaginationOptions,
		setupPreview,
		renderTab
	};
})(window);
