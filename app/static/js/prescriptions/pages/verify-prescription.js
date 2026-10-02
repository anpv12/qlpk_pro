// Public prescription verification page: fetches the prescription by code and renders the shared
// print document, a verification badge and a scaler that fits the A5 document to the viewport.
// Shared page runtime (formerly classic script tags), in page order.
import '../../clinic-config.js';
import '../shared/prescription-dose-utils.js';
import '../shared/prescription-document-template.js';
import '../components/prescription-preview-scaler.js';
import { byId, el, renderDocumentMarkup, replace } from '../../shared/dom.js';

function banner(icon, text, sub) {
	return el('div', { class: 'verify-banner invalid' }, el('span', { class: 'icon' }, icon), el('span', { class: 'text' }, text), el('div', { class: 'sub' }, sub));
}

function showInvalidPrescription(prescriptionCode) {
	replace(byId('bannerArea'), banner('❌', 'Không tìm thấy đơn thuốc', `Mã đơn thuốc "${prescriptionCode}" không tồn tại hoặc đã bị thu hồi.`));
	replace(byId('prescriptionPreviewArea'), el('div', { class: 'verify-prescription-invalid-state' },
		el('div', { class: 'verify-prescription-invalid-icon' }, '🔍'),
		el('h3', { class: 'verify-prescription-invalid-title' }, 'Không xác thực được'),
		el('p', { class: 'verify-prescription-invalid-copy' }, 'Vui lòng liên hệ phòng khám để kiểm tra lại.')));
}

function showConnectionError(error) {
	replace(byId('bannerArea'), banner('⚠️', 'Lỗi kết nối', 'Không thể kết nối đến server để xác thực. Vui lòng thử lại sau.'));
	console.error(error);
}

function verificationBadge(prescriptionData) {
	const doctorName = prescriptionData.doctor?.full_name || 'Bác sĩ';
	const licenseNumber = prescriptionData.doctor?.license_number || '';
	return el('div', { class: 'verify-prescription-badge' }, 'Đơn thuốc được kê bởi ', el('strong', {}, doctorName), ' tại Phòng khám Sơn Tâm.',
		licenseNumber ? [el('br'), 'Chứng chỉ hành nghề: ', el('strong', {}, licenseNumber)] : null);
}

function documentOptions(data) {
	const diagnosisText = data.diagnosis_text || data.diagnosis || '';
	return {
		clinicInfo: window.getClinicInfoConfig(),
		patient: data.patient || {},
		history: { examination_date: data.examination_date, doctor: data.doctor },
		examinationDetail: { diagnosis: diagnosisText, benh_kem_theo: data.benh_kem_theo, weight: data.weight, loi_dan: data.loi_dan },
		examinationDetailsBySection: null,
		prescriptionData: {
			prescription_code: data.prescription_code, prescription_type: data.prescription_type, medicines: data.medicines || [],
			diagnosis: diagnosisText, re_examination_date: data.re_examination_date,
			show_re_examination_date: data.show_re_examination_date, usage_instructions: data.usage_instructions,
		},
		relatives: data.relatives || [],
		isPrint: true, renderContext: 'verify', showVerificationQr: false, showSignature: false,
	};
}

function renderVerifiedPrescription(data) {
	replace(byId('bannerArea'));
	const area = renderDocumentMarkup(byId('prescriptionPreviewArea'), window.buildPrescriptionPreviewHTML(documentOptions(data)));
	const previewContainer = area.querySelector('.prescription-preview');
	if (!previewContainer) return;
	previewContainer.appendChild(verificationBadge(data));
	const scaler = window.createPrescriptionPreviewScaler({ area, preview: previewContainer, documentWidth: 800 });
	previewContainer.querySelectorAll('img').forEach(img => img.addEventListener('load', scaler.fit, { once: true }));
	requestAnimationFrame(scaler.fit);
	window.addEventListener('resize', scaler.fit, { passive: true });
	if (document.fonts?.ready) document.fonts.ready.then(scaler.fit).catch(() => {});
}

const prescriptionCode = document.body?.dataset?.prescriptionCode || window.QLPK_VERIFY_PRESCRIPTION_CODE || '';
fetch('/api/public/prescription/' + encodeURIComponent(prescriptionCode))
	.then(response => response.json())
	.then(result => {
		if (!result.success) {
			showInvalidPrescription(prescriptionCode);
			return;
		}
		renderVerifiedPrescription(result.data);
	})
	.catch(showConnectionError);
