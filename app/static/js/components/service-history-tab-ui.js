import { renderDocumentMarkup } from '../shared/dom.js';

(function (window) {
	'use strict';

	const STATE_HTML = {
		noPatient: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-gear patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Chọn bệnh nhân để xem dịch vụ</p>
                <small class="text-muted">Danh sách dịch vụ sẽ hiển thị tại đây</small>
            </div>
        `,
		historyLoading: `
            <div class="text-center text-muted py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2 mb-0">Đang tải dữ liệu dịch vụ...</p>
            </div>
        `,
		emptyHistory: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-clipboard-data patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-1">Chưa có lượt khám nào để hiển thị dịch vụ</p>
                <small class="text-muted">Vui lòng chọn hoặc tạo lịch sử khám trước</small>
            </div>
        `,
		missingHistory: `
            <div class="text-center text-muted py-4">
                <i class="bi bi-clipboard-x patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Không tìm thấy dữ liệu lịch sử tương ứng</p>
            </div>
        `,
		serviceLoading: `
        <div class="text-center text-muted py-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 mb-0">Đang tải dịch vụ...</p>
        </div>
    `,
		loadError: `
            <div class="text-center text-danger py-4">
                <i class="bi bi-exclamation-triangle patient-search-modal__empty-icon"></i>
                <p class="mt-2 mb-0">Không tải được danh sách dịch vụ. Vui lòng thử lại.</p>
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

	function buildInvoiceHtml(options = {}) {
		if (typeof options.buildServiceInvoiceHTML !== 'function') {
			throw new Error('buildServiceInvoiceHTML is required');
		}

		const historyWithDetail = options.examinationDetail
			? { ...options.history, ...options.examinationDetail }
			: options.history;

		return options.buildServiceInvoiceHTML({
			clinicInfo: options.clinicInfo,
			patient: options.patient,
			history: historyWithDetail,
			servicesData: options.servicesData,
			prescriptionData: options.prescriptionData
		});
	}

	function renderInvoice(options = {}) {
		const invoiceHtml = buildInvoiceHtml(options);
		if (options.container) {
			renderDocumentMarkup(options.container, invoiceHtml);
			if (typeof options.createBarcodesInElement === 'function') {
				options.createBarcodesInElement(options.container);
			}
		}
		return invoiceHtml;
	}

	async function renderTab(options = {}) {
		const tab = historyTabCore.resolveTabContext(options, renderState);
		if (tab.done) return tab.done;
		const { contentArea, historyState } = tab;

		const history = historyState.history;
		renderState(contentArea, 'serviceLoading');

		try {
			const requiredFetchers = ['fetchPatientDetail', 'fetchExaminationDetail', 'fetchServicesForAppointment', 'fetchPrescriptionForAppointment'];
			const missingFetcher = requiredFetchers.find(name => typeof options[name] !== 'function');
			if (missingFetcher) throw new Error(`Thiếu dependency ${missingFetcher} cho tab dịch vụ`);
			const examinationId = history.id;
			const [patientDetail, examinationDetail, servicesData, prescriptionData] = await Promise.all([
				options.fetchPatientDetail(options.patient.id),
				examinationId
					? options.fetchExaminationDetail(examinationId, true).catch(() => null)
					: Promise.resolve(null),
				options.fetchServicesForAppointment(history.appointment_id, true),
				options.fetchPrescriptionForAppointment(history.appointment_id, true)
			]);
			if (!isCurrent(options)) return { state: 'stale' };

			const invoiceHtml = renderInvoice({
				container: contentArea,
				buildServiceInvoiceHTML: options.buildServiceInvoiceHTML,
				clinicInfo: typeof options.getClinicInfoConfig === 'function'
					? options.getClinicInfoConfig()
					: options.clinicInfo,
				patient: patientDetail || options.patient,
				history,
				examinationDetail,
				servicesData,
				prescriptionData,
				createBarcodesInElement: options.createBarcodesInElement
			});

			return { state: 'ready', history, index: historyState.index, invoiceHtml };
		} catch (error) {
			if (typeof options.onError === 'function') {
				options.onError(error);
			}
			renderState(contentArea, 'loadError');
			return { state: 'loadError', history, index: historyState.index, error };
		}
	}

	window.ServiceHistoryTabUi = {
		buildStateHtml,
		renderState,
		resolveHistoryState,
		buildInvoiceHtml,
		renderInvoice,
		renderTab
	};
})(window);
