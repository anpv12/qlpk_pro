(function (window) {
	'use strict';

	function populateDoctorSelect($, selector, doctors, placeholder) {
		const select = $(selector);
		select.empty();
		select.append($('<option>').val('').text(placeholder));

		if (doctors && doctors.length > 0) {
			doctors.forEach(doctor => {
				select.append($('<option>').val(doctor.id).text(doctor.name || ''));
			});
		}
	}

	function populateMainDoctorControls($, doctors) {
		populateDoctorSelect($, '#doctorFilter', doctors, 'Tất cả bác sĩ');
		populateDoctorSelect($, "select[name='doctor_id']", doctors, 'Chọn bác sĩ');
	}

	function applyDoctorFilterSettings(options) {
		const currentUser = options.currentUser;
		if (!currentUser) return;

		const $ = options.$;
		const filterSelect = $('#doctorFilter');
		const userRole = (currentUser.role || '').toUpperCase();

		if (userRole === 'DOCTOR' || userRole === 'PSYCHOLOGIST') {
			filterSelect.val(currentUser.id);
			if (typeof options.setSelectedDoctor === 'function') {
				options.setSelectedDoctor(currentUser.id.toString());
			}

			filterSelect.prop('disabled', true);
			filterSelect.addClass('appointment-doctor-filter-locked');

			filterSelect.trigger('change');
			return;
		}

		filterSelect.prop('disabled', false);
		filterSelect.removeClass('appointment-doctor-filter-locked');
	}

	window.AppointmentManagementDoctorControlsUtils = {
		applyDoctorFilterSettings,
		populateDoctorSelect,
		populateMainDoctorControls
	};
})(window);
