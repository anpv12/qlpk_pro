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


/** Render the backend-owned prescription data as the shared document. */
function buildPrescriptionPreviewHTML({
	clinicInfo,
	patient,
	history,
	examinationDetail,
	examinationDetailsBySection,
	prescriptionData,
	relatives = [],
	overridePrescriptionType = null,
	isPrint = false,
	renderContext = null,
	showVerificationQr = true,
	showSignature = true
}) {
	const documentViewModel = buildPrescriptionDocumentViewModel({
		patient,
		history,
		examinationDetail,
		examinationDetailsBySection,
		prescriptionData,
		relatives
	});
	patient = documentViewModel.patient;
	history = documentViewModel.history;
	examinationDetail = documentViewModel.examinationDetail;
	examinationDetailsBySection = documentViewModel.examinationDetailsBySection;
	prescriptionData = documentViewModel.prescriptionData;
	relatives = documentViewModel.relatives;

	const examinationDate = history?.examination_date ? new Date(history.examination_date) : new Date();
	const examinationDateText = formatVietnamDate(examinationDate);
	// Format ngày cho phần chữ ký: "Ngày 14 tháng 12 năm 2025"
	const signatureDateText = examinationDate ? (() => {
		const day = examinationDate.getDate();
		const month = examinationDate.getMonth() + 1;
		const year = examinationDate.getFullYear();
		return `Ngày ${day} tháng ${month} năm ${year}`;
	})() : '';
	// Dòng ngày ký: hiển thị ngày thực tế dạng song ngữ nếu có examination_date, ngược lại dạng blank form
	const signatureDateLine = history?.examination_date
		? (() => {
			const d = examinationDate.getDate();
			const m = examinationDate.getMonth() + 1;
			const y = examinationDate.getFullYear();
			return `<span class="rx-nowrap">Ngày <em>(Date)</em> ${d} Tháng <em>(Month)</em> ${m} Năm <em>(Year)</em> ${y}</span>`;
		})()
		: `<span class="rx-nowrap">Ngày <em>(Date)</em> ...... Tháng <em>(Month)</em> ..... Năm <em>(Year)</em> 20...</span>`;
	const doctorName = history?.doctor?.full_name || '';
	const effectiveRenderContext = renderContext || (isPrint ? 'print' : 'screen');
	const isVerifyContext = effectiveRenderContext === 'verify';
	const previewContextClass = isVerifyContext ? ' prescription-preview--verify' : '';

	// Tính tuổi tại thời điểm khám để check điều kiện dưới 18 tuổi
	const detailAge = calculateDetailedAge(patient.date_of_birth, history?.examination_date);
	const isUnder18 = detailAge.years !== null && detailAge.years < 18;

	// Lấy thông tin người đi cùng đầu tiên (nếu có)
	const relativeInfo = (() => {
		if (Array.isArray(relatives) && relatives.length > 0) {
			const rel = relatives[0];
			const name = rel.name || rel.relative_full_name || rel.relative_name || rel.full_name || '';
			const phone = rel.phone || '';
			const idNumber = rel.id_number || '';
			const kinship = rel.kinship || '';
			return { name, phone, idNumber, kinship };
		}
		return null;
	})();
	// Lấy chẩn đoán: lấy trực tiếp từ examinationDetail.diagnosis (bảng examinations, field diagnosis)
	const diagnosisText = examinationDetail?.diagnosis || '';
	// Xây dựng địa chỉ từ các phần riêng lẻ, nếu không có thì dùng address đầy đủ
	let patientAddress = buildFullAddressFromParts(
		patient.address_detail,
		patient.ward,
		patient.district,
		patient.province
	);
	// Fallback: nếu không có địa chỉ từ các phần riêng lẻ, dùng address đầy đủ
	if (!patientAddress && patient.address) {
		patientAddress = patient.address;
	}
	const patientPhone = patient.phone || patient.phone_number || '';
	const ageDetail = isPrint ? formatPrintAge(patient.date_of_birth, history?.examination_date) : calculateDetailedAge(patient.date_of_birth, history?.examination_date).text;
	// Lấy giới tính: lấy trực tiếp từ patient.gender (bảng patients, field gender - đã được fetch từ API /api/patients/{id})
	const genderDisplay = formatGenderDisplay(patient?.gender || '');

	const medicineRows = [];
	const medicines = Array.isArray(prescriptionData?.medicines) ? prescriptionData?.medicines : [];

	// Kiểm tra xem có thuốc hợp lệ không (có tên và quantity > 0)
	const hasValidMedicines = medicines.some(medicine => {
		const name = (medicine.name || '').trim();
		const quantity = parseFloat(medicine.quantity) || 0;
		return name && quantity > 0;
	});

	medicines.forEach((medicine, index) => {
		// Tên thuốc + hàm lượng + tên gốc
		const medicineName = medicine.name || '';
		const genericName = medicine.generic_name || '';
		const strength = medicine.strength || '';
		const unit = medicine.unit || '';

		let medicineTitle = medicineName;
		if (strength) medicineTitle += ` ${strength}`;
		if (genericName) medicineTitle += ` (${genericName})`;

		const quantity = medicine.quantity || 0;
		const quantityDisplay = quantity || '';

		// Parse usage payload để lấy schedule và note
		const usagePayload = parseMedicineUsagePayload(medicine.usage || '');
		const schedule = usagePayload.schedule || {};
		const rawNote = (usagePayload.note || '').replace(/^[ \t\uFEFF\xA0]+|[ \t\uFEFF\xA0]+$/gm, '');

		// Dòng 2: Các buổi có giá trị — dynamic, note hiện 1 lần ở cuối
		let scheduleHtml = '';
		const slotDefs = [
			{ key: 'morning', label: 'Sáng', en: 'Morning' },
			{ key: 'noon', label: 'Trưa', en: 'Noon' },
			{ key: 'afternoon', label: 'Chiều', en: 'Afternoon' },
			{ key: 'evening', label: 'Tối', en: 'Night' }
		];
		if (schedule.mode === 'time_slots') {
			const slots = schedule.time_slots || {};
			const slotParts = slotDefs
				.filter(slot => toNumber(slots[slot.key], 0) > 0)
				.map(slot => {
					const val = toNumber(slots[slot.key], 0);
					return `<strong>${slot.label} <em>(${slot.en})</em>:</strong> ${formatDoseAsFraction(val)} ${unit}`;
				});
			if (slotParts.length) {
				const noteText = rawNote ? ` <em>(${rawNote.replace(/\n/g, ', ')})</em>` : '';
				scheduleHtml = `<div class="rx-schedule-line">${slotParts.join('&emsp;&emsp;')}${noteText}</div>`;
			}
		} else if (schedule.mode === 'times_per_day' && schedule.times_per_day) {
			const qtyPerTime = toNumber(schedule.times_per_day.qty_per_time, 0);
			const timesPerDay = toNumber(schedule.times_per_day.times_per_day, 0);
			const parts = [];
			if (qtyPerTime > 0) parts.push(`<strong>SL/lần <em>(Per dose)</em>:</strong> ${formatDoseAsFraction(qtyPerTime)} ${unit}`);
			if (timesPerDay > 0) parts.push(`<strong>Số lần/ngày <em>(Times/day)</em>:</strong> ${timesPerDay}`);
			if (parts.length) {
				const noteText = rawNote ? ` <em>(${rawNote.replace(/\n/g, ', ')})</em>` : '';
				scheduleHtml = `<div class="rx-schedule-line">${parts.join('&emsp;&emsp;')}${noteText}</div>`;
			}
		}

		// Dòng 3: rawNote đã hiện trong schedule, không cần render riêng
		const noteHtml = '';

		medicineRows.push(`
            <div class="rx-med-item">
                <div class="rx-med-row">
                    <div class="rx-col-drug"><strong>${index + 1}. Tên thuốc <em>(Drug)</em>:</strong> ${medicineTitle}</div>
                    <div class="rx-col-dosage"><strong>Số lượng <em>(Dosage)</em>:</strong> ${quantityDisplay} ${unit}</div>
                </div>
                ${scheduleHtml}
                ${noteHtml}
            </div>
        `);
	});

	const medicinesTable = medicineRows.length ? `
        <div class="prescription-medicine-list">
            ${medicineRows.join('')}
        </div>
    ` : `
        <div class="text-muted fst-italic">Chưa có thuốc trong đơn.</div>
    `;

	const usageInfo = parseGlobalUsagePayload(prescriptionData?.usage_instructions || '');
	const hasReExamDate = Boolean(prescriptionData?.re_examination_date);
	const reExamDate = hasReExamDate
		? formatVietnamDate(prescriptionData?.re_examination_date)
		: '';

	const clinic = clinicInfo || {};
	const todayText = formatVietnamDate(new Date());

	// Sinh hiệu thuộc lượt khám, không đọc từ section legacy.
	const details = examinationDetailsBySection || {};

	const getFieldValue = (section, fieldName, defaultValue = '') => {
		return section[fieldName] || defaultValue;
	};

	const weight = examinationDetail?.weight || history?.weight || '';
	const height = examinationDetail?.height || history?.height || '';
	const bmi = examinationDetail?.bmi || history?.bmi || '';
	const pulse = examinationDetail?.pulse || history?.pulse || '';
	const bloodPressure = examinationDetail?.blood_pressure || history?.blood_pressure || '';
	const temperature = examinationDetail?.temperature || history?.temperature || '';
	const breathing = examinationDetail?.breathing || history?.breathing || '';

	// Format hiển thị
	const weightDisplay = weight && weight !== '0' && weight !== 0 ? `${weight} kg` : '';
	const heightDisplay = height && height !== '0' && height !== 0 ? `${height} cm` : '';
	const bmiDisplay = bmi && bmi !== '0' && bmi !== 0 ? bmi : '';
	const pulseDisplay = pulse && pulse !== '0' && pulse !== 0 ? `${pulse} lần/phút` : '';
	const bloodPressureDisplay = bloodPressure || '';
	const temperatureDisplay = temperature && temperature !== '0' && temperature !== 0 ? `${temperature}°C` : '';
	const breathingDisplay = breathing && breathing !== '0' && breathing !== 0 ? `${breathing} lần/phút` : '';

	// Lấy số định danh
	const patientIdNumber = patient.id_number || patient.id_card || patient.cccd || '';

	const openingHours = clinic.opening_hours || clinic.openingHours || clinic.hours || '';

	const prescription = details.don_thuoc || {};
	const examForm = details.bac_si_kham_form_kham || {};
	const loiDan = examinationDetail?.loi_dan || history?.loi_dan || '';

	// Ưu tiên lấy từ tham số overridePrescriptionType trước, sau đó mới đến các nguồn khác
	const prescriptionType = overridePrescriptionType
		|| getFieldValue(prescription, 'prescriptionType', '')
		|| getFieldValue(prescription, 'prescription_type', '')
		|| getFieldValue(examForm, 'prescriptionType', '')
		|| getFieldValue(examForm, 'prescription_type', '')
		|| (prescriptionData?.prescriptionType || '')
		|| (prescriptionData?.prescription_type || '')
		|| (prescriptionData?.type || '')
		|| '';

	// Xác định title dựa trên loại đơn thuốc
	let prescriptionTitle = 'ĐƠN THUỐC'; // Mặc định
	let prescriptionTypeDisplay = '';

	// Normalize prescriptionType để so sánh
	const normalizedType = prescriptionType.toString().trim().toLowerCase();

	if (normalizedType === 'co_ban' || normalizedType === 'cơ bản' || normalizedType === 'co ban' || normalizedType === 'basic') {
		prescriptionTitle = 'ĐƠN THUỐC';
		prescriptionTypeDisplay = 'Cơ bản';
	} else if (normalizedType === 'h') {
		prescriptionTitle = 'ĐƠN THUỐC "H"';
		prescriptionTypeDisplay = 'Đơn thuốc &quot;H&quot;';
	} else if (normalizedType === 'n') {
		prescriptionTitle = 'ĐƠN THUỐC "N"';
		prescriptionTypeDisplay = 'Đơn thuốc &quot;N&quot;';
	} else if (prescriptionType) {
		// Nếu có loại nhưng không khớp, giữ nguyên title mặc định và hiển thị loại
		prescriptionTypeDisplay = prescriptionType;
	}

	// Lấy mã đơn thuốc từ backend (từ prescriptionData.prescription_code)
	// Nếu có mã trong database thì luôn hiển thị, không phụ thuộc vào hasValidMedicines
	// Vì có thể đơn thuốc đã có mã từ trước nhưng hiện tại không có thuốc (đã xóa)
	let prescriptionCode = prescriptionData?.prescription_code || null;
	const shouldShowVerificationQr = showVerificationQr !== false && Boolean(prescriptionCode);
	const verificationQrSource = shouldShowVerificationQr
		? `/api/public/prescription/${encodeURIComponent(prescriptionCode)}/verification-qr.png`
		: '';
	const shouldShowSignature = showSignature !== false;

	if (!prescriptionData) {
		console.warn('buildPrescriptionPreviewHTML - prescriptionData is null or undefined');
	}

	// Format số điện thoại với khoảng trắng (0938 549 609)
	const formatPhoneWithSpaces = (phone) => {
		if (!phone) return '';
		const cleaned = phone.replace(/\D/g, ''); // Chỉ lấy số
		if (cleaned.length === 10) {
			return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
		}
		return phone;
	};

	// Format Zalo với khoảng trắng
	const formattedZalo = clinic.zalo || formatPhoneWithSpaces(clinic.phone || '');
	const clinicEmail = clinic.email || '';
	const clinicFanpage = clinic.fanpage || clinic.facebook || '';

	const signatureSectionHtml = (shouldShowVerificationQr || shouldShowSignature) ? `
		<table class="rx-signature-table">
			<tr>
				<td class="rx-signature-qr-cell">
					${shouldShowVerificationQr ? `
					<div class="rx-inline-center">
						<img src="${verificationQrSource}" class="rx-verify-qr-image" alt="QR xác thực đơn thuốc" data-required-print-asset="verification-qr" loading="eager" decoding="sync">
						<div class="rx-verify-qr-caption">Quét để xác thực<br><em>(Scan to verify)</em></div>
					</div>
					` : ''}
				</td>
				<td class="rx-signature-doctor-cell">
					${shouldShowSignature ? `
					<div class="rx-inline-center">
						<div>${signatureDateLine}</div>
						<div class="rx-signature-role">Bác sĩ khám bệnh <em class="rx-signature-doctor-label">(Doctor)</em></div>
						<div class="rx-signature-sign-label"><em>Ký tên (Sign)</em></div>
						<div class="rx-signature-doctor-name">${doctorName}</div>
					</div>
					` : ''}
				</td>
			</tr>
		</table>
	` : '';

	return `
        <div class="prescription-preview prescription-preview--rx${previewContextClass}" data-render-context="${effectiveRenderContext}">
            <!-- Header: Logo bên trái, thông tin phòng khám ở giữa, mã đơn thuốc + barcode bên phải -->
            <div class="prescription-preview__header prescription-preview__header--clinic">
                <!-- Bên trái: Logo -->
                <div class="clinic-logo">
                    <img src="/static/assets/sontam.jpg" alt="Logo phòng khám" class="clinic-logo__image">
                </div>
                
                <!-- Ở giữa: Thông tin phòng khám -->
                <div class="clinic-info">
                    <div class="clinic-name-row">
                        <div class="clinic-name">
                            ${clinic.name || ''}
                        </div>
                    </div>
                    <div class="clinic-details">
                        <div class="clinic-detail-line">
                            📍 <strong>Địa chỉ:</strong> ${clinic.address || ''}
                        </div>
                        <div class="clinic-detail-line">
                            📞 <strong>Zalo:</strong> ${formattedZalo}
                        </div>
                        <div class="clinic-detail-line">
                            📧 <strong>Email:</strong> ${clinicEmail}
                        </div>
                        <div class="clinic-detail-line">
                            📘 <strong>Fanpage:</strong> ${clinicFanpage}
                        </div>
                    </div>
                </div>
                
                <!-- Bên phải: Mã đơn thuốc, Barcode và mã bệnh nhân -->
                <div class="prescription-code-section">
                    ${prescriptionCode ? `
                    <div class="prescription-code-badge prescription-code-badge--rx">
                        Mã đơn thuốc: <strong>${prescriptionCode}</strong>
                    </div>
                    ` : ''}
                    ${patient?.patient_code ? `
                    <svg id="barcode-${patient.patient_code}" class="barcode-svg barcode-svg--patient"></svg>
                    <span class="patient-code patient-code--rx">Mã hồ sơ: ${patient.patient_code}</span>
                    ` : ''}
                </div>
            </div>
            
            <!-- Separator -->
            <div class="prescription-gradient-separator"></div>
            
            <!-- Tiêu đề -->
            <div class="prescription-title-section">
                <h3 class="prescription-preview__title prescription-preview__title--rx">
                    ${prescriptionTitle}
                </h3>
                <div class="prescription-title-en">PRESCRIPTION</div>
                ${normalizedType === 'h' || normalizedType === 'n' ? `
                <div class="prescription-period-line">
                    Đợt: ............. (từ ngày ..... / ..... / 20..... đến hết ngày ..... / ..... / 20.....)
                </div>
                ` : ''}
            </div>
            <div class="rx-section rx-section--patient">
                <div class="rx-patient-grid">
                    <div class="rx-col-left">
                        <div class="rx-line"><strong>Họ tên <em class="rx-em-normal">(Full name)</em>:</strong> ${patient.full_name || ''}</div>
                        <div class="rx-line"><strong>Ngày sinh <em class="rx-em-normal">(Date of birth)</em>:</strong> ${patient.date_of_birth ? `${formatVietnamDate(patient.date_of_birth)} — ${ageDetail}` : ''}</div>
                        <div class="rx-line"><strong>Số định danh cá nhân (CCCD/CMT/VISA):</strong> ${patientIdNumber || ''}</div>
                        <div class="rx-line"><strong>Địa chỉ <em class="rx-em-normal">(Address)</em>:</strong> ${patientAddress}</div>
                    </div>
                    <div class="rx-col-right">
                        <div class="rx-line"><strong>Giới tính <em class="rx-em-normal">(Gender)</em>:</strong> ${genderDisplay}</div>
                        <div class="rx-line"><strong>Số điện thoại <em class="rx-em-normal">(Phone)</em>:</strong> ${patientPhone || ''}</div>
                        <div class="rx-line"><strong>Cân nặng <em class="rx-em-normal">(Weight)</em>:</strong> ${weightDisplay || ''}</div>
                        <div class="rx-line"><strong>Mã số bảo hiểm y tế <em class="rx-em-normal">(Health insurance)</em>:</strong></div>
                    </div>
                </div>

                <div class="rx-line"><strong>Chẩn đoán <em class="rx-em-normal">(Diagnosis)</em>:</strong> ${diagnosisText}</div>
            </div>
            <div class="rx-section rx-section--medication">
                <div class="rx-line"><strong>Thuốc điều trị <em class="rx-em-normal">(Medication)</em>:</strong></div>
                ${medicinesTable}
                ${reExamDate ? `<div class="rx-reexam-line"><strong>Tái khám ngày <em class="rx-em-normal">(Follow-up date)</em>:</strong> ${reExamDate}</div>` : ''}
                <div class="rx-note-block">
                    <strong>Lời dặn <em class="rx-em-normal">(Note)</em>:</strong>
                    <div class="rx-note-text">${(loiDan || '').replace(/\n/g, '<br>')}</div>
                </div>
                <div class="rx-warning-vi"><em>- Vui lòng mang theo đơn thuốc này khi tái khám! Toa thuốc chỉ có giá trị cho lần khám bệnh này.</em></div>
                <div class="rx-warning-en"><em>(Please bring this prescription to the next appointment. This prescription is valid for this visit only.)</em></div>
                ${(normalizedType === 'h' || normalizedType === 'n') && !isUnder18 ? (() => {
			// Format danh sách người đi cùng: "Họ và Tên (CCCD: số)"
			const relativesList = Array.isArray(relatives) && relatives.length > 0
				? relatives
					.map(rel => {
						const name = rel.name || rel.relative_full_name || rel.relative_name || rel.full_name || '';
						const idNumber = rel.id_number || '';
						// Chỉ hiển thị nếu có cả tên và CCCD
						if (name && idNumber) {
							return `${name} (CCCD: ${idNumber})`;
						}
						return null;
					})
					.filter(item => item !== null)
					.join(', ')
				: '';
			return relativesList ? `<div class="rx-recipient-id-line"><em>- Số định danh cá nhân/số căn cước công dân/số căn cước/số hộ chiếu của người nhận thuốc: ${relativesList}</em></div>` : '';
		})() : ''}
            </div>
            ${signatureSectionHtml}
            
            ${(normalizedType === 'h' || normalizedType === 'n') && isUnder18 ? (() => {
			const phoneVal = relativeInfo?.phone ? relativeInfo.phone : '.......................................................................................................';
			let nameVal = '';
			if (relativeInfo?.name) {
				nameVal = relativeInfo.name;
				if (relativeInfo.kinship) {
					nameVal += ` (${relativeInfo.kinship})`;
				}
			} else {
				nameVal = '.......................................................................................................';
			}
			const idVal = relativeInfo?.idNumber ? relativeInfo.idNumber : '.......................................................................................................';

			return `
                <div class="prescription-under18-info">
                    <div>- Số điện thoại liên hệ <em>(Contact phone number)</em>: ${phoneVal}</div>
                    <div>- Tên bố hoặc mẹ của trẻ hoặc người đưa trẻ đến khám bệnh, chữa bệnh <em>(Parent/guardian's name)</em>: ${nameVal}</div>
                    <div>- Căn cước công dân/chứng minh nhân dân của người nhận thuốc <em>(ID card/passport of medicine recipient)</em>: ${idVal}</div>
                </div>
                `;
		})() : ''}
        </div>
	`;
}

if (typeof window !== 'undefined') {
	window.getClinicInfoConfig = getClinicInfoConfig;
	window.buildPrescriptionPreviewHTML = buildPrescriptionPreviewHTML;
	window.QLPKDoctorModuleRegistry?.register?.('prescriptionDocumentTemplate', Object.freeze({
		getClinicInfoConfig,
		buildPrescriptionPreviewHTML
	}), {
		owner: 'shared/prescription-document',
		version: 2
	});
}
