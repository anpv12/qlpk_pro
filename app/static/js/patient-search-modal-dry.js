/**
 * Patient Search Modal DRY Module
 * Di dời từ doctor-examination.js & psychologist-examination.js
 * Chứa helpers, build HTML, fetch, print functions cho modal Tìm kiếm bệnh nhân.
 * Đây là compatibility shell cho psychologist/receptionist; Doctor dùng
 * QLPKPatientModalContract trực tiếp.
 */

// ============================================
// Shared Constants — Dùng chung cả doctor & psychologist
// ============================================
if (typeof PRESCRIPTION_USAGE_MODES === 'undefined') {
	var PRESCRIPTION_USAGE_MODES = {
		TIMES_PER_DAY: 'times_per_day',
		TIME_SLOTS: 'time_slots'
	};
}

function ensureValidPrescriptionUsageMode(mode) {
	return mode === PRESCRIPTION_USAGE_MODES.TIME_SLOTS
		? PRESCRIPTION_USAGE_MODES.TIME_SLOTS
		: PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY;
}

// ============================================
// Shared Utility Functions — Dùng chung cả doctor & psychologist
// ============================================
function buildSelectOptions(optionList) {
	return optionList.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
}

function updateServiceAmountDisplayFromValue(rawValue) {
	const total = toNumber(rawValue, 0);
	const hiddenInput = document.getElementById('prescriptionServiceAmount');
	if (hiddenInput) {
		hiddenInput.value = total;
	}
	const displayEl = document.getElementById('prescriptionServiceAmountDisplay');
	if (displayEl) {
		displayEl.textContent = `${formatCurrency(total)} VNĐ`;
	}
}

function getToastIcon(type) {
	switch (type) {
		case 'success':
			return '<i class="bi bi-check-circle-fill text-success"></i>';
		case 'error':
			return '<i class="bi bi-x-circle-fill text-danger"></i>';
		case 'warning':
			return '<i class="bi bi-exclamation-triangle-fill text-warning"></i>';
		default:
			return '<i class="bi bi-info-circle-fill text-info"></i>';
	}
}

function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

function getPatientSearchAuthHeaders() {
	if (typeof getAuthHeader === 'function') {
		const authHeader = getAuthHeader();
		return authHeader ? { 'Authorization': authHeader } : {};
	}
	const token = localStorage.getItem('qlpk_token') || localStorage.getItem('token') || '';
	return token ? { 'Authorization': `Bearer ${token.replace(/^Bearer\s+/i, '')}` } : {};
}

async function showConfirmationDialog(options = {}) {
	const {
		title = 'Xác nhận',
		text = '',
		icon = 'warning',
		confirmText = 'Đồng ý',
		cancelText = 'Hủy',
		confirmButtonClass = 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--primary',
		cancelButtonClass = 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
	} = options;

	if (typeof Swal === 'undefined' || typeof Swal.fire !== 'function') {
		const sharedDialog = window.QLPKConfirmationDialog;
		return sharedDialog && typeof sharedDialog.confirm === 'function'
			? sharedDialog.confirm({ title, text, icon, confirmText, cancelText, confirmButtonClass, cancelButtonClass })
			: Promise.resolve(false);
	}

	function cleanupSweetAlertArtifacts() {
		try {
			if (typeof Swal !== 'undefined' && typeof Swal.close === 'function') {
				Swal.close();
			}
			document.querySelectorAll('.swal2-container').forEach(container => container.remove());
			const body = document.body;
			if (body) {
				body.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
				body.style.overflow = '';
				body.style.paddingRight = '';
			}
		} catch (error) {
			console.warn('Error cleaning SweetAlert dialog:', error);
		}
	}

	// Chuyển \n thành <br> để hiển thị xuống dòng
	const html = text.replace(/\n/g, '<br>');

	const isDeleteDialog = confirmButtonClass.includes('btn-danger') || confirmButtonClass.includes('--danger');
	const confirmVariant = isDeleteDialog ? 'danger' : 'primary';
	const popupClass = `qlpk-confirm-dialog qlpk-confirm-dialog--${confirmVariant}`;
	const normalizedConfirmButtonClass = `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${confirmVariant}`;
	const normalizedCancelButtonClass = cancelButtonClass.includes('qlpk-confirm-dialog__button')
		? cancelButtonClass
		: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost';

	return new Promise((resolve) => {
		let settled = false;
		const settle = (confirmed) => {
			if (settled) return;
			settled = true;
			cleanupSweetAlertArtifacts();
			resolve(confirmed === true);
		};

		Swal.fire({
			title,
			html,
			icon,
			showCancelButton: true,
			confirmButtonText: confirmText,
			cancelButtonText: cancelText,
			focusCancel: true,
			reverseButtons: true,
			buttonsStyling: false,
			allowOutsideClick: false,
			allowEscapeKey: true,
			customClass: {
				container: 'qlpk-confirm-container',
				popup: popupClass,
				icon: 'qlpk-confirm-dialog__icon',
				title: 'qlpk-confirm-dialog__title',
				htmlContainer: 'qlpk-confirm-dialog__text',
				actions: 'qlpk-confirm-dialog__actions',
				confirmButton: normalizedConfirmButtonClass,
				cancelButton: normalizedCancelButtonClass
			},
			didOpen: () => {
				const confirmButton = typeof Swal.getConfirmButton === 'function' ? Swal.getConfirmButton() : null;
				const cancelButton = typeof Swal.getCancelButton === 'function' ? Swal.getCancelButton() : null;

				if (confirmButton) {
					confirmButton.addEventListener('click', (event) => {
						event.preventDefault();
						event.stopImmediatePropagation();
						settle(true);
					}, { once: true, capture: true });
				}

				if (cancelButton) {
					cancelButton.addEventListener('click', (event) => {
						event.preventDefault();
						event.stopImmediatePropagation();
						settle(false);
					}, { once: true, capture: true });
				}
			}
		}).then(result => {
			settle(result.isConfirmed === true);
		}).catch(() => {
			settle(false);
		});
	});
}

function formatMaritalStatusDisplay(value) {
	if (!value) return '';
	const normalized = value.toString().trim().toLowerCase();
	if (['single', 'độc thân'].includes(normalized)) return 'Độc thân';
	if (['married', 'đã kết hôn', 'ket hon'].includes(normalized)) return 'Đã kết hôn';
	if (['divorced', 'đã ly hôn', 'ly hon'].includes(normalized)) return 'Đã ly hôn';
	if (['widowed', 'góa', 'goa'].includes(normalized)) return 'Góa';
	if (['separated', 'ly thân', 'ly than'].includes(normalized)) return 'Ly thân';
	if (['cohabiting', 'sống như vợ/chồng', 'song nhu vo chong'].includes(normalized)) return 'Sống như vợ/chồng';
	return value; // Trả về giá trị gốc nếu không khớp
}

function formatCurrency(value) {
	const number = toNumber(value, 0);
	return number.toLocaleString('vi-VN');
}

async function printModalPrescription() {
	if (window.prescriptionModalPrintController?.printModalPrescription) {
		return window.prescriptionModalPrintController.printModalPrescription();
	}

	if (typeof window.createPrescriptionModalPrint === 'function') {
		window.prescriptionModalPrintController = window.createPrescriptionModalPrint();
		return window.prescriptionModalPrintController.printModalPrescription();
	}

	const message = 'Không thể mở bản in đơn thuốc. Vui lòng tải lại trang.';
	console.error(message);
	showCustomToast && showCustomToast('error', message);
}

function getSelectedModalHistoryContext() {
	const patient = (window.modalSelectedPatient != null) ? window.modalSelectedPatient : null;
	const historyLoading = (window.modalMedicalHistoryLoading != null) ? window.modalMedicalHistoryLoading : false;
	const historyData = (window.modalMedicalHistoryData != null) ? window.modalMedicalHistoryData : [];
	const historyIndex = (window.modalSelectedHistoryIndex != null) ? window.modalSelectedHistoryIndex : null;

	if (!patient) {
		showCustomToast && showCustomToast('error', 'Vui lòng chọn bệnh nhân');
		return null;
	}

	if (historyLoading) {
		showCustomToast && showCustomToast('warning', 'Đang tải lịch sử khám, vui lòng đợi...');
		return null;
	}

	if (!Array.isArray(historyData) || !historyData.length) {
		showCustomToast && showCustomToast('error', 'Chưa có lịch sử khám cho bệnh nhân này');
		return null;
	}

	let selectedIndex = historyIndex;
	if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= historyData.length) {
		selectedIndex = 0;
	}
	const history = historyData[selectedIndex];
	if (!history) {
		showCustomToast && showCustomToast('error', 'Không tìm thấy dữ liệu lịch sử tương ứng');
		return null;
	}

	return { patient, history, selectedIndex, historyData };
}

async function fetchMedicalRecordPrintContext(patient, history) {
	const examinationId = history.id;
	const appointmentId = history.appointment_id;
	const fetchPromises = [
		fetchPatientDetailForPrescription(patient.id).catch(() => null),
		examinationId
			? fetchExaminationDetailForPrescription(examinationId, true).catch(() => null)
			: Promise.resolve(null),
		examinationId
			? fetchExaminationDetailsBySection(examinationId, true).catch(() => ({}))
			: Promise.resolve({}),
		appointmentId
			? fetchPrescriptionDataForAppointment(appointmentId, true).catch(() => null)
			: Promise.resolve(null),
		appointmentId
			? apiCall(`/api/appointments/${appointmentId}`).then(response => response.ok ? response.json() : null).catch(() => null)
			: Promise.resolve(null),
		appointmentId
			? fetch(`/api/appointment-relatives/appointment/${appointmentId}`, {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			}).then(response => response.ok ? response.json() : { data: [] }).catch(() => ({ data: [] }))
			: Promise.resolve({ data: [] })
	];

	const [patientDetail, examinationDetail, examinationDetailsBySection, prescriptionData, appointmentResponse, relativesResponse] = await Promise.all(fetchPromises);
	const appointment = appointmentResponse?.data || appointmentResponse || null;
	const relatives = relativesResponse?.data || [];
	const historyWithDetail = examinationDetail ? { ...history, ...examinationDetail } : history;

	return {
		patientDetail,
		examinationDetail,
		examinationDetailsBySection: examinationDetailsBySection || {},
		prescriptionData: prescriptionData || null,
		appointment,
		relatives,
		historyWithDetail
	};
}

/**
 * In hóa đơn dịch vụ từ modal tìm kiếm bệnh nhân (rebuild HTML từ data mới nhất)
 */

async function printModalServices() {
	try {
		const context = getSelectedModalHistoryContext();
		if (!context) {
			return;
		}
		const { patient, history } = context;

		// Force reload để luôn lấy dữ liệu mới nhất từ server
		const examinationId = history.id;
		const fetchPromises = [
			fetchPatientDetailForPrescription(patient.id).catch(() => null),
			examinationId
				? fetchExaminationDetailForPrescription(examinationId, true).catch(() => null) // forceReload = true
				: Promise.resolve(null),
			fetchServicesForAppointment(history.appointment_id, true), // forceReload = true
			fetchPrescriptionDataForAppointment(history.appointment_id, true) // forceReload = true
		];

		const [patientDetail, examinationDetail, servicesData, prescriptionData] = await Promise.all(fetchPromises);

		// Build HTML mới nhất
		const clinicInfo = getClinicInfoConfig();
		// Merge examination detail vào history để có diagnosis
		const historyWithDetail = examinationDetail ? { ...history, ...examinationDetail } : history;
		const invoiceHtml = buildServiceInvoiceHTML({
			clinicInfo,
			patient: patientDetail || patient,
			history: historyWithDetail,
			servicesData,
			prescriptionData,
			isPrint: true
		});

		// In bằng hàm chung
		const printWindow = setupPrintWindow(invoiceHtml, 'In hóa đơn dịch vụ');
		triggerPrint(printWindow);
	} catch (error) {
		console.error('Error printing services from modal:', error);
		showCustomToast && showCustomToast('error', 'Không thể in hóa đơn dịch vụ. Vui lòng thử lại.');
	}
}

/**
 * In bệnh án từ modal tìm kiếm bệnh nhân (rebuild HTML từ data mới nhất)
 */

async function printModalMedicalRecord() {
	try {
		const context = getSelectedModalHistoryContext();
		if (!context) {
			return;
		}
		const { patient, history } = context;

		const printContext = await fetchMedicalRecordPrintContext(patient, history);
		const { patientDetail, examinationDetailsBySection, prescriptionData, appointment, relatives, historyWithDetail } = printContext;

		// Build HTML mới nhất
		const clinicInfo = getClinicInfoConfig();
		const medicalRecordHtml = buildMedicalRecordHTML({
			clinicInfo,
			patient: patientDetail || patient,
			history: historyWithDetail,
			examinationDetailsBySection: examinationDetailsBySection || {},
			prescriptionData: prescriptionData || null,
			relatives: relatives,
			appointment: appointment,
			isPrint: true
		});

		// In bằng hàm chung
		const printWindow = setupPrintWindow(medicalRecordHtml, 'In bệnh án');
		triggerPrint(printWindow);
	} catch (error) {
		console.error('Error printing medical record from modal:', error);
		showCustomToast && showCustomToast('error', 'Không thể in bệnh án. Vui lòng thử lại.');
	}
}

