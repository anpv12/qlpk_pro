(function (window) {
	'use strict';

	function showEditFieldError($, selector, message) {
		$(selector).addClass('is-invalid');
		$(selector).siblings('.invalid-feedback').text(message);
	}

	function clearEditFieldError($, target) {
		const field = target && target.jquery ? target : $(target);
		field.removeClass('is-invalid');
		field.siblings('.invalid-feedback').text('');
	}

	function clearAllEditFieldErrors($) {
		$('.is-invalid').removeClass('is-invalid');
		$('.invalid-feedback').text('');
	}

	function updateEditStatusFlag(options) {
		const $ = options.$;
		const status = options.status;
		const statusText = options.getStatusText(status);
		const statusIcon = options.getStatusIcon(status);

		$('#editStatusFlag')
			.removeClass('appointment-status-flag--scheduled appointment-status-flag--confirmed appointment-status-flag--no-show appointment-status-flag--cancelled')
			.addClass(`appointment-status-flag--${String(status || '').toLowerCase().replace(/_/g, '-')}`)
			.html(`<i class="bi ${statusIcon} me-1"></i>${window.QLPKHtml.escape(statusText)}`);
	}

	function initializeEditFormValidation(options) {
		const $ = options.$;

		$('#editPatientName, #editPatientPhone, #editPatientEmail').off('input.appointmentEditValidation').on('input.appointmentEditValidation', function () {
			options.clearEditFieldError($(this));
		});

		$('input[name="editAppointmentType"]').off('change.appointmentEditValidation').on('change.appointmentEditValidation', function () {
			const selectedType = $(this).val();

			if (selectedType === 'service') {
				$('#editServiceSelection').show();
				$('#editPackageSelection').hide();
				$('#editPackage').val('');
				$('#editService').prop('required', true);
				$('#editPackage').prop('required', false);
			} else if (selectedType === 'package') {
				$('#editServiceSelection').hide();
				$('#editPackageSelection').show();
				$('#editService').val('');
				$('#editServiceId').val('');
				$('#editService').prop('required', false);
				$('#editPackage').prop('required', true);
			}
		});

		$('#editPackage').off('change.appointmentEditValidation').on('change.appointmentEditValidation', function () {
			const selectedOption = $(this).find('option:selected');
			const duration = selectedOption.data('duration');

			if (duration) {
				$('#editDuration').val(duration);
			}
		});

	}

	window.AppointmentManagementEditModalUiUtils = {
		clearAllEditFieldErrors,
		clearEditFieldError,
		initializeEditFormValidation,
		showEditFieldError,
		updateEditStatusFlag
	};
})(window);
