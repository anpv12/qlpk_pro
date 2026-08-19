(function (window, document) {
	'use strict';

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

	function buildMedicalRecordHTML(options = {}) {
		const patient = options.patient || {};
		const history = options.history || {};
		const details = options.examinationDetailsBySection || {};
		const role = options.role === 'psychologist' ? 'psychologist' : 'doctor';
		const prefix = role === 'psychologist' ? 'tam_ly_gia' : 'bac_si';
		const formSection = details[`${prefix}_kham_form_kham`] || {};
		const historySection = details[`${prefix}_kham_tien_su`] || {};
		const generalSection = details[`${prefix}_kham_kham_tong_quat`] || {};
		const mentalSection = details[`${prefix}_kham_kham_tam_than`] || {};
		const labSection = details[`${prefix}_kham_xet_nghiem`] || {};
		const appointment = options.appointment || {};
		const prescriptionData = options.prescriptionData || {};
		const relatives = options.relatives || [];
		const title = role === 'psychologist' ? 'HỒ SƠ BỆNH ÁN TÂM LÝ' : 'HỒ SƠ BỆNH ÁN';
		const patientAddress = buildAddress(patient);
		const age = formatAge(patient.date_of_birth, history.examination_date);
		const mainReason = getField(formSection, 'main_reason', history.main_reason || '');
		const personalHistory = formatHistoryEntries(patient.physical_history);
		const familyHistory = formatHistoryEntries(patient.family_history);
		const medicalHistory = getField(historySection, 'medical_history', '');
		const generalManifestations = role === 'doctor'
			? getField(generalSection, 'bieu_hien_chung', '')
			: getField(mentalSection, 'danh_gia_ban_dau', '');
		const generalExamination = role === 'doctor'
			? getField(generalSection, 'general_examination', '')
			: getField(mentalSection, 'dien_tien_trong_phien_kham', '');
		const diagnosis = role === 'doctor' ? history.diagnosis || '' : history.psychologist_summary || '';
		const accompanyingDiagnosis = role === 'doctor'
			? history.benh_kem_theo || ''
			: getField(formSection, 'nhan_dinh_chung', '');
		const treatmentPlan = role === 'doctor'
			? history.treatment_plan || ''
			: getField(formSection, 'ke_hoach_can_thiep', '');
		const vitalItems = [
			['Mạch', history.pulse, 'lần/phút'],
			['Huyết áp', history.blood_pressure, 'mmHg'],
			['Chiều cao', history.height, 'cm'],
			['Cân nặng', history.weight, 'kg'],
			['Nhiệt độ', history.temperature, '°C'],
			['Nhịp thở', history.breathing, 'lần/phút'],
			['BMI', history.bmi, '']
		].map(([label, value, unit]) => `${label}: ${value ? `${escapeHtml(value)}${unit === '°C' ? '' : ' '}${unit}`.trim() : 'Chưa ghi nhận'}`).join(', ');
		const organFields = [
			['Tuần hoàn', 'circulation'], ['Tiêu hoá', 'digestive'],
			['Thận-tiết niệu-sinh dục', 'renal_urogenital'], ['Cơ-xương-khớp', 'musculoskeletal'],
			['Tai-mũi-họng', 'ent'], ['Nội tiết-dinh dưỡng', 'endocrine_nutrition_others'],
			['Thần kinh', 'neurological']
		];
		const mentalFields = [
			['Ý thức định hướng', 'orientation'], ['Tình cảm, cảm xúc', 'emotions'],
			['Tri giác', 'perception'], ['Tư duy', 'thought'], ['Hành vi tác phong', 'behavior'],
			['Trí nhớ', 'memory'], ['Tập trung - chú ý', 'attention'], ['Trí năng', 'intelligence']
		];
		const prescriptionType = prescriptionData.prescriptions?.[0]?.type
			|| prescriptionData.prescription_type || prescriptionData.type || '';
		const doctorName = history.doctor?.full_name || (role === 'doctor' ? 'Bác sĩ' : 'Tâm lý gia');
		const medicinesHtml = buildMedicineRows(prescriptionData);

		return `
			<div class="prescription-preview prescription-preview--document">
				${buildClinicHeader(options.clinicInfo || getClinicInfo(), patient.patient_code)}
				<div class="prescription-gradient-separator"></div>
				<h3 class="prescription-preview__title prescription-preview__title--document">${title}</h3>
				<div class="medical-record-section">
					<h6 class="medical-record-section-title">I. HÀNH CHÍNH</h6>
					<div class="medical-record-admin-grid">
						<div class="medical-record-admin-main">
							<div class="medical-record-line medical-record-line--tight"><strong>Họ tên:</strong> ${escapeHtml(patient.full_name || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Ngày sinh:</strong> ${formatDate(patient.date_of_birth)}${age ? ` — ${escapeHtml(age)}` : ''}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Giới tính:</strong> ${escapeHtml(formatGender(patient.gender))}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Số điện thoại:</strong> ${escapeHtml(patient.phone || patient.phone_number || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Nghề nghiệp:</strong> ${escapeHtml(patient.occupation || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Địa chỉ:</strong> ${escapeHtml(patientAddress)}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Tỉnh/thành phố:</strong> ${escapeHtml(patient.province || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Ghi chú:</strong> ${formatMultiline(appointment.notes || '')}</div>
						</div>
						<div class="medical-record-admin-side">
							<div class="medical-record-line medical-record-line--tight"><strong>Xu hướng tính dục:</strong> ${escapeHtml(patient.sexual_orientation || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>CMT/CCCD:</strong> ${escapeHtml(patient.id_number || patient.id_card || patient.cccd || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Tôn giáo:</strong> ${escapeHtml(patient.religion || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Tình trạng hôn nhân:</strong> ${escapeHtml(formatMaritalStatus(patient.marital_status))}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Học vấn:</strong> ${escapeHtml(patient.education_level || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Người giám hộ:</strong> ${escapeHtml(patient.guardian_name || patient.guardian || patient.emergency_contact || '')}</div>
							<div class="medical-record-line medical-record-line--tight"><strong>Thẻ BHYT:</strong> ${escapeHtml(patient.insurance_card || patient.insurance || '')}</div>
						</div>
					</div>
				</div>
				<div class="medical-record-section">
					<h6 class="medical-record-section-title">II. HỎI BỆNH</h6>
					<div class="medical-record-line"><strong>Lý do chính đến khám:</strong> ${formatMultiline(mainReason)}</div>
					<div class="medical-record-line"><strong>Triệu chứng chính:</strong> ${formatMultiline(history.main_symptoms || '')}</div>
					<div class="medical-record-line"><strong>Đến khám cùng:</strong> ${escapeHtml(buildRelativeText(relatives))}</div>
					<div class="medical-record-block"><strong>Tiền sử bệnh:</strong><div class="medical-record-indent">
						<div class="medical-record-line medical-record-line--compact"><strong>+ Bản thân:</strong> ${escapeHtml(personalHistory)}</div>
						<div class="medical-record-line medical-record-line--compact"><strong>+ Gia đình:</strong> ${escapeHtml(familyHistory)}</div>
					</div></div>
				</div>
				<div class="medical-record-section">
					<h6 class="medical-record-section-title">III. KHÁM BỆNH</h6>
					<div class="medical-record-section-title"><strong>Sinh hiệu:</strong> ${vitalItems}</div>
					<div class="medical-record-line"><strong>Bệnh sử:</strong> ${formatMultiline(medicalHistory)}</div>
					<div class="medical-record-line"><strong>${role === 'doctor' ? 'Biểu hiện chung' : 'Đánh giá ban đầu'}:</strong> ${formatMultiline(generalManifestations)}</div>
					<div class="medical-record-block"><strong>${role === 'doctor' ? 'KQ khám toàn thân' : 'Diễn tiến trong phiên khám'}:</strong> ${formatMultiline(generalExamination)}
						${role === 'doctor' ? `
						<div class="medical-record-indent medical-record-examination-grid">
							<div class="medical-record-examination-group">
								<div class="medical-record-subtitle"><strong>- Các cơ quan:</strong></div>
								<div class="medical-record-indent-lg">${organFields.map(([label, key]) => `<div class="medical-record-line medical-record-line--compact">+ ${label}: ${formatMultiline(getField(generalSection, key, ''))}</div>`).join('')}</div>
							</div>
							<div class="medical-record-examination-group">
								<div class="medical-record-subtitle"><strong>- Khám tâm thần:</strong></div>
								<div class="medical-record-indent-lg">${mentalFields.map(([label, key]) => `<div class="medical-record-line medical-record-line--compact">+ ${label}: ${formatMultiline(getField(mentalSection, key, ''))}</div>`).join('')}</div>
							</div>
						</div>` : `
						<div class="medical-record-indent">
							<div class="medical-record-subtitle"><strong>- Khám tâm thần:</strong></div>
							<div class="medical-record-indent-lg">${mentalFields.map(([label, key]) => `<div class="medical-record-line medical-record-line--compact">+ ${label}: ${formatMultiline(getField(mentalSection, key, ''))}</div>`).join('')}</div>
						</div>`}
					</div>
					${role === 'doctor' ? `<div class="medical-record-line"><strong>- Các xét nghiệm cận lâm sàng cần làm:</strong> ${formatMultiline(getField(labSection, 'required_tests', ''))}</div>` : ''}
					<div class="medical-record-line"><strong>${role === 'doctor' ? 'Chẩn đoán (ICD-10)' : 'Triệu chứng & Hành vi'}:</strong> ${formatMultiline(diagnosis)}</div>
					<div class="medical-record-line"><strong>${role === 'doctor' ? 'Bệnh kèm theo' : 'Nhận định chung'}:</strong> ${formatMultiline(accompanyingDiagnosis)}</div>
					<div class="medical-record-line"><strong>${role === 'doctor' ? 'Kết luận & Hướng Đ.trị' : 'Kế hoạch can thiệp'}:</strong> ${formatMultiline(treatmentPlan)}</div>
					${role === 'doctor' ? `<div class="medical-record-line"><strong>Dị ứng thuốc:</strong> ${escapeHtml(formatAllergies(patient.allergies))}</div>` : ''}
				</div>
				${role === 'doctor' ? `<div class="medical-record-section">
					<h6 class="medical-record-section-title">IV. ĐIỀU TRỊ</h6>
					<div class="medical-record-block"><strong>Loại đơn thuốc:</strong> ${escapeHtml(formatPrescriptionType(prescriptionType))}</div>
					<div class="medical-record-block"><strong>Số ngày thuốc:</strong> ${escapeHtml(resolvePrescriptionDays(prescriptionData))}</div>
					<div class="medical-record-block"><strong>Hẹn ngày tái khám:</strong> ${formatDate(prescriptionData.re_examination_date)}</div>
					<div class="medical-record-treatment-list"><strong>Danh sách thuốc:</strong>${medicinesHtml}</div>
					<div class="medical-record-loi-dan"><strong>Lời dặn:</strong><div class="medical-record-loi-dan-text">${formatMultiline(history.loi_dan || '')}</div></div>
				</div>` : ''}
				<div class="prescription-preview__signature prescription-preview__signature--avoid-break">
					<div>${formatSignatureDate(history.examination_date)}</div>
					<div class="prescription-preview__signature-role">${role === 'doctor' ? 'Bác sĩ khám bệnh' : 'Tâm lý gia'}</div>
					<div class="prescription-preview__signature-name">${escapeHtml(doctorName)}</div>
				</div>
			</div>`;
	}

	async function parseJsonResponse(response, errorMessage) {
		if (!response || !response.ok) {
			let detail = '';
			try { detail = await response.text(); } catch (error) { detail = ''; }
			throw new Error(detail || errorMessage);
		}
		return response.json();
	}

	function createDataFetchers(apiCall) {
		if (typeof apiCall !== 'function') throw new Error('apiCall is required');
		const getJson = async (url, errorMessage) => parseJsonResponse(await apiCall(url, { cache: 'no-store' }), errorMessage);
		return {
			async fetchPatientDetail(patientId) {
				const data = await getJson(`/api/patients/${patientId}`, 'Không thể tải thông tin bệnh nhân');
				return data.data || data;
			},
			fetchExaminationDetail(examinationId) {
				return getJson(`/api/examination-detail/${examinationId}`, 'Không thể tải thông tin lượt khám');
			},
			fetchSectionDetails(examinationId) {
				return getJson(`/api/examination-details/${examinationId}`, 'Không thể tải chi tiết bệnh án');
			},
			fetchPrescription(appointmentId) {
				return getJson(`/api/prescription/appointment/${appointmentId}`, 'Không thể tải toa thuốc');
			},
			fetchServicesForAppointment(appointmentId) {
				return getJson(`/services/appointment/${appointmentId}`, 'Không thể tải dịch vụ');
			},
			fetchAppointment(appointmentId) {
				return getJson(`/api/appointments/${appointmentId}`, 'Không thể tải lịch hẹn');
			},
			async fetchRelatives(appointmentId) {
				try {
					return await getJson(`/api/appointment-relatives/appointment/${appointmentId}`, 'Không thể tải người đi cùng');
				} catch (error) {
					console.warn('Không tải được người đi cùng cho bệnh án:', error);
					return { data: [] };
				}
			},
			fetchVitalSigns(patientId) {
				return getJson(`/api/patients/${patientId}/examinations`, 'Không thể tải sinh hiệu');
			}
		};
	}

	function createBarcodesInElement(container) {
		if (!container) return;
		const render = () => {
			if (typeof window.JsBarcode !== 'function') return;
			container.querySelectorAll('.barcode-svg').forEach(svg => {
				const code = svg.dataset.barcode || (svg.id && svg.id.startsWith('barcode-') ? svg.id.slice(8) : '');
				if (!code) return;
				try {
					window.JsBarcode(svg, code, { format: 'CODE128', width: 1.5, height: 35, displayValue: false, margin: 0 });
				} catch (error) {
					console.error('Không tạo được barcode:', error);
				}
			});
		};
		if (typeof window.JsBarcode === 'function') {
			render();
			return;
		}
		if (document.querySelector('script[data-modal-history-barcode]')) return;
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
		script.dataset.modalHistoryBarcode = '1';
		script.addEventListener('load', render, { once: true });
		script.addEventListener('error', () => console.error('Không tải được thư viện barcode'), { once: true });
		document.head.appendChild(script);
	}

	function createVitalSignsController(fetchVitalSigns) {
		let requestToken = 0;
		let patientId = null;
		let data = [];
		let filteredData = [];
		let timeRange = 'all';
		let viewMode = typeof window.Chart === 'function' ? 'chart' : 'table';
		let chart = null;
		let lastLayoutSignature = '';

		function setDisplay(element, visible, display = 'block') {
			if (element) element.style.display = visible ? display : 'none';
		}

		function destroyChart() {
			if (chart && typeof chart.destroy === 'function') chart.destroy();
			chart = null;
			lastLayoutSignature = '';
		}

		function parseBloodPressure(value) {
			const parts = String(value || '').split('/').map(item => Number.parseInt(item, 10));
			if (parts.length === 2 && parts.every(Number.isFinite)) return { sys: parts[0], dia: parts[1] };
			const match = String(value || '').match(/(\d+)/);
			const number = match ? Number.parseInt(match[1], 10) : NaN;
			return Number.isFinite(number) ? { sys: number, dia: number } : null;
		}

		function processData(examinations) {
			return (Array.isArray(examinations) ? examinations : [])
				.filter(item => item && item.examination_date)
				.sort((a, b) => new Date(a.examination_date) - new Date(b.examination_date))
				.map(item => {
					const date = new Date(item.examination_date);
					const bp = parseBloodPressure(item.blood_pressure);
					const validDate = !Number.isNaN(date.getTime());
					const dateLabel = validDate ? `${date.getDate()}/${date.getMonth() + 1}` : '';
					const timeLabel = validDate ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
					return {
						date: item.examination_date,
						dateLabel,
						timeLabel,
						fullDateLabel: validDate ? `${timeLabel} ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}` : '',
						breathing: toNumber(item.breathing, null),
						pulse: toNumber(item.pulse, null),
						bloodPressureRaw: item.blood_pressure || '',
						bloodPressureMin: bp?.dia ?? null,
						bloodPressureMax: bp?.sys ?? null,
						temperature: toNumber(item.temperature, null),
						weight: toNumber(item.weight, null),
						height: toNumber(item.height, null),
						bmi: toNumber(item.bmi, null)
					};
				});
		}

		function renderEmpty(message) {
			destroyChart();
			const empty = document.getElementById('vitalSignsChartEmpty');
			if (empty) {
				setDisplay(empty, true, 'flex');
				const text = empty.querySelector('p');
				if (text) text.textContent = message;
			}
			setDisplay(document.getElementById('vitalSignsChartLayout'), false);
			setDisplay(document.getElementById('vitalSignsTableWrapper'), false);
		}

		function clear(message = 'Chọn bệnh nhân để xem lưu đồ sinh hiệu') {
			requestToken += 1;
			patientId = null;
			data = [];
			filteredData = [];
			renderEmpty(message);
		}

		function filterData() {
			if (timeRange === 'all') return data;
			const days = { '1w': 7, '1m': 30, '3m': 90 }[timeRange];
			if (!days) return data;
			const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
			return data.filter(item => new Date(item.date).getTime() >= cutoff);
		}

		function renderTable(items) {
			const wrapper = document.getElementById('vitalSignsTableWrapper');
			if (!wrapper) return;
			const containerWidth = wrapper.clientWidth || 600;
			const numCols = Math.max(items.length, 10, Math.floor(Math.max(containerWidth - 165, 0) / 80));
			const totalMinWidth = 165 + numCols * 80;
			const cols = `<col class="vital-grid-col-label">${Array.from({ length: numCols }, () => '<col class="vital-grid-col-data">').join('')}`;
			const headerCells = (key, emptyClass) => Array.from({ length: numCols }, (_, index) => {
				const item = items[index];
				return item ? `<th>${escapeHtml(item[key])}</th>` : `<th class="${emptyClass}">-</th>`;
			}).join('');
			const rows = [
				['Huyết áp (mmHg)', 'bloodPressureRaw'], ['Nhịp thở (lần/phút)', 'breathing'], ['Mạch (bpm)', 'pulse'],
				['Nhiệt độ (°C)', 'temperature'], ['Cân nặng (kg)', 'weight'], ['Chiều cao (cm)', 'height'], ['BMI', 'bmi']
			].map(([label, key]) => `<tr><td class="vital-label-col">${label}</td>${Array.from({ length: numCols }, (_, index) => {
				const value = items[index]?.[key];
				return `<td>${value === null || value === undefined || value === '' ? '-' : escapeHtml(value)}</td>`;
			}).join('')}</tr>`).join('');
			wrapper.innerHTML = `<table class="vital-signs-grid-table" style="width:${totalMinWidth}px"><colgroup>${cols}</colgroup><thead><tr><th class="vital-label-col" rowspan="2">Chỉ số \\ Thời gian</th>${headerCells('dateLabel', 'vital-grid-empty-date')}</tr><tr>${headerCells('timeLabel', 'vital-grid-empty-time')}</tr></thead><tbody>${rows}</tbody></table>`;
			setDisplay(wrapper, true);
		}

		function alignAxesAndHeader() {
			if (!chart?.chartArea || !chart.scales?.yHA || !chart.scales?.x) return;
			const yScale = chart.scales.yHA;
			const xScale = chart.scales.x;
			const yValues = [200, 180, 160, 140, 120, 100, 80, 60, 40];
			const signature = `${yValues.map(value => Math.round(yScale.getPixelForValue(value))).join(',')}|${filteredData.map((_, index) => Math.round(xScale.getPixelForValue(index))).join(',')}`;
			if (signature === lastLayoutSignature) return;
			lastLayoutSignature = signature;
			const axis = document.getElementById('vitalSignsYAxisFixed');
			if (axis) {
				axis.replaceChildren();
				const dateHeader = document.createElement('div');
				dateHeader.className = 'vital-axis-date-header';
				dateHeader.textContent = 'Ngày/tháng';
				const metricHeader = document.createElement('div');
				metricHeader.className = 'vital-axis-metric-header';
				['Huyết áp', 'Mạch', 'Nhiệt độ'].forEach((label, index) => {
					const cell = document.createElement('div');
					cell.className = index < 2 ? 'vital-axis-metric-cell vital-axis-metric-cell--border' : 'vital-axis-metric-cell';
					cell.textContent = label;
					metricHeader.appendChild(cell);
				});
				const ticks = document.createElement('div');
				ticks.className = 'vital-y-ticks';
				yValues.forEach((value, index) => {
					const tick = document.createElement('div');
					tick.className = 'vital-y-tick';
					tick.style.top = `${yScale.getPixelForValue(value)}px`;
					[value, value, 43 - index].forEach((cellValue, cellIndex) => {
						const cell = document.createElement('div');
						cell.className = cellIndex < 2 ? 'vital-y-tick-cell vital-y-tick-cell--border' : 'vital-y-tick-cell';
						cell.textContent = cellValue;
						tick.appendChild(cell);
					});
					ticks.appendChild(tick);
				});
				axis.append(dateHeader, metricHeader, ticks);
			}
			const header = document.getElementById('vitalSignsHeaderTable');
			if (header) {
				header.replaceChildren();
				const dateRow = document.createElement('div');
				dateRow.className = 'vital-x-date-row';
				const timeRow = document.createElement('div');
				timeRow.className = 'vital-x-time-row';
				filteredData.forEach((item, index) => {
					const x = xScale.getPixelForValue(index);
					const dateLabel = document.createElement('div');
					dateLabel.className = 'vital-x-date-label';
					dateLabel.style.left = `${x}px`;
					dateLabel.textContent = item.dateLabel;
					dateRow.appendChild(dateLabel);
					const timeLabel = document.createElement('div');
					timeLabel.className = 'vital-x-time-label';
					timeLabel.style.left = `${x}px`;
					timeLabel.textContent = item.timeLabel;
					timeRow.appendChild(timeLabel);
				});
				header.append(dateRow, timeRow);
			}
		}

		function renderChart(items) {
			if (typeof window.Chart !== 'function') {
				viewMode = 'table';
				renderTable(items);
				return;
			}
			const canvas = document.getElementById('vitalSignsChart');
			const scrollContainer = document.getElementById('vitalSignsChartScrollable');
			const header = document.getElementById('vitalSignsHeaderTable');
			if (!canvas || !scrollContainer || !header) return;
			destroyChart();
			const containerWidth = scrollContainer.clientWidth || 600;
			const numCols = Math.max(items.length, 10, Math.floor(containerWidth / 80));
			const calculatedWidth = Math.max(containerWidth, numCols * 60);
			const canvasContainer = canvas.parentElement;
			if (canvasContainer) canvasContainer.style.width = `${calculatedWidth}px`;
			header.style.width = `${calculatedWidth}px`;
			const paddedItems = Array.from({ length: numCols }, (_, index) => items[index] || null);
			const triangle = (up = false) => {
				const marker = document.createElement('canvas');
				marker.width = 12; marker.height = 12;
				const context = marker.getContext('2d');
				context.fillStyle = '#ca8a04';
				context.beginPath();
				if (up) { context.moveTo(1, 10); context.lineTo(11, 10); context.lineTo(6, 1); }
				else { context.moveTo(1, 2); context.lineTo(11, 2); context.lineTo(6, 11); }
				context.closePath(); context.fill();
				return marker;
			};
			chart = new window.Chart(canvas.getContext('2d'), {
				type: 'line',
				data: {
					labels: Array.from({ length: numCols }, (_, index) => index),
					datasets: [
						{ label: 'Huyết áp', data: paddedItems.map(item => item?.bloodPressureMax), borderColor: '#ca8a04', backgroundColor: 'rgba(254, 240, 138, 0.4)', borderWidth: 1.5, tension: 0, fill: '+1', pointStyle: triangle(), spanGaps: true, yAxisID: 'yHA' },
						{ label: 'Huyết áp tâm trương', data: paddedItems.map(item => item?.bloodPressureMin), borderColor: '#ca8a04', backgroundColor: 'transparent', borderWidth: 1.5, tension: 0, fill: false, pointStyle: triangle(true), spanGaps: true, yAxisID: 'yHA' },
						{ label: 'Mạch (lần/phút)', data: paddedItems.map(item => item?.pulse), borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2, tension: 0, fill: false, pointStyle: 'crossRot', pointRadius: 6, pointHoverRadius: 8, spanGaps: true, yAxisID: 'yMach' },
						{ label: 'Nhiệt độ (°C)', data: paddedItems.map(item => item?.temperature), borderColor: '#2563eb', backgroundColor: '#2563eb', borderWidth: 2, tension: 0, fill: false, pointStyle: 'circle', pointRadius: 5, pointHoverRadius: 7, spanGaps: true, yAxisID: 'yTemp' }
					]
				},
				options: {
					responsive: true, maintainAspectRatio: false,
					layout: { padding: { top: 10, bottom: 10, left: 5, right: 15 } },
					interaction: { mode: 'index', intersect: false },
					plugins: {
						legend: { position: 'top', labels: { usePointStyle: true, padding: 8, font: { family: 'Roboto', size: 11 }, filter: item => item.text !== 'Huyết áp tâm trương' } },
						tooltip: {
							backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 8, cornerRadius: 6,
							callbacks: {
								title: context => paddedItems[context[0]?.dataIndex]?.fullDateLabel || '',
								label: context => {
									const item = paddedItems[context.dataIndex];
									if (!item || context.dataset.label === 'Huyết áp tâm trương') return null;
									if (context.dataset.label === 'Huyết áp') return `Huyết áp: ${item.bloodPressureMax}/${item.bloodPressureMin} mmHg`;
									return `${context.dataset.label}: ${context.parsed.y}${context.dataset.yAxisID === 'yTemp' ? ' °C' : ' lần/phút'}`;
								}
							}
						}
					},
					scales: {
						x: { display: true, grid: { color: 'rgba(0, 0, 0, 0.05)' }, border: { display: false }, ticks: { display: false } },
						yHA: { type: 'linear', display: true, position: 'left', min: 40, max: 200, ticks: { stepSize: 20, display: false }, grid: { color: 'rgba(0, 0, 0, 0.05)' }, border: { display: false } },
						yMach: { type: 'linear', display: true, position: 'left', min: 40, max: 200, ticks: { stepSize: 20, display: false }, grid: { drawOnChartArea: false }, border: { display: false } },
						yTemp: { type: 'linear', display: true, position: 'left', min: 35, max: 43, ticks: { stepSize: 1, display: false }, grid: { drawOnChartArea: false }, border: { display: false } }
					}
				},
				plugins: [{ id: 'modal-vital-layout', afterLayout: () => alignAxesAndHeader() }]
			});
			window.requestAnimationFrame(alignAxesAndHeader);
		}

		function syncButtons() {
			const chartButton = document.getElementById('btnVitalViewChart');
			const tableButton = document.getElementById('btnVitalViewTable');
			if (chartButton) {
				chartButton.disabled = typeof window.Chart !== 'function';
				chartButton.classList.toggle('active', viewMode === 'chart');
			}
			if (tableButton) tableButton.classList.toggle('active', viewMode === 'table');
		}

		function render() {
			filteredData = filterData();
			if (!filteredData.length) {
				renderEmpty('Không có dữ liệu sinh hiệu trong khoảng thời gian này');
				return;
			}
			setDisplay(document.getElementById('vitalSignsChartEmpty'), false);
			if (viewMode === 'chart' && typeof window.Chart === 'function') {
				setDisplay(document.getElementById('vitalSignsTableWrapper'), false);
				setDisplay(document.getElementById('vitalSignsChartLayout'), true, 'flex');
				renderChart(filteredData);
			} else {
				viewMode = 'table';
				setDisplay(document.getElementById('vitalSignsChartLayout'), false);
				renderTable(filteredData);
			}
			syncButtons();
		}

		async function load(nextPatientId) {
			const numericPatientId = Number(nextPatientId);
			if (!Number.isFinite(numericPatientId) || numericPatientId <= 0) {
				clear();
				return { status: 'missingPatient' };
			}
			const token = requestToken + 1;
			requestToken = token;
			patientId = numericPatientId;
			data = [];
			renderEmpty('Đang tải dữ liệu sinh hiệu...');
			try {
				const payload = await fetchVitalSigns(numericPatientId);
				if (token !== requestToken || patientId !== numericPatientId) return { status: 'stale' };
				data = processData(payload?.examinations);
				if (!data.length) {
					renderEmpty('Chưa có dữ liệu sinh hiệu');
					return { status: 'empty' };
				}
				render();
				return { status: 'ready', count: data.length };
			} catch (error) {
				if (token !== requestToken || patientId !== numericPatientId) return { status: 'stale' };
				console.error('Không tải được sinh hiệu:', error);
				renderEmpty('Lỗi khi tải dữ liệu sinh hiệu');
				return { status: 'error', error };
			}
		}

		document.getElementById('btnVitalViewChart')?.addEventListener('click', () => {
			if (typeof window.Chart !== 'function') return;
			viewMode = 'chart';
			render();
		});
		document.getElementById('btnVitalViewTable')?.addEventListener('click', () => {
			viewMode = 'table';
			render();
		});
		document.querySelector('.time-range-selector')?.addEventListener('click', event => {
			const button = event.target.closest('[data-vital-time-range]');
			if (!button) return;
			timeRange = button.dataset.vitalTimeRange || 'all';
			document.querySelectorAll('[data-vital-time-range]').forEach(item => item.classList.toggle('active', item === button));
			render();
		});
		document.getElementById('vital-signs-tab')?.addEventListener('shown.bs.tab', () => {
			if (viewMode === 'chart' && filteredData.length) window.setTimeout(() => chart?.resize(), 100);
		});
		window.addEventListener('resize', () => {
			if (viewMode === 'table' && filteredData.length) renderTable(filteredData);
			if (viewMode === 'chart' && chart) chart.resize();
		});
		syncButtons();

		return { load, clear, render };
	}

	function create(options = {}) {
		const fetchers = createDataFetchers(options.apiCall);
		const vitalSigns = createVitalSignsController(fetchers.fetchVitalSigns);
		return {
			fetchers,
			vitalSigns,
			buildServiceInvoiceHTML,
			buildMedicalRecordHTML,
			getClinicInfo,
			createBarcodesInElement
		};
	}

	window.ModalHistoryDataRuntime = Object.freeze({ create });
	window.QLPKDoctorModuleRegistry?.register?.('modalHistoryDataRuntime', window.ModalHistoryDataRuntime);
})(window, document);
