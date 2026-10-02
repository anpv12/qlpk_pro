import { moduleState } from './state.js';

function escapeHtml(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
function toNumber(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}
function formatCurrency(value) {
	return toNumber(value).toLocaleString('vi-VN');
}
function formatDate(value, includeTime = false) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return escapeHtml(value);
	const dateText = date.toLocaleDateString('vi-VN');
	if (!includeTime) return dateText;
	return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${dateText}`;
}
function formatAge(dateOfBirth, referenceDate) {
	if (!dateOfBirth) return '';
	const birth = new Date(dateOfBirth);
	const reference = referenceDate ? new Date(referenceDate) : new Date();
	if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) return '';
	let years = reference.getFullYear() - birth.getFullYear();
	let months = reference.getMonth() - birth.getMonth();
	let days = reference.getDate() - birth.getDate();
	if (days < 0) {
		months -= 1;
		days += new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
	}
	if (months < 0) {
		years -= 1;
		months += 12;
	}
	if (years < 0) return '';
	const parts = [];
	if (years > 0) parts.push(`${years} tuổi`);
	if (months > 0) parts.push(`${months} tháng`);
	if (!parts.length && days >= 0) parts.push(`${days} ngày`);
	return parts.join(' ');
}
function formatGender(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (['male', 'nam', 'm'].includes(normalized)) return 'Nam';
	if (['female', 'nữ', 'nu', 'f'].includes(normalized)) return 'Nữ';
	return value || '';
}
function buildAddress(patient = {}) {
	const parts = [patient.address_detail, patient.ward, patient.district, patient.province]
		.map(value => String(value || '').trim())
		.filter(Boolean);
	return parts.join(', ') || patient.address || '';
}
function formatMaritalStatus(value) {
	const normalized = String(value || '').trim().toLowerCase();
	const labels = {
		single: 'Độc thân',
		married: 'Đã kết hôn',
		divorced: 'Ly hôn',
		widowed: 'Góa'
	};
	return labels[normalized] || value || '';
}
function parseArrayValue(value) {
	if (Array.isArray(value)) return value;
	if (!value || typeof value !== 'string') return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		return [];
	}
}
function formatHistoryEntries(value) {
	const entries = parseArrayValue(value);
	if (!entries.length) return typeof value === 'string' ? value : '';
	return entries.map(item => {
		if (!item || typeof item !== 'object') return String(item || '').trim();
		if (item.type === 'icd') {
			const code = String(item.icd_code || '').trim();
			const name = String(item.disease_name || '').trim();
			return code && name ? `${code} - ${name}` : name || code;
		}
		return String(item.value || item.name || '').trim();
	}).filter(Boolean).join('; ');
}
function formatAllergies(value) {
	const entries = parseArrayValue(value);
	if (!entries.length) return typeof value === 'string' ? value : '';
	const levelLabels = { nghi_ngo: 'Nghi ngờ', chac_chan: 'Chắc chắn' };
	return entries.map(item => {
		if (!item || typeof item !== 'object') return String(item || '').trim();
		const name = String(item.name || '').trim();
		if (!name) return '';
		const level = levelLabels[String(item.level || '').trim().toLowerCase()] || '';
		const symptom = String(item.symptom || '').trim();
		const label = level ? `${level}: ${name}` : name;
		return symptom ? `${label} - ${symptom}` : label;
	}).filter(Boolean).join(', ');
}
function formatMultiline(value) {
	return escapeHtml(value).replace(/\r?\n/g, '<br>');
}
function formatSignatureDate(value) {
	const date = value ? new Date(value) : new Date();
	if (Number.isNaN(date.getTime())) return '';
	return `Ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
}
function getClinicInfo() {
	if (typeof window.getClinicInfoConfig === 'function') {
		try {
			return window.getClinicInfoConfig();
		} catch (error) {
			console.error('Không tải được cấu hình phòng khám:', error);
		}
	}
	return window.clinicInfo || {};
}
function buildClinicHeader(clinicInfo = {}, patientCode = '') {
	const clinic = {
		name: clinicInfo.name || 'PHÒNG KHÁM SƠN TÂM',
		address: clinicInfo.address || '702/121 Điện Biên Phủ, P. Vườn Lài, TP.HCM',
		zalo: clinicInfo.zalo || clinicInfo.phone || '',
		email: clinicInfo.email || 'care@sontamclinic.vn',
		fanpage: clinicInfo.fanpage || clinicInfo.facebook || 'Phòng khám Sơn Tâm'
	};
	return `
			<div class="prescription-preview__header prescription-preview__header--clinic">
				<div class="clinic-logo">
					<img src="/static/assets/sontam.jpg" alt="Logo phòng khám" class="clinic-logo__image">
				</div>
				<div class="clinic-info">
					<div class="clinic-name-row"><div class="clinic-name">${escapeHtml(clinic.name)}</div></div>
					<div class="clinic-details clinic-details--loose">
						<div class="clinic-detail-line">📍 <strong>Địa chỉ:</strong> ${escapeHtml(clinic.address)}</div>
						<div class="clinic-detail-line">📞 <strong>Zalo:</strong> ${escapeHtml(clinic.zalo)}</div>
						<div class="clinic-detail-line">📧 <strong>Email:</strong> ${escapeHtml(clinic.email)}</div>
						<div class="clinic-detail-line">📘 <strong>Fanpage:</strong> ${escapeHtml(clinic.fanpage)}</div>
					</div>
				</div>
				${patientCode ? `
				<div class="prescription-code-section">
					<svg class="barcode-svg barcode-svg--patient" data-barcode="${escapeHtml(patientCode)}"></svg>
					<span class="patient-code">Mã hồ sơ: ${escapeHtml(patientCode)}</span>
				</div>` : ''}
			</div>`;
}
function buildPatientInfo(patient = {}, history = {}, options = {}) {
	const birthDate = formatDate(patient.date_of_birth);
	const age = formatAge(patient.date_of_birth, history.examination_date);
	const weight = history.weight || options.weight || '';
	return `
			<div class="prescription-preview__patient-info">
				<div class="prescription-preview__patient-info-left">
					<div><strong>Họ tên:</strong> ${escapeHtml(patient.full_name || '')}</div>
					<div><strong>Ngày sinh:</strong> ${birthDate}${age ? ` — ${escapeHtml(age)}` : ''}</div>
					<div><strong>Địa chỉ:</strong> ${escapeHtml(buildAddress(patient))}</div>
				</div>
				<div class="prescription-preview__patient-info-right">
					<div><strong>Giới tính:</strong> ${escapeHtml(formatGender(patient.gender))}</div>
					<div><strong>Số điện thoại:</strong> ${escapeHtml(patient.phone || patient.phone_number || '')}</div>
					<div><strong>Cân nặng:</strong> ${weight ? `${escapeHtml(weight)} kg` : ''}</div>
				</div>
			</div>`;
}
function buildServiceInvoiceHTML(options = {}) {
	const patient = options.patient || {};
	const history = options.history || {};
	const servicesData = options.servicesData || {};
	const services = Array.isArray(servicesData.services) ? servicesData.services : [];
	let subtotal = 0;
	let totalDiscount = 0;
	const rows = services.map((service, index) => {
		const quantity = Math.max(0, toNumber(service.quantity, 0));
		const unitPrice = toNumber(service.unit_price ?? service.price ?? service.amount, 0);
		const lineSubtotal = quantity * unitPrice;
		const discountPercent = toNumber(service.discount_percent ?? service.discountPercent, 0);
		const discountAmount = toNumber(
			service.discount_amount ?? service.discountAmount,
			discountPercent ? Math.round(lineSubtotal * discountPercent / 100) : 0
		);
		const lineTotal = Math.max(toNumber(service.total ?? service.total_amount, lineSubtotal - discountAmount), 0);
		const duration = toNumber(service.duration ?? service.duration_minutes ?? service.durationMinutes, 0);
		subtotal += lineSubtotal;
		totalDiscount += discountAmount;
		return `
				<tr>
					<td>${index + 1}</td>
					<td>${escapeHtml(service.service_name || service.name || '')}</td>
					<td class="text-center">${quantity}</td>
					<td class="text-center">${duration ? `${duration} phút` : ''}</td>
					<td class="text-end">${formatCurrency(unitPrice)}</td>
					<td class="text-end">${formatCurrency(lineTotal)}</td>
				</tr>`;
	}).join('');

	const emptyRow = `
			<tr><td colspan="6" class="text-center text-muted py-4">Lượt khám này chưa có dịch vụ</td></tr>`;
	const resolvedTotal = toNumber(servicesData.total_amount, Math.max(subtotal - totalDiscount, 0));
	const doctorName = history.doctor?.full_name || 'Bác sĩ';

	return `
			<div class="prescription-preview prescription-preview--document">
				${buildClinicHeader(options.clinicInfo || getClinicInfo(), patient.patient_code)}
				<div class="prescription-gradient-separator"></div>
				<h3 class="prescription-preview__title prescription-preview__title--document">HÓA ĐƠN DỊCH VỤ</h3>
				${buildPatientInfo(patient, history, { weight: servicesData.patient_info?.weight })}
				<div class="prescription-preview__diagnosis"><strong>Chẩn đoán:</strong> ${escapeHtml(history.diagnosis || '')}</div>
				<div class="prescription-preview__body">
					<table class="prescription-preview-table table-centered prescription-service-table">
						<colgroup><col class="prescription-service-table__col-index"><col class="prescription-service-table__col-name"><col class="prescription-service-table__col-quantity"><col class="prescription-service-table__col-duration"><col class="prescription-service-table__col-price"><col class="prescription-service-table__col-total"></colgroup>
						<thead><tr><th>STT</th><th>Tên dịch vụ</th><th>Số lượng</th><th>Thời gian</th><th>Đơn giá (VNĐ)</th><th>Thành tiền</th></tr></thead>
						<tbody>${rows || emptyRow}<tr><td colspan="5" class="text-end"><strong>Tổng thanh toán</strong></td><td class="text-end"><strong>${formatCurrency(resolvedTotal)} VNĐ</strong></td></tr></tbody>
					</table>
				</div>
				<div class="prescription-preview__signature prescription-preview__signature--avoid-break">
					<div>${formatSignatureDate(history.examination_date)}</div>
					<div class="prescription-preview__signature-role">Bác sĩ khám bệnh</div>
					<div class="prescription-preview__signature-name">${escapeHtml(doctorName)}</div>
				</div>
			</div>`;
}
function resolveMedicineUsageNote(rawUsage) {
	if (rawUsage === null || rawUsage === undefined) return '';
	if (typeof rawUsage === 'object') {
		return String(rawUsage.note || rawUsage.global_usage || '').trim();
	}
	const text = String(rawUsage).trim();
	if (!text) return '';
	if (text.startsWith('{')) {
		try {
			const parsed = JSON.parse(text);
			return String(parsed.note || parsed.global_usage || '').trim();
		} catch (error) {
			// Keep legacy plain-text usage readable when an old payload is malformed.
		}
	}
	return text;
}
function parseMedicineUsage(rawUsage) {
	if (!rawUsage) return {};
	if (typeof rawUsage === 'object') return rawUsage;
	try {
		const parsed = JSON.parse(String(rawUsage));
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch (error) {
		return {};
	}
}
function buildMedicineRows(prescriptionData = {}) {
	const medicines = Array.isArray(prescriptionData.medicines) ? prescriptionData.medicines : [];
	if (!medicines.length) return '';
	return medicines.map((medicine, index) => `
			<div class="medical-record-medicine-item">
				<div class="medical-record-medicine-row">
					<div class="medical-record-medicine-name">${index + 1}. ${escapeHtml([medicine.name, medicine.strength].filter(Boolean).join(' ') || 'Không tên')}${medicine.generic_name ? ` (${escapeHtml(medicine.generic_name)})` : ''}</div>
					<div class="medical-record-medicine-quantity">${escapeHtml(medicine.quantity || '')} ${escapeHtml(medicine.unit || '')}</div>
				</div>
				${resolveMedicineUsageNote(medicine.usage) ? `<div class="medical-record-medicine-usage">${formatMultiline(resolveMedicineUsageNote(medicine.usage))}</div>` : ''}
			</div>`).join('');
}
function getField(section, key, fallback = '') {
	const value = section && section[key];
	return value === null || value === undefined ? fallback : value;
}
function buildRelativeText(relatives) {
	if (!Array.isArray(relatives) || !relatives.length) return 'Đi một mình';
	const labels = relatives.map(relative => {
		const name = relative?.name || relative?.relative_full_name || relative?.relative_name || relative?.full_name || '';
		const relationship = relative?.kinship || relative?.relationship || '';
		if (!name) return '';
		return relationship ? `${name} (${relationship})` : name;
	}).filter(Boolean);
	return labels.length ? labels.join(', ') : 'Đi một mình';
}
function resolvePrescriptionDays(prescriptionData = {}) {
	let days = 0;
	const medicines = Array.isArray(prescriptionData.medicines) ? prescriptionData.medicines : [];
	medicines.forEach(medicine => {
		const usage = parseMedicineUsage(medicine.usage);
		const candidate = toNumber(usage.medicine_days ?? usage.medicineDays, 0);
		if (candidate > days) days = candidate;
	});
	if (days) return String(days);
	const usageText = String(prescriptionData.usage_instructions || '');
	const matched = usageText.match(/(\d+)\s*ngày/i);
	return matched ? matched[1] : '';
}
function formatPrescriptionType(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (['basic', 'co_ban', 'cơ bản', 'co ban'].includes(normalized)) return 'Cơ bản';
	if (normalized === 'h') return 'Đơn thuốc "H"';
	if (normalized === 'n') return 'Đơn thuốc "N"';
	return value || '';
}
function buildMedicalRecordModel(options = {}) {
	const role = options.role === 'psychologist' ? 'psychologist' : 'doctor';
	const labels = moduleState.MEDICAL_RECORD_LABELS[role];
	const details = options.examinationDetailsBySection || {};
	const section = name => details[`${labels.prefix}_kham_${name}`] || {};
	const history = options.history || {};
	const formSection = section('form_kham');
	const generalSection = section('kham_tong_quat');
	const mentalSection = section('kham_tam_than');
	const isDoctor = role === 'doctor';
	return {
		role, labels, isDoctor, history,
		patient: options.patient || {},
		appointment: options.appointment || {},
		prescriptionData: options.prescriptionData || {},
		relatives: options.relatives || [],
		clinicInfo: options.clinicInfo || getClinicInfo(),
		generalSection, mentalSection,
		labSection: section('xet_nghiem'),
		mainReason: getField(formSection, 'main_reason', history.main_reason || ''),
		medicalHistory: getField(section('tien_su'), 'medical_history', ''),
		...buildMedicalRecordRoleFields(isDoctor, { formSection, generalSection, mentalSection }, history)
	};
}
function buildMedicalRecordRoleFields(isDoctor, sections, history) {
	const { formSection, generalSection, mentalSection } = sections;
	if (isDoctor) {
		return {
			generalManifestations: getField(generalSection, 'bieu_hien_chung', ''),
			generalExamination: getField(generalSection, 'general_examination', ''),
			diagnosis: history.diagnosis || '',
			accompanyingDiagnosis: history.benh_kem_theo || '',
			treatmentPlan: history.treatment_plan || ''
		};
	}
	return {
		generalManifestations: getField(mentalSection, 'danh_gia_ban_dau', ''),
		generalExamination: getField(mentalSection, 'dien_tien_trong_phien_kham', ''),
		diagnosis: history.psychologist_summary || '',
		accompanyingDiagnosis: getField(formSection, 'nhan_dinh_chung', ''),
		treatmentPlan: getField(formSection, 'ke_hoach_can_thiep', '')
	};
}
function buildMedicalRecordVitals(history) {
	return [
		['Mạch', history.pulse, 'lần/phút'],
		['Huyết áp', history.blood_pressure, 'mmHg'],
		['Chiều cao', history.height, 'cm'],
		['Cân nặng', history.weight, 'kg'],
		['Nhiệt độ', history.temperature, '°C'],
		['Nhịp thở', history.breathing, 'lần/phút'],
		['BMI', history.bmi, '']
	].map(([label, value, unit]) => `${label}: ${value ? `${escapeHtml(value)}${unit === '°C' ? '' : ' '}${unit}`.trim() : 'Chưa ghi nhận'}`).join(', ');
}
function buildMedicalRecordFieldLines(fields, sectionData) {
	return fields.map(([label, key]) => `<div class="medical-record-line medical-record-line--compact">+ ${label}: ${formatMultiline(getField(sectionData, key, ''))}</div>`).join('');
}
function firstPatientValue(patient, keys) {
	for (const key of keys) {
		if (patient[key]) return patient[key];
	}
	return '';
}

function buildMedicalRecordAdminHtml(model) {
	const { patient, appointment } = model;
	const patientAddress = buildAddress(patient);
	const age = formatAge(patient.date_of_birth, model.history.examination_date);
	const phone = firstPatientValue(patient, ['phone', 'phone_number']);
	const identity = firstPatientValue(patient, ['id_number', 'id_card', 'cccd']);
	const guardian = firstPatientValue(patient, ['guardian_name', 'guardian', 'emergency_contact']);
	const insurance = firstPatientValue(patient, ['insurance_card', 'insurance']);
	return `
				<div class="medical-record-section">
					<h6 class="medical-record-section-title">I. HÀNH CHÍNH</h6>
					<div class="medical-record-admin-grid">
						<div class="medical-record-admin-main">
							<div class="medical-record-line medical-record-line--tight"><strong>Họ tên:</strong> ${escapeHtml(patient.full_name || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Ngày sinh:</strong> ${formatDate(patient.date_of_birth)}${age ? ` — ${escapeHtml(age)}` : ''}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Giới tính:</strong> ${escapeHtml(formatGender(patient.gender))}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Số điện thoại:</strong> ${escapeHtml(phone)}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Nghề nghiệp:</strong> ${escapeHtml(patient.occupation || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Địa chỉ:</strong> ${escapeHtml(patientAddress)}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Tỉnh/thành phố:</strong> ${escapeHtml(patient.province || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Ghi chú:</strong> ${formatMultiline(appointment.notes || '')}</div>
						</div>
						<div class="medical-record-admin-side">
							<div class="medical-record-line medical-record-line--tight"><strong>Xu hướng tính dục:</strong> ${escapeHtml(patient.sexual_orientation || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>CMT/CCCD:</strong> ${escapeHtml(identity)}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Tôn giáo:</strong> ${escapeHtml(patient.religion || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Tình trạng hôn nhân:</strong> ${escapeHtml(formatMaritalStatus(patient.marital_status))}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Học vấn:</strong> ${escapeHtml(patient.education_level || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Người giám hộ:</strong> ${escapeHtml(guardian)}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Thẻ BHYT:</strong> ${escapeHtml(insurance)}</div>
						</div>
					</div>
				</div>`;
}
function buildMedicalRecordInquiryHtml(model) {
	const { patient, history } = model;
	return `
				<div class="medical-record-section">
					<h6 class="medical-record-section-title">II. HỎI BỆNH</h6>
					<div class="medical-record-line"><strong>Lý do chính đến khám:</strong> ${formatMultiline(model.mainReason)}</div>
					<div class="medical-record-line"><strong>Triệu chứng chính:</strong> ${formatMultiline(history.main_symptoms || '')}</div>
					<div class="medical-record-line"><strong>Đến khám cùng:</strong> ${escapeHtml(buildRelativeText(model.relatives))}</div>
					<div class="medical-record-block"><strong>Tiền sử bệnh:</strong><div class="medical-record-indent">
						<div class="medical-record-line medical-record-line--compact"><strong>+ Bản thân:</strong> ${escapeHtml(formatHistoryEntries(patient.physical_history))}</div>
						<div class="medical-record-line medical-record-line--compact"><strong>+ Gia đình:</strong> ${escapeHtml(formatHistoryEntries(patient.family_history))}</div>
					</div></div>
				</div>`;
}
function buildMedicalRecordExaminationDetailHtml(model) {
	const mental = buildMedicalRecordFieldLines(moduleState.MEDICAL_RECORD_MENTAL_FIELDS, model.mentalSection);
	if (model.isDoctor) {
		return `${moduleState.MEDICAL_RECORD_DETAIL_LEAD}<div class="medical-record-indent medical-record-examination-grid">
							<div class="medical-record-examination-group">
								<div class="medical-record-subtitle"><strong>- Các cơ quan:</strong></div>
								<div class="medical-record-indent-lg">${buildMedicalRecordFieldLines(moduleState.MEDICAL_RECORD_ORGAN_FIELDS, model.generalSection)}</div>
							</div>
							<div class="medical-record-examination-group">
								<div class="medical-record-subtitle"><strong>- Khám tâm thần:</strong></div>
								<div class="medical-record-indent-lg">${mental}</div>
							</div>
						</div>`;
	}
	return `${moduleState.MEDICAL_RECORD_DETAIL_LEAD}<div class="medical-record-indent">
							<div class="medical-record-subtitle"><strong>- Khám tâm thần:</strong></div>
							<div class="medical-record-indent-lg">${mental}</div>
						</div>`;
}
function buildMedicalRecordExaminationHtml(model) {
	const { labels, isDoctor, patient } = model;
	return `
				<div class="medical-record-section">
					<h6 class="medical-record-section-title">III. KHÁM BỆNH</h6>
					<div class="medical-record-section-title"><strong>Sinh hiệu:</strong> ${buildMedicalRecordVitals(model.history)}</div>
					<div class="medical-record-line"><strong>Bệnh sử:</strong> ${formatMultiline(model.medicalHistory)}</div>
					<div class="medical-record-line"><strong>${labels.manifestations}:</strong> ${formatMultiline(model.generalManifestations)}</div>
					<div class="medical-record-block"><strong>${labels.examination}:</strong> ${formatMultiline(model.generalExamination)}${buildMedicalRecordExaminationDetailHtml(model)}
					</div>
					${isDoctor ? `<div class="medical-record-line"><strong>- Các xét nghiệm cận lâm sàng cần làm:</strong> ${formatMultiline(getField(model.labSection, 'required_tests', ''))}</div>` : ''}
					<div class="medical-record-line"><strong>${labels.diagnosis}:</strong> ${formatMultiline(model.diagnosis)}</div>
					<div class="medical-record-line"><strong>${labels.accompanying}:</strong> ${formatMultiline(model.accompanyingDiagnosis)}</div>
					<div class="medical-record-line"><strong>${labels.plan}:</strong> ${formatMultiline(model.treatmentPlan)}</div>
					${isDoctor ? `<div class="medical-record-line"><strong>Dị ứng thuốc:</strong> ${escapeHtml(formatAllergies(patient.allergies))}</div>` : ''}
				</div>`;
}

export { buildAddress, buildClinicHeader, buildMedicalRecordAdminHtml, buildMedicalRecordExaminationDetailHtml, buildMedicalRecordExaminationHtml, buildMedicalRecordFieldLines, buildMedicalRecordInquiryHtml, buildMedicalRecordModel, buildMedicalRecordRoleFields, buildMedicalRecordVitals, buildMedicineRows, buildPatientInfo, buildRelativeText, buildServiceInvoiceHTML, escapeHtml, formatAge, formatAllergies, formatCurrency, formatDate, formatGender, formatHistoryEntries, formatMaritalStatus, formatMultiline, formatPrescriptionType, formatSignatureDate, getClinicInfo, getField, parseArrayValue, parseMedicineUsage, resolveMedicineUsageNote, resolvePrescriptionDays, toNumber };
