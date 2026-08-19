(function (window) {
	'use strict';

	function missingDependency(name) {
		return new Error(`Thiếu helper in đơn thuốc từ modal: ${name}`);
	}

	function resolveFunction(deps, dependencyName, globalName = dependencyName) {
		const candidate = deps[dependencyName] || window[globalName];
		if (typeof candidate !== 'function') {
			throw missingDependency(globalName);
		}
		return candidate;
	}

	function showToast(deps, type, message) {
		const toast = deps.showToast || window.showCustomToast;
		if (typeof toast === 'function') {
			toast(type, message);
		}
	}

	function getToken(deps) {
		if (typeof deps.getToken === 'function') {
			return deps.getToken();
		}
		return window.localStorage ? window.localStorage.getItem('qlpk_token') : null;
	}

	function getModalState(deps) {
		if (typeof deps.getModalState === 'function') {
			return deps.getModalState();
		}

		return {
			patient: window.modalSelectedPatient != null ? window.modalSelectedPatient : null,
			historyLoading: window.modalMedicalHistoryLoading != null ? window.modalMedicalHistoryLoading : false,
			historyData: window.modalMedicalHistoryData != null ? window.modalMedicalHistoryData : [],
			historyIndex: window.modalSelectedHistoryIndex != null ? window.modalSelectedHistoryIndex : null
		};
	}

	window.createPrescriptionModalPrint = function createPrescriptionModalPrint(deps = {}) {
		let printDocument = null;

		function getPrintDocument() {
			if (printDocument) return printDocument;
			if (deps.printDocument) {
				printDocument = deps.printDocument;
				return printDocument;
			}
			const factory = deps.printDocumentFactory || window.PrescriptionPrintDocument?.create;
			if (typeof factory !== 'function') {
				throw missingDependency('PrescriptionPrintDocument');
			}
			printDocument = factory({
				document: deps.document || window.document,
				buildPrescriptionPreviewHTML: deps.buildPrescriptionPreviewHTML || window.buildPrescriptionPreviewHTML
			});
			return printDocument;
		}

		async function printModalPrescription() {
			let component = null;
			let printWindow = null;
			try {
				const state = getModalState(deps);
				const patient = state.patient;
				const historyLoading = state.historyLoading;
				const historyData = state.historyData;
				const historyIndex = state.historyIndex;

				if (!patient) {
					showToast(deps, 'error', 'Vui lòng chọn bệnh nhân');
					return;
				}

				if (historyLoading) {
					showToast(deps, 'warning', 'Đang tải lịch sử khám, vui lòng đợi...');
					return;
				}

				if (!Array.isArray(historyData) || !historyData.length) {
					showToast(deps, 'error', 'Chưa có lịch sử khám cho bệnh nhân này');
					return;
				}

				let selectedIndex = historyIndex;
				if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= historyData.length) {
					selectedIndex = 0;
				}
				const history = historyData[selectedIndex];
				if (!history) {
					showToast(deps, 'error', 'Không tìm thấy dữ liệu lịch sử tương ứng');
					return;
				}
				component = getPrintDocument();
				printWindow = component.open({ title: 'In đơn thuốc' });

				const fetchPatientDetailForPrescription = resolveFunction(deps, 'fetchPatientDetailForPrescription');
				const fetchExaminationDetailForPrescription = resolveFunction(deps, 'fetchExaminationDetailForPrescription');
				const fetchExaminationDetailsBySection = resolveFunction(deps, 'fetchExaminationDetailsBySection');
				const fetchPrescriptionDataForAppointment = resolveFunction(deps, 'fetchPrescriptionDataForAppointment');
				const getClinicInfoConfig = resolveFunction(deps, 'getClinicInfoConfig');

				const examinationId = history.id;
				const appointmentId = history.appointment_id;

				const [patientDetail, examinationDetail, examinationDetailsBySection, prescriptionData, relativesResponse] = await Promise.all([
					fetchPatientDetailForPrescription(patient.id).catch(() => null),
					examinationId
						? fetchExaminationDetailForPrescription(examinationId, true).catch(() => null)
						: Promise.resolve(null),
					examinationId
						? fetchExaminationDetailsBySection(examinationId, true).catch(() => ({}))
						: Promise.resolve({}),
					appointmentId
						? fetchPrescriptionDataForAppointment(appointmentId, true).catch(() => null)
						: Promise.resolve(null),
					appointmentId
						? fetch(`/api/appointment-relatives/appointment/${appointmentId}`, {
							headers: { 'Authorization': `Bearer ${getToken(deps)}` }
						}).then(response => response.ok ? response.json() : { data: [] }).catch(() => ({ data: [] }))
						: Promise.resolve({ data: [] })
				]);
				const relatives = relativesResponse?.data || [];

				const data = {
					patient: patientDetail || patient,
					history,
					examinationDetail,
					examinationDetailsBySection: examinationDetailsBySection || {},
					prescriptionData,
					relatives
				};

				component.render(printWindow, {
					title: 'In đơn thuốc',
					clinicInfo: getClinicInfoConfig(),
					...data
				});
				return printWindow;
			} catch (error) {
				console.error('Error printing prescription from modal:', error);
				if (component) {
					component.renderError(printWindow, {
						title: 'In đơn thuốc',
						message: 'Không thể chuẩn bị đơn thuốc'
					});
				}
				showToast(deps, 'error', 'Không thể in đơn thuốc. Vui lòng thử lại.');
			}
		}

		return { printModalPrescription };
	};

	window.prescriptionModalPrintController = window.createPrescriptionModalPrint();
	window.printModalPrescription = function printModalPrescriptionFromComponent() {
		return window.prescriptionModalPrintController.printModalPrescription();
	};
})(window);
