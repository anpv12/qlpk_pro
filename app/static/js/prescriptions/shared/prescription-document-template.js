// Shared Prescription Template Helpers
// ============================================
// Self-contained utilities — guard pattern để không conflict với doctor-examination.js
// ============================================

if (typeof PRESCRIPTION_USAGE_MODES === 'undefined') {
	var PRESCRIPTION_USAGE_MODES = { TIMES_PER_DAY: 'times_per_day', TIME_SLOTS: 'time_slots' };
}

if (typeof ensureValidPrescriptionUsageMode === 'undefined') {
	var ensureValidPrescriptionUsageMode = function ensureValidPrescriptionUsageMode(mode) {
		return mode === PRESCRIPTION_USAGE_MODES.TIME_SLOTS
			? PRESCRIPTION_USAGE_MODES.TIME_SLOTS
			: PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY;
	};
}

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

		if (diagnosisText) {
			examinationDetail.diagnosis = diagnosisText;
			history.diagnosis = diagnosisText;
		} else {
			if (isRawPrescriptionIcdValue(examinationDetail.diagnosis)) examinationDetail.diagnosis = '';
			if (isRawPrescriptionIcdValue(history.diagnosis)) history.diagnosis = '';
		}

		if (benhKemTheoText) {
			examinationDetail.benh_kem_theo = benhKemTheoText;
			history.benh_kem_theo = benhKemTheoText;
		} else {
			if (isRawPrescriptionIcdValue(examinationDetail.benh_kem_theo)) examinationDetail.benh_kem_theo = '';
			if (isRawPrescriptionIcdValue(history.benh_kem_theo)) history.benh_kem_theo = '';
		}

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

if (typeof gcd === 'undefined') {
	var gcd = function gcd(a, b) {
		a = Math.abs(a); b = Math.abs(b);
		while (b) { var t = b; b = a % b; a = t; }
		return a;
	};
}

if (typeof decimalToFraction === 'undefined') {
	var decimalToFraction = function decimalToFraction(decimal) {
		if (decimal === 0) return null;
		const tolerance = 0.0001;
		for (let den = 2; den <= 10; den++) {
			const num = Math.round(decimal * den);
			if (num > 0 && Math.abs(num / den - decimal) < tolerance) {
				const d = gcd(num, den);
				return { numerator: num / d, denominator: den / d };
			}
		}
		return null;
	};
}

if (typeof parseFractionalQuantity === 'undefined') {
	var parseFractionalQuantity = function parseFractionalQuantity(value) {
		if (value === null || value === undefined || value === '') return null;
		if (typeof value === 'number') return isNaN(value) ? null : value;
		const str = String(value).trim();
		if (!str) return null;
		if (str.includes('/')) {
			const parts = str.split('/').map(function (p) { return p.trim(); });
			if (parts.length === 2) {
				const num = parseFloat(parts[0]), den = parseFloat(parts[1]);
				if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
			}
			return null;
		}
		const decimal = parseFloat(str.replace(',', '.'));
		return isNaN(decimal) ? null : decimal;
	};
}

if (typeof formatDoseAsFraction === 'undefined') {
	var formatDoseAsFraction = function formatDoseAsFraction(value) {
		if (value === null || value === undefined || value === '') return '0';
		const num = parseFloat(value);
		if (isNaN(num) || num <= 0) return '0';
		if (num === Math.floor(num)) return num.toString();
		if (num < 1) {
			const frac = decimalToFraction(num);
			if (frac) return frac.numerator + '/' + frac.denominator;
		}
		return num.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
	};
}

if (typeof window !== 'undefined' && typeof window.formatDoseAsFraction !== 'function') {
	window.formatDoseAsFraction = formatDoseAsFraction;
}

