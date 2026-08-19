(function (window) {
	'use strict';

	function buildPatientPayload(formData) {
		return {
			full_name: formData.full_name,
			nickname: formData.nickname,
			date_of_birth: formData.date_of_birth,
			gender: formData.gender,
			phone: formData.phone,
			occupation: formData.occupation,
			don_vi_cong_tac: formData.don_vi_cong_tac,
			dia_chi_cong_ty: formData.dia_chi_cong_ty,
			sexual_orientation: formData.sexual_orientation,
			mang_thai: formData.mang_thai,
			expected_delivery_date: formData.expected_delivery_date,
			so_tuan_thai: formData.so_tuan_thai,
			address: formData.address,
			nationality: formData.nationality,
			religion: formData.religion,
			ethnicity: formData.ethnicity,
			education_level: formData.education_level,
		referral_source: formData.referral_source,
		problem_start_time: formData.problem_start_time,
		symptom_progression: formData.symptom_progression,
		current_behavior: formData.current_behavior,
			reminder: formData.reminder,
			reminder_time: formData.reminder_time,
			emergency_contact: formData.emergency_contact,
			severity_level: formData.severity_level,
			id_number: formData.id_number,
			marital_status: formData.marital_status,
			address_detail: formData.address_detail,
			...(formData.province && { province: formData.province }),
			...(formData.district && { district: formData.district }),
			...(formData.ward && { ward: formData.ward })
		};
	}

	function buildAppointmentPayload(formData, options) {
		const opts = options || {};
		const appointmentDateTime = `${formData.appointment_date}T${formData.appointment_time}:00`;
		const originalAppointmentId = opts.originalAppointmentId || null;
		const hasReExamSource = Boolean(originalAppointmentId);

		return {
			appointment_date: appointmentDateTime,
			doctor_id: formData.doctor_id,
			appointment_type: formData.appointment_type,
			appointment_category: opts.isReExamChecked && hasReExamSource ? 'RE_EXAMINATION' : 'NEW',
			original_appointment_id: opts.isReExamChecked && hasReExamSource ? originalAppointmentId : null,
			service_id: formData.service_id,
			package_id: formData.package_id,
			notes: formData.notes,
			main_reason: formData.main_reason,
			main_symptoms: formData.main_symptoms,
			current_behavior: formData.current_behavior,
			referral_source: formData.referral_source,
			problem_start_time: formData.problem_start_time,
			symptom_progression: formData.symptom_progression,
			severity_level: formData.severity_level,
			weight: formData.weight,
			height: formData.height,
			bmi: formData.bmi,
			pulse: formData.pulse,
			blood_pressure: formData.blood_pressure,
			temperature: formData.temperature,
			breathing: formData.breathing
		};
	}

	function getAppointmentValidationError(appointmentData) {
		if (!appointmentData.doctor_id) {
			return { code: 'missing_doctor', fieldId: 'doctorId' };
		}
		if (!appointmentData.service_id) {
			return { code: 'missing_service', fieldId: 'serviceType' };
		}
		return null;
	}

	function resolveAppointmentRequest(currentAppointmentId) {
		if (currentAppointmentId) {
			return {
				method: 'PUT',
				url: `/api/appointments/${currentAppointmentId}`
			};
		}

		return {
			method: 'POST',
			url: '/api/appointments/'
		};
	}

	function parseAppointmentErrorMessage(errorText) {
		try {
			const errorJson = JSON.parse(errorText);
			if (errorJson.detail) {
				return errorJson.detail;
			}
		} catch (e) {
			// Keep the original response text when it is not JSON.
		}
		return errorText;
	}

	function isDuplicateAppointmentError(errorMessage) {
		return errorMessage.includes('Khung giờ này đã có lịch hẹn') ||
			errorMessage.includes('đã có lịch hẹn') ||
			errorMessage.includes('lịch khám với bác sĩ này');
	}

	window.ReceptionistAppointmentSubmit = {
		buildPatientPayload,
		buildAppointmentPayload,
		getAppointmentValidationError,
		resolveAppointmentRequest,
		parseAppointmentErrorMessage,
		isDuplicateAppointmentError
	};
})(window);
