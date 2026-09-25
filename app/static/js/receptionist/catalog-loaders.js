(function (window) {
	'use strict';

	function getConsole(options) {
		return options.console || window.console;
	}

	function getServicePackage(options) {
		return options.servicePackage || window.ReceptionistServicePackage;
	}

	function loadDoctorsForForm(options = {}) {
		const $ = options.$ || window.$;
		const storage = options.localStorage || window.localStorage;
		const pageWindow = options.window || window;
		const delay = options.setTimeout || window.setTimeout.bind(window);
		const logger = getConsole(options);
		const token = storage.getItem('qlpk_token');

		if (!token) {
			logger.error('No token found, redirecting to login...');
			pageWindow.location.href = '/login.html';
			return;
		}

		const doctorSelect = $('#doctorId');

		if (doctorSelect.length === 0) {
			logger.error('Doctor dropdown not found, retrying in 500ms...');
			delay(() => {
				loadDoctorsForForm(options);
			}, 500);
			return;
		}

		$.ajax({
			url: '/users/doctors',
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			},
			timeout: 10000,
			success: function (data) {
				const doctors = data || [];
				if (typeof options.setDoctors === 'function') {
					options.setDoctors(doctors);
				}

				doctorSelect.empty();
				doctorSelect.append('<option value="">Chọn người khám</option>');

				if (doctors.length > 0) {
					doctors.forEach(doctor => {
						doctorSelect.append(`<option value="${doctor.id}">${doctor.name}</option>`);
					});
				}
			},
			error: function (xhr, status) {
				if (xhr.status === 401) {
					logger.error('Token expired, redirecting to login...');
					pageWindow.location.href = '/login.html';
			} else if (xhr.status === 0 || status === 'timeout') {
				delay(() => {
					loadDoctorsForForm(options);
				}, 2000);
				} else {
					logger.error('Unknown error, showing error message');
					options.showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	function loadServicesForForm(options = {}) {
		const $ = options.$ || window.$;
		const logger = getConsole(options);
		const servicePackage = getServicePackage(options);
		const storage = options.localStorage || window.localStorage;
		const pageWindow = options.window || window;
		const token = storage.getItem('qlpk_token');

		if (!token) {
			logger.error('No token found, redirecting to login...');
			pageWindow.location.href = '/login.html';
			return;
		}

		$.ajax({
			url: '/services',
			method: 'GET',
			headers: {
				'Authorization': 'Bearer ' + token
			},
			success: function (data) {
				const services = data || [];
				if (typeof options.setServices === 'function') {
					options.setServices(services);
				}
				servicePackage.initServiceAutocomplete('serviceType', 'serviceTypeDropdown', 'serviceTypeId', services, $);
			},
			error: function (xhr) {
				logger.error('Error loading services for form:', xhr);
			}
		});
	}

	window.ReceptionistCatalogLoaders = {
		loadDoctorsForForm,
		loadServicesForForm
	};
})(window);