if (typeof normalizeScheduleData === 'undefined') {
	var normalizeScheduleData = function normalizeScheduleData(rawSchedule) {
		rawSchedule = rawSchedule || {};
		const timesPerDay = rawSchedule.times_per_day || {};
		const timeSlots = rawSchedule.time_slots || {};
		return {
			mode: ensureValidPrescriptionUsageMode(rawSchedule.mode),
			times_per_day: {
				qty_per_time: Math.max(0.001, parseFractionalQuantity(timesPerDay.qty_per_time) || 1),
				times_per_day: Math.max(1, toNumber(timesPerDay.times_per_day, 1))
			},
			time_slots: {
				morning: Math.max(0, toNumber(timeSlots.morning, 0)),
				noon: Math.max(0, toNumber(timeSlots.noon, 0)),
				afternoon: Math.max(0, toNumber(timeSlots.afternoon, 0)),
				evening: Math.max(0, toNumber(timeSlots.evening, 0))
			}
		};
	};
}

if (typeof parseMedicineUsagePayload === 'undefined') {
	var parseMedicineUsagePayload = function parseMedicineUsagePayload(rawUsage) {
		if (typeof rawUsage === 'string') {
			const trimmed = rawUsage.trim();
			if (trimmed.startsWith('{')) {
					try {
						const parsed = JSON.parse(trimmed);
						const note = typeof parsed.note === 'string' ? parsed.note : '';
						return {
							note: note,
							note_mode: parsed.note_mode || parsed.noteMode || '',
							schedule: normalizeScheduleData(parsed.schedule || {})
						};
					} catch (e) {
						return { note: trimmed, note_mode: 'manual', schedule: normalizeScheduleData() };
					}
				}
				return { note: trimmed, note_mode: 'manual', schedule: normalizeScheduleData() };
			}
			return { note: '', note_mode: 'generated', schedule: normalizeScheduleData() };
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
function formatPrintAge(birthDateString, referenceDateString) {
	const detail = calculateDetailedAge(birthDateString, referenceDateString);
	if (detail.years > 0) return `${detail.years} tuổi`;
	if (detail.months > 0) return `${detail.months} tháng`;
	return detail.text;
}

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
			if (one) parts.push(one === 1 && ten > 1 ? 'mốt' : one === 5 && ten ? 'lăm' : digits[one]);
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
function buildPrescriptionScreenHTML(options = {}) {
	const { patient, history, examinationDetail, prescriptionData } = buildPrescriptionDocumentViewModel(options);
	const clinic = options.clinicInfo || {};
	const esc = prescriptionFormEscape;
	const type = String(options.overridePrescriptionType || prescriptionData.prescription_type || 'BASIC').toUpperCase();
	const title = type === 'H' || type === 'N' ? 'ĐƠN THUỐC “' + type + '”' : 'ĐƠN THUỐC';
	const age = calculateDetailedAge(patient.date_of_birth, history.examination_date);
	const birth = formatVietnamDate(patient.date_of_birth);
	const address = buildFullAddressFromParts(patient.address_detail, patient.ward, patient.district, patient.province) || patient.address;
	const weight = examinationDetail.weight || history.weight || '';
	const usage = parseGlobalUsagePayload(prescriptionData.usage_instructions || '') || {};
	const medicines = Array.isArray(prescriptionData.medicines) ? prescriptionData.medicines : [];
	const field = (label, english, value) => '<div class="rx-screen__field"><strong>' + label + '</strong>' +
		(english ? ' <em>(' + english + ')</em>' : '') + ': ' + esc(value) + '</div>';
	const advice = [examinationDetail.loi_dan || history.loi_dan || '', usage.global_usage || usage.globalUsage || usage.note || ''].filter(Boolean);
	const reExamDate = prescriptionData.show_re_examination_date !== false ? formatVietnamDate(prescriptionData.re_examination_date) : '';
	const date = history.examination_date ? new Date(history.examination_date) : null;
	const dateLine = date && !Number.isNaN(date.getTime()) ? 'Ngày <em>(Date)</em> ' + date.getDate() +
		' Tháng <em>(Month)</em> ' + (date.getMonth() + 1) + ' Năm <em>(Year)</em> ' + date.getFullYear() : '';
	return '<article class="rx-screen" data-prescription-type="' + esc(type) + '">' +
		'<header class="rx-screen__header"><img class="rx-screen__logo" src="/static/assets/sontam.jpg" alt="Logo phòng khám Sơn Tâm">' +
		'<div class="rx-screen__clinic"><div class="rx-screen__clinic-name">' + esc(clinic.name) + '</div>' +
		'<div>📍 <strong>Địa chỉ:</strong> ' + esc(clinic.address) + '</div>' +
		'<div>📞 <strong>Zalo:</strong> ' + esc(clinic.zalo || clinic.phone) + '</div>' +
		'<div>📧 <strong>Email:</strong> ' + esc(clinic.email) + '</div>' +
		'<div>📘 <strong>Fanpage:</strong> ' + esc(clinic.fanpage) + '</div></div>' +
		(patient.patient_code ? '<div class="rx-screen__code"><svg class="barcode-svg" data-barcode="' + esc(patient.patient_code) +
		'" role="img" aria-label="Mã vạch hồ sơ ' + esc(patient.patient_code) + '"></svg><strong>Mã hồ sơ: ' + esc(patient.patient_code) + '</strong></div>' : '') + '</header>' +
		'<div class="rx-screen__title"><h3>' + title + '</h3><em>PRESCRIPTION</em>' +
		(prescriptionData.prescription_code ? '<div class="rx-screen__prescription-code">Mã đơn thuốc: ' + esc(prescriptionData.prescription_code) + '</div>' : '') + '</div>' +
		'<section class="rx-screen__patient"><div>' + field('Họ tên', 'Full name', patient.full_name) +
		field('Ngày sinh', 'Date of birth', birth + (birth && age.text ? ' — ' + age.text : '')) +
		field('Số định danh cá nhân (CCCD/CMT/MSA)', '', patient.id_number || patient.id_card || patient.cccd) +
		field('Địa chỉ', 'Address', address) + '</div><div>' + field('Giới tính', 'Gender', formatGenderDisplay(patient.gender)) +
		field('Số điện thoại', 'Phone', patient.phone || patient.phone_number) + field('Cân nặng', 'Weight', weight ? weight + ' kg' : '') +
		field('Mã số bảo hiểm y tế', 'Health insurance', '') + '</div></section>' +
		field('Chẩn đoán', 'Diagnosis', [examinationDetail.diagnosis, examinationDetail.benh_kem_theo].filter(Boolean).join('; ')) +
		'<section class="rx-screen__treatment">' + field('Thuốc điều trị', 'Medication', '') +
		(medicines.length ? '<ol class="rx-screen__medicines">' + medicines.map(medicine => {
			const quantity = Number(medicine.quantity);
			return '<li><div class="rx-screen__medicine-heading"><strong>' + esc(prescriptionMedicineTitle(medicine)) + '</strong>' +
				'<span>Số lượng: <strong>' + (Number.isFinite(quantity) && quantity > 0 ? esc(String(quantity).replace('.', ',') + ' ' + (medicine.unit || '')) : 'Chưa ghi nhận') + '</strong></span></div>' +
				'<div class="rx-screen__usage">' + (prescriptionFormUsage(medicine) || '<em>Chưa ghi cách dùng.</em>') + '</div></li>';
		}).join('') + '</ol>' : '<p class="rx-screen__empty"><em>Chưa có thuốc trong đơn.</em></p>') + '</section>' +
		(reExamDate ? field('Tái khám ngày', 'Follow-up date', reExamDate) : '') +
		'<section class="rx-screen__advice">' + field('Lời dặn', 'Note', '') + '<div class="rx-screen__advice-text">' + advice.map(esc).join('\n') + '</div></section>' +
		'<p class="rx-screen__notice"><em>Vui lòng mang theo đơn thuốc này khi tái khám! Toa thuốc chỉ có giá trị cho lần khám này.<br>' +
		'(Please bring this prescription to the next appointment. This prescription is valid only for this visit.)</em></p>' +
		'<footer class="rx-screen__signature"><div>' + dateLine + '</div><div>Bác sĩ khám bệnh <em>(Doctor)</em></div><em>Ký tên (Sign)</em>' +
		'<div class="rx-screen__doctor-name">' + esc(history.doctor?.full_name) + '</div></footer></article>';
}

/** Paper/verify form; field labels follow the user's Đơn H.docx. */
function buildPrescriptionPreviewHTML({
	clinicInfo, patient, history, examinationDetail, examinationDetailsBySection,
	prescriptionData, relatives = [], overridePrescriptionType = null,
	isPrint = false, renderContext = null, showVerificationQr = true, showSignature = true
}) {
	const data = buildPrescriptionDocumentViewModel({ patient, history, examinationDetail,
		examinationDetailsBySection, prescriptionData, relatives });
	({ patient, history, examinationDetail, examinationDetailsBySection, prescriptionData, relatives } = data);
	const esc = prescriptionFormEscape;
	const field = value => String(value ?? '').trim() ? esc(value) : '<span class="moh-blank" aria-label="Để trống"></span>';
	const line = (label, value, className = '') => '<div class="moh-field-line ' + className + '"><span>' + label +
		'</span><span class="moh-field-value">' + field(value) + '</span></div>';
	const clinic = clinicInfo || {};
	const section = examinationDetailsBySection.don_thuoc || {};
	const examForm = examinationDetailsBySection.bac_si_kham_form_kham || {};
	const type = String(overridePrescriptionType || prescriptionData.prescription_type || prescriptionData.prescriptionType
		|| section.prescription_type || section.prescriptionType || examForm.prescription_type || examForm.prescriptionType || 'BASIC').toUpperCase();
	const controlled = type === 'H' || type === 'N';
	const title = controlled ? 'ĐƠN THUỐC “' + type + '”' : 'ĐƠN THUỐC';
	const context = renderContext || (isPrint ? 'print' : 'screen');
	const prescriptionCode = prescriptionData.prescription_code || '';
	const qr = showVerificationQr !== false && prescriptionCode
		? `/api/public/prescription/${encodeURIComponent(prescriptionCode)}/verification-qr.png` : '';
	const age = calculateDetailedAge(patient.date_of_birth, history.examination_date);
	const months = age.years === null ? null : age.years * 12 + age.months;
	const under72Months = months !== null && months >= 0 && months < 72;
	const birth = formatVietnamDate(patient.date_of_birth);
	const gender = formatGenderDisplay(patient.gender);
	const weight = examinationDetail.weight || history.weight || '';
	const address = buildFullAddressFromParts(patient.address_detail, patient.ward, patient.district, patient.province) || patient.address;
	const companions = relatives.map(relative => relative.name || relative.relative_full_name || relative.relative_name || relative.full_name || '').filter(Boolean);
	const contactPhone = patient.phone || patient.phone_number || relatives.find(relative => relative.phone)?.phone || '';
	const usage = parseGlobalUsagePayload(prescriptionData.usage_instructions || '') || {};
	const medicines = Array.isArray(prescriptionData.medicines) ? prescriptionData.medicines : [];
	const rows = medicines.map((medicine, index) => {
		const title = prescriptionMedicineTitle(medicine);
		const amount = Number(medicine.quantity);
		const quantity = Number.isFinite(amount) && amount > 0
			? (amount < 10 ? '0' : '') + String(amount).replace('.', ',') : '';
		const words = type === 'N' && quantity ? prescriptionQuantityWords(amount) : '';
		return '<div class="moh-medicine">' +
			'<div class="moh-medicine-heading"><strong>' + (index + 1) + '. ' + esc(title) + '</strong>' +
			'<span class="moh-quantity">Số lượng: <strong>' + field(quantity) + ' ' + esc(medicine.unit || '') + '</strong>' +
			(words ? ' <span class="moh-quantity-words">(' + esc(words) + ')</span>' : '') + '</span></div>' +
			'<div class="moh-usage">' + (prescriptionFormUsage(medicine) || 'Cách dùng: ................................') + '</div></div>';
	});
	const reExamDate = prescriptionData.show_re_examination_date !== false
		? formatVietnamDate(prescriptionData.re_examination_date) : '';
	const advice = [examinationDetail.loi_dan || history.loi_dan || '',
		usage.global_usage || usage.globalUsage || usage.note || ''].filter(Boolean);
	const date = history.examination_date ? new Date(history.examination_date) : null;
	const dateLine = date && !Number.isNaN(date.getTime())
		? 'Ngày ' + date.getDate() + ' tháng ' + (date.getMonth() + 1) + ' năm ' + date.getFullYear()
		: 'Ngày ...... tháng ...... năm ........';
	return '<div class="prescription-preview prescription-preview--rx prescription-preview--moh' +
		(context === 'verify' ? ' prescription-preview--verify' : '') + '" data-render-context="' + esc(context) + '" data-prescription-type="' + esc(controlled ? type : 'BASIC') + '">' +
		'<div class="moh-form">' +
		'<div class="moh-code">Mã đơn thuốc: <strong>' + field(prescriptionCode) + '</strong></div>' +
		'<div class="moh-content"><header class="moh-header">' +
		'<div>Tên đơn vị: <strong>' + field(clinic.name) + '</strong></div><div>Địa chỉ: ' + field(clinic.address) + '</div><div>Điện thoại: ' + field(clinic.phone) + '</div>' +
		'<h3 class="moh-title">' + title + '</h3></header>' +
		'<section class="moh-patient">' + line('Họ tên:', patient.full_name, 'moh-patient-name') +
		line('Căn cước công dân:', patient.id_number || patient.id_card || patient.cccd) +
		'<div class="moh-demographics">' + line('Ngày sinh:', birth + (under72Months ? ' (' + months + ' tháng tuổi)' : '')) +
		line('Cân nặng:', weight ? weight + ' kg' : '') +
		'<div>Giới tính: <span class="moh-check">' + (gender === 'Nam' ? '×' : '') + '</span> Nam <span class="moh-check">' + (gender === 'Nữ' ? '×' : '') + '</span> Nữ</div></div>' +
		line('Số thẻ bảo hiểm y tế (nếu có):', '') +
		line('Địa chỉ liên hệ:', address) +
		line('Chẩn đoán:', [examinationDetail.diagnosis, examinationDetail.benh_kem_theo].filter(Boolean).join('; '), 'moh-diagnosis') + '</section>' +
		(type === 'N' ? '<div class="moh-periods">' + [1, 2, 3].map(index => '<div>Đợt ' + index + ': Từ ngày ...../...../.......... đến hết ngày ...../...../..........</div>').join('') + '</div>' : '') +
		(type === 'H' ? '<div class="moh-periods">Đợt.......(từ ngày...../...../20.... đến hết ngày ...../...../ 20....)</div>' : '') +
		'<section class="moh-treatment"><div class="moh-treatment-label">Thuốc điều trị:</div>' + (rows.length ? rows.slice(0, -1).join('') : '<div class="moh-empty">' + field('') + field('') + '</div>') + '</section>' +
		'<div class="moh-ending">' + (rows.at(-1) || '') +
		'<div class="moh-advice"><div class="moh-section-label">Lời dặn:</div>' + (advice.length ? '<div>' + advice.map(esc).join('<br>') + '</div>' : field('')) +
		(reExamDate ? '<div>Tái khám ngày: ' + esc(reExamDate) + '</div>' : '') + '</div>' +
		'<div class="moh-closing">' +
		((showSignature !== false || qr) ? '<div class="moh-signature">' +
			'<div class="moh-qr">' + (qr ? '<img src="' + qr + '" class="moh-qr-image" alt="QR xác thực đơn thuốc" data-required-print-asset="verification-qr" loading="eager" decoding="sync"><div>Xác thực đơn thuốc</div>' : '') + '</div>' +
			'<div class="moh-doctor">' + (showSignature !== false ? '<div>' + dateLine + '</div><strong>Bác sỹ/Y sỹ khám bệnh</strong><div>(Ký, ghi rõ họ tên)</div><div class="moh-doctor-name">' + esc(history.doctor?.full_name || '') + '</div>' : '') + '</div></div>' : '') +
		'<footer class="moh-contact"><div>- Khám lại xin mang theo đơn này.</div>' + line('- Số điện thoại liên hệ:', contactPhone) +
		line('- Tên bố hoặc mẹ của trẻ hoặc người đưa trẻ đến khám bệnh, chữa bệnh:', under72Months ? companions.join(', ') : '', 'moh-companion') + '</footer>' +
		(controlled ? line('Căn cước công dân của người nhận thuốc:', '', 'moh-recipient') : '') +
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
