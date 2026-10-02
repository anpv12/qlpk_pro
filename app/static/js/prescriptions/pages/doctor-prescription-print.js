import { PrescriptionPrintDocument } from '../components/prescription-print-document.js';

(function (window) {
	'use strict';

	window.createDoctorPrescriptionPrint = function createDoctorPrescriptionPrint(deps = {}) {
		let printDocument = null;

		function getPrintDocument() {
			if (printDocument) return printDocument;
			if (deps.printDocument) {
				printDocument = deps.printDocument;
				return printDocument;
			}
			const factory = deps.printDocumentFactory || PrescriptionPrintDocument?.create;
			if (typeof factory !== 'function') {
				throw new Error('Thiếu component in đơn thuốc dùng chung');
			}
			printDocument = factory({
				document: deps.document || window.document,
				buildPrescriptionPreviewHTML: deps.buildPrescriptionPreviewHTML || window.buildPrescriptionPreviewHTML
			});
			return printDocument;
		}

		function mergePrintPrescriptionData(printData) {
			const currentData = deps.collectPrescriptionFormData();
			const persistedData = printData && printData.prescriptionData ? printData.prescriptionData : {};
			return {
				...persistedData,
				...currentData,
				medicines: Array.isArray(currentData.medicines) ? currentData.medicines : []
			};
		}

		function buildMainPrintOptions(appointment, printData) {
			const prescriptionData = mergePrintPrescriptionData(printData);
			const prescriptionCodesByType = typeof deps.getPrescriptionCodesByType === 'function'
				? deps.getPrescriptionCodesByType() || {}
				: {};
			const patient = printData.patient || appointment.patient_info || appointment.patient || {};
			const history = printData.history || {
				id: appointment.examination_id,
				examination_date: appointment.appointment_date,
				doctor: appointment.doctor_info || appointment.doctor || {}
			};
			return {
				title: 'In đơn thuốc',
				clinicInfo: window.getClinicInfoConfig(),
				patient,
				history,
				examinationDetail: printData.examinationDetail || null,
				examinationDetailsBySection: printData.examinationDetailsBySection || {},
				relatives: printData.relatives || [],
				prescriptionData,
				prescriptionCodesByType,
				preferGroupedPrescriptions: false
			};
		}

		async function printMainPrescription() {
			const appointmentId = deps.getCurrentAppointmentId && deps.getCurrentAppointmentId();
			if (!appointmentId) throw new Error('Chưa chọn ca khám để in đơn thuốc');
			const component = getPrintDocument();
			let printWindow = null;

			try {
				printWindow = component.open({ title: 'In đơn thuốc' });
				const appointment = await deps.getCurrentAppointmentData(appointmentId);
				const printData = await deps.fetchPrescriptionDataForPrint(appointmentId);
				await component.render(printWindow, buildMainPrintOptions(appointment, printData));
				return printWindow;
			} catch (error) {
				component.renderError(printWindow, {
					title: 'In đơn thuốc',
					message: 'Không thể chuẩn bị đơn thuốc'
				});
				throw error;
			}
		}

		return { printMainPrescription };
	};
})(window);
