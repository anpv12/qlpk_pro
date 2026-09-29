// Shared Prescription Template Helpers
// ============================================
// Dose helpers are legacy global aliases of PrescriptionDoseUtils; the guard pattern keeps classic pages compatible.
// ============================================

if (typeof toNumber === 'undefined') {
	var toNumber = function toNumber(value, fallback) {
		if (fallback === undefined) fallback = 0;
		const num = Number(value);
		return Number.isFinite(num) ? num : fallback;
	};
}

if (typeof buildFullAddressFromParts === 'undefined') {
	var buildFullAddressFromParts = function buildFullAddressFromParts(addressDetail, ward, district, province) {
		const parts = [];
		if (addressDetail && addressDetail.trim()) parts.push(addressDetail.trim());
		if (ward && ward.trim()) parts.push(ward.trim());
		if (district && district.trim()) parts.push(district.trim());
		if (province && province.trim()) parts.push(province.trim());
		return parts.length ? parts.join(', ') : '';
	};
}

if (typeof parseGlobalUsagePayload === 'undefined') {
	var parseGlobalUsagePayload = function parseGlobalUsagePayload(usageStr) {
		if (!usageStr) return { note: '' };
		try {
			if (typeof usageStr === 'object') return usageStr;
			return JSON.parse(usageStr);
		} catch (e) {
			return { note: String(usageStr) };
		}
	};
}

if (typeof isRawPrescriptionIcdValue === 'undefined') {
	var isRawPrescriptionIcdValue = function isRawPrescriptionIcdValue(value) {
		if (value === null || value === undefined || value === '') return false;
		if (Array.isArray(value)) return true;
		if (typeof value === 'number') return true;
		if (typeof value !== 'string') return false;
		const text = value.trim();
		return /^\d+$/.test(text) || /^\[\s*\d+(\s*,\s*\d+)*\s*\]$/.test(text);
	};
}

if (typeof pickPrescriptionDisplayText === 'undefined') {
	var pickPrescriptionDisplayText = function pickPrescriptionDisplayText() {
		for (let i = 0; i < arguments.length; i++) {
			const candidate = arguments[i];
			if (candidate === null || candidate === undefined) continue;
			if (Array.isArray(candidate)) continue;
			let text = '';
			if (typeof candidate === 'object') {
				text = candidate.text || candidate.diagnosis_text || candidate.diagnosis || '';
			} else {
				text = String(candidate);
			}
			text = text.trim();
			if (text && !isRawPrescriptionIcdValue(text)) return text;
		}
		return '';
	};
}

if (typeof buildPrescriptionDocumentViewModel === 'undefined') {
	var buildPrescriptionDocumentViewModel = function buildPrescriptionDocumentViewModel(data) {
		data = data || {};
		const history = { ...(data.history || {}) };
		const examinationDetail = { ...(data.examinationDetail || {}) };
		const prescriptionData = data.prescriptionData || {};
		const appointment = data.appointment || {};

		const diagnosisText = pickPrescriptionDisplayText(
			examinationDetail.diagnosis_text,
			examinationDetail.diagnosis,
			history.diagnosis_text,
			history.diagnosis,
			appointment.examination?.diagnosis,
			prescriptionData.diagnosis
		);
		const benhKemTheoText = pickPrescriptionDisplayText(
			examinationDetail.benh_kem_theo_text,
			examinationDetail.benh_kem_theo,
			history.benh_kem_theo_text,
			history.benh_kem_theo,
			appointment.examination?.benh_kem_theo,
			prescriptionData.benh_kem_theo
		);

		// Use the resolved display text; otherwise blank out raw ICD values.
		function applyDisplayText(field, text) {
			[examinationDetail, history].forEach(target => {
				if (text) target[field] = text;
				else if (isRawPrescriptionIcdValue(target[field])) target[field] = '';
			});
		}
		applyDisplayText('diagnosis', diagnosisText);
		applyDisplayText('benh_kem_theo', benhKemTheoText);

		return {
			...data,
			patient: data.patient || {},
			history,
			examinationDetail,
			examinationDetailsBySection: data.examinationDetailsBySection || {},
			prescriptionData,
			relatives: Array.isArray(data.relatives) ? data.relatives : []
		};
	};
	if (typeof window !== 'undefined') {
		window.buildPrescriptionDocumentViewModel = buildPrescriptionDocumentViewModel;
	}
}

function requirePrescriptionDoseUtils() {
	if (!window.PrescriptionDoseUtils) throw new Error('Thiếu tiện ích liều thuốc dùng chung');
	return window.PrescriptionDoseUtils;
}

