import { buildPrescriptionScreenHTML } from '../shared/prescription-document-template.js';
import { el, renderDocumentMarkup, replace } from '../../shared/dom.js';
import { QLPKDoctorModuleRegistry } from '../../doctor-examination/module-registry.js';

const PRESCRIPTION_PAGE_COLORS = {
	'BASIC': { accent: '#00897B', label: 'Đơn Cơ bản' },
	'H': { accent: '#7E57C2', label: 'Đơn Hướng thần (H)' },
	'N': { accent: '#F4511E', label: 'Đơn Gây nghiện (N)' }
};

function missingDependency(name) {
	return new Error(`Thiếu helper preview đơn thuốc từ modal: ${name}`);
}

const DEFAULT_DEPENDENCIES = { buildPrescriptionScreenHTML };

function resolveFunction(deps, dependencyName) {
	const candidate = deps[dependencyName] || DEFAULT_DEPENDENCIES[dependencyName];
	if (typeof candidate !== 'function') {
		throw missingDependency(dependencyName);
	}
	return candidate;
}

function buildPerTypePrescriptionData(rx, fullPrescriptionData) {
	return {
		medicines: rx.medicines || [],
		prescription_code: rx.prescription_code || null,
		prescription_type: rx.type || 'BASIC',
		usage_instructions: fullPrescriptionData?.usage_instructions || '',
		re_examination_date: fullPrescriptionData?.re_examination_date || null,
		show_re_examination_date: fullPrescriptionData?.show_re_examination_date,
		re_examination_time: fullPrescriptionData?.re_examination_time || null,
		total_amount: rx.total_amount || 0
	};
}

function normalizeTabPrescriptions(prescriptionData) {
	return prescriptionData?.prescriptions && prescriptionData.prescriptions.length > 0
		? prescriptionData.prescriptions
		: [{
			type: 'BASIC',
			medicines: prescriptionData?.medicines || [],
			prescription_code: prescriptionData?.prescription_code || null,
			total_amount: prescriptionData?.total_amount || 0
		}];
}

function createPrescriptionModalPreview(deps = {}) {
	let prescriptionTabPageIndex = 0;
	let prescriptionTabData = null;

	function renderPrescriptionPage() {
		const contentArea = document.getElementById('modalContentArea');
		if (!contentArea || !prescriptionTabData) return;

		const buildPrescriptionScreenHTML = resolveFunction(deps, 'buildPrescriptionScreenHTML');
		const createBarcodesInElement = resolveFunction(deps, 'createBarcodesInElement');
		const {
			prescriptions,
			clinicInfo,
			patient,
			history,
			examinationDetail,
			examinationDetailsBySection,
			relatives,
			fullPrescriptionData
		} = prescriptionTabData;

		const totalPages = prescriptions.length;
		if (totalPages === 0) {
			const emptyIcon = el('i', { class: 'bi bi-clipboard' });
			emptyIcon.style.setProperty('font-size', 'var(--qlpk-font-size-5xl, 32px)');
			replace(contentArea, el('div', { class: 'text-center text-muted py-4' },
				emptyIcon, el('p', { class: 'mt-2 mb-0' }, 'Lượt khám này không có đơn thuốc')));
			return;
		}

		let combinedHtml = '';
		prescriptions.forEach(rx => {
			const pType = rx.type || 'BASIC';

			const perTypePrescriptionData = buildPerTypePrescriptionData(rx, fullPrescriptionData);

			const previewHtml = buildPrescriptionScreenHTML({
				clinicInfo,
				patient,
				history,
				examinationDetail,
				examinationDetailsBySection,
				prescriptionData: perTypePrescriptionData,
				relatives,
				overridePrescriptionType: pType
			});

			combinedHtml += previewHtml;
		});

		renderDocumentMarkup(contentArea, combinedHtml);
		createBarcodesInElement(contentArea);
	}

	function setupPrescriptionTabPagination({ prescriptionData, clinicInfo, patient, history, examinationDetail, examinationDetailsBySection, relatives }) {
		const prescriptions = normalizeTabPrescriptions(prescriptionData);

		prescriptionTabPageIndex = 0;
		prescriptionTabData = {
			prescriptions,
			clinicInfo,
			patient,
			history,
			examinationDetail,
			examinationDetailsBySection: examinationDetailsBySection || {},
			relatives,
			fullPrescriptionData: prescriptionData
		};

		renderPrescriptionPage();
	}

	return {
		get pageIndex() { return prescriptionTabPageIndex; },
		set pageIndex(value) { prescriptionTabPageIndex = value; },
		renderPrescriptionPage,
		setupPrescriptionTabPagination,
		PRESCRIPTION_PAGE_COLORS
	};
}

const controller = createPrescriptionModalPreview();
QLPKDoctorModuleRegistry.register('prescriptionModalPreview', Object.freeze({
	create: createPrescriptionModalPreview,
	getController: () => controller
}), {
	owner: 'shared/prescription-preview',
	version: 2
});

export { createPrescriptionModalPreview };
