(function () {
	function showInvalidPrescription(prescriptionCode) {
		document.getElementById('bannerArea').innerHTML = `
			<div class="verify-banner invalid">
				<span class="icon">❌</span><span class="text">Không tìm thấy đơn thuốc</span>
				<div class="sub">Mã đơn thuốc "${prescriptionCode}" không tồn tại hoặc đã bị thu hồi.</div>
			</div>
		`;
		document.getElementById('prescriptionPreviewArea').innerHTML = `
			<div class="verify-prescription-invalid-state">
				<div class="verify-prescription-invalid-icon">🔍</div>
				<h3 class="verify-prescription-invalid-title">Không xác thực được</h3>
				<p class="verify-prescription-invalid-copy">Vui lòng liên hệ phòng khám để kiểm tra lại.</p>
			</div>
		`;
	}

	function showConnectionError(error) {
		document.getElementById('bannerArea').innerHTML = `
			<div class="verify-banner invalid">
				<span class="icon">⚠️</span><span class="text">Lỗi kết nối</span>
				<div class="sub">Không thể kết nối đến server để xác thực. Vui lòng thử lại sau.</div>
			</div>
		`;
		console.error(error);
	}

	function appendVerificationBadge(previewContainer, prescriptionData) {
		const doctorName = prescriptionData.doctor?.full_name || 'Bác sĩ';
		const licenseNumber = prescriptionData.doctor?.license_number || '';
		const validationBadge = document.createElement('div');
		validationBadge.className = 'verify-prescription-badge';
		validationBadge.innerHTML = `Đơn thuốc được kê bởi <strong>${doctorName}</strong> tại Phòng khám Sơn Tâm.${licenseNumber ? `<br>Chứng chỉ hành nghề: <strong>${licenseNumber}</strong>` : ''}`;
		previewContainer.appendChild(validationBadge);
	}

	function renderVerifiedPrescription(data) {
		const diagnosisText = data.diagnosis_text || data.diagnosis || '';
		document.getElementById('bannerArea').innerHTML = '';

		const patientInfo = data.patient || {};
		const html = buildPrescriptionPreviewHTML({
			clinicInfo: getClinicInfoConfig(),
			patient: patientInfo,
			history: { examination_date: data.examination_date, doctor: data.doctor },
			examinationDetail: { diagnosis: diagnosisText, benh_kem_theo: data.benh_kem_theo, weight: data.weight, loi_dan: data.loi_dan },
			examinationDetailsBySection: null,
			prescriptionData: {
				prescription_code: data.prescription_code,
				prescription_type: data.prescription_type,
				medicines: data.medicines || [],
				diagnosis: diagnosisText,
				re_examination_date: data.re_examination_date,
				show_re_examination_date: data.show_re_examination_date,
				usage_instructions: data.usage_instructions
			},
			relatives: data.relatives || [],
			isPrint: true,
			renderContext: 'verify',
			showVerificationQr: false,
			showSignature: false
		});

		const area = document.getElementById('prescriptionPreviewArea');
		area.innerHTML = html;

		const previewContainer = area.querySelector('.prescription-preview');
		if (!previewContainer) return;

		appendVerificationBadge(previewContainer, data);
		const scaler = window.createPrescriptionPreviewScaler({
			area,
			preview: previewContainer,
			documentWidth: 800
		});

		previewContainer.querySelectorAll('img').forEach(img => {
			img.addEventListener('load', scaler.fit, { once: true });
		});
		requestAnimationFrame(scaler.fit);
		window.addEventListener('resize', scaler.fit, { passive: true });
		if (document.fonts?.ready) {
			document.fonts.ready.then(scaler.fit).catch(() => {});
		}

	}

	document.addEventListener('DOMContentLoaded', function () {
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
	});
})();