/**
 * In bệnh án TLG từ modal tìm kiếm bệnh nhân (rebuild HTML từ data mới nhất)
 */
async function printModalMedicalRecordTLG() {
	try {
		const context = getSelectedModalHistoryContext();
		if (!context) {
			return;
		}
		const { patient, history } = context;

		const printContext = await fetchMedicalRecordPrintContext(patient, history);
		const { patientDetail, examinationDetailsBySection, prescriptionData, appointment, relatives, historyWithDetail } = printContext;

		const clinicInfo = getClinicInfoConfig();
		const medicalRecordHtml = buildMedicalRecordHTML({
			clinicInfo,
			patient: patientDetail || patient,
			history: historyWithDetail,
			examinationDetailsBySection: examinationDetailsBySection || {},
			prescriptionData: prescriptionData || null,
			relatives: relatives,
			appointment: appointment,
			role: 'psychologist',
			isPrint: true
		});

		const printWindow = setupPrintWindow(medicalRecordHtml, 'In bệnh án TLG');
		triggerPrint(printWindow);
	} catch (error) {
		console.error('Error printing medical record TLG from modal:', error);
		showCustomToast && showCustomToast('error', 'Không thể in bệnh án tâm lý. Vui lòng thử lại.');
	}
}

function printModalTabContent(targetId) {
	// Dùng logic rebuild HTML từ data mới nhất thay vì clone DOM
	if (targetId === 'prescription-content') {
		printModalPrescription();
		return;
	} else if (targetId === 'services-content') {
		printModalServices();
		return;
	} else if (targetId === 'medical-record-content') {
		printModalMedicalRecord();
		return;
	} else if (targetId === 'medical-record-tlg-content') {
		printModalMedicalRecordTLG();
		return;
	}
}

function buildFullAddressFromParts(addressDetail, ward, district, province) {
	const parts = [];
	if (addressDetail && addressDetail.trim()) parts.push(addressDetail.trim());
	if (ward && ward.trim()) parts.push(ward.trim());
	if (district && district.trim()) parts.push(district.trim());
	if (province && province.trim()) parts.push(province.trim());
	return parts.length ? parts.join(', ') : '';
}

function formatPhoneWithSpaces(phone) {
	if (!phone) return '';
	const cleaned = String(phone).replace(/\D/g, '');
	if (cleaned.length === 10) {
		return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
	}
	return String(phone);
}

function getPatientPrintDisplayFields(patient, history, isPrint = false) {
	let patientAddress = buildFullAddressFromParts(
		patient.address_detail,
		patient.ward,
		patient.district,
		patient.province
	);
	if (!patientAddress && patient.address) {
		patientAddress = patient.address;
	}

	return {
		fullName: patient.full_name || modalSelectedPatient?.full_name || '',
		birthDateText: patient.date_of_birth ? formatVietnamDate(patient.date_of_birth) : '',
		ageDetail: isPrint ? formatPrintAge(patient.date_of_birth, history?.examination_date) : calculateDetailedAge(patient.date_of_birth, history?.examination_date).text,
		genderDisplay: formatGenderDisplay(patient.gender || modalSelectedPatient?.gender),
		address: patientAddress,
		phone: patient.phone || patient.phone_number || modalSelectedPatient?.phone || '',
		idCard: patient.id_number || patient.id_card || patient.cccd || '',
		insurance: patient.insurance_card || patient.insurance || '',
		guardian: patient.guardian_name || patient.guardian || patient.emergency_contact || '',
		occupation: patient.occupation || '',
		religion: patient.religion || '',
		sexualOrientation: patient.sexual_orientation || '',
		maritalStatus: formatMaritalStatusDisplay(patient.marital_status || ''),
		educationLevel: patient.education_level || ''
	};
}

function getClinicPrintDisplayFields(clinicInfo) {
	const clinic = clinicInfo || {};
	return {
		name: clinic.name || 'PHÒNG KHÁM SƠN TÂM',
		address: clinic.address || '702/121 Điện Biên Phủ, P. Vườn Lài, TP.HCM',
		zalo: clinic.zalo || formatPhoneWithSpaces(clinic.phone || ''),
		email: clinic.email || 'care@sontamclinic.vn',
		fanpage: clinic.fanpage || clinic.facebook || 'Phòng khám Sơn Tâm'
	};
}

function buildClinicPrintHeaderHTML(clinicInfo, patientCode = '') {
	const clinic = getClinicPrintDisplayFields(clinicInfo);
	return `
			<div class="prescription-preview__header prescription-preview__header--clinic">
				<div class="clinic-logo">
					<img src="/static/assets/sontam.jpg" alt="Logo phòng khám" class="clinic-logo__image">
				</div>
				<div class="clinic-info">
					<div class="clinic-name-row">
						<div class="clinic-name">
							${clinic.name}
						</div>
					</div>
					<div class="clinic-details clinic-details--loose">
						<div class="clinic-detail-line">
							📍 <strong>Địa chỉ:</strong> ${clinic.address}
						</div>
						<div class="clinic-detail-line">
							📞 <strong>Zalo:</strong> ${clinic.zalo}
						</div>
						<div class="clinic-detail-line">
							📧 <strong>Email:</strong> ${clinic.email}
						</div>
						<div class="clinic-detail-line">
							📘 <strong>Fanpage:</strong> ${clinic.fanpage}
						</div>
					</div>
				</div>
				${patientCode ? `
				<div class="prescription-code-section">
					<svg id="barcode-${patientCode}" class="barcode-svg barcode-svg--patient"></svg>
					<span class="patient-code">Mã hồ sơ: ${patientCode}</span>
				</div>
				` : ''}
			</div>
	`;
}

