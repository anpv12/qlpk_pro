(function (window) {
	'use strict';

	const PRESCRIPTION_PAGE_COLORS = {
		'BASIC': { accent: '#00897B', label: 'Đơn Cơ bản' },
		'H': { accent: '#7E57C2', label: 'Đơn Hướng thần (H)' },
		'N': { accent: '#F4511E', label: 'Đơn Gây nghiện (N)' }
	};

	function missingDependency(name) {
		return new Error(`Thiếu helper preview đơn thuốc từ modal: ${name}`);
	}

	function resolveFunction(deps, dependencyName, globalName = dependencyName) {
		const candidate = deps[dependencyName] || window[globalName];
		if (typeof candidate !== 'function') {
			throw missingDependency(globalName);
		}
		return candidate;
	}

	window.createPrescriptionModalPreview = function createPrescriptionModalPreview(deps = {}) {
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
				contentArea.innerHTML = `
					<div class="text-center text-muted py-4">
						<i class="bi bi-clipboard" style="font-size: var(--qlpk-font-size-5xl, 32px);"></i>
						<p class="mt-2 mb-0">Lượt khám này không có đơn thuốc</p>
					</div>`;
				return;
			}

			let combinedHtml = '';
			prescriptions.forEach(rx => {
				const pType = rx.type || 'BASIC';

				const perTypePrescriptionData = {
					medicines: rx.medicines || [],
					prescription_code: rx.prescription_code || null,
					prescription_type: rx.type || 'BASIC',
					usage_instructions: fullPrescriptionData?.usage_instructions || '',
					re_examination_date: fullPrescriptionData?.re_examination_date || null,
					show_re_examination_date: fullPrescriptionData?.show_re_examination_date,
					re_examination_time: fullPrescriptionData?.re_examination_time || null,
					total_amount: rx.total_amount || 0
				};

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

			contentArea.innerHTML = combinedHtml;
			createBarcodesInElement(contentArea);
		}

		function setupPrescriptionTabPagination({ prescriptionData, clinicInfo, patient, history, examinationDetail, examinationDetailsBySection, relatives }) {
			const prescriptions = prescriptionData?.prescriptions && prescriptionData.prescriptions.length > 0
				? prescriptionData.prescriptions
				: [{
					type: 'BASIC',
					medicines: prescriptionData?.medicines || [],
					prescription_code: prescriptionData?.prescription_code || null,
					total_amount: prescriptionData?.total_amount || 0
				}];

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
	};

	window.prescriptionModalPreviewController = window.createPrescriptionModalPreview();
	window.PRESCRIPTION_PAGE_COLORS = PRESCRIPTION_PAGE_COLORS;
	window.renderPrescriptionPage = function renderPrescriptionPageFromComponent() {
		return window.prescriptionModalPreviewController.renderPrescriptionPage();
	};
	window.setupPrescriptionTabPagination = function setupPrescriptionTabPaginationFromComponent(options) {
		return window.prescriptionModalPreviewController.setupPrescriptionTabPagination(options);
	};

	Object.defineProperty(window, '_prescriptionTabPageIndex', {
		get() { return window.prescriptionModalPreviewController.pageIndex; },
		set(value) { window.prescriptionModalPreviewController.pageIndex = value; },
		configurable: true
	});

	window.QLPKDoctorModuleRegistry?.register?.('prescriptionModalPreview', Object.freeze({
		create: window.createPrescriptionModalPreview,
		getController: () => window.prescriptionModalPreviewController
	}), {
		owner: 'shared/prescription-preview',
		version: 2
	});
})(window);
