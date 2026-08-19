(function (window) {
	'use strict';

	function getTodayAndCurrentTime(now) {
		const date = now || new Date();
		return {
			today: date.toISOString().slice(0, 10),
			currentTime: date.toTimeString().slice(0, 5)
		};
	}

	function showFieldError($, selector, message) {
		$(selector).addClass('is-invalid');
		$(selector).siblings('.invalid-feedback').text(message);
	}

	function clearFieldError($, selector) {
		$(selector).removeClass('is-invalid');
		$(selector).siblings('.invalid-feedback').text('');
	}

	function clearAllFieldErrors($) {
		$('.is-invalid').removeClass('is-invalid');
		$('.invalid-feedback').text('');
	}

	function isValidEmail(email) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	function isValidPhone(phone) {
		const phoneRegex = /^[0-9]{8,11}$/;
		return phoneRegex.test(phone.replace(/\s/g, ''));
	}

	function initializeFormValidation(options) {
		const $ = options.$;
		const namespace = '.appointmentAddValidation';

		$('#addPatientName').off(`blur${namespace}`).on(`blur${namespace}`, function () {
			const value = $(this).val().trim();
			if (!value) {
				showFieldError($, this, 'Vui lòng nhập họ và tên');
			} else {
				clearFieldError($, this);
			}
		});

		$('#addPatientPhone').off(`blur${namespace}`).on(`blur${namespace}`, function () {
			const value = $(this).val().trim();
			if (value && !isValidPhone(value)) {
				showFieldError($, this, 'Số điện thoại không hợp lệ');
			} else {
				clearFieldError($, this);
			}
		});

		$('#addPatientEmail').off(`blur${namespace}`).on(`blur${namespace}`, function () {
			const value = $(this).val().trim();
			if (value && !isValidEmail(value)) {
				showFieldError($, this, 'Email không hợp lệ');
			} else {
				clearFieldError($, this);
			}
		});

		$('#addAppointmentDate').off(`blur${namespace}`).on(`blur${namespace}`, function () {
			const value = $(this).val();
			if (!value) {
				showFieldError($, this, 'Vui lòng chọn ngày hẹn');
			} else {
				clearFieldError($, this);
			}
		});

		$('#addAppointmentTime').off(`blur${namespace}`).on(`blur${namespace}`, function () {
			const value = $(this).val();
			if (!value) {
				showFieldError($, this, 'Vui lòng chọn giờ hẹn');
			} else {
				clearFieldError($, this);
			}
		});

		$('#addDoctor').off(`change${namespace}`).on(`change${namespace}`, function () {
			const value = $(this).val();
			if (!value) {
				showFieldError($, this, 'Vui lòng chọn bác sĩ');
			} else {
				clearFieldError($, this);
			}
		});
	}

	function openAddAppointmentWithDate(options) {
		const $ = options.$;
		const current = getTodayAndCurrentTime();
		const dateStr = options.dateStr;

		$('#addAppointmentModal').data('selectedDate', dateStr || current.today);
		$('#addAppointmentDate').val(dateStr || current.today);
		$('#addAppointmentDate').attr('min', current.today);
		$('#addAppointmentTime').val(current.currentTime);

		$('#addAppointmentModal').modal('show');
		options.loadDoctorsForAdd();
		options.loadServices();
		options.loadPackages();
	}

	function resetAddAppointmentForm($) {
		const form = $('#addAppointmentForm')[0];
		if (form) {
			form.reset();
		}

		$('#serviceSelection').show();
		$('#packageSelection').hide();
	}

	function applyAppointmentTypeSelection($, type, shouldClearOpposite) {
		if (type === 'service') {
			$('#serviceSelection').show();
			$('#packageSelection').hide();
			if (shouldClearOpposite) {
				$('#addPackage').val('');
			}
		} else {
			$('#serviceSelection').hide();
			$('#packageSelection').show();
			if (shouldClearOpposite) {
				$('#addService').val('');
				$('#addServiceId').val('');
			}
		}
		if (!$('#addDuration').val()) {
			$('#addDuration').val('60');
		}
	}

	function applySelectedDuration($, element, includeLegacyDurationSelect) {
		const selectedOption = $(element).find('option:selected');
		const duration = selectedOption.data('duration');
		if (duration) {
			$('#addDuration').val(duration);
			if (includeLegacyDurationSelect) {
				$('select[name="duration_minutes"]').val(duration);
			}
		}
	}

	function prepareAddModalShown(options) {
		const $ = options.$;
		const current = getTodayAndCurrentTime();
		const selectedDate = $('#addAppointmentModal').data('selectedDate');
		const defaultDate = selectedDate || current.today;
		const dateInput = options.document.getElementById('addAppointmentDate');

		options.setDatepickerValue(dateInput, defaultDate, true);
		$('#addAppointmentDate').attr('min', current.today);

		if (!$('#addAppointmentTime').val()) {
			$('#addAppointmentTime').val(current.currentTime);
		}

		$('#addAppointmentModal').removeData('selectedDate');
		options.setupICDMultiSelect('addMedicalHistory', 'add');
		options.initializePhase3Features();
	}

	function resetAddModalForOpen(options) {
		const $ = options.$;
		const form = $('#addAppointmentForm')[0];
		if (form) {
			form.reset();
		}

		clearAllFieldErrors($);
		$('#addDuration').val('60');
		$('#addPatientName, #addPatientPhone, #addPatientEmail, #addPatientDOB').prop('disabled', false);
		$('#addMedicalHistory, #addAllergies, #addCurrentMedication').prop('disabled', false);
		$('#addPatientName, #addPatientPhone, #addPatientEmail, #addPatientDOB').removeClass('bg-light');
		$('#addMedicalHistory, #addAllergies, #addCurrentMedication').removeClass('bg-light');
		window.AppointmentManagementAllergyFormatUtils?.clearFieldValue($('#addAllergies'));

		options.clearSelectedICDs('add');
		options.loadDoctorsForAdd();
		options.loadServices();
		options.loadPackages();

		$('#addAppointmentModal').data('selectedDate', options.dateStr);
		$('#addAppointmentModal').modal('show');
	}

	function isAddFormValid($) {
		let valid = true;
		const $date = $('#addAppointmentDate');
		const $time = $('#addAppointmentTime');
		const $doctor = $('#addDoctor');
		const $service = $('#addService');
		const $package = $('#addPackage');
		const appointmentType = $('input[name="appointmentType"]:checked').val();

		$date.removeClass('is-invalid');
		$time.removeClass('is-invalid');
		$doctor.removeClass('is-invalid');
		$service.removeClass('is-invalid');
		$package.removeClass('is-invalid');

		if (!$date.val()) {
			$date.addClass('is-invalid');
			valid = false;
		}
		if (!$time.val()) {
			$time.addClass('is-invalid');
			valid = false;
		}
		if (!$doctor.val()) {
			$doctor.addClass('is-invalid');
			valid = false;
		}
		if (appointmentType === 'service' && !$('#addServiceId').val()) {
			$service.addClass('is-invalid');
			valid = false;
		}
		if (appointmentType === 'package' && !$package.val()) {
			$package.addClass('is-invalid');
			valid = false;
		}

		return valid;
	}

	function buildAddAppointmentFormData(options) {
		const $ = options.$;
		const appointmentDate = $('#addAppointmentDate').val();
		const appointmentTime = $('#addAppointmentTime').val();
		const fullDateTime = appointmentDate + 'T' + appointmentTime;
		const appointmentType = $('input[name="appointmentType"]:checked').val();
		const durationMinutes = parseInt($('#addDuration').val(), 10) || 60;

		const formData = {
			appointment_date: fullDateTime,
			doctor_id: $('#addDoctor').val(),
			appointment_category: $('input[name="appointmentCategory"]:checked').val(),
			appointment_type: appointmentType,
			service_id: appointmentType === 'service' ? ($('#addServiceId').val() || null) : null,
			package_id: appointmentType === 'package' ? ($('#addPackage').val() || null) : null,
			duration_minutes: durationMinutes,
			status: $('#addStatus').val(),
			main_reason: $('#addMainReason').val().trim(),
			main_symptoms: $('#addSymptoms').val().trim()
		};

		formData.full_name = $('#addPatientName').val().trim();
		formData.phone = $('#addPatientPhone').val().trim();
		formData.id_number = $('#addPatientCCCD').val().trim();
		formData.email = $('#addPatientEmail').val().trim();
		formData.physical_history = options.getSelectedICDsString('add');
		formData.allergies = window.AppointmentManagementAllergyFormatUtils
			? window.AppointmentManagementAllergyFormatUtils.getSubmitValue($('#addAllergies'))
			: $('#addAllergies').val().trim();
		formData.current_medication = $('#addCurrentMedication').val().trim();
		formData.main_symptoms = $('#addSymptoms').val().trim();

		const dob = $('#addPatientDOB').val();
		if (dob && dob.trim()) {
			formData.date_of_birth = dob;
		}

		return formData;
	}

	window.AppointmentManagementAddModalUiUtils = {
		applyAppointmentTypeSelection,
		applySelectedDuration,
		buildAddAppointmentFormData,
		clearAllFieldErrors,
		clearFieldError,
		getTodayAndCurrentTime,
		initializeFormValidation,
		isAddFormValid,
		isValidEmail,
		isValidPhone,
		openAddAppointmentWithDate,
		prepareAddModalShown,
		resetAddAppointmentForm,
		resetAddModalForOpen,
		showFieldError
	};
})(window);
