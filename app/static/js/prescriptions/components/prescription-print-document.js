import { PrescriptionTypeContract } from '../shared/prescription-type-contract.js';
import { QLPKPdfPreview } from '../../shared/pdf-preview.js';

const DEFAULT_TITLE = 'In đơn thuốc';

const TYPE_CONTRACT = PrescriptionTypeContract;
if (!TYPE_CONTRACT) throw new Error('Thiếu contract loại đơn thuốc dùng chung');

function escapeHtml(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function normalizePrescriptionType(value) {
	return TYPE_CONTRACT.toDocumentType(value);
}

function filterMedicines(medicines) {
	return (Array.isArray(medicines) ? medicines : [])
		.filter(medicine => medicine?.category_type === 'DRUG');
}

function buildPageOptions(options, prescriptionData, { type, medicines, prescriptionCode, totalAmount }) {
	return {
		clinicInfo: options.clinicInfo || {},
		patient: options.patient || {},
		history: options.history || {},
		examinationDetail: options.examinationDetail || null,
		examinationDetailsBySection: options.examinationDetailsBySection || {},
		relatives: options.relatives || [],
		prescriptionData: {
			...prescriptionData,
			medicines,
			prescription_code: prescriptionCode || '',
			prescription_type: type,
			total_amount: totalAmount ?? prescriptionData.total_amount ?? 0
		},
		overridePrescriptionType: type,
		isPrint: true,
		renderContext: 'print'
	};
}

function buildGroupedPageModels(options, prescriptionData, codesByType) {
	const grouped = Array.isArray(prescriptionData.prescriptions)
		? prescriptionData.prescriptions
		: [];
	const pages = grouped.reduce((result, prescription) => {
		const medicines = filterMedicines(prescription?.medicines);
		if (!medicines.length) return result;
		const type = normalizePrescriptionType(prescription.type || prescription.prescription_type);
		result.push(buildPageOptions(options, prescriptionData, {
			type,
			medicines,
			prescriptionCode: prescription.prescription_code || codesByType[type] || prescriptionData.prescription_code,
			totalAmount: prescription.total_amount
		}));
		return result;
	}, []);

	if (pages.length) return pages;
	return [buildPageOptions(options, prescriptionData, {
		type: 'BASIC',
		medicines: [],
		prescriptionCode: codesByType.BASIC || prescriptionData.prescription_code,
		totalAmount: prescriptionData.total_amount
	})];
}

function buildFlatPageModels(options, prescriptionData, codesByType) {
	const medicinesByType = { BASIC: [], H: [], N: [] };
	filterMedicines(prescriptionData.medicines).forEach(medicine => {
		medicinesByType[normalizePrescriptionType(medicine.prescription_type)].push(medicine);
	});

	const types = Object.keys(medicinesByType).filter(type => medicinesByType[type].length);
	if (!types.length) types.push('BASIC');

	return types.map(type => buildPageOptions(options, prescriptionData, {
		type,
		medicines: medicinesByType[type],
		prescriptionCode: codesByType[type] || prescriptionData.prescription_code,
		totalAmount: prescriptionData.total_amount
	}));
}

function buildPageModels(options = {}) {
	const prescriptionData = options.prescriptionData || {};
	const codesByType = options.prescriptionCodesByType || {};
	const hasGroupedPrescriptions = Array.isArray(prescriptionData.prescriptions)
		&& prescriptionData.prescriptions.length > 0;

	if (options.preferGroupedPrescriptions !== false && hasGroupedPrescriptions) {
		return buildGroupedPageModels(options, prescriptionData, codesByType);
	}
	return buildFlatPageModels(options, prescriptionData, codesByType);
}

function buildAssetUrl(path, version) {
	return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

function getAssetVersion(hostDocument) {
	return hostDocument
		?.querySelector('meta[name="qlpk-app-version"]')
		?.getAttribute('content') || '';
}

function installPrintDocumentFns1(ctx) {
	function getDocumentBaseUrl() {
		const origin = ctx.hostDocument.location?.origin || ctx.hostWindow.location?.origin;
		return origin && origin !== 'null' ? `${origin}/` : '';
	}

	function createDocumentUrl(html) {
		const UrlApi = ctx.hostWindow.URL || window.URL;
		const BlobConstructor = ctx.hostWindow.Blob || window.Blob;
		if (!UrlApi || typeof UrlApi.createObjectURL !== 'function' || typeof BlobConstructor !== 'function') {
			throw new Error('Trình duyệt không hỗ trợ tài liệu in tạm thời');
		}
		return UrlApi.createObjectURL(new BlobConstructor([html], { type: 'text/html;charset=utf-8' }));
	}

	function revokeDocumentUrl(printWindow, url) {
		const UrlApi = ctx.hostWindow.URL || window.URL;
		if (!UrlApi || typeof UrlApi.revokeObjectURL !== 'function') return;
		if (ctx.activeDocumentUrls.get(printWindow) === url) ctx.activeDocumentUrls.delete(printWindow);
		UrlApi.revokeObjectURL(url);
	}

	function navigateDocument(printWindow, html) {
		if (!printWindow || printWindow.closed) {
			throw new Error('Cửa sổ in đơn thuốc không còn khả dụng');
		}
		const url = createDocumentUrl(html);
		const previousUrl = ctx.activeDocumentUrls.get(printWindow);
		ctx.activeDocumentUrls.set(printWindow, url);
		if (previousUrl && typeof printWindow.addEventListener === 'function') {
			printWindow.addEventListener('load', () => revokeDocumentUrl(printWindow, previousUrl), { once: true });
		}
		try {
			if (printWindow.location && typeof printWindow.location.replace === 'function') {
				printWindow.location.replace(url);
			} else if (printWindow.location) {
				printWindow.location.href = url;
			} else {
				throw new Error('Cửa sổ in đơn thuốc không hỗ trợ điều hướng');
			}
		} catch (error) {
			revokeDocumentUrl(printWindow, url);
			throw error;
		}
		if (previousUrl) {
			if (typeof printWindow.addEventListener !== 'function') {
				ctx.hostWindow.setTimeout(() => revokeDocumentUrl(printWindow, previousUrl), 60000);
			}
		}
		return printWindow;
	}

	function resolvePreviewBuilder(input = {}) {
		const builder = input.buildPrescriptionPreviewHTML
			|| ctx.options.buildPrescriptionPreviewHTML
			|| window.buildPrescriptionPreviewHTML;
		if (typeof builder !== 'function') {
			throw new Error('Thiếu mẫu tài liệu đơn thuốc dùng chung');
		}
		return builder;
	}

	Object.assign(ctx, { getDocumentBaseUrl, navigateDocument, resolvePreviewBuilder });
}

function installPrintDocumentFns2(ctx) {
	function buildPagesHtml(input = {}) {
		const buildPreview = ctx.resolvePreviewBuilder(input);
		const pageModels = Array.isArray(input.pageModels)
			? input.pageModels
			: buildPageModels(input);
		return pageModels.map(model => (
			`<article class="prescription-print-document__page">${buildPreview({
					...model,
					isPrint: true,
					renderContext: 'print'
				})}</article>`
		)).join('');
	}

	function buildLoadingDocument(title) {
		return `<!DOCTYPE html>
				<html lang="vi">
				<head>
					<meta charset="utf-8">
					<title>${escapeHtml(title)}</title>
					<style>
						html, body { margin: 0; min-height: 100%; background: #ffffff; }
						body { display: grid; font-family: Arial, sans-serif; place-items: center; }
					</style>
				</head>
				<body><p>Đang chuẩn bị đơn thuốc...</p></body>
				</html>`;
	}

	function open(input = {}) {
		const title = input.title || DEFAULT_TITLE;
		if (typeof ctx.openWindow !== 'function') {
			throw new Error('Trình duyệt không hỗ trợ cửa sổ in');
		}
		const printWindow = ctx.openWindow('', '_blank');
		if (!printWindow) throw new Error('Trình duyệt đã chặn cửa sổ in');
		return ctx.navigateDocument(printWindow, buildLoadingDocument(title));
	}

	function buildDocument(input = {}) {
		const title = input.title || DEFAULT_TITLE;
		const version = input.assetVersion || getAssetVersion(ctx.hostDocument);
		const typographyUrl = buildAssetUrl('/static/css/shared/typography.css', version);
		const colorTokensUrl = buildAssetUrl('/static/css/shared/color-tokens.css', version);
		const printStylesUrl = buildAssetUrl('/static/css/prescriptions/components/prescription-print-document.css', version);
		const formStylesUrl = buildAssetUrl('/static/css/prescriptions/components/prescription-standard-form.css', version);
		const pagesHtml = buildPagesHtml(input);
		const documentBaseUrl = ctx.getDocumentBaseUrl();

		return `<!DOCTYPE html>
				<html lang="vi">
				<head>
					<meta charset="utf-8">
					${documentBaseUrl ? `<base href="${escapeHtml(documentBaseUrl)}">` : ''}
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<title>${escapeHtml(title)}</title>
					<link rel="stylesheet" href="${escapeHtml(typographyUrl)}">
					<link rel="stylesheet" href="${escapeHtml(colorTokensUrl)}">
					<link rel="stylesheet" href="${escapeHtml(formStylesUrl)}">
					<link rel="stylesheet" href="${escapeHtml(printStylesUrl)}">
				</head>
				<body class="prescription-print-document">
					<main class="prescription-print-document__pages">${pagesHtml}</main>
				</body>
				</html>`;
	}

	Object.assign(ctx, { buildPagesHtml, open, buildDocument });
}

function installPrintDocumentFns3(ctx) {
	function render(printWindow, input = {}) {
		if (!printWindow || printWindow.closed) {
			throw new Error('Cửa sổ in đơn thuốc không còn khả dụng');
		}
		return QLPKPdfPreview.render(printWindow, ctx.buildDocument(input));
	}

	function renderError(printWindow, input = {}) {
		if (!printWindow || printWindow.closed) return;
		const title = input.title || DEFAULT_TITLE;
		const message = input.message || 'Không thể chuẩn bị đơn thuốc';
		ctx.navigateDocument(printWindow, `<!DOCTYPE html>
				<html lang="vi">
				<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
				<body><h1>Không thể chuẩn bị đơn thuốc</h1><p>${escapeHtml(message)}</p></body>
				</html>`);
	}

	Object.assign(ctx, { render, renderError });
}

function create(options = {}) {
	const ctx = {};
	ctx.options = options;
	installPrintDocumentFns1(ctx);
	installPrintDocumentFns2(ctx);
	installPrintDocumentFns3(ctx);

	ctx.hostDocument = ctx.options.document || document;
	ctx.hostWindow = ctx.hostDocument.defaultView || window;
	const defaultOpenWindow = typeof window.open === 'function' ? window.open.bind(window) : null;
	ctx.openWindow = typeof ctx.options.openWindow === 'function' ? ctx.options.openWindow : defaultOpenWindow;
	ctx.activeDocumentUrls = new WeakMap();

	return {
		buildDocument: ctx.buildDocument,
		buildPageModels,
		buildPagesHtml: ctx.buildPagesHtml,
		open: ctx.open,
		render: ctx.render,
		renderError: ctx.renderError
	};
}

export const PrescriptionPrintDocument = Object.freeze({
	buildPageModels,
	create,
	normalizePrescriptionType
});
