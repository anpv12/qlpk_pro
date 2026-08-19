(function (window, document) {
	'use strict';

	const DEFAULT_TITLE = 'In đơn thuốc';

	function escapeHtml(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function normalizePrescriptionType(value) {
		const raw = String(value || 'BASIC').trim().toUpperCase();
		if (raw === 'H' || raw.includes('HƯỚNG')) return 'H';
		if (raw === 'N' || raw.includes('NGHIỆN')) return 'N';
		return 'BASIC';
	}

	function filterMedicines(medicines) {
		return (Array.isArray(medicines) ? medicines : [])
			.filter(medicine => medicine?.category_type === 'DRUG');
	}

	function buildPageOptions(options, prescriptionData, type, medicines, prescriptionCode, totalAmount) {
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
			result.push(buildPageOptions(
				options,
				prescriptionData,
				type,
				medicines,
				prescription.prescription_code || codesByType[type] || prescriptionData.prescription_code,
				prescription.total_amount
			));
			return result;
		}, []);

		if (pages.length) return pages;
		return [buildPageOptions(
			options,
			prescriptionData,
			'BASIC',
			[],
			codesByType.BASIC || prescriptionData.prescription_code,
			prescriptionData.total_amount
		)];
	}

	function buildFlatPageModels(options, prescriptionData, codesByType) {
		const medicinesByType = { BASIC: [], H: [], N: [] };
		filterMedicines(prescriptionData.medicines).forEach(medicine => {
			medicinesByType[normalizePrescriptionType(medicine.prescription_type)].push(medicine);
		});

		const types = Object.keys(medicinesByType).filter(type => medicinesByType[type].length);
		if (!types.length) types.push('BASIC');

		return types.map(type => buildPageOptions(
			options,
			prescriptionData,
			type,
			medicinesByType[type],
			codesByType[type] || prescriptionData.prescription_code,
			prescriptionData.total_amount
		));
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

	function create(options = {}) {
		const hostDocument = options.document || document;
		const hostWindow = hostDocument.defaultView || window;
		const openWindow = typeof options.openWindow === 'function'
			? options.openWindow
			: (typeof window.open === 'function' ? window.open.bind(window) : null);
		const activeDocumentUrls = new WeakMap();

		function getDocumentBaseUrl() {
			const origin = hostDocument.location?.origin || hostWindow.location?.origin;
			return origin && origin !== 'null' ? `${origin}/` : '';
		}

		function createDocumentUrl(html) {
			const UrlApi = hostWindow.URL || window.URL;
			const BlobConstructor = hostWindow.Blob || window.Blob;
			if (!UrlApi || typeof UrlApi.createObjectURL !== 'function' || typeof BlobConstructor !== 'function') {
				throw new Error('Trình duyệt không hỗ trợ tài liệu in tạm thời');
			}
			return UrlApi.createObjectURL(new BlobConstructor([html], { type: 'text/html;charset=utf-8' }));
		}

		function revokeDocumentUrl(printWindow, url) {
			const UrlApi = hostWindow.URL || window.URL;
			if (!UrlApi || typeof UrlApi.revokeObjectURL !== 'function') return;
			if (activeDocumentUrls.get(printWindow) === url) activeDocumentUrls.delete(printWindow);
			UrlApi.revokeObjectURL(url);
		}

		function navigateDocument(printWindow, html) {
			if (!printWindow || printWindow.closed) {
				throw new Error('Cửa sổ in đơn thuốc không còn khả dụng');
			}
			const url = createDocumentUrl(html);
			const previousUrl = activeDocumentUrls.get(printWindow);
			activeDocumentUrls.set(printWindow, url);
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
					hostWindow.setTimeout(() => revokeDocumentUrl(printWindow, previousUrl), 60000);
				}
			}
			return printWindow;
		}

		function resolvePreviewBuilder(input = {}) {
			const builder = input.buildPrescriptionPreviewHTML
				|| options.buildPrescriptionPreviewHTML
				|| window.buildPrescriptionPreviewHTML;
			if (typeof builder !== 'function') {
				throw new Error('Thiếu mẫu tài liệu đơn thuốc dùng chung');
			}
			return builder;
		}

		function buildPagesHtml(input = {}) {
			const buildPreview = resolvePreviewBuilder(input);
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
			if (typeof openWindow !== 'function') {
				throw new Error('Trình duyệt không hỗ trợ cửa sổ in');
			}
			const printWindow = openWindow('', '_blank', 'width=900,height=700');
			if (!printWindow) throw new Error('Trình duyệt đã chặn cửa sổ in');
			return navigateDocument(printWindow, buildLoadingDocument(title));
		}

		function buildDocument(input = {}) {
			const title = input.title || DEFAULT_TITLE;
			const version = input.assetVersion || getAssetVersion(hostDocument);
			const typographyUrl = buildAssetUrl('/static/css/shared/typography.css', version);
			const colorTokensUrl = buildAssetUrl('/static/css/shared/color-tokens.css', version);
			const printStylesUrl = buildAssetUrl('/static/css/prescriptions/components/prescription-print-document.css', version);
			const pagesHtml = buildPagesHtml(input);
			const documentBaseUrl = getDocumentBaseUrl();

			return `<!DOCTYPE html>
				<html lang="vi">
				<head>
					<meta charset="utf-8">
					${documentBaseUrl ? `<base href="${escapeHtml(documentBaseUrl)}">` : ''}
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<title>${escapeHtml(title)}</title>
					<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
					<link rel="stylesheet" href="${escapeHtml(typographyUrl)}">
					<link rel="stylesheet" href="${escapeHtml(colorTokensUrl)}">
					<link rel="stylesheet" href="${escapeHtml(printStylesUrl)}">
					<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
				</head>
				<body class="prescription-print-document">
					<main class="prescription-print-document__pages">${pagesHtml}</main>
					<script>
						(function () {
							var CODE128_PATTERNS = [
								'212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
								'221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
								'221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
								'212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
								'231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
								'231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
								'314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
								'112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
								'111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
								'214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
								'114131', '311141', '411131', '211412', '211214', '211232', '2331112'
							];

							function renderFallbackCode128(svg, code) {
								var text = String(code || '');
								var values = [];
								for (var index = 0; index < text.length; index += 1) {
									var value = text.charCodeAt(index) - 32;
									if (value < 0 || value > 95) return false;
									values.push(value);
								}

								var checksum = 104;
								values.forEach(function (value, index) {
									checksum += value * (index + 1);
								});
								var pattern = CODE128_PATTERNS[104] + values.map(function (value) {
									return CODE128_PATTERNS[value];
								}).join('') + CODE128_PATTERNS[checksum % 103] + CODE128_PATTERNS[106];
								var totalModules = pattern.split('').reduce(function (total, width) {
									return total + Number(width);
								}, 0);
								var namespace = 'http://www.w3.org/2000/svg';
								var cursor = 0;
								var black = true;
								svg.replaceChildren();
								svg.setAttribute('viewBox', '0 0 ' + totalModules + ' 35');
								svg.setAttribute('preserveAspectRatio', 'none');
								pattern.split('').forEach(function (widthText) {
									var width = Number(widthText);
									if (black) {
										var rect = document.createElementNS(namespace, 'rect');
										rect.setAttribute('x', cursor);
										rect.setAttribute('y', 0);
										rect.setAttribute('width', width);
										rect.setAttribute('height', 35);
										rect.setAttribute('fill', '#000');
										svg.appendChild(rect);
									}
									cursor += width;
									black = !black;
								});
								return true;
							}

							function renderBarcodes() {
								document.querySelectorAll('.barcode-svg').forEach(function (svg) {
									var code = svg.dataset.barcode || (svg.id && svg.id.indexOf('barcode-') === 0 ? svg.id.slice(8) : '');
									if (!code) return;
									if (typeof window.JsBarcode !== 'function') {
										renderFallbackCode128(svg, code);
										return;
									}
									try {
										window.JsBarcode(svg, code, {
											format: 'CODE128', width: 1.5, height: 35, displayValue: false, margin: 0
										});
									} catch (error) {
										console.error('Không tạo được barcode cho đơn thuốc:', error);
									}
								});
							}

							function waitForImage(image) {
								if (image.complete) return Promise.resolve(image);

								return new Promise(function (resolve) {
									var timeoutId = window.setTimeout(finish, 10000);

									function finish() {
										window.clearTimeout(timeoutId);
										image.removeEventListener('load', finish);
										image.removeEventListener('error', finish);
										resolve(image);
									}

									image.addEventListener('load', finish, { once: true });
									image.addEventListener('error', finish, { once: true });
								});
							}

							function waitForImages() {
								return Promise.all(Array.from(document.images).map(waitForImage)).then(function (images) {
									var missingRequiredAssets = images.filter(function (image) {
										return image.dataset.requiredPrintAsset && image.naturalWidth <= 0;
									});

									if (missingRequiredAssets.length) {
										var error = new Error('Không thể tải mã QR xác thực của đơn thuốc.');
										error.missingAssets = missingRequiredAssets.map(function (image) {
											return image.dataset.requiredPrintAsset;
										});
										throw error;
									}

									return images;
								});
							}

							function showPrintAssetError(error) {
								var message = 'Không thể in đơn thuốc vì mã QR xác thực chưa tải được. Vui lòng đóng cửa sổ này và thử lại.';
								var banner = document.createElement('div');
								banner.className = 'prescription-print-document__asset-error';
								banner.setAttribute('role', 'alert');
								banner.textContent = message;
								document.body.dataset.printReady = 'error';
								document.body.dataset.printError = error && error.missingAssets
									? error.missingAssets.join(',')
									: 'print-assets';
								document.body.insertBefore(banner, document.body.firstChild);
								console.error(message, error);
							}

							window.addEventListener('afterprint', function () {
								window.setTimeout(function () { window.close(); }, 100);
							}, { once: true });

							window.addEventListener('load', function () {
								renderBarcodes();
								var fontsReady = document.fonts && document.fonts.ready
									? document.fonts.ready.catch(function () {})
									: Promise.resolve();
								Promise.all([fontsReady, waitForImages()]).then(function () {
									document.body.dataset.printReady = 'true';
									window.focus();
									window.setTimeout(function () { window.print(); }, 100);
								}).catch(showPrintAssetError);
							}, { once: true });
						})();
					</script>
				</body>
				</html>`;
		}

		function render(printWindow, input = {}) {
			if (!printWindow || printWindow.closed) {
				throw new Error('Cửa sổ in đơn thuốc không còn khả dụng');
			}
			return navigateDocument(printWindow, buildDocument(input));
		}

		function renderError(printWindow, input = {}) {
			if (!printWindow || printWindow.closed) return;
			const title = input.title || DEFAULT_TITLE;
			const message = input.message || 'Không thể chuẩn bị đơn thuốc';
			navigateDocument(printWindow, `<!DOCTYPE html>
				<html lang="vi">
				<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
				<body><h1>Không thể chuẩn bị đơn thuốc</h1><p>${escapeHtml(message)}</p></body>
				</html>`);
		}

		return {
			buildDocument,
			buildPageModels,
			buildPagesHtml,
			open,
			render,
			renderError
		};
	}

	window.PrescriptionPrintDocument = Object.freeze({
		buildPageModels,
		create,
		normalizePrescriptionType
	});
})(window, document);