if (typeof parseFractionalQuantity === 'undefined') {
	var parseFractionalQuantity = function parseFractionalQuantity(value) {
		return requirePrescriptionDoseUtils().parseDose(value, null);
	};
}

if (typeof formatDoseAsFraction === 'undefined') {
	var formatDoseAsFraction = function formatDoseAsFraction(value) {
		return requirePrescriptionDoseUtils().formatDose(value);
	};
}

if (typeof normalizeScheduleData === 'undefined') {
	var normalizeScheduleData = function normalizeScheduleData(rawSchedule) {
		const doseUtils = requirePrescriptionDoseUtils();
		return doseUtils.normalizeSchedule(rawSchedule, undefined, { defaultMode: doseUtils.USAGE_MODES.TIMES_PER_DAY });
	};
}

if (typeof parseMedicineUsagePayload === 'undefined') {
	var parseMedicineUsagePayload = function parseMedicineUsagePayload(rawUsage) {
		const doseUtils = requirePrescriptionDoseUtils();
		const parsed = doseUtils.parseUsage(rawUsage, undefined, { defaultMode: doseUtils.USAGE_MODES.TIMES_PER_DAY });
		return { note: parsed.note, note_mode: parsed.noteMode, schedule: parsed.schedule };
	};
}

// ============================================

function getClinicInfoConfig() {
	if (!window.clinicInfo || typeof window.clinicInfo !== 'object') {
		throw new Error('Thiếu cấu hình phòng khám');
	}
	return window.clinicInfo;
}

function formatVietnamDate(dateInput) {
	if (!dateInput) return '';
	const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
	if (Number.isNaN(date.getTime())) return '';
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
}

function calculateDetailedAge(birthDateString, referenceDateString) {
	if (!birthDateString) return { text: '', years: null, months: null, days: null };
	const birthDate = new Date(birthDateString);
	if (Number.isNaN(birthDate.getTime())) {
		return { text: '', years: null, months: null, days: null };
	}
	const refDate = referenceDateString ? new Date(referenceDateString) : new Date();
	if (Number.isNaN(refDate.getTime())) {
		return { text: '', years: null, months: null, days: null };
	}

	let years = refDate.getFullYear() - birthDate.getFullYear();
	let months = refDate.getMonth() - birthDate.getMonth();
	let days = refDate.getDate() - birthDate.getDate();

	if (days < 0) {
		months -= 1;
		const prevMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
		days += prevMonth.getDate();
	}
	if (months < 0) {
		years -= 1;
		months += 12;
	}

	const parts = [];
	if (Number.isFinite(years) && years > 0) parts.push(`${years} tuổi`);
	if (Number.isFinite(months) && months > 0) parts.push(`${months} tháng`);
	if (Number.isFinite(days) && days > 0) parts.push(`${days} ngày`);
	const text = parts.length ? parts.join(' ') : '0 ngày';

	return { text, years, months, days };
}

/**
 * Format tuổi cho mẫu in ấn — chỉ hiển thị số năm (ví dụ: "21 tuổi")
 * UI phần mềm vẫn dùng calculateDetailedAge().text để hiển thị đầy đủ
 */

function formatGenderDisplay(value) {
	if (!value) return '';
	const normalized = value.toString().trim().toLowerCase();
	if (['male', 'nam', 'm', 'man'].includes(normalized)) return 'Nam';
	if (['female', 'nu', 'nữ', 'f', 'woman'].includes(normalized)) return 'Nữ';
	if (['other', 'khac', 'khác'].includes(normalized)) return 'Khác';
	return value;
}