function formatPrintTitleText(value) {
	return (value || '').replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

function formatAllergyEntriesForDisplay(entries) {
	if (!Array.isArray(entries)) return '';
	const labels = { nghi_ngo: 'Nghi ngờ', chac_chan: 'Chắc chắn' };
	return entries.map(entry => {
		const name = String(entry?.name || '').trim();
		if (!name) return '';
		const level = labels[String(entry?.level || '').trim().toLowerCase()] || '';
		const symptom = String(entry?.symptom || '').trim();
		const value = level ? `${level}: ${name}` : name;
		return symptom ? `${value} - ${symptom}` : value;
	}).filter(Boolean).join(', ');
}

function buildMedicineUsageDescription(medicine) {
	const usagePayload = parseMedicineUsagePayload(medicine.usage || '');
	const schedule = usagePayload.schedule;
	const unitText = medicine.unit || '';
	const lines = [];
	const normalizedLines = new Set();
	// Giữ nguyên xuống dòng trong note, chỉ loại bỏ khoảng trắng và tab thừa ở đầu và cuối
	const rawNote = usagePayload.note || '';
	const note = rawNote.replace(/^[ \t\uFEFF\xA0]+|[ \t\uFEFF\xA0]+$/gm, '');
	const noteLower = note.toLowerCase();

	const addLine = (line) => {
		const trimmed = (line || '').trim();
		if (!trimmed) return;
		const lower = trimmed.toLowerCase();
		if (normalizedLines.has(lower)) return;
		normalizedLines.add(lower);
		lines.push(trimmed);
	};

	if (schedule.mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY) {
		const qtyPerTime = Math.max(0.001, parseFractionalQuantity(schedule.times_per_day.qty_per_time) || 1);
		const timesPerDay = Math.max(1, toNumber(schedule.times_per_day.times_per_day, 1));
		addLine(`SL/lần: ${formatDoseAsFraction(qtyPerTime)} ${unitText}`.trim());
		addLine(`Số lần/ngày: ${timesPerDay}`);
	} else if (schedule.mode === PRESCRIPTION_USAGE_MODES.TIME_SLOTS) {
		const slotDesc = buildUsageTimeSlotDescription(schedule, unitText);
		if (slotDesc) {
			const slotDescLower = slotDesc.toLowerCase();
			if (!noteLower || !noteLower.includes(slotDescLower)) {
				addLine(slotDesc);
			}
		}
	}

	// Tách note theo xuống dòng và thêm từng dòng riêng biệt
	if (note) {
		const noteLines = note.split('\n');
		noteLines.forEach(line => {
			const trimmedLine = line.trim();
			if (trimmedLine) {
				addLine(trimmedLine);
			}
		});
	}

	if (!lines.length) {
		lines.push('Chưa có hướng dẫn');
	}

	return lines.map(line => `<div>${line}</div>`).join('');
}

// ============================================

/**
 * Lấy CSS styles chung cho print prescription
 */

function buildServiceInvoiceHTML({ clinicInfo, patient, history, servicesData, prescriptionData, isPrint = false }) {
	const examinationDate = history?.examination_date ? new Date(history.examination_date) : new Date();
	const examinationDateText = formatVietnamDate(examinationDate);
	// Format ngày cho phần chữ ký: "Ngày 14 tháng 12 năm 2025"
	const signatureDateText = examinationDate ? (() => {
		const day = examinationDate.getDate();
		const month = examinationDate.getMonth() + 1;
		const year = examinationDate.getFullYear();
		return `Ngày ${day} tháng ${month} năm ${year}`;
	})() : '';
	const doctorName = history?.doctor?.full_name || 'Bác sĩ';
	const diagnosisText = history?.diagnosis || '';
	const patientDisplay = getPatientPrintDisplayFields(patient, history, isPrint);
	const patientAddress = patientDisplay.address;
	const patientPhone = patientDisplay.phone;
	const ageDetail = patientDisplay.ageDetail;
	const genderDisplay = patientDisplay.genderDisplay;
	const reExamDateRaw = history?.re_examination_date
		|| history?.reExamDate
		|| history?.reexam_date
		|| servicesData?.re_examination_date
		|| servicesData?.reExamDate
		|| servicesData?.prescription?.re_examination_date
		|| prescriptionData?.re_examination_date
		|| null;
	const hasReExamDate = Boolean(reExamDateRaw);
	const reExamDate = hasReExamDate ? formatVietnamDate(reExamDateRaw) : '';

	const services = Array.isArray(servicesData?.services) ? servicesData.services : [];
	let weightDisplay = '';
	if (history?.weight) {
		weightDisplay = history.weight;
	} else if (servicesData?.patient_info?.weight) {
		weightDisplay = servicesData.patient_info.weight;
	}
	let subtotal = 0;
	let totalDiscount = 0;
	const serviceRows = services.map((service, index) => {
		const name = service.service_name || service.name || '';
		const quantity = Math.max(0, toNumber(service.quantity, 0));
		const unitPrice = toNumber(service.unit_price ?? service.price ?? service.amount, 0);
		const discountPercent = toNumber(service.discount_percent ?? service.discountPercent, 0);
		let discountAmount = toNumber(service.discount_amount ?? service.discountAmount, 0);
		const lineSubtotal = quantity * unitPrice;
		if (!discountAmount && discountPercent) {
			discountAmount = Math.round(lineSubtotal * discountPercent / 100);
		}
		const lineTotal = Math.max(lineSubtotal - discountAmount, 0);
		subtotal += lineSubtotal;
		totalDiscount += discountAmount;
		const duration = toNumber(service.duration ?? service.duration_minutes ?? service.durationMinutes, 0);
		const durationDisplay = duration > 0 ? `${duration} phút` : '';
		return `
            <tr>
                <td>${index + 1}</td>
                <td>${name}</td>
                <td class="text-center">${quantity}</td>
                <td class="text-center">${durationDisplay}</td>
                <td class="text-end">${formatCurrency(unitPrice)}</td>
                <td class="text-end">${formatCurrency(lineTotal)}</td>
            </tr>
        `;
	});

	if (!serviceRows.length) {
		serviceRows.push(`
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="bi bi-clipboard-data patient-search-modal__empty-icon--md"></i>
                    <p class="mt-2 mb-0">Chưa có dịch vụ nào trong đợt khám này</p>
                </td>
            </tr>
        `);
	}

	const totalAmount = Math.max(subtotal - totalDiscount, 0);

	return `
        <div class="prescription-preview">
            ${buildClinicPrintHeaderHTML(clinicInfo, patient?.patient_code || '')}
            
            <!-- Separator -->
            <div class="prescription-gradient-separator"></div>
            
            <!-- Tiêu đề -->
            <h3 class="prescription-preview__title prescription-preview__title--document">HÓA ĐƠN DỊCH VỤ</h3>
            <div class="prescription-preview__patient-info">
                <div class="prescription-preview__patient-info-left">
                    <div><strong>Họ tên:</strong> ${patient.full_name || modalSelectedPatient?.full_name || ''}</div>
                    <div><strong>Ngày sinh:</strong> ${patient.date_of_birth ? `${formatVietnamDate(patient.date_of_birth)} — ${ageDetail}` : ''}</div>
                    <div><strong>Địa chỉ:</strong> ${patientAddress}</div>
                </div>
                <div class="prescription-preview__patient-info-right">
                    <div><strong>Giới tính:</strong> ${genderDisplay}</div>
                    <div><strong>Số điện thoại:</strong> ${patientPhone}</div>
                    <div><strong>Cân nặng:</strong> ${weightDisplay}</div>
                </div>
            </div>
            <div class="prescription-preview__diagnosis">
                <strong>Chẩn đoán:</strong> ${diagnosisText}
            </div>
            <div class="prescription-preview__body">
                <table class="prescription-preview-table table-centered prescription-service-table">
                    <colgroup>
                        <col class="prescription-service-table__col-index">
                        <col class="prescription-service-table__col-name">
                        <col class="prescription-service-table__col-quantity">
                        <col class="prescription-service-table__col-duration">
                        <col class="prescription-service-table__col-price">
                        <col class="prescription-service-table__col-total">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Tên dịch vụ</th>
                            <th>Số lượng</th>
                            <th>Thời gian</th>
                            <th>Đơn giá (VNĐ)</th>
                            <th>Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${serviceRows.join('')}
                        <tr>
                            <td colspan="5" class="text-end"><strong>Tổng thanh toán</strong></td>
                            <td class="text-end"><strong>${formatCurrency(totalAmount)} VNĐ</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            ${hasReExamDate ? `
            <div class="mt-3 text-end">
                <span class="fw-semibold">Tái khám ngày:</span>
                <span>${reExamDate}</span>
            </div>` : ''}
            <div class="prescription-preview__signature">
                <div>${signatureDateText}</div>
                <div class="prescription-preview__signature-role">Bác sĩ khám bệnh</div>
                <div class="prescription-preview__signature-name">${doctorName}</div>
            </div>
        </div>
    `;
}

/**
 * Build HTML cho bệnh án
 */

function buildMedicalRecordHTML({ clinicInfo, patient, history, examinationDetailsBySection, prescriptionData, relatives = [], appointment = null, role = 'doctor', isPrint = false }) {
	const examinationDate = history?.examination_date ? new Date(history.examination_date) : new Date();
	const examinationDateText = formatVietnamDate(examinationDate);
	const examinationDateTime = history?.examination_time ? `${examinationDateText} ${history.examination_time}` : examinationDateText;
	// Format ngày cho phần chữ ký: "Ngày 14 tháng 12 năm 2025"
	const signatureDateText = examinationDate ? (() => {
		const day = examinationDate.getDate();
		const month = examinationDate.getMonth() + 1;
		const year = examinationDate.getFullYear();
		return `Ngày ${day} tháng ${month} năm ${year}`;
	})() : '';
	const doctorName = history?.doctor?.full_name || (role === 'doctor' ? 'Bác sĩ' : 'Tâm lý gia');
	const diagnosisText = role === 'doctor'
		? (history?.diagnosis || '')
		: (history?.psychologist_summary || '');
	const patientDisplay = getPatientPrintDisplayFields(patient, history, isPrint);
	const patientAddress = patientDisplay.address;
	const patientPhone = patientDisplay.phone;
	const ageDetail = patientDisplay.ageDetail;
	const genderDisplay = patientDisplay.genderDisplay;
	const patientFullName = patientDisplay.fullName;
	const patientBirthDate = patientDisplay.birthDateText;
	const patientIdCard = patientDisplay.idCard;
	const patientInsurance = patientDisplay.insurance;
	const patientGuardian = patientDisplay.guardian;
	const patientOccupation = patientDisplay.occupation;
	const patientSexualOrientation = patientDisplay.sexualOrientation;
	const patientReligion = patientDisplay.religion;
	const patientMaritalStatus = patientDisplay.maritalStatus;
	const patientEducationLevel = patientDisplay.educationLevel;
	const patientNote = appointment?.notes || '';

	// Lấy dữ liệu từ examinationDetailsBySection - sử dụng section theo role
	const details = examinationDetailsBySection || {};
	const sectionPrefix = role === 'doctor' ? 'bac_si' : 'tam_ly_gia';
	const histories = details[`${sectionPrefix}_kham_tien_su`] || {};
	const generalExam = details[`${sectionPrefix}_kham_kham_tong_quat`] || {};
	const mentalExam = details[`${sectionPrefix}_kham_kham_tam_than`] || {};
	const examForm = details[`${sectionPrefix}_kham_form_kham`] || {};

	// I. Hành chính
	const getFieldValue = (section, fieldName, defaultValue = '') => {
		return section[fieldName] || defaultValue;
	};

	// II. Hỏi bệnh
	const mainReasonText = getFieldValue(examForm, 'main_reason', '');
	const mainSymptomsText = history?.main_symptoms || '';

	// III. Khám bệnh - Vital signs
	// Mặc định để rỗng thay vì '0' để phân biệt trường hợp không có dữ liệu với giá trị thực bằng 0
	const pulse = history?.pulse || '';
	const bloodPressure = history?.blood_pressure || '';
	const temperature = history?.temperature || '';
	const breathing = history?.breathing || '';
	const height = history?.height || '';
	const weight = history?.weight || '';
	const bmi = history?.bmi || '';

	// Giá trị hiển thị (có kèm đơn vị); nếu không có dữ liệu thì để trống nhưng vẫn render label ở HTML
	const pulseDisplay = pulse ? `${pulse} lần/phút` : '';
	const bloodPressureDisplay = bloodPressure
		? (String(bloodPressure).includes('mmHg') ? bloodPressure : `${bloodPressure} mmHg`)
		: '';
	const heightDisplay = height ? `${height} cm` : '';
	const weightDisplay = weight ? `${weight} kg` : '';
	const temperatureDisplay = temperature ? `${temperature}°C` : '';
	const breathingDisplay = breathing ? `${breathing} lần/phút` : '';
	const bmiDisplay = bmi ? bmi : '';

	// Tạo chuỗi sinh hiệu gộp thành 1 hàng - luôn hiển thị tất cả, nếu không có giá trị thì "Chưa ghi nhận"
	const vitalSignsList = [];
	vitalSignsList.push(`Mạch: ${pulseDisplay || 'Chưa ghi nhận'}`);
	vitalSignsList.push(`Huyết áp: ${bloodPressureDisplay || 'Chưa ghi nhận'}`);
	vitalSignsList.push(`Chiều cao: ${heightDisplay || 'Chưa ghi nhận'}`);
	vitalSignsList.push(`Cân nặng: ${weightDisplay || 'Chưa ghi nhận'}`);
	vitalSignsList.push(`Nhiệt độ: ${temperatureDisplay || 'Chưa ghi nhận'}`);
	vitalSignsList.push(`Nhịp thở: ${breathingDisplay || 'Chưa ghi nhận'}`);
	vitalSignsList.push(`BMI: ${bmiDisplay || 'Chưa ghi nhận'}`);
	const vitalSignsText = `<div class="medical-record-section-title"><strong>Sinh hiệu:</strong> ${vitalSignsList.join(', ')}</div>`;

	// Các field khác cho phần III. KHÁM BỆNH
	const medicalHistory = getFieldValue(histories, 'medical_history', '');
	
	// Helper function để định dạng tiền sử bệnh từ JSONB array (trỏ đích danh tới patients table)
	const formatHistoryJsonb = (historyArray) => {
		if (!historyArray || !Array.isArray(historyArray)) return '';
		return historyArray.map(item => {
			if (item.type === 'icd') {
				const code = item.icd_code || '';
				const name = item.disease_name || '';
				return code && name ? `${code} – ${name}` : (name || code);
			} else if (item.type === 'text') {
				return item.value || '';
			}
			return '';
		}).filter(Boolean).join('; ');
	};

	const personalHistory = formatHistoryJsonb(patient.physical_history);
	const familyHistory = formatHistoryJsonb(patient.family_history);
	const generalManifestations = role === 'doctor'
		? getFieldValue(generalExam, 'bieu_hien_chung', '')
		: (getFieldValue(mentalExam, 'danh_gia_ban_dau', '') || '');
	const benhKemTheo = role === 'doctor'
		? (history?.benh_kem_theo || '')
		: (getFieldValue(examForm, 'nhan_dinh_chung', '') || '');

	const generalExamination = role === 'doctor'
		? getFieldValue(generalExam, 'general_examination', '')
		: (getFieldValue(mentalExam, 'dien_tien_trong_phien_kham', '') || '');
	const circulation = getFieldValue(generalExam, 'circulation', '');
	const digestive = getFieldValue(generalExam, 'digestive', '');
	const renalUrogenital = getFieldValue(generalExam, 'renal_urogenital', '');
	const musculoskeletal = getFieldValue(generalExam, 'musculoskeletal', '');
	const ent = getFieldValue(generalExam, 'ent', '');
	const endocrineNutritionOthers = getFieldValue(generalExam, 'endocrine_nutrition_others', '');
	const neurological = getFieldValue(generalExam, 'neurological', '');

	// KQ khám toàn thân - 2. Khám tâm thần
	const orientation = getFieldValue(mentalExam, 'orientation', '');
	const emotions = getFieldValue(mentalExam, 'emotions', '');
	const perception = getFieldValue(mentalExam, 'perception', '');
	const thought = getFieldValue(mentalExam, 'thought', '');
	const behavior = getFieldValue(mentalExam, 'behavior', '');
	const memory = getFieldValue(mentalExam, 'memory', '');
	const attention = getFieldValue(mentalExam, 'attention', '');
	const intelligence = getFieldValue(mentalExam, 'intelligence', '');

	const labTestsSection = details[`${sectionPrefix}_kham_xet_nghiem`] || {};
	const labTests = getFieldValue(labTestsSection, 'required_tests', '');

	const treatmentPlan = role === 'doctor'
		? (history?.treatment_plan || '')
		: (getFieldValue(examForm, 'ke_hoach_can_thiep', '') || '');
	const treatmentType = 'Ngoại trú';
	const allergies = formatAllergyEntriesForDisplay(patient?.allergies || []);
	const loiDan = history?.loi_dan || '';

	// Đơn thuốc và form khám đã được khai báo ở đầu hàm (dòng 11257-11264)
	// Không cần khai báo lại ở đây



	const prescriptionType = prescriptionData?.prescriptions?.[0]?.type || '';

	let prescriptionDays = '';

	// Nếu không có từ API hoặc examination_details, thử parse từ usage_instructions
	if (!prescriptionDays && prescriptionData?.usage_instructions) {
		const usageInfo = parseGlobalUsagePayload(prescriptionData.usage_instructions);
		const globalUsage = usageInfo.global_usage || '';
		// Tìm số ngày trong chuỗi usage (ví dụ: "trong 7 ngày", "7 ngày", "uống trong 10 ngày")
		const daysMatch = globalUsage.match(/(\d+)\s*ngày/i);
		if (daysMatch && daysMatch[1]) {
			prescriptionDays = daysMatch[1];
		}
	}

	// Nếu vẫn không có, thử parse từ danh sách thuốc (lấy số ngày lớn nhất từ usage của từng thuốc)
	if (!prescriptionDays && prescriptionData?.medicines && Array.isArray(prescriptionData.medicines)) {
		let maxDays = 0;
		prescriptionData.medicines.forEach(medicine => {
			if (medicine.usage) {
				const usagePayload = parseMedicineUsagePayload(medicine.usage);
				const note = usagePayload.note || '';
				// Tìm số ngày trong note (ví dụ: "trong 4 ngày", "4 ngày", "uống trong 10 ngày")
				const daysMatch = note.match(/(\d+)\s*ngày/i);
				if (daysMatch && daysMatch[1]) {
					const days = parseInt(daysMatch[1], 10);
					if (days > maxDays) {
						maxDays = days;
					}
				}
			}
		});
		if (maxDays > 0) {
			prescriptionDays = String(maxDays);
		}
	}

	// Format prescriptionType để hiển thị
	let prescriptionTypeDisplay = prescriptionType;
	if (prescriptionType === 'co_ban') {
		prescriptionTypeDisplay = 'cơ bản';
	} else if (prescriptionType === 'H') {
		prescriptionTypeDisplay = 'đơn thuốc &quot;H&quot;';
	} else if (prescriptionType === 'N') {
		prescriptionTypeDisplay = 'đơn thuốc &quot;N&quot;';
	}

	const reExaminationDate = prescriptionData?.re_examination_date || '';

	// Build danh sách thuốc
	let medicinesHtml = '';
	if (prescriptionData && Array.isArray(prescriptionData.medicines) && prescriptionData.medicines.length > 0) {
		const medicineItems = prescriptionData.medicines.map((medicine, index) => {
			const usageHtml = buildMedicineUsageDescription(medicine);

			// Tên thuốc + hàm lượng + tên gốc (giống tab toa thuốc)
			const medicineName = medicine.name || 'Không tên';
			const genericName = medicine.generic_name || '';
			const strength = medicine.strength || '';
			const unit = medicine.unit || '';

			let medicineTitle = medicineName;
			if (strength) {
				medicineTitle += ` ${strength}`;
			}
			if (genericName) {
				medicineTitle += ` (${genericName})`;
			}

			const quantity = medicine.quantity || 0;
			const quantityDisplay = (Number.isInteger(quantity) && quantity < 10)
				? String(quantity).padStart(2, '0')
				: quantity;

            return `
                <div class="medical-record-medicine-item">
                    <div class="medical-record-medicine-row">
                        <div class="medical-record-medicine-name">${index + 1} . ${medicineTitle.toUpperCase()}</div>
                        <div class="medical-record-medicine-quantity">${quantityDisplay} ${unit}</div>
                    </div>
                    <div class="medical-record-medicine-usage">${usageHtml}</div>
                </div>
            `;
		}).join('');

		medicinesHtml = `
            <div class="prescription-medicine-list">
                ${medicineItems}
            </div>
        `;
	}

	return `
		<div class="prescription-preview prescription-preview--document">
            ${buildClinicPrintHeaderHTML(clinicInfo, patient?.patient_code || '')}
            
            <!-- Separator -->
            <div class="prescription-gradient-separator"></div>
            
            <!-- Tiêu đề -->
            <h3 class="prescription-preview__title prescription-preview__title--document">HỒ SƠ BỆNH ÁN</h3>
            
            <!-- I. Hành chính -->
            <div class="medical-record-section">
                <h6 class="medical-record-section-title">I. HÀNH CHÍNH</h6>
                <div class="medical-record-admin-grid">
                    <div class="medical-record-admin-main">
                        <div class="medical-record-line medical-record-line--tight"><strong>Họ tên:</strong> ${patientFullName || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Ngày sinh:</strong> ${patientBirthDate ? `${patientBirthDate} — ${ageDetail}` : ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Giới tính:</strong> ${genderDisplay || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Số điện thoại:</strong> ${patientPhone || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Nghề nghiệp:</strong> ${patientOccupation || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Địa chỉ:</strong> ${patientAddress || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Tỉnh/thành phố:</strong> ${patient.province || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Ghi chú:</strong> ${patientNote || ''}</div>
                    </div>
                    <div class="medical-record-admin-side">
                        <div class="medical-record-line medical-record-line--tight"><strong>Xu hướng tính dục:</strong> ${patientSexualOrientation || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>CMT/CCCD:</strong> ${patientIdCard || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Tôn giáo:</strong> ${patientReligion || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Tình trạng hôn nhân:</strong> ${patientMaritalStatus || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Học vấn:</strong> ${patientEducationLevel || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Người giám hộ:</strong> ${patientGuardian || ''}</div>
                        <div class="medical-record-line medical-record-line--tight"><strong>Thẻ BHYT:</strong> ${patientInsurance || ''}</div>
                    </div>
                </div>
            </div>

            <!-- II. Hỏi bệnh -->
            <div class="medical-record-section">
                <h6 class="medical-record-section-title">II. HỎI BỆNH</h6>
                <div class="medical-record-line" title="${formatPrintTitleText(mainReasonText)}">
                    <strong>Lý do chính đến khám:</strong> ${mainReasonText || ''}
                </div>
                <div class="medical-record-line" title="${formatPrintTitleText(mainSymptomsText)}">
                    <strong>Triệu chứng chính:</strong> ${mainSymptomsText || ''}
                </div>
                <div class="medical-record-line">
                    <strong>Đến khám cùng:</strong> ${relatives.length > 0
			? (() => {
				const relativesList = relatives
					.map(relative => {
						const name = relative.name || relative.relative_full_name || relative.relative_name || relative.full_name || '';
						const relationship = relative.kinship || relative.relationship || '';
						if (name && relationship) {
							return `${name} (${relationship})`;
						} else if (name) {
							return name;
						}
						return null;
					})
					.filter(item => item !== null)
					.join(', ');
				return relativesList || 'Đi một mình';
			})()
			: 'Đi một mình'}
                </div>
                <div class="medical-record-block">
                    <strong>Tiền sử bệnh:</strong>
                    <div class="medical-record-indent">
                        <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(personalHistory)}"><strong>+ Bản thân:</strong> ${personalHistory || ''}</div>
                        <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(familyHistory)}"><strong>+ Gia đình:</strong> ${familyHistory || ''}</div>
                    </div>
                </div>
            </div>

            <!-- III. Khám bệnh -->
            <div class="medical-record-section">
                <h6 class="medical-record-section-title">III. KHÁM BỆNH</h6>
                <!-- Vital signs - Gộp thành 1 hàng -->
                ${vitalSignsText}
                <div class="medical-record-line" title="${formatPrintTitleText(medicalHistory)}">
                    <strong>Bệnh sử:</strong> ${medicalHistory || ''}
                </div>
                <div class="medical-record-line" title="${formatPrintTitleText(generalManifestations)}"><strong>${role === 'doctor' ? 'Biểu hiện chung' : 'Đánh giá ban đầu'}:</strong> ${generalManifestations || ''}</div>
                
                <div class="medical-record-block">
                    <strong>${role === 'doctor' ? 'KQ khám toàn thân' : 'Diễn tiến trong phiên khám'}:</strong> ${generalExamination || ''}
                    <div class="medical-record-indent">
                        ${role === 'doctor' ? `
                        <div class="medical-record-subtitle"><strong>- Các cơ quan:</strong></div>
                        <div class="medical-record-indent-lg">
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(circulation)}">+ Tuần hoàn: ${circulation || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(digestive)}">+ Tiêu hoá: ${digestive || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(renalUrogenital)}">+ Thận-tiết niệu-sinh dục: ${renalUrogenital || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(musculoskeletal)}">+ Cơ-xương-khớp: ${musculoskeletal || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(ent)}">+ Tai-mũi-họng: ${ent || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(endocrineNutritionOthers)}">+ Nội tiết-dinh dưỡng: ${endocrineNutritionOthers || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(neurological)}">+ Thần kinh: ${neurological || ''}</div>
                        </div>
                        ` : ''}
                        
                        <div class="medical-record-subtitle medical-record-subtitle--spaced"><strong>- Khám tâm thần:</strong></div>
                        <div class="medical-record-indent-lg">
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(orientation)}">+ Ý thức định hướng: ${orientation || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(emotions)}">+ Tình cảm, cảm xúc: ${emotions || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(perception)}">+ Tri giác: ${perception || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(thought)}">+ Tư duy: ${thought || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(behavior)}">+ Hành vi tác phong: ${behavior || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(memory)}">+ Trí nhớ: ${memory || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(attention)}">+ Tập trung - chú ý: ${attention || ''}</div>
                            <div class="medical-record-line medical-record-line--compact" title="${formatPrintTitleText(intelligence)}">+ Trí năng: ${intelligence || ''}</div>
                        </div>
                        </div>
                        
                        ${role === 'doctor' ? `
                        <div class="medical-record-line medical-record-subtitle--spaced" title="${formatPrintTitleText(labTests)}"><strong>- Các xét nghiệm cận lâm sàng cần làm:</strong> ${labTests || ''}</div>
                        ` : ''}
                </div>
                
                <div class="medical-record-line" title="${formatPrintTitleText(diagnosisText)}"><strong>${role === 'doctor' ? 'Chẩn đoán (ICD-10)' : 'Triệu chứng & Hành vi'}:</strong> ${diagnosisText || ''}</div>
                <div class="medical-record-line" title="${formatPrintTitleText(benhKemTheo)}"><strong>${role === 'doctor' ? 'Bệnh kèm theo' : 'Nhận định chung'}:</strong> ${benhKemTheo || ''}</div>
                <div class="medical-record-line" title="${formatPrintTitleText(treatmentPlan)}"><strong>${role === 'doctor' ? 'Kết luận & Hướng Đ.trị' : 'Kế hoạch can thiệp'}:</strong> ${treatmentPlan || ''}</div>
                ${role === 'doctor' ? `<div class="medical-record-line" title="${formatPrintTitleText(allergies)}"><strong>Dị ứng thuốc:</strong> ${allergies || ''}</div>` : ''}
            </div>

            <!-- IV. Điều trị -->
            ${role === 'doctor' ? `
            <div class="medical-record-section">
                <h6 class="medical-record-section-title">IV. ĐIỀU TRỊ</h6>
                <div class="medical-record-block"><strong>Loại đơn thuốc:</strong> ${prescriptionTypeDisplay || ''}</div>
                <div class="medical-record-block"><strong>Số ngày thuốc:</strong> ${prescriptionDays || ''}</div>
                <div class="medical-record-block"><strong>Hẹn ngày tái khám:</strong> ${reExaminationDate ? formatVietnamDate(new Date(reExaminationDate)) : ''}</div>
                <div class="medical-record-treatment-list"><strong>Danh sách thuốc:</strong>${medicinesHtml || ''}</div>
                <div class="medical-record-loi-dan" title="${formatPrintTitleText(loiDan)}">
                    <strong>Lời dặn:</strong>
                    <div class="medical-record-loi-dan-text">${(loiDan || '').replace(/\n/g, '<br>')}</div>
                </div>
            </div>
            ` : ''}
            <div class="prescription-preview__signature prescription-preview__signature--avoid-break">
                <div>${signatureDateText}</div>
                <div class="prescription-preview__signature-role">${role === 'doctor' ? 'Bác sĩ khám bệnh' : 'Tâm lý gia'}</div>
                <div class="prescription-preview__signature-name">${doctorName}</div>
            </div>
        </div>
    `;
}

