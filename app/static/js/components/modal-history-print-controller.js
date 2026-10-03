import { buildPrescriptionPreviewHTML } from '../prescriptions/shared/prescription-document-template.js';
import { PrescriptionPrintDocument } from '../prescriptions/components/prescription-print-document.js';
import { QLPKPdfPreview } from '../shared/pdf-preview.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

const TARGETS = Object.freeze({
	'prescription-content': {
		contentId: 'modalContentArea',
		label: 'toa thuốc',
		rendererKey: 'prescription',
		title: 'In toa thuốc'
	},
	'services-content': {
		contentId: 'servicesContentArea',
		label: 'hóa đơn dịch vụ',
		rendererKey: 'services',
		title: 'In hóa đơn dịch vụ'
	},
	'medical-record-content': {
		contentId: 'medicalRecordContentArea',
		label: 'bệnh án bác sĩ',
		rendererKey: 'medicalRecord',
		title: 'In bệnh án bác sĩ'
	},
	'medical-record-tlg-content': {
		contentId: 'medicalRecordTLGContentArea',
		label: 'bệnh án tâm lý gia',
		rendererKey: 'medicalRecordTlg',
		title: 'In bệnh án tâm lý gia'
	}
});

function escapeHtml(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function getAssetVersion(doc) {
	return doc.querySelector('meta[name="qlpk-app-version"]')?.getAttribute('content') || '';
}

function buildAssetUrl(path, version) {
	return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

function buildLoadingDocument(title) {
	return `<!DOCTYPE html>
			<html lang="vi">
			<head>
				<meta charset="utf-8">
				<title>${escapeHtml(title)}</title>
				<style>
					html, body { margin: 0; min-height: 100%; background: #ffffff; }
					body { display: grid; place-items: center; }
				</style>
			</head>
			<body><p>Đang chuẩn bị tài liệu in...</p></body>
			</html>`;
}

function openPrintWindow(title, openWindow) {
	if (typeof openWindow !== 'function') {
		throw new Error('Trình duyệt không hỗ trợ cửa sổ in');
	}
	const printWindow = openWindow('', '_blank');
	if (!printWindow) throw new Error('Trình duyệt đã chặn cửa sổ in');
	printWindow.document.open();
	printWindow.document.write(buildLoadingDocument(title));
	printWindow.document.close();
	return printWindow;
}

const PRINT_DOCUMENT_STYLE = `<style>
				@page { size: A4; margin: 8mm; }
					html, body { height: auto; margin: 0; background: #ffffff; }
					body.patient-search-modal.patient-search-modal__right-column {
						display: block;
						height: auto;
						overflow: visible;
					}
					.modal-history-print-content {
						width: 100%;
						max-width: 210mm;
						margin: 0 auto;
					}
					.modal-history-print-content .prescription-preview {
						min-height: auto;
						border: 0;
						border-radius: 0;
						box-shadow: none;
					}
					.modal-history-print-content .prescription-gradient-separator {
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}
					.modal-history-print-content .prescription-preview__header--clinic {
						align-items: flex-start;
						display: flex;
						flex-direction: row;
						flex-wrap: nowrap;
						gap: 20px;
					}
					.modal-history-print-content .clinic-logo,
					.modal-history-print-content .prescription-code-section {
						flex: 0 0 auto;
					}
					.modal-history-print-content .clinic-info {
						flex: 1 1 auto;
						min-width: 0;
					}
					.modal-history-print-content .prescription-code-section {
						align-items: center;
						gap: 3px;
						margin: 0;
						padding-left: 0;
						width: auto;
					}
					.modal-history-print-content .prescription-code-section .barcode-svg--patient {
						order: 1;
					}
					.modal-history-print-content .prescription-code-section .patient-code {
						order: 2;
					}
					.modal-history-print-content .prescription-code-section .prescription-code-badge--rx {
						background: transparent;
						border-radius: 0;
						box-shadow: none;
						margin: 0;
						order: 3;
						padding: 0;
					}
					.modal-history-print-content .prescription-preview:not(:last-child) {
						break-after: page;
						page-break-after: always;
					}
					@media print {
						html, body { background: #ffffff; }
						.modal-history-print-content { max-width: none; }
						.prescription-preview__signature--avoid-break { break-inside: avoid; page-break-inside: avoid; }
					}
				</style>`;

function buildPrintDocument(options = {}) {
	const version = options.assetVersion || '';
	const typographyUrl = buildAssetUrl('/static/css/shared/typography.css', version);
	const colorTokensUrl = buildAssetUrl('/static/css/shared/color-tokens.css', version);
	const modalStylesUrl = buildAssetUrl('/static/css/patient-search-modal.css', version);

	return `<!DOCTYPE html>
			<html lang="vi">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<title>${escapeHtml(options.title)}</title>
				<link href="/static/vendor/pdf/bootstrap.min.css" rel="stylesheet">
				<link rel="stylesheet" href="${escapeHtml(typographyUrl)}">
				<link rel="stylesheet" href="${escapeHtml(colorTokensUrl)}">
				<link rel="stylesheet" href="${escapeHtml(modalStylesUrl)}">
				${PRINT_DOCUMENT_STYLE}
			</head>
			<body class="patient-search-modal patient-search-modal__right-column">
				<main class="modal-history-print-content">${options.html}</main>
			</body>
			</html>`;
}

function writePrintDocument(printWindow, options) {
	return QLPKPdfPreview.render(printWindow, buildPrintDocument(options));
}

function writePrintError(printWindow, title, message) {
	if (!printWindow || printWindow.closed) return;
	printWindow.document.open();
	printWindow.document.write(`<!DOCTYPE html>
			<html lang="vi">
			<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
			<body><h1>Không thể chuẩn bị tài liệu in</h1><p>${escapeHtml(message)}</p></body>
			</html>`);
	printWindow.document.close();
}

function resolveSelection(stateStore) {
	const state = stateStore.getState();
	if (!state.selectedPatient) throw new Error('Vui lòng chọn bệnh nhân');
	if (state.medicalHistoryLoading) throw new Error('Lịch sử khám đang được tải, vui lòng đợi');
	const histories = Array.isArray(state.medicalHistoryData) ? state.medicalHistoryData : [];
	if (!histories.length) throw new Error('Bệnh nhân chưa có lịch sử khám');

	const selectedIndex = Number.isInteger(state.selectedHistoryIndex) ? state.selectedHistoryIndex : 0;
	const history = histories[selectedIndex];
	if (!history) throw new Error('Không tìm thấy lượt khám đang chọn');

	return {
		contextRevision: Number(state.contextRevision) || 0,
		historyId: Number(history.id) || 0,
		patientId: Number(state.selectedPatient.id) || 0,
		selectedIndex
	};
}

function isSameSelection(left, right) {
	return left.contextRevision === right.contextRevision
		&& left.historyId === right.historyId
		&& left.patientId === right.patientId
		&& left.selectedIndex === right.selectedIndex;
}

// Runs the target renderer and rejects results that are not ready or belong to another visit.
async function renderPrintTarget(renderers, stateStore, target, selection) {
	const renderer = renderers[target.rendererKey];
	if (typeof renderer !== 'function') {
		throw new Error(`Thiếu renderer cho ${target.label}`);
	}
	const result = await renderer();
	if (!result || result.state !== 'ready') {
		throw new Error(result?.state === 'stale'
			? 'Lượt khám đã thay đổi trong khi chuẩn bị tài liệu in'
			: `Không thể tải ${target.label}`);
	}
	if (!isSameSelection(selection, resolveSelection(stateStore))) {
		throw new Error('Lượt khám đã thay đổi trong khi chuẩn bị tài liệu in');
	}
	return result;
}

async function writeRenderedTarget(doc, target, result, printWindow, prescriptionDocument) {
	if (target.rendererKey === 'prescription') {
		if (!result.paginationOptions) {
			throw new Error('Thiếu dữ liệu tài liệu đơn thuốc');
		}
		await prescriptionDocument.render(printWindow, {
			...result.paginationOptions,
			assetVersion: getAssetVersion(doc),
			title: target.title
		});
		return;
	}
	const content = doc.getElementById(target.contentId);
	const html = content?.innerHTML?.trim();
	if (!html) throw new Error(`Không có nội dung ${target.label} để in`);
	await writePrintDocument(printWindow, {
		assetVersion: getAssetVersion(doc),
		html,
		title: target.title
	});
}

function createPrescriptionPrintDocument(options, doc, openWindow) {
	const factory = options.prescriptionPrintDocumentFactory
		|| PrescriptionPrintDocument?.create;
	if (typeof factory !== 'function') {
		throw new Error('Thiếu component in đơn thuốc dùng chung');
	}
	return factory({
		document: doc,
		openWindow,
		buildPrescriptionPreviewHTML
	});
}

function markPrintButtonLoading(button) {
	if (!button) return;
	button.disabled = true;
	button.setAttribute('aria-busy', 'true');
	button.dataset.pdfPreviewState = 'loading';
}

function releasePrintButton(button) {
	if (!button) return;
	button.disabled = false;
	button.removeAttribute('aria-busy');
}

function create(options = {}) {
	const doc = options.document || document;
	const stateStore = options.stateStore;
	const renderers = options.renderers || {};
	const showToast = typeof options.showToast === 'function' ? options.showToast : function () {};
	const defaultOpenWindow = typeof window.open === 'function' ? window.open.bind(window) : null;
	const openWindow = typeof options.openWindow === 'function' ? options.openWindow : defaultOpenWindow;

	if (!stateStore || typeof stateStore.getState !== 'function') {
		throw new Error('Modal history stateStore is required');
	}

	let prescriptionPrintDocument = null;

	function getPrescriptionPrintDocument() {
		if (prescriptionPrintDocument) return prescriptionPrintDocument;
		if (options.prescriptionPrintDocument) {
			prescriptionPrintDocument = options.prescriptionPrintDocument;
			return prescriptionPrintDocument;
		}
		prescriptionPrintDocument = createPrescriptionPrintDocument(options, doc, openWindow);
		return prescriptionPrintDocument;
	}

	async function printTarget(targetId, button) {
		const target = TARGETS[targetId];
		if (!target) return { status: 'unsupportedTarget', targetId };

		let selection;
		let printWindow = null;
		let prescriptionDocument = null;
		try {
			selection = resolveSelection(stateStore);
			if (target.rendererKey === 'prescription') {
				prescriptionDocument = getPrescriptionPrintDocument();
				printWindow = prescriptionDocument.open({ title: target.title });
			} else {
				printWindow = openPrintWindow(target.title, openWindow);
			}
			markPrintButtonLoading(button);

			const result = await renderPrintTarget(renderers, stateStore, target, selection);
			await writeRenderedTarget(doc, target, result, printWindow, prescriptionDocument);
			if (button) button.dataset.pdfPreviewState = 'ready';
			return { status: 'ready', targetId };
		} catch (error) {
			if (button) button.dataset.pdfPreviewState = 'error';
			console.error(`[ModalHistoryPrintController] ${targetId}:`, error);
			if (prescriptionDocument) {
				prescriptionDocument.renderError(printWindow, {
					title: target.title,
					message: `Không thể in ${target.label}`
				});
			} else {
				writePrintError(printWindow, target.title, `Không thể in ${target.label}`);
			}
			showToast('error', `Không thể in ${target.label}. Vui lòng thử lại.`);
			return { status: 'error', targetId, error };
		} finally {
			releasePrintButton(button);
		}
	}

	function bind() {
		const root = doc.getElementById('patientSearchModal') || doc;
		const buttons = Array.from(root.querySelectorAll('.tab-print-btn'));
		buttons.forEach(button => {
			if (button._tabPrintBound) return;
			button.addEventListener('click', event => {
				event.preventDefault();
				const targetId = button.getAttribute('data-print-target');
				if (targetId) void printTarget(targetId, button);
			});
			button._tabPrintBound = true;
			button.dataset.pdfPreviewBound = 'true';
		});
		return buttons;
	}

	return { bind, printTarget };
}

export const ModalHistoryPrintController = Object.freeze({ TARGETS, create });
QLPKDoctorModuleRegistry.register('modalHistoryPrintController', ModalHistoryPrintController);