/** Pure formatting only: never normalize missing dosage into a clinical default. */
function prescriptionFormEscape(value) {
	return String(value ?? '').replace(/[&<>"']/g, char => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[char]);
}

function readUnitDigit(one, ten, digits) {
	if (one === 1 && ten > 1) return 'mốt';
	if (one === 5 && ten) return 'lăm';
	return digits[one];
}

function prescriptionQuantityWords(value) {
	const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0 || number > 9999999999) return '';
	const integerWords = (number) => {
		if (number === 0) return digits[0];
		const triplet = (number, full) => {
			const hundred = Math.floor(number / 100);
			const ten = Math.floor(number / 10) % 10;
			const one = number % 10;
			const parts = [];
			if (hundred || full) parts.push(digits[hundred], 'trăm');
			if (ten > 1) parts.push(digits[ten], 'mươi');
			else if (ten === 1) parts.push('mười');
			else if (one && (hundred || full)) parts.push('lẻ');
			if (one) parts.push(readUnitDigit(one, ten, digits));
			return parts.join(' ');
		};
		const groups = [];
		let rest = number;
		while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
		return groups.map((group, index) => group
			? triplet(group, index < groups.length - 1 && group < 100) + (['', ' nghìn', ' triệu', ' tỷ'][index])
			: '').reverse().filter(Boolean).join(' ');
	};
	const [integer, decimal] = String(number).split('.');
	return integerWords(Number(integer)) + (decimal ? ' phẩy ' + [...decimal].map(digit => digits[Number(digit)]).join(' ') : '');
}

function prescriptionFormUsage(medicine) {
	let payload = {};
	try {
		payload = typeof medicine.usage === 'object' && medicine.usage !== null
			? medicine.usage : JSON.parse(medicine.usage || '{}');
	} catch (_) { payload = { note: medicine.usage || '' }; }
	if (!payload || typeof payload !== 'object') payload = { note: String(payload ?? '') };
	const note = String(payload.note || '').trim();
	return prescriptionFormEscape(note);
}

function prescriptionMedicineTitle(medicine) {
	const generic = String(medicine.generic_name || '').trim();
	const name = String(medicine.name || '').trim();
	let title = generic && !name.toLowerCase().startsWith(generic.toLowerCase()) ? generic + ' (' + name + ')' : name;
	const strength = String(medicine.strength || '').trim();
	if (!strength) return title;
	const compact = value => value.toLowerCase().replace(/\s+/g, '');
	const literal = compact(strength).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Match the complete strength, never a substring of 110 mg or 10 mg/ml.
	if (new RegExp('(^|[^\\d.,])' + literal + '(?=$|[(),;])').test(compact(title))) return title;
	const amount = strength.match(/^(\d+(?:[.,]\d+)?)\s+\S/);
	if (amount && generic && title.toLowerCase() === (generic + ' ' + amount[1]).toLowerCase()) title = generic;
	return title + ' ' + strength;
}

/** Web presentation only. Shares clinical formatters with the paper form below. */
function rxScreenField(label, english, value) {
	return '<div class="rx-screen__field"><strong>' + label + '</strong>' +
		(english ? ' <em>(' + english + ')</em>' : '') + ': ' + prescriptionFormEscape(value) + '</div>';
}

function buildRxScreenHeaderHtml(clinic, patientCode) {
	const esc = prescriptionFormEscape;
	return '<header class="rx-screen__header"><img class="rx-screen__logo" src="/static/assets/sontam.jpg" alt="Logo phòng khám Sơn Tâm">' +
		'<div class="rx-screen__clinic"><div class="rx-screen__clinic-name">' + esc(clinic.name) + '</div>' +
		'<div>📍 <strong>Địa chỉ:</strong> ' + esc(clinic.address) + '</div>' +
		'<div>📞 <strong>Zalo:</strong> ' + esc(clinic.zalo || clinic.phone) + '</div>' +
		'<div>📧 <strong>Email:</strong> ' + esc(clinic.email) + '</div>' +
		'<div>📘 <strong>Fanpage:</strong> ' + esc(clinic.fanpage) + '</div></div>' +
		(patientCode ? '<div class="rx-screen__code"><svg class="barcode-svg" data-barcode="' + esc(patientCode) +
		'" role="img" aria-label="Mã vạch hồ sơ ' + esc(patientCode) + '"></svg><strong>Mã hồ sơ: ' + esc(patientCode) + '</strong></div>' : '') + '</header>';
}

function buildRxScreenPatientHtml(patient, history, examinationDetail) {
	const field = rxScreenField;
	const age = calculateDetailedAge(patient.date_of_birth, history.examination_date);
	const birth = formatVietnamDate(patient.date_of_birth);
	const address = buildFullAddressFromParts(patient.address_detail, patient.ward, patient.district, patient.province) || patient.address;
	const weight = examinationDetail.weight || history.weight || '';
	return '<section class="rx-screen__patient"><div>' + field('Họ tên', 'Full name', patient.full_name) +
		field('Ngày sinh', 'Date of birth', birth + (birth && age.text ? ' — ' + age.text : '')) +
		field('Số định danh cá nhân (CCCD/CMT/MSA)', '', patient.id_number || patient.id_card || patient.cccd) +
		field('Địa chỉ', 'Address', address) + '</div><div>' + field('Giới tính', 'Gender', formatGenderDisplay(patient.gender)) +
		field('Số điện thoại', 'Phone', patient.phone || patient.phone_number) + field('Cân nặng', 'Weight', weight ? weight + ' kg' : '') +
		field('Mã số bảo hiểm y tế', 'Health insurance', '') + '</div></section>';
}

function buildRxScreenMedicinesHtml(medicines) {
	const esc = prescriptionFormEscape;
	if (!medicines.length) return '<p class="rx-screen__empty"><em>Chưa có thuốc trong đơn.</em></p>';
	return '<ol class="rx-screen__medicines">' + medicines.map(medicine => {
		const quantity = Number(medicine.quantity);
		return '<li><div class="rx-screen__medicine-heading"><strong>' + esc(prescriptionMedicineTitle(medicine)) + '</strong>' +
			'<span>Số lượng: <strong>' + (Number.isFinite(quantity) && quantity > 0 ? esc(String(quantity).replace('.', ',') + ' ' + (medicine.unit || '')) : 'Chưa ghi nhận') + '</strong></span></div>' +
			'<div class="rx-screen__usage">' + (prescriptionFormUsage(medicine) || '<em>Chưa ghi cách dùng.</em>') + '</div></li>';
	}).join('') + '</ol>';
}

function buildRxScreenDateLine(examinationDate) {
	const date = examinationDate ? new Date(examinationDate) : null;
	return date && !Number.isNaN(date.getTime()) ? 'Ngày <em>(Date)</em> ' + date.getDate() +
		' Tháng <em>(Month)</em> ' + (date.getMonth() + 1) + ' Năm <em>(Year)</em> ' + date.getFullYear() : '';
}

function resolvePrescriptionAdvice(examinationDetail, history, prescriptionData) {
	const usage = parseGlobalUsagePayload(prescriptionData.usage_instructions || '') || {};
	return [examinationDetail.loi_dan || history.loi_dan || '', usage.global_usage || usage.globalUsage || usage.note || ''].filter(Boolean);
}

function resolvePrescriptionReExamDate(prescriptionData) {
	return prescriptionData.show_re_examination_date !== false ? formatVietnamDate(prescriptionData.re_examination_date) : '';
}

function buildPrescriptionScreenHTML(options = {}) {
	const { patient, history, examinationDetail, prescriptionData } = buildPrescriptionDocumentViewModel(options);
	const esc = prescriptionFormEscape;
	const field = rxScreenField;
	const type = String(options.overridePrescriptionType || prescriptionData.prescription_type || 'BASIC').toUpperCase();
	const title = type === 'H' || type === 'N' ? 'ĐƠN THUỐC “' + type + '”' : 'ĐƠN THUỐC';
	const medicines = Array.isArray(prescriptionData.medicines) ? prescriptionData.medicines : [];
	const advice = resolvePrescriptionAdvice(examinationDetail, history, prescriptionData);
	const reExamDate = resolvePrescriptionReExamDate(prescriptionData);
	return '<article class="rx-screen" data-prescription-type="' + esc(type) + '">' +
		buildRxScreenHeaderHtml(options.clinicInfo || {}, patient.patient_code) +
		'<div class="rx-screen__title"><h3>' + title + '</h3><em>PRESCRIPTION</em>' +
		(prescriptionData.prescription_code ? '<div class="rx-screen__prescription-code">Mã đơn thuốc: ' + esc(prescriptionData.prescription_code) + '</div>' : '') + '</div>' +
		buildRxScreenPatientHtml(patient, history, examinationDetail) +
		field('Chẩn đoán', 'Diagnosis', [examinationDetail.diagnosis, examinationDetail.benh_kem_theo].filter(Boolean).join('; ')) +
		'<section class="rx-screen__treatment">' + field('Thuốc điều trị', 'Medication', '') + buildRxScreenMedicinesHtml(medicines) + '</section>' +
		(reExamDate ? field('Tái khám ngày', 'Follow-up date', reExamDate) : '') +
		'<section class="rx-screen__advice">' + field('Lời dặn', 'Note', '') + '<div class="rx-screen__advice-text">' + advice.map(esc).join('\n') + '</div></section>' +
		'<p class="rx-screen__notice"><em>Vui lòng mang theo đơn thuốc này khi tái khám! Toa thuốc chỉ có giá trị cho lần khám này.<br>' +
		'(Please bring this prescription to the next appointment. This prescription is valid only for this visit.)</em></p>' +
		'<footer class="rx-screen__signature"><div>' + buildRxScreenDateLine(history.examination_date) + '</div><div>Bác sĩ khám bệnh <em>(Doctor)</em></div><em>Ký tên (Sign)</em>' +
		'<div class="rx-screen__doctor-name">' + esc(history.doctor?.full_name) + '</div></footer></article>';
}

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

function buildMohPatientContext(patient, history, examinationDetail, relatives) {
	const age = calculateDetailedAge(patient.date_of_birth, history.examination_date);
	const months = age.years === null ? null : age.years * 12 + age.months;
	return {
		months,
		under72Months: months !== null && months >= 0 && months < 72,
		birth: formatVietnamDate(patient.date_of_birth),
		gender: formatGenderDisplay(patient.gender),
		weight: examinationDetail.weight || history.weight || '',
		address: buildFullAddressFromParts(patient.address_detail, patient.ward, patient.district, patient.province) || patient.address,
		companions: relatives.map(relative => relative.name || relative.relative_full_name || relative.relative_name || relative.full_name || '').filter(Boolean),
		contactPhone: patient.phone || patient.phone_number || relatives.find(relative => relative.phone)?.phone || ''
	};
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

function resolvePreviewRenderContext(renderContext, isPrint) {
	return renderContext || (isPrint ? 'print' : 'screen');
}

function buildVerificationQrUrl(prescriptionCode, showVerificationQr) {
	return showVerificationQr !== false && prescriptionCode
		? `/api/public/prescription/${encodeURIComponent(prescriptionCode)}/verification-qr.png` : '';
}

function prescriptionMedicineList(prescriptionData) {
	return Array.isArray(prescriptionData.medicines) ? prescriptionData.medicines : [];
}

function buildPrescriptionPreviewHTML({
	clinicInfo, patient, history, examinationDetail, examinationDetailsBySection,
	prescriptionData, relatives = [], overridePrescriptionType = null,
	isPrint = false, renderContext = null, showVerificationQr = true, showSignature = true
}) {
	const data = buildPrescriptionDocumentViewModel({ patient, history, examinationDetail,
		examinationDetailsBySection, prescriptionData, relatives });
	({ patient, history, examinationDetail, examinationDetailsBySection, prescriptionData, relatives } = data);
	const esc = prescriptionFormEscape;
	const clinic = clinicInfo || {};
	const type = resolvePrescriptionFormType(overridePrescriptionType, prescriptionData, examinationDetailsBySection);
	const controlled = type === 'H' || type === 'N';
	const title = controlled ? 'ĐƠN THUỐC “' + type + '”' : 'ĐƠN THUỐC';
	const context = resolvePreviewRenderContext(renderContext, isPrint);
	const prescriptionCode = prescriptionData.prescription_code || '';
	const qr = buildVerificationQrUrl(prescriptionCode, showVerificationQr);
	const ctx = buildMohPatientContext(patient, history, examinationDetail, relatives);
	const rows = buildMohMedicineRows(prescriptionMedicineList(prescriptionData), type);
	const advice = resolvePrescriptionAdvice(examinationDetail, history, prescriptionData);
	const reExamDate = resolvePrescriptionReExamDate(prescriptionData);
	return '<div class="prescription-preview prescription-preview--rx prescription-preview--moh' +
		(context === 'verify' ? ' prescription-preview--verify' : '') + '" data-render-context="' + esc(context) + '" data-prescription-type="' + esc(controlled ? type : 'BASIC') + '">' +
		'<div class="moh-form">' +
		buildMohHeaderHtml(clinic, prescriptionCode, title) +
		buildMohPatientSectionHtml(patient, examinationDetail, ctx) +
		buildMohPeriodsHtml(type) +
		buildMohTreatmentHtml(rows, advice, reExamDate) +
		'<div class="moh-closing">' +
		buildMohSignatureHtml({ showSignature, qr, dateLine: buildMohDateLine(history.examination_date), doctorName: history.doctor?.full_name }) +
		buildMohContactHtml(ctx, controlled) +
		'</div></div></div></div></div>';
}

if (typeof window !== 'undefined') {
	window.getClinicInfoConfig = getClinicInfoConfig;
	window.buildPrescriptionPreviewHTML = buildPrescriptionPreviewHTML;
	window.buildPrescriptionScreenHTML = buildPrescriptionScreenHTML;
	window.QLPKDoctorModuleRegistry?.register?.('prescriptionDocumentTemplate', Object.freeze({
		getClinicInfoConfig,
		buildPrescriptionPreviewHTML,
		buildPrescriptionScreenHTML
	}), {
		owner: 'shared/prescription-document',
		version: 2
	});
}