/**
 * CSS styles chung cho print prescription / bệnh án / dịch vụ
 * DRY: dùng chung cho cả doctor và psychologist
 */
function getPrescriptionPrintStyles() {
	return `
        @page {
            size: A4;
            margin: 5mm 5mm;
        }
        html, body { 
            background: #fff !important; 
            background-color: #fff !important; 
            padding: 0 !important; 
            margin: 0 !important; 
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important; 
        }
        .prescription-preview { 
            background: #ffffff; 
            border: 1px solid #dee2e6; 
            border-radius: 12px; 
            padding: 24px; 
            padding-top: 10px !important; 
            color: #212529; 
            font-size: var(--qlpk-font-size-md, 14px); 
            line-height: 1.6; 
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important; 
        }
        .prescription-preview *, 
        .prescription-preview em, 
        .prescription-preview i,
        .prescription-preview [style*="italic"] {
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important;
        }
        .prescription-preview__header { 
            display: flex; 
            justify-content: flex-start; 
            gap: 24px; 
            border-bottom: none; 
            font-size: var(--qlpk-font-size-sm, 12px);
        }
        .prescription-preview__header--clinic {
            align-items: flex-start;
            gap: 20px;
            justify-content: flex-start;
        }
        .clinic-logo {
            flex-shrink: 0;
        }
        .clinic-logo__image {
            height: auto;
            object-fit: contain;
            width: 120px;
        }
        .clinic-info {
            flex: 1;
            min-width: 0;
        }
        .clinic-name-row {
            align-items: center;
            display: flex;
            justify-content: space-between;
        }
        .clinic-details--loose {
            line-height: 1.8;
        }
        .clinic-detail-line {
            margin-bottom: 4px;
        }
        .prescription-code-section {
            align-items: center;
            align-self: flex-start;
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            gap: 5px;
            margin-top: 40px;
        }
        .barcode-svg--patient {
            height: 35px;
            width: 200px;
        }
        .patient-code {
            font-size: var(--qlpk-font-size-md, 14px);
            font-weight: var(--qlpk-font-weight-bold, 700);
            text-align: center;
        }
        .prescription-gradient-separator {
            height: 4px !important;
            background: linear-gradient(to right, #1976D2, #42A5F5) !important;
            border-radius: 2px !important;
            margin: 5px 0 !important;
            display: block !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .prescription-preview__title { 
            text-align: center; 
            font-weight: var(--qlpk-font-weight-bold, 700); 
            font-size: var(--qlpk-font-size-3xl, 24px); 
            letter-spacing: 1px; 
            margin: 40px 0 15px; 
            color: #1d4ed8; 
        }
        .prescription-preview__title--document {
            font-size: var(--qlpk-font-size-3xl, 24px);
            font-weight: var(--qlpk-font-weight-bold, 700);
        }
        .prescription-preview__diagnosis {
            margin-bottom: 10px;
        }
        .prescription-preview__patient-info { 
            display: flex; 
            gap: 16px; 
        }
        .prescription-preview__patient-info div > div { 
            margin-bottom: 6px; 
        }
        .prescription-preview__patient-info-left { 
            flex: 0 0 66.6667%; 
            max-width: 66.6667%; 
        }
        .prescription-preview__patient-info-right { 
            flex: 0 0 33.3333%; 
            max-width: 33.3333%; 
        }
        .prescription-preview__body { 
            margin-bottom: 20px; 
        }
        .prescription-preview-table { 
            width: 100%; 
            border-collapse: collapse; 
            font-size: var(--qlpk-font-size-lg, 16px); 
        }
        .prescription-preview-table th, .prescription-preview-table td { 
            border: 1px solid #55585c; 
            padding: 10px 12px; 
            vertical-align: top; 
        }
        .prescription-preview-table th { 
            background: #f1f5f9; 
            font-size: var(--qlpk-font-size-lg, 16px); 
            letter-spacing: 0.5px; 
        }
        .prescription-medicine-table th, .prescription-medicine-table td { 
            text-align: center; 
        }
        .prescription-medicine-table .col-medicine-name, .prescription-medicine-table .col-medicine-usage, .prescription-medicine-table td:nth-child(2), .prescription-medicine-table td:nth-child(5) { 
            text-align: left; 
        }
        .prescription-service-table__col-index { width: 5%; }
        .prescription-service-table__col-name { width: 30%; }
        .prescription-service-table__col-quantity { width: 10%; }
        .prescription-service-table__col-duration { width: 12%; }
        .prescription-service-table__col-price { width: 18%; }
        .prescription-service-table__col-total { width: 25%; }
        .prescription-preview__signature {
            margin-left: auto;
            margin-right: 0;
            margin-top: 30px;
            max-width: 50%;
            padding-top: 30px;
            text-align: center;
        }
        .prescription-preview__signature--avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .prescription-preview__signature-role {
            margin-top: 8px;
        }
        .prescription-preview__signature-name {
            margin-top: 64px;
        }
        .prescription-preview__footer { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-end; 
            gap: 16px; 
        }
        .clinic-name { 
            font-weight: var(--qlpk-font-weight-bold, 700); 
            font-size: var(--qlpk-font-size-lg, 16px); 
            text-transform: uppercase; 
            color: #1d4ed8; 
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif);
            line-height: 1.5;
        }
        .clinic-details {
            font-size: var(--qlpk-font-size-base, 13px);
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif);
            line-height: 1.5;
        }
        .prescription-code-badge {
            font-size: var(--qlpk-font-size-md, 14px);
            font-weight: var(--qlpk-font-weight-bold, 700);
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif);
            line-height: 1.5;
        }
        .prescription-preview--document {
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif);
            font-size: var(--qlpk-font-size-md, 14px);
        }
        .medical-record-section {
            margin-bottom: 15px;
        }
        .medical-record-section-title {
            font-weight: var(--qlpk-font-weight-bold, 700);
            margin-bottom: 10px;
        }
        .medical-record-admin-grid {
            align-items: flex-start;
            display: flex;
            flex-direction: row;
            gap: 16px;
        }
        .medical-record-admin-main {
            flex: 0 0 66.6667%;
            max-width: 66.6667%;
        }
        .medical-record-admin-side {
            flex: 0 0 33.3333%;
            max-width: 33.3333%;
        }
        .medical-record-line {
            margin-bottom: 8px;
            max-width: 100%;
            overflow-wrap: break-word;
            word-wrap: break-word;
        }
        .medical-record-line--tight {
            margin-bottom: 6px;
        }
        .medical-record-line--compact {
            margin-bottom: 4px;
        }
        .medical-record-block {
            margin-bottom: 8px;
        }
        .medical-record-indent {
            margin-left: 20px;
            margin-top: 5px;
        }
        .medical-record-indent-lg {
            margin-left: 20px;
        }
        .medical-record-subtitle {
            margin-bottom: 5px;
        }
        .medical-record-subtitle--spaced {
            margin-top: 10px;
        }
        .medical-record-treatment-list {
            margin-top: 10px;
        }
        .medical-record-loi-dan {
            margin-bottom: 8px;
            margin-top: 10px;
            max-width: 100%;
            overflow-wrap: break-word;
            word-wrap: break-word;
        }
        .medical-record-loi-dan-text {
            margin-top: 4px;
        }
        .medical-record-medicine-item {
            margin-bottom: 14px;
        }
        .medical-record-medicine-row {
            align-items: baseline;
            display: flex;
            gap: 16px;
        }
        .medical-record-medicine-name {
            flex: 0 0 66.6667%;
            font-weight: var(--qlpk-font-weight-bold, 700);
            max-width: 66.6667%;
        }
        .medical-record-medicine-quantity {
            flex: 0 0 33.3333%;
            font-weight: var(--qlpk-font-weight-bold, 700);
            max-width: 33.3333%;
        }
        .medical-record-medicine-usage {
            line-height: 1.5;
            margin-top: 2px;
            padding-left: 20px;
        }
        .printable-content .card { 
            box-shadow: none !important; 
            border: none !important; 
        }
        .printable-content .card-body { 
            max-height: none !important; 
            overflow: visible !important; 
        }
        .printable-content .tab-pane { 
            display: block !important; 
            opacity: 1 !important; 
        }
        .printable-content .prescription-preview__header { 
            display: flex !important;
            align-items: flex-start !important;
            gap: 20px !important;
            flex-wrap: nowrap !important; 
            justify-content: flex-start !important;
            border-bottom: none !important;
        }
        .printable-content .clinic-logo {
            flex-shrink: 0 !important;
            width: auto !important;
        }
        .printable-content .clinic-info {
            flex: 1 !important;
            min-width: 0 !important;
        }
        .printable-content .prescription-code-section {
            flex-shrink: 0 !important;
            width: auto !important;
        }
        .printable-content .prescription-preview__header > div:first-child { 
            flex: 1 1 auto !important; 
            max-width: none !important; 
            text-align: left !important;
        }
        @media print {
            .prescription-preview {
                font-size: var(--qlpk-font-size-md, 14px) !important;
                border: none !important;
                border-radius: 0 !important;
                height: auto !important;
                min-height: 280mm !important;
                max-height: none !important;
                display: block !important;
                page-break-inside: avoid !important;
                position: relative !important;
                box-sizing: border-box !important;
            }
            .prescription-preview__title {
                font-size: var(--qlpk-font-size-3xl, 24px) !important;
                margin: 15px 0 10px !important;
            }
            .prescription-medicine-table th, .table thead th { 
                white-space: nowrap; 
                background: #f1f5f9 !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .prescription-preview-table th { 
                background: #f1f5f9 !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .prescription-medicine-table th:nth-child(1), .prescription-medicine-table td:nth-child(1) { 
                width: 5%; 
            }
            .prescription-medicine-table th:nth-child(2), .prescription-medicine-table td:nth-child(2) { 
                width: 25%; 
            }
            .prescription-medicine-table th:nth-child(3), .prescription-medicine-table td:nth-child(3) { 
                width: 12%; 
            }
            .prescription-medicine-table th:nth-child(4), .prescription-medicine-table td:nth-child(4) { 
                width: 12%; 
            }
            .prescription-medicine-table th:nth-child(5), .prescription-medicine-table td:nth-child(5) { 
                width: 46%; 
            }
            .prescription-service-table th { 
                white-space: nowrap; 
            }
            .prescription-service-table th:nth-child(1), .prescription-service-table td:nth-child(1) { 
                width: 5%; 
            }
            .prescription-service-table th:nth-child(2), .prescription-service-table td:nth-child(2) { 
                width: 30%; 
            }
            .prescription-service-table th:nth-child(3), .prescription-service-table td:nth-child(3) { 
                width: 10%; 
            }
            .prescription-service-table th:nth-child(4), .prescription-service-table td:nth-child(4) { 
                width: 12%; 
            }
            .prescription-service-table th:nth-child(5), .prescription-service-table td:nth-child(5) { 
                width: 18%; 
            }
            .prescription-service-table th:nth-child(6), .prescription-service-table td:nth-child(6) { 
                width: 25%; 
            }
            .prescription-preview__body { 
                overflow: visible !important; 
            }
            html, body { 
                background: #fff !important; 
                background-color: #fff !important; 
                height: auto !important; 
                margin: 0 !important; 
                padding: 0 !important; 
            }
            .printable-content { 
                height: auto !important; 
            }
            .clinic-name { 
                font-weight: var(--qlpk-font-weight-bold, 700) !important; 
                font-size: var(--qlpk-font-size-lg, 16px) !important; 
                text-transform: uppercase !important; 
                color: #1d4ed8 !important; 
                font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important;
                line-height: 1.5 !important;
            }
            .clinic-details {
                font-size: var(--qlpk-font-size-base, 13px) !important;
                font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important;
                line-height: 1.5 !important;
            }
            .prescription-code-badge {
                font-size: var(--qlpk-font-size-md, 14px) !important;
                font-weight: var(--qlpk-font-weight-bold, 700) !important;
                font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important;
                line-height: 1.5 !important;
            }
            .prescription-preview-table { 
                font-size: var(--qlpk-font-size-lg, 16px) !important; 
            }
            .prescription-preview-table th { 
                font-size: var(--qlpk-font-size-lg, 16px) !important; 
            }
            .prescription-preview__patient-info { 
                flex-direction: row !important; 
            }
            .prescription-preview__patient-info-left { 
                flex: 0 0 70% !important; 
                max-width: 70% !important; 
            }
            .prescription-preview__patient-info-right { 
                flex: 0 0 30% !important; 
                max-width: 30% !important; 
            }
            .printable-content .prescription-preview__header { 
                display: flex !important;
                align-items: flex-start !important;
                gap: 20px !important;
                border-bottom: none !important;
                flex-wrap: nowrap !important;
            }
            .printable-content .clinic-logo {
                flex-shrink: 0 !important;
                width: auto !important;
            }
            .printable-content .clinic-info {
                flex: 1 !important;
                min-width: 0 !important;
            }
            .printable-content .prescription-code-section {
                flex-shrink: 0 !important;
                width: auto !important;
            }
            .prescription-gradient-separator {
                height: 4px !important;
                background: linear-gradient(to right, #1976D2, #42A5F5) !important;
                border-radius: 2px !important;
                display: block !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .printable-content .prescription-preview__header > div:last-child { 
                padding-right: 24px !important; 
            }
            .prescription-preview__footer { 
                flex-shrink: 0 !important; 
                margin-top: 20px !important; 
                text-align: left !important; 
                width: 100% !important; 
            }
            .prescription-preview__footer > div { 
                text-align: left !important; 
                width: 100% !important; 
            }
            .prescription-preview__signature { 
                flex-shrink: 0 !important; 
                margin-top: 0 !important; 
                padding-top: 0 !important; 
                text-align: center !important; 
                margin-left: auto !important; 
                margin-right: 0 !important; 
                max-width: 50% !important; 
            }
            .prescription-under18-info {
                position: absolute !important;
                bottom: 15px !important;
                left: 24px !important;
                right: 24px !important;
                width: auto !important;
                border-top: 1px solid #000 !important;
                padding-top: 10px !important;
                font-size: var(--qlpk-font-size-sm, 12px) !important;
                line-height: 1.8 !important;
                font-style: italic !important;
                margin-top: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
    `;
}

