import { renderDocumentMarkup } from '../shared/dom.js';

(function (window) {
	'use strict';

	function getRecordLabel(options = {}) {
		return options.recordLabel || 'bệnh án';
	}

	function stateSpec(state, options = {}) {
		const recordLabel = getRecordLabel(options);
		const states = {
			noPatient: { icon: 'bi-file-medical', text: `Chọn bệnh nhân để xem ${recordLabel}` },
			historyLoading: { spinner: true, text: `Đang tải dữ liệu ${recordLabel}...` },
			emptyHistory: { icon: 'bi-clipboard-data', text: `Chưa có lượt khám nào để hiển thị ${recordLabel}`, small: 'Vui lòng chọn hoặc tạo lịch sử khám trước' },
			missingHistory: { icon: 'bi-clipboard-x', text: 'Không tìm thấy dữ liệu lịch sử tương ứng' },
			recordLoading: { spinner: true, text: `Đang tải ${recordLabel}...` },
			loadError: { tone: 'danger', icon: 'bi-exclamation-triangle', text: `Không tải được ${recordLabel}. Vui lòng thử lại.` }
		};
		return states[state];
	}

	function renderState(container, state, options = {}) {
		return window.QLPKHistoryTabCore.renderStateBlock(container, stateSpec(state, options));
	}

	const historyTabCore = window.QLPKHistoryTabCore;
	const isCurrent = historyTabCore.isContextCurrent;
	const resolveHistoryState = historyTabCore.resolveHistoryState;

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

	// Last record drawn into each container, so a realtime patient edit redraws the same visit's data.
	const lastRecords = new WeakMap();

	function renderRecord(options = {}) {
		const html = buildRecordHtml(options);
		if (options.container) {
			lastRecords.set(options.container, options);
			renderDocumentMarkup(options.container, html);
			if (typeof options.createBarcodesInElement === 'function') {
				options.createBarcodesInElement(options.container);
			}
		}
		return html;
	}

	async function renderTab(options = {}) {
		const tab = historyTabCore.resolveTabContext(options, (container, state) => renderState(container, state, options));
		if (tab.done) return tab.done;
		const { contentArea, historyState } = tab;

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

	// Redraws the container's last record with the patient's current fields; false when it shows another patient.
	function rerenderRecord(container, patient) {
		const last = container ? lastRecords.get(container) : null;
		if (!last || !patient || String(last.patient?.id) !== String(patient.id)) return false;
		renderRecord({ ...last, patient: { ...last.patient, ...patient } });
		return true;
	}

	window.MedicalRecordHistoryTabUi = {
		renderState,
		resolveHistoryState,
		buildRecordHtml,
		renderRecord,
		rerenderRecord,
		renderTab
	};
})(window);
