/* global prescriptionFormEscape, prescriptionFormUsage, prescriptionMedicineTitle, prescriptionQuantityWords */
/* exported buildMohContactHtml, buildMohDateLine, buildMohHeaderHtml, buildMohMedicineRows, buildMohPatientSectionHtml, buildMohPeriodsHtml, buildMohSignatureHtml, buildMohTreatmentHtml, resolvePrescriptionFormType */
// prescription-document-template.js: MOH_BLANK, mohField, mohLine, resolvePrescriptionFormType, buildMohMedicineRows, buildMohDateLine, buildMohHeaderHtml, buildMohPatientSectionHtml, buildMohPeriodsHtml, buildMohSignatureHtml, buildMohTreatmentHtml, buildMohContactHtml (nạp trước prescription-document-template.js, cùng scope trang).

/** Paper/verify form; field labels follow the user's Đơn H.docx. */
const MOH_BLANK = '<span class="moh-blank" aria-label="Để trống"></span>';

function mohField(value) {
	return String(value ?? '').trim() ? prescriptionFormEscape(value) : MOH_BLANK;
}

function mohLine(label, value, className = '') {
	return '<div class="moh-field-line ' + className + '"><span>' + label + '</span><span class="moh-field-value">' + mohField(value) + '</span></div>';
}

function resolvePrescriptionFormType(overridePrescriptionType, prescriptionData, examinationDetailsBySection) {
	const section = examinationDetailsBySection.don_thuoc || {};
	const examForm = examinationDetailsBySection.bac_si_kham_form_kham || {};
	return String(overridePrescriptionType || prescriptionData.prescription_type || prescriptionData.prescriptionType
		|| section.prescription_type || section.prescriptionType || examForm.prescription_type || examForm.prescriptionType || 'BASIC').toUpperCase();
}

function buildMohMedicineRows(medicines, type) {
	const esc = prescriptionFormEscape;
	return medicines.map((medicine, index) => {
		const title = prescriptionMedicineTitle(medicine);
		const amount = Number(medicine.quantity);
		const quantity = Number.isFinite(amount) && amount > 0
			? (amount < 10 ? '0' : '') + String(amount).replace('.', ',') : '';
		const words = type === 'N' && quantity ? prescriptionQuantityWords(amount) : '';
		return '<div class="moh-medicine">' +
			'<div class="moh-medicine-heading"><strong>' + (index + 1) + '. ' + esc(title) + '</strong>' +
			'<span class="moh-quantity">Số lượng: <strong>' + mohField(quantity) + ' ' + esc(medicine.unit || '') + '</strong>' +
			(words ? ' <span class="moh-quantity-words">(' + esc(words) + ')</span>' : '') + '</span></div>' +
			'<div class="moh-usage">' + (prescriptionFormUsage(medicine) || 'Cách dùng: ................................') + '</div></div>';
	});
}

function buildMohDateLine(examinationDate) {
	const date = examinationDate ? new Date(examinationDate) : null;
	return date && !Number.isNaN(date.getTime())
		? 'Ngày ' + date.getDate() + ' tháng ' + (date.getMonth() + 1) + ' năm ' + date.getFullYear()
		: 'Ngày ...... tháng ...... năm ........';
}

function buildMohHeaderHtml(clinic, prescriptionCode, title) {
	return '<div class="moh-code">Mã đơn thuốc: <strong>' + mohField(prescriptionCode) + '</strong></div>' +
		'<div class="moh-content"><header class="moh-header">' +
		'<div>Tên đơn vị: <strong>' + mohField(clinic.name) + '</strong></div><div>Địa chỉ: ' + mohField(clinic.address) + '</div><div>Điện thoại: ' + mohField(clinic.phone) + '</div>' +
		'<h3 class="moh-title">' + title + '</h3></header>';
}

function buildMohPatientSectionHtml(patient, examinationDetail, ctx) {
	return '<section class="moh-patient">' + mohLine('Họ tên:', patient.full_name, 'moh-patient-name') +
		mohLine('Căn cước công dân:', patient.id_number || patient.id_card || patient.cccd) +
		'<div class="moh-demographics">' + mohLine('Ngày sinh:', ctx.birth + (ctx.under72Months ? ' (' + ctx.months + ' tháng tuổi)' : '')) +
		mohLine('Cân nặng:', ctx.weight ? ctx.weight + ' kg' : '') +
		'<div>Giới tính: <span class="moh-check">' + (ctx.gender === 'Nam' ? '×' : '') + '</span> Nam <span class="moh-check">' + (ctx.gender === 'Nữ' ? '×' : '') + '</span> Nữ</div></div>' +
		mohLine('Số thẻ bảo hiểm y tế (nếu có):', '') +
		mohLine('Địa chỉ liên hệ:', ctx.address) +
		mohLine('Chẩn đoán:', [examinationDetail.diagnosis, examinationDetail.benh_kem_theo].filter(Boolean).join('; '), 'moh-diagnosis') + '</section>';
}

function buildMohPeriodsHtml(type) {
	if (type === 'N') return '<div class="moh-periods">' + [1, 2, 3].map(index => '<div>Đợt ' + index + ': Từ ngày ...../...../.......... đến hết ngày ...../...../..........</div>').join('') + '</div>';
	if (type === 'H') return '<div class="moh-periods">Đợt.......(từ ngày...../...../20.... đến hết ngày ...../...../ 20....)</div>';
	return '';
}

function buildMohSignatureHtml({ showSignature, qr, dateLine, doctorName }) {
	if (showSignature === false && !qr) return '';
	const esc = prescriptionFormEscape;
	return '<div class="moh-signature">' +
		'<div class="moh-qr">' + (qr ? '<img src="' + qr + '" class="moh-qr-image" alt="QR xác thực đơn thuốc" data-required-print-asset="verification-qr" loading="eager" decoding="sync"><div>Xác thực đơn thuốc</div>' : '') + '</div>' +
		'<div class="moh-doctor">' + (showSignature !== false ? '<div>' + dateLine + '</div><strong>Bác sỹ/Y sỹ khám bệnh</strong><div>(Ký, ghi rõ họ tên)</div><div class="moh-doctor-name">' + esc(doctorName || '') + '</div>' : '') + '</div></div>';
}

function buildMohTreatmentHtml(rows, advice, reExamDate) {
	const esc = prescriptionFormEscape;
	return '<section class="moh-treatment"><div class="moh-treatment-label">Thuốc điều trị:</div>' + (rows.length ? rows.slice(0, -1).join('') : '<div class="moh-empty">' + mohField('') + mohField('') + '</div>') + '</section>' +
		'<div class="moh-ending">' + (rows.at(-1) || '') +
		'<div class="moh-advice"><div class="moh-section-label">Lời dặn:</div>' + (advice.length ? '<div>' + advice.map(esc).join('<br>') + '</div>' : mohField('')) +
		(reExamDate ? '<div>Tái khám ngày: ' + esc(reExamDate) + '</div>' : '') + '</div>';
}

function buildMohContactHtml(ctx, controlled) {
	return '<footer class="moh-contact"><div>- Khám lại xin mang theo đơn này.</div>' + mohLine('- Số điện thoại liên hệ:', ctx.contactPhone) +
		mohLine('- Tên bố hoặc mẹ của trẻ hoặc người đưa trẻ đến khám bệnh, chữa bệnh:', ctx.under72Months ? ctx.companions.join(', ') : '', 'moh-companion') + '</footer>' +
		(controlled ? mohLine('Căn cước công dân của người nhận thuốc:', '', 'moh-recipient') : '');
}