/**
 * Setup print window với HTML content và styles
 */

function setupPrintWindow(htmlContent, title = 'In đơn thuốc') {
	const printWindow = window.open('', '_blank', 'width=900,height=700');
	if (!printWindow) {
		showCustomToast && showCustomToast('error', 'Trình duyệt chặn cửa sổ in');
		return null;
	}

	const styles = getPrescriptionPrintStyles();
	printWindow.document.open();
	printWindow.document.write('<!DOCTYPE html>');
	printWindow.document.write('<html lang="vi">');
	printWindow.document.write('<head>');
	printWindow.document.write('<meta charset="utf-8">');
	printWindow.document.write(`<title>${title}</title>`);
	printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">');
	printWindow.document.write('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">');
	printWindow.document.write('<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>');
	const printStyle = printWindow.document.createElement('style');
	printStyle.textContent = styles;
	printWindow.document.head.appendChild(printStyle);
	printWindow.document.write('</head>');
	printWindow.document.write('<body>');
	printWindow.document.write(htmlContent);
	printWindow.document.write('<script>');
	printWindow.document.write(`
        // Tạo barcode sau khi document được load
        window.addEventListener('load', function() {
            // Tìm tất cả các element có class barcode-svg
            const barcodeElements = document.querySelectorAll('.barcode-svg');
            barcodeElements.forEach(function(svg) {
                const id = svg.id;
                if (id && id.startsWith('barcode-')) {
                    const code = id.replace('barcode-', '');
                    try {
                        JsBarcode(svg, code, {
                            format: "CODE128",
                            width: 1.5,
                            height: 35,
                            displayValue: false,
                            margin: 0
                        });
                        // Chốt attribute SVG sau khi JsBarcode render.
                        svg.setAttribute('width', '200px');
                        svg.setAttribute('height', '35px');
                    } catch (e) {
                        console.error('Lỗi tạo barcode:', e);
                    }
                }
            });
        });
    `);
	printWindow.document.write('</script>');
	printWindow.document.write('</body>');
	printWindow.document.write('</html>');
	printWindow.document.close();

	return printWindow;
}

/**
 * Trigger print cho print window (DRY - dùng chung cho tất cả chức năng in)
 */

function triggerPrint(printWindow) {
	if (!printWindow) {
		return;
	}

	printWindow.onload = () => {
		printWindow.focus();
		setTimeout(() => {
			printWindow.print();
			setTimeout(() => {
				printWindow.close();
			}, 100);
		}, 250);
	};
}

/**
 * Fetch appointment từ API
 */

async function fetchPatientDetailForPrescription(patientId, forceReload = false) {
	if (!forceReload && prescriptionTabCache.patient.has(patientId)) {
		return prescriptionTabCache.patient.get(patientId);
	}
	const response = await apiCall(`/api/patients/${patientId}`);
	if (!response.ok) {
		throw new Error('Không thể tải thông tin bệnh nhân');
	}
	const data = await response.json();
	const result = data.data || data;
	prescriptionTabCache.patient.set(patientId, result);
	return result;
}

/**
 * Fetch examination detail cho prescription
 */

async function fetchExaminationDetailForPrescription(examinationId, forceReload = false) {
	if (!forceReload && prescriptionTabCache.examination.has(examinationId)) {
		return prescriptionTabCache.examination.get(examinationId);
	}
	const response = await apiCall(`/api/examination-detail/${examinationId}`);
	if (!response.ok) {
		throw new Error('Không thể tải thông tin lượt khám');
	}
	const data = await response.json();
	prescriptionTabCache.examination.set(examinationId, data);
	return data;
}

/**
 * Fetch examination details by section cho prescription
 */

async function fetchExaminationDetailsBySection(examinationId, forceReload = false) {
	if (!forceReload && prescriptionTabCache.examinationDetails.has(examinationId)) {
		return prescriptionTabCache.examinationDetails.get(examinationId);
	}
	const response = await apiCall(`/api/examination-details/${examinationId}`);
	if (!response.ok) {
		throw new Error('Không thể tải thông tin chi tiết khám bệnh');
	}
	const data = await response.json();
	prescriptionTabCache.examinationDetails.set(examinationId, data);
	return data;
}

/**
 * Fetch prescription data cho appointment
 */

async function fetchPrescriptionDataForAppointment(appointmentId, forceReload = false) {
	if (!forceReload && prescriptionTabCache.prescription.has(appointmentId)) {
		return prescriptionTabCache.prescription.get(appointmentId);
	}
	const response = await apiCall(`/api/prescription/appointment/${appointmentId}`);
	if (!response.ok) {
		throw new Error('Không thể tải đơn thuốc');
	}
	const data = await response.json();
	prescriptionTabCache.prescription.set(appointmentId, data);
	return data;
}

/**
 * Fetch services data cho appointment
 */

async function fetchServicesForAppointment(appointmentId, forceReload = false) {
	if (!appointmentId) return null;
	if (!forceReload && servicesTabCache.has(appointmentId)) {
		return servicesTabCache.get(appointmentId);
	}
	const response = await apiCall(`/services/appointment/${appointmentId}`);
	if (!response.ok) {
		throw new Error('Không thể tải dịch vụ');
	}
	const data = await response.json();
	servicesTabCache.set(appointmentId, data);
	return data;
}

/**
 * Fetch dữ liệu cho prescription (patient, examination, prescription data)
 */

async function fetchPrescriptionDataForPrint(appointmentId, examinationId, patientId, options = {}) {
	if (!appointmentId) {
		throw new Error('Thiếu appointment_id để tải dữ liệu in đơn thuốc');
	}

	const response = await apiCall(`/api/prescription/appointment/${appointmentId}/print-view-model`);
	if (!response.ok) {
		throw new Error('Không thể tải dữ liệu in đơn thuốc');
	}

	const data = await response.json();
	return {
		patient: data.patient || null,
		examinationDetail: data.examinationDetail || null,
		examinationDetailsBySection: data.examinationDetailsBySection || {},
		prescriptionData: data.prescriptionData || null,
		history: data.history || null,
		relatives: data.relatives || []
	};
}

// ============================================
// Barcode Generation — Shared (DRY)
// ============================================

/**
 * Tạo barcode cho tất cả các element .barcode-svg trong một container
 */
function createBarcodesInElement(container) {
	const createBarcodes = () => {
		const barcodeElements = container.querySelectorAll('.barcode-svg');
		barcodeElements.forEach(function (svg) {
			const id = svg.id;
			if (id && id.startsWith('barcode-')) {
				const code = id.replace('barcode-', '');
				try {
					JsBarcode(svg, code, {
						format: "CODE128",
						width: 1.5,
						height: 35,
						displayValue: false,
						margin: 0
					});
					// Chốt attribute SVG sau khi JsBarcode render.
					svg.setAttribute('width', '200px');
					svg.setAttribute('height', '35px');
				} catch (e) {
					console.error('Lỗi tạo barcode:', e);
				}
			}
		});
	};

	// Kiểm tra xem JsBarcode đã được load chưa
	if (typeof JsBarcode !== 'undefined') {
		setTimeout(createBarcodes, 100);
	} else {
		// Load JsBarcode nếu chưa có
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
		script.onload = function () {
			setTimeout(createBarcodes, 100);
		};
		script.onerror = function () {
			console.error('Không thể load thư viện JsBarcode');
		};
		document.head.appendChild(script);
	}
}

// ============================================
// Prescription Tab — Shared (DRY) — Scroll layout
// ============================================

let prescriptionTabPageIndexBridge = 0;

function getPrescriptionModalPreviewController() {
	if (window.prescriptionModalPreviewController) {
		return window.prescriptionModalPreviewController;
	}

	if (typeof window.createPrescriptionModalPreview === 'function') {
		window.prescriptionModalPreviewController = window.createPrescriptionModalPreview();
		return window.prescriptionModalPreviewController;
	}

	const message = 'Không thể xem trước đơn thuốc. Vui lòng tải lại trang.';
	console.error(message);
	showCustomToast && showCustomToast('error', message);
	return null;
}

/**
 * Render tất cả đơn thuốc dạng scroll (không phân trang)
 * Dùng chung cho cả doctor và psychologist
 */
function renderPrescriptionPage() {
	const controller = getPrescriptionModalPreviewController();
	return controller ? controller.renderPrescriptionPage() : null;
}


/**
 * Setup dữ liệu pagination cho prescription tab
 * Gọi từ renderPrescriptionTab() trong doctor/psychologist
 */
function setupPrescriptionTabPagination({ prescriptionData, clinicInfo, patient, history, examinationDetail, examinationDetailsBySection, relatives }) {
	const controller = getPrescriptionModalPreviewController();
	return controller ? controller.setupPrescriptionTabPagination({ prescriptionData, clinicInfo, patient, history, examinationDetail, examinationDetailsBySection, relatives }) : null;
}

// Expose pagination via window for inline onclick
Object.defineProperty(window, '_prescriptionTabPageIndex', {
	get() { return window.prescriptionModalPreviewController?.pageIndex ?? prescriptionTabPageIndexBridge; },
	set(v) {
		if (window.prescriptionModalPreviewController) {
			window.prescriptionModalPreviewController.pageIndex = v;
		} else {
			prescriptionTabPageIndexBridge = v;
		}
	},
	configurable: true
});

/**
 * Merge prescription data từ form và API
 */

// Template HTML được include server-side bằng Jinja {% include 'partials/patient-search-modal.html' %}
// Không cần async template loader

// ============================================
// Expose functions lên window để các file khác access
// ============================================
window.PRESCRIPTION_USAGE_MODES = PRESCRIPTION_USAGE_MODES;
window.ensureValidPrescriptionUsageMode = ensureValidPrescriptionUsageMode;
window.buildSelectOptions = buildSelectOptions;
window.updateServiceAmountDisplayFromValue = updateServiceAmountDisplayFromValue;
window.getToastIcon = getToastIcon;
window.showCustomToast = showCustomToast;
window.showConfirmationDialog = showConfirmationDialog;
window.getClinicInfoConfig = getClinicInfoConfig;
window.formatVietnamDate = formatVietnamDate;
window.calculateDetailedAge = calculateDetailedAge;
window.formatPrintAge = formatPrintAge;
window.formatGenderDisplay = formatGenderDisplay;
window.formatMaritalStatusDisplay = formatMaritalStatusDisplay;
window.formatCurrency = formatCurrency;
window.printModalPrescription = printModalPrescription;
window.printModalServices = printModalServices;
window.printModalMedicalRecord = printModalMedicalRecord;
window.printModalTabContent = printModalTabContent;

window.buildFullAddressFromParts = buildFullAddressFromParts;
window.buildMedicineUsageDescription = buildMedicineUsageDescription;
window.buildPrescriptionPreviewHTML = buildPrescriptionPreviewHTML;
window.buildServiceInvoiceHTML = buildServiceInvoiceHTML;
window.buildMedicalRecordHTML = buildMedicalRecordHTML;
window.getPrescriptionPrintStyles = getPrescriptionPrintStyles;
window.setupPrintWindow = setupPrintWindow;
window.triggerPrint = triggerPrint;
window.fetchPatientDetailForPrescription = fetchPatientDetailForPrescription;
window.fetchExaminationDetailForPrescription = fetchExaminationDetailForPrescription;
window.fetchExaminationDetailsBySection = fetchExaminationDetailsBySection;
window.fetchPrescriptionDataForAppointment = fetchPrescriptionDataForAppointment;
window.fetchServicesForAppointment = fetchServicesForAppointment;
window.fetchPrescriptionDataForPrint = fetchPrescriptionDataForPrint;
window.renderPrescriptionPage = renderPrescriptionPage;
window.setupPrescriptionTabPagination = setupPrescriptionTabPagination;
window.PRESCRIPTION_PAGE_COLORS = window.PRESCRIPTION_PAGE_COLORS || {};
window.createBarcodesInElement = createBarcodesInElement;
// ensurePatientSearchModalLoaded đã loại bỏ — template include server-side


// ============================================
// Modal Core Functions — Di dời từ doctor-examination.js
// ============================================

async function loadMedicalHistoryIntoModal() {
	// Load medical draft from sessionStorage for current page load
	let raw = null;
	let data = null;
	let loadId = null;

	try {
		raw = sessionStorage.getItem(MEDICAL_DRAFT_KEY);
		loadId = sessionStorage.getItem(PAGE_LOAD_ID_KEY);
		if (raw) {
			data = JSON.parse(raw);
			if (!data.loadId || data.loadId === loadId) {
				if (document.getElementById('mainReason')) {
					document.getElementById('mainReason').value = data.mainReason || '';
				}
				if (window.ReferralSourceControl) {
					window.ReferralSourceControl.setValue(data.referralSource || '', { document });
				} else if (document.getElementById('referralSource')) {
					document.getElementById('referralSource').value = data.referralSource || '';
				}
				if (document.getElementById('problemStartTime')) {
					document.getElementById('problemStartTime').value = data.problemStartTime || '';
				}
				if (document.getElementById('symptomProgression')) {
					document.getElementById('symptomProgression').value = data.symptomProgression || '';
				}
				if (document.getElementById('allergies')) {
					document.getElementById('allergies').value = formatAllergyEntriesForDisplay(data.allergies || []);
				}
				if (data.physicalHistory) {
					if (window.physicalHistoryAutocomplete) {
						window.physicalHistoryAutocomplete.setValue(data.physicalHistory);
					} else {
						if (document.getElementById('physicalHistory')) {
							document.getElementById('physicalHistory').value = data.physicalHistory;
						}
					}
				} else {
					if (window.physicalHistoryAutocomplete) {
						window.physicalHistoryAutocomplete.clear();
					} else {
						if (document.getElementById('physicalHistory')) {
							document.getElementById('physicalHistory').value = '';
						}
					}
				}
				if (document.getElementById('substanceHistory')) {
					document.getElementById('substanceHistory').value = data.substanceHistory || '';
				}
				if (document.getElementById('familyHistory')) {
					document.getElementById('familyHistory').value = data.familyHistory || '';
				}
				if (document.getElementById('familyRelationship')) {
					document.getElementById('familyRelationship').value = data.familyRelationship || '';
				}
				if (document.getElementById('livingEnvironment')) {
					document.getElementById('livingEnvironment').value = data.livingEnvironment || '';
				}
				if (document.getElementById('mainSymptoms')) {
					document.getElementById('mainSymptoms').value = data.mainSymptoms || '';
				}
				if (document.getElementById('currentBehavior')) {
					document.getElementById('currentBehavior').value = data.currentBehavior || '';
				}
				if (document.getElementById('severityLevel')) {
					document.getElementById('severityLevel').value = data.severityLevel || '';
				}
			}
		}
	} catch (e) {
		console.error('Error loading medical draft:', e);
	}

	// Nếu không có draft data hợp lệ, load từ appointment/examination nếu có
	const hasValidDraft = raw && data && (!data.loadId || data.loadId === loadId);

	// Load #mainReason (modal) từ examinations.main_reason
	if (currentAppointmentId && !hasValidDraft) {
		try {
			const appointmentResponse = await apiCall(`/api/appointments/${currentAppointmentId}`, { method: 'GET' });
			if (appointmentResponse.ok) {
				const appointmentData = await appointmentResponse.json();
				// #mainReason (modal): load từ examinations.main_reason
				if (appointmentData.examination_info?.main_reason) {
					if (document.getElementById('mainReason')) {
						document.getElementById('mainReason').value = appointmentData.examination_info.main_reason;
					}
				}
				if (appointmentData.examination_info?.main_symptoms) {
					if (document.getElementById('mainSymptoms')) {
						document.getElementById('mainSymptoms').value = appointmentData.examination_info.main_symptoms;
					}
				}
			}
		} catch (error) {
			console.error('Error loading examination data for modal:', error);
		}
	}

	// Load các field khác từ patient nếu có currentPatientId
	if (currentPatientId && !hasValidDraft) {
		loadPatientMedicalData(currentPatientId);
	}

	// Không còn đọc legacy localStorage để tránh dính cache sau F5

	// Load attachments from server
	try { await loadAttachmentsForCurrentPatient(); } catch (e) { }

	// Sync data từ modal về hidden fields sau khi load xong
	syncMedicalHistoryToHiddenFields();
}

// ================= AUTO-SAVE BLOCK 2: MODAL HỎI BỆNH =================
// Auto-save field từ modal Hỏi bệnh vào database

// Đối tượng điều khiển sinh hiệu của Modal dùng chung, tự quản hoàn toàn (tránh Name Collision với doctor-examination.js)
const ModalVitalController = {
	state: {
		data: [],
		timeRange: 'all',
		viewMode: 'chart',
		chart: null
	},

	injectStyles() {
		// CSS owner: app/static/css/patient-search-modal.css. Giữ method để không đổi init contract.
	},

	setDisplay(element, mode) {
		if (!element) return;
		element.classList.remove('vital-hidden', 'vital-display-flex', 'vital-display-block');
		if (mode === 'none') {
			element.classList.add('vital-hidden');
		} else if (mode === 'flex') {
			element.classList.add('vital-display-flex');
		} else if (mode === 'block') {
			element.classList.add('vital-display-block');
		}
	},

	async loadData(patientId, patientName) {
		if (!patientId) {
			this.showEmpty();
			return;
		}

		try {

			// Gọi API lấy lịch sử khám của bệnh nhân
			const response = await fetch(`/api/patients/${patientId}/examinations`, {
				headers: getPatientSearchAuthHeaders()
			});
			if (!response.ok) throw new Error('Failed to fetch examinations');

			const data = await response.json();

			if (!data.examinations || data.examinations.length === 0) {
				this.showEmpty('Chưa có dữ liệu sinh hiệu');
				return;
			}

			// Xử lý dữ liệu và lưu vào state
			this.state.data = this.processData(data.examinations);
			
			// Render dữ liệu theo View Mode hiện tại
			this.renderContent();

		} catch (error) {
			console.error('Error loading vital signs:', error);
			this.showEmpty('Lỗi khi tải dữ liệu');
		}
	},

	processData(examinations) {
		// Sắp xếp theo ngày khám tăng dần
		const sorted = examinations
			.filter(e => e.examination_date)
			.sort((a, b) => new Date(a.examination_date) - new Date(b.examination_date));

		return sorted.map(exam => {
			const bpParsed = this.parseBloodPressureRange(exam.blood_pressure);
			return {
				date: exam.examination_date,
				dateLabel: this.formatDateLabel(exam.examination_date),
				timeLabel: this.formatTimeLabel(exam.examination_date),
				fullDateLabel: this.formatFullDateLabel(exam.examination_date),
				breathing: exam.breathing || null,
				pulse: exam.pulse || null,
				bloodPressureRaw: exam.blood_pressure || '',
				bloodPressureMin: bpParsed ? bpParsed.dia : null,
				bloodPressureMax: bpParsed ? bpParsed.sys : null,
				temperature: exam.temperature || null,
				weight: exam.weight || null,
				height: exam.height || null,
				bmi: exam.bmi || null,
				doctorName: exam.doctor ? exam.doctor.full_name : '',
				serviceName: exam.service ? exam.service.name : ''
			};
		});
	},

	parseBloodPressureRange(bp) {
		if (!bp) return null;
		const parts = bp.toString().split('/');
		if (parts.length === 2) {
			const sys = parseInt(parts[0]);
			const dia = parseInt(parts[1]);
			if (!isNaN(sys) && !isNaN(dia)) {
				return { sys, dia };
			}
		}
		const match = bp.toString().match(/(\d+)/);
		if (match) {
			const val = parseInt(match[1]);
			return { sys: val, dia: val };
		}
		return null;
	},

	formatDateLabel(dateStr) {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return `${date.getDate()}/${date.getMonth() + 1}`;
	},

	formatTimeLabel(dateStr) {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const h = String(date.getHours()).padStart(2, '0');
		const min = String(date.getMinutes()).padStart(2, '0');
		return `${h}:${min}`;
	},

	formatFullDateLabel(dateStr) {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const d = String(date.getDate()).padStart(2, '0');
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const h = String(date.getHours()).padStart(2, '0');
		const min = String(date.getMinutes()).padStart(2, '0');
		return `${h}:${min} ${d}/${m}`;
	},

	showEmpty(message = 'Chọn bệnh nhân để xem lưu đồ sinh hiệu') {
		const emptyEl = document.getElementById('vitalSignsChartEmpty');
		const chartLayoutEl = document.getElementById('vitalSignsChartLayout');
		const canvasEl = document.getElementById('vitalSignsChart');
		const tableEl = document.getElementById('vitalSignsTableWrapper');

		if (emptyEl) {
			this.setDisplay(emptyEl, 'flex');
			emptyEl.querySelector('p').textContent = message;
		}
		this.setDisplay(chartLayoutEl, 'none');
		this.setDisplay(canvasEl, 'none');
		this.setDisplay(tableEl, 'none');

		if (this.state.chart) {
			this.state.chart.destroy();
			this.state.chart = null;
		}
	},

	filterDataByTimeRange(data, range) {
		if (range === 'all' || !data.length) return data;

		const now = new Date();
		let cutoffDate;

		switch (range) {
			case '1w':
				cutoffDate = new Date(now.setDate(now.getDate() - 7));
				break;
			case '1m':
				cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
				break;
			case '3m':
				cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
				break;
			default:
				return data;
		}

		return data.filter(d => new Date(d.date) >= cutoffDate);
	},

	renderContent() {
		const filteredData = this.filterDataByTimeRange(this.state.data, this.state.timeRange);
		this.state.filteredData = filteredData;

		const chartLayoutEl = document.getElementById('vitalSignsChartLayout');
		const canvasEl = document.getElementById('vitalSignsChart');
		const tableEl = document.getElementById('vitalSignsTableWrapper');
		const emptyEl = document.getElementById('vitalSignsChartEmpty');

		if (filteredData.length === 0) {
			this.showEmpty('Không có dữ liệu trong khoảng thời gian này');
			return;
		}

		this.setDisplay(emptyEl, 'none');

		if (this.state.viewMode === 'chart') {
			this.setDisplay(tableEl, 'none');
			this.setDisplay(chartLayoutEl, 'flex');
			this.setDisplay(canvasEl, 'block');
			this.renderChart(filteredData);
		} else {
			this.setDisplay(chartLayoutEl, 'none');
			this.setDisplay(canvasEl, 'none');
			this.setDisplay(tableEl, 'block');
			this.renderTable(filteredData);
		}
	},

	renderChart(filteredData) {
		const scrollContainer = document.getElementById('vitalSignsChartScrollable');
		const canvasEl = document.getElementById('vitalSignsChart');
		const headerTable = document.getElementById('vitalSignsHeaderTable');
		if (!canvasEl || !scrollContainer || !headerTable) return;

		if (this.state.chart) {
			this.state.chart.destroy();
			this.state.chart = null;
		}

		// Tính toán số lượng cột tối thiểu để phủ kín chiều rộng màn hình lớn
		const containerWidth = scrollContainer.clientWidth || 600;
		const minCols = Math.max(10, Math.floor(containerWidth / 80));
		const numCols = Math.max(filteredData.length, minCols);
		const calculatedWidth = Math.max(containerWidth, numCols * 60);

		// Set kích thước container cha của canvas và header để tránh lỗi ResizeObserver vòng lặp vô hạn
		const canvasContainer = canvasEl.parentElement;
		if (canvasContainer) {
			canvasContainer.style.width = calculatedWidth + 'px';
		}
		headerTable.style.width = calculatedWidth + 'px';

		const ctx = canvasEl.getContext('2d');
		// Tạo nhãn index từ 0 đến numCols - 1
		const labels = Array.from({ length: numCols }, (_, i) => i);

		// Vẽ tam giác chỉ xuống ▽ cho Huyết áp tâm thu
		const drawTriangleDown = () => {
			const canvas = document.createElement('canvas');
			canvas.width = 12;
			canvas.height = 12;
			const c = canvas.getContext('2d');
			c.fillStyle = '#ca8a04';
			c.beginPath();
			c.moveTo(1, 2);
			c.lineTo(11, 2);
			c.lineTo(6, 11);
			c.closePath();
			c.fill();
			return canvas;
		};

		// Vẽ tam giác chỉ lên △ cho Huyết áp tâm trương
		const drawTriangleUp = () => {
			const canvas = document.createElement('canvas');
			canvas.width = 12;
			canvas.height = 12;
			const c = canvas.getContext('2d');
			c.fillStyle = '#ca8a04';
			c.beginPath();
			c.moveTo(1, 10);
			c.lineTo(11, 10);
			c.lineTo(6, 1);
			c.closePath();
			c.fill();
			return canvas;
		};

		const self = this;

		// Chuẩn bị dữ liệu an toàn có đệm null cho các cột trống bên phải
		const datasetData = Array.from({ length: numCols }, (_, i) => {
			return i < filteredData.length ? filteredData[i] : null;
		});

		this.state.chart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: labels,
				datasets: [
					{
						label: 'Huyết áp',
						data: datasetData.map(d => d ? d.bloodPressureMax : null),
						borderColor: '#ca8a04',
						backgroundColor: 'rgba(254, 240, 138, 0.4)', // Màu vàng nhạt cho dải màu ở giữa
						borderWidth: 1.5,
						tension: 0,
						fill: '+1', // Điền màu nối xuống dataset tiếp theo (Tâm trương)
						pointStyle: drawTriangleDown(),
						spanGaps: true,
						yAxisID: 'yHA'
					},
					{
						label: 'Huyết áp tâm trương',
						data: datasetData.map(d => d ? d.bloodPressureMin : null),
						borderColor: '#ca8a04',
						backgroundColor: 'transparent',
						borderWidth: 1.5,
						tension: 0,
						fill: false,
						pointStyle: drawTriangleUp(),
						spanGaps: true,
						yAxisID: 'yHA'
					},
					{
						label: 'Mạch (lần/phút)',
						data: datasetData.map(d => d ? d.pulse : null),
						borderColor: '#ef4444',
						backgroundColor: '#ef4444',
						borderWidth: 2,
						tension: 0,
						fill: false,
						pointStyle: 'crossRot',
						pointRadius: 6,
						pointHoverRadius: 8,
						spanGaps: true,
						yAxisID: 'yMach'
					},
					{
						label: 'Nhiệt độ (°C)',
						data: datasetData.map(d => d ? d.temperature : null),
						borderColor: '#2563eb',
						backgroundColor: '#2563eb',
						borderWidth: 2,
						tension: 0,
						fill: false,
						pointStyle: 'circle',
						pointRadius: 5,
						pointHoverRadius: 7,
						spanGaps: true,
						yAxisID: 'yTemp'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				onResize: function(chart, size) {
					// Cập nhật lại kích thước container khi resize thực tế
					const currentContainerWidth = scrollContainer.clientWidth || 600;
					const currentMinCols = Math.max(10, Math.floor(currentContainerWidth / 80));
					const currentNumCols = Math.max(filteredData.length, currentMinCols);
					const currentCalculatedWidth = Math.max(currentContainerWidth, currentNumCols * 60);

					if (canvasContainer) {
						canvasContainer.style.width = currentCalculatedWidth + 'px';
					}
					headerTable.style.width = currentCalculatedWidth + 'px';
					self.alignAxesAndHeader(chart, filteredData);
				},
				layout: {
					padding: {
						top: 10,
						bottom: 10,
						left: 5,
						right: 15
					}
				},
				interaction: {
					mode: 'index',
					intersect: false,
				},
				plugins: {
					legend: {
						display: true,
						position: 'top',
						labels: {
							usePointStyle: true,
							padding: 8,
							font: { family: 'Roboto', size: 11 },
							filter: function(item, chart) {
								return item.text !== 'Huyết áp tâm trương';
							}
						}
					},
					tooltip: {
						backgroundColor: 'rgba(15, 23, 42, 0.9)',
						titleFont: { family: 'Roboto', size: 12, weight: '600' },
						bodyFont: { family: 'Roboto', size: 11 },
						padding: 8,
						cornerRadius: 6,
						displayColors: true,
						callbacks: {
							title: function(context) {
								const idx = context[0].dataIndex;
								return idx < filteredData.length ? filteredData[idx].fullDateLabel : '';
							},
							label: function(context) {
								const idx = context.dataIndex;
								if (idx >= filteredData.length) return null; // Ẩn tooltip ở các cột trống

								let label = context.dataset.label || '';
								if (label === 'Huyết áp') {
									const max = filteredData[idx].bloodPressureMax;
									const min = filteredData[idx].bloodPressureMin;
									return `Huyết áp: ${max}/${min} mmHg`;
								}
								if (label === 'Huyết áp tâm trương') return null;
								
								let value = context.parsed.y;
								if (value !== null) {
									if (context.dataset.yAxisID === 'yTemp') {
										return `${label}: ${value} °C`;
									}
									return `${label}: ${value} lần/phút`;
								}
								return null;
							}
						}
					}
				},
				scales: {
					x: {
						display: true,
						grid: { color: 'rgba(0, 0, 0, 0.05)' },
						border: { display: false },
						ticks: { display: false }
					},
					yHA: {
						type: 'linear',
						display: true,
						position: 'left',
						min: 40,
						max: 200,
						ticks: { stepSize: 20, display: false },
						grid: { color: 'rgba(0, 0, 0, 0.05)' },
						border: { display: false }
					},
					yMach: {
						type: 'linear',
						display: true,
						position: 'left',
						min: 40,
						max: 200,
						ticks: { stepSize: 20, display: false },
						grid: { drawOnChartArea: false },
						border: { display: false }
					},
					yTemp: {
						type: 'linear',
						display: true,
						position: 'left',
						min: 35,
						max: 43,
						ticks: { stepSize: 1, display: false },
						grid: { drawOnChartArea: false },
						border: { display: false }
					}
				}
			}
		});

		// Gọi căn chỉnh ngay sau khi khởi tạo
		this.alignAxesAndHeader(this.state.chart, filteredData);
	},

	alignAxesAndHeader(chart, filteredData) {
		const chartArea = chart.chartArea;
		if (!chartArea) return;

		const yHA = chart.scales.yHA;
		const xScale = chart.scales.x;

		// Kiểm tra Signature tọa độ để chống vòng lặp vô hạn
		const haValues = [200, 180, 160, 140, 120, 100, 80, 60, 40];
		const yCoords = haValues.map(val => Math.round(yHA.getPixelForValue(val))).join(',');
		const xCoords = filteredData.map((d, i) => Math.round(xScale.getPixelForValue(i))).join(',');
		const currentSignature = `${yCoords}|${xCoords}`;

		if (this.state.lastLayoutSignature === currentSignature) {
			return; // Tọa độ không đổi, thoát ngay lập tức để tránh re-render DOM gây giật
		}
		this.state.lastLayoutSignature = currentSignature;

		// 1. Vẽ trục Y cố định bên trái
		const yAxisFixedEl = document.getElementById('vitalSignsYAxisFixed');
		if (yAxisFixedEl) {
			yAxisFixedEl.replaceChildren();

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

			const yTicks = document.createElement('div');
			yTicks.className = 'vital-y-ticks';
			const tempValues = [43, 42, 41, 40, 39, 38, 37, 36, 35];
			
			haValues.forEach((val, idx) => {
				const tempVal = tempValues[idx];
				const yCoord = yHA.getPixelForValue(val);
				const tick = document.createElement('div');
				tick.className = 'vital-y-tick';
				tick.style.top = `${yCoord}px`;

				[val, val, tempVal].forEach((cellValue, cellIndex) => {
					const cell = document.createElement('div');
					cell.className = cellIndex < 2 ? 'vital-y-tick-cell vital-y-tick-cell--border' : 'vital-y-tick-cell';
					cell.textContent = cellValue;
					tick.appendChild(cell);
				});

				yTicks.appendChild(tick);
			});

			yAxisFixedEl.append(dateHeader, metricHeader, yTicks);
		}

		// 2. Vẽ nhãn trục X ở Header Table bên phải
		const headerTableEl = document.getElementById('vitalSignsHeaderTable');
		if (headerTableEl) {
			headerTableEl.replaceChildren();

			const dateRow = document.createElement('div');
			dateRow.className = 'vital-x-date-row';
			filteredData.forEach((d, i) => {
				const x = xScale.getPixelForValue(i);
				const label = document.createElement('div');
				label.className = 'vital-x-date-label';
				label.style.left = `${x}px`;
				label.textContent = d.dateLabel;
				dateRow.appendChild(label);
			});

			const timeRow = document.createElement('div');
			timeRow.className = 'vital-x-time-row';
			filteredData.forEach((d, i) => {
				const x = xScale.getPixelForValue(i);
				const label = document.createElement('div');
				label.className = 'vital-x-time-label';
				label.style.left = `${x}px`;
				label.textContent = d.timeLabel;
				timeRow.appendChild(label);
			});

			headerTableEl.append(dateRow, timeRow);
		}
	},

	renderTable(filteredData) {
		const wrapper = document.getElementById('vitalSignsTableWrapper');
		if (!wrapper) return;

		// 1. Đo chiều rộng thực tế của wrapper
		const containerWidth = wrapper.clientWidth || 600;

		// 2. Tính số lượng cột tối thiểu (ít nhất là 10 cột để lấp đầy màn hình)
		const availableWidthForCols = containerWidth - 165; // Trừ đi 165px của cột nhãn cố định
		const minCols = Math.max(10, Math.floor(availableWidthForCols / 80));
		const numCols = Math.max(filteredData.length, minCols);

		// 3. Kiểm tra xem có thực sự cần cuộn ngang không
		const colDefaultWidth = 80;
		const totalMinWidth = 165 + (numCols * colDefaultWidth);
		const needsScroll = totalMinWidth > containerWidth;

		let colHtml = '<col class="vital-grid-col-label" />';
		
		if (needsScroll) {
			for (let i = 0; i < numCols; i++) {
				colHtml += '<col class="vital-grid-col-data" />';
			}
		} else {
			for (let i = 0; i < numCols; i++) {
				colHtml += '<col />';
			}
		}

		let html = `
			<table class="vital-signs-grid-table">
				<colgroup>
					${colHtml}
				</colgroup>
				<thead>
					<tr>
						<th class="vital-label-col" rowspan="2">Chỉ số \\ Thời gian</th>
		`;

		// Header hàng 1: Ngày/tháng
		for (let i = 0; i < numCols; i++) {
			if (i < filteredData.length) {
				const d = filteredData[i];
				html += `<th>${d.dateLabel}</th>`;
			} else {
				html += `<th class="vital-grid-empty-date">-</th>`;
			}
		}

		html += `
					</tr>
					<tr>
		`;

		// Header hàng 2: Giờ
		for (let i = 0; i < numCols; i++) {
			if (i < filteredData.length) {
				const d = filteredData[i];
				html += `<th>${d.timeLabel}</th>`;
			} else {
				html += `<th class="vital-grid-empty-time">-</th>`;
			}
		}

		html += `
					</tr>
				</thead>
				<tbody>
		`;

		const rows = [
			{ label: 'Huyết áp (mmHg)', key: 'bloodPressureRaw' },
			{ label: 'Nhịp thở (lần/phút)', key: 'breathing' },
			{ label: 'Mạch (bpm)', key: 'pulse' },
			{ label: 'Nhiệt độ (°C)', key: 'temperature' },
			{ label: 'Cân nặng (kg)', key: 'weight' },
			{ label: 'Chiều cao (cm)', key: 'height' },
			{ label: 'BMI', key: 'bmi' }
		];

		rows.forEach(row => {
			html += `<tr><td class="vital-label-col">${row.label}</td>`;
			for (let i = 0; i < numCols; i++) {
				if (i < filteredData.length) {
					const d = filteredData[i];
					let val = d[row.key];
					if (val === null || val === undefined || val === '') {
						val = '-';
					}
					html += `<td>${val}</td>`;
				} else {
					html += `<td class="vital-grid-empty-cell">-</td>`;
				}
			}
			html += `</tr>`;
		});

		html += `
				</tbody>
			</table>
		`;

		wrapper.innerHTML = html;
		const table = wrapper.querySelector('.vital-signs-grid-table');
		if (table && needsScroll) {
			table.style.width = `${totalMinWidth}px`;
		}
	},

	setTimeRange(range, btn) {
		this.state.timeRange = range;

		document.querySelectorAll('.time-range-selector .time-range-btn').forEach(b => {
			b.classList.remove('active');
		});
		if (btn) btn.classList.add('active');

		if (this.state.data.length > 0) {
			this.renderContent();
		}
	},

	setViewMode(mode) {
		this.state.viewMode = mode;

		const btnChart = document.getElementById('btnVitalViewChart');
		const btnTable = document.getElementById('btnVitalViewTable');

		if (mode === 'chart') {
			if (btnChart) btnChart.classList.add('active');
			if (btnTable) btnTable.classList.remove('active');
		} else {
			if (btnChart) btnChart.classList.remove('active');
			if (btnTable) btnTable.classList.add('active');
		}

		if (this.state.data.length > 0) {
			this.renderContent();
		}
	},

	init() {
		this.injectStyles();

		const self = this;

		const btnChart = document.getElementById('btnVitalViewChart');
		const btnTable = document.getElementById('btnVitalViewTable');

		if (btnChart) {
			btnChart.addEventListener('click', function() {
				self.setViewMode('chart');
			});
		}
		if (btnTable) {
			btnTable.addEventListener('click', function() {
				self.setViewMode('table');
			});
		}

		const timeRangeSelector = document.querySelector('.time-range-selector');
		if (timeRangeSelector && !timeRangeSelector._modalVitalTimeRangeBound) {
			timeRangeSelector.addEventListener('click', function(event) {
				const button = event.target.closest('[data-vital-time-range]');
				if (!button || !timeRangeSelector.contains(button)) return;
				event.preventDefault();
				self.setTimeRange(button.getAttribute('data-vital-time-range') || 'all', button);
			});
			timeRangeSelector._modalVitalTimeRangeBound = true;
		}

		const vitalSignsTab = document.getElementById('vital-signs-tab');
		if (vitalSignsTab) {
			vitalSignsTab.addEventListener('shown.bs.tab', function () {
				setTimeout(() => {
					if (self.state.viewMode === 'chart' && self.state.filteredData) {
						self.renderChart(self.state.filteredData);
					} else if (self.state.viewMode === 'table' && self.state.filteredData) {
						self.renderTable(self.state.filteredData);
					}
				}, 100);
			});
		}

		// Lắng nghe sự kiện window resize để render lại bảng số liệu nếu đang hiển thị
		window.addEventListener('resize', function() {
			if (self.state.viewMode === 'table' && self.state.filteredData) {
				const wrapper = document.getElementById('vitalSignsTableWrapper');
				if (wrapper && wrapper.classList.contains('vital-display-block')) {
					self.renderTable(self.state.filteredData);
				}
			}
		});
	}
};

// Hàm toàn cục giao tiếp với bên ngoài modal
async function loadVitalSignsData(patientId, patientName) {
	await ModalVitalController.loadData(patientId, patientName);
}

function setVitalTimeRange(range, btn) {
	ModalVitalController.setTimeRange(range, btn);
}

// Khởi tạo khi DOM ready
$(document).ready(function () {
	ModalVitalController.init();
});

window.loadMedicalHistoryIntoModal = loadMedicalHistoryIntoModal;
window.loadVitalSignsData = loadVitalSignsData;
window.setVitalTimeRange = setVitalTimeRange;

// Expose one migration seam without changing the legacy globals above.
if (window.QLPKPatientModalContract) {
	window.QLPKLegacyPatientModalAdapter = Object.freeze({
		contract: window.QLPKPatientModalContract,
		getOrCreate: options => window.QLPKPatientModalContract.getOrCreate(options)
	});
}
