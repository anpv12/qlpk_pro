// Tải dữ liệu nền: bác sĩ, dịch vụ, gói, lịch hẹn, ngày lễ, lịch bận.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	// Load danh sách bác sĩ
	function loadDoctors() {
		$.ajax({
			url: '/users/doctors',
			method: 'GET',
			success: function (res) {
				state.doctors = res;
				window.AppointmentManagementDoctorControlsUtils.populateMainDoctorControls($, state.doctors);

				// Lấy thông tin user hiện tại và set filter tự động
				setupDoctorFilterForCurrentUser();

				// Build legend bác sĩ — màu
				buildDoctorLegend();
				if (state.calendar && state.allAppointments.length) {
					page.refreshView();
				}
			},
			error: function (xhr) {

				// Handle authentication error
				if (xhr.status === 401) {
					page.showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
				} else {
					page.showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	// Build legend bác sĩ — màu trong sidebar
	function buildDoctorLegend() {
		window.AppointmentManagementDoctorLegendUtils.buildDoctorLegend({
			document,
			$,
			doctors: state.doctors,
			getSelectedRoleFilter: () => state.selectedRoleFilter,
			setSelectedRoleFilter: value => { state.selectedRoleFilter = value; },
			setSelectedDoctor: value => { state.selectedDoctor = value; },
			refreshView: page.refreshView
		});
	}

	// Setup doctorFilter theo role của user hiện tại
	function setupDoctorFilterForCurrentUser() {
		window.QLPKApiTransport.currentUser().then(currentUser => {
			if (currentUser && currentUser.id) applyDoctorFilterSettings(currentUser);
		});
	}

	// Áp dụng cài đặt filter theo user role
	function applyDoctorFilterSettings(currentUser) {
		window.AppointmentManagementDoctorControlsUtils.applyDoctorFilterSettings({
			$,
			currentUser,
			setSelectedDoctor: value => { state.selectedDoctor = value; }
		});
	}

	// Load danh sách dịch vụ
	function loadServices() {
		return $.get('/services/', function (res) {
			state.services = res;
			initServiceAutocomplete('addService', 'addServiceDropdown', 'addServiceId');
			initServiceAutocomplete('editService', 'editServiceDropdown', 'editServiceId');
		}).fail(function (xhr, status, error) {
			console.error('Lỗi tải dịch vụ:', error);
			window.AppointmentManagementServicePackageControlsUtils.renderServiceLoadError($);
		});
	}

	// Hàm khởi tạo autocomplete cho service input
	function initServiceAutocomplete(inputId, dropdownId, hiddenId) {
		window.AppointmentManagementServicePackageControlsUtils.initializeServiceAutocomplete({
			$,
			inputId,
			dropdownId,
			hiddenId,
			getServices: () => state.services
		});
	}

	// Load service prices when service is selected
	function loadServicePrices(serviceId) {
		if (!serviceId) return;

		$.ajax({
			url: `/services/${serviceId}`,
			method: 'GET',
			success: function (data) {
				window.currentServicePrices = data.prices || [];
				updatePriceDisplay();
				updateEditPriceDisplay();
			},
			error: function () {
			}
		});
	}

	// Update price display based on selected target type
	function updatePriceDisplay() {
		window.AppointmentManagementServicePackageControlsUtils.updatePriceDisplay({
			$,
			services: state.services,
			currentServicePrices: window.currentServicePrices
		});
	}

	// Format price function
	function formatPrice(price) {
		return window.AppointmentManagementServicePackageControlsUtils.formatPrice(price);
	}

	// Update price display for edit modal
	function updateEditPriceDisplay() {
		window.AppointmentManagementServicePackageControlsUtils.updateEditPriceDisplay({
			$,
			services: state.services
		});
	}

	// Load danh sách gói dịch vụ
	function loadPackages() {
		return $.get('/packages/', function (res) {
			state.packages = res;
			window.AppointmentManagementServicePackageControlsUtils.populatePackageSelects($, state.packages);
		}).fail(function () {
			window.AppointmentManagementServicePackageControlsUtils.renderPackageSelectError($);
		});
	}

	function abortActiveRequest(request) {
		if (request && request.readyState !== 4) {
			request.abort();
		}
	}

	function appendDateRangeParams(url, dateFrom, dateTo) {
		let result = url;
		if (dateFrom) result += `&date_from=${encodeURIComponent(dateFrom)}`;
		if (dateTo) result += `&date_to=${encodeURIComponent(dateTo)}`;
		return result;
	}

	function toRangeStartDateTime(dateValue) {
		return dateValue ? `${dateValue}T00:00:00` : '';
	}

	function toRangeEndDateTime(dateValue) {
		return dateValue ? `${dateValue}T23:59:59` : '';
	}

	function loadAppointmentsData(dateFrom, dateTo, options = {}) {
		const deferred = $.Deferred();
		const shouldAbortPrevious = options.abortPrevious !== false;

		if (shouldAbortPrevious) {
			abortActiveRequest(state.appointmentsRequest);
		}

		let url = '/api/?per_page=10000';
		url = appendDateRangeParams(url, dateFrom, dateTo);

		state.appointmentsRequest = $.ajax({
			url: url,
			method: 'GET',
			success: function (res) {
				deferred.resolve(res.appointments || []);
			},
			error: function (xhr, status) {
				if (status === 'abort') {
					deferred.reject(status);
					return;
				}

				// Handle authentication error
				if (xhr.status === 401) {
					page.showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
					deferred.reject('unauthorized');
				} else {
					deferred.resolve([]);
				}
			}
		});

		return deferred.promise();
	}

	// Hàm load lịch hẹn theo khoảng thời gian (date range)
	function loadAllAppointments(dateFrom, dateTo, callback) {
		loadAppointmentsData(dateFrom, dateTo)
			.done(function (appointments) {
				state.allAppointments = appointments;
				if (typeof callback === 'function') callback();
			})
			.fail(function (status) {
				if (status === 'abort') return;
				state.allAppointments = [];
				if (typeof callback === 'function') callback();
			});
	}

	// Helper: lấy date range từ FullCalendar view hiện tại
	function getCalendarDateRange() {
		return window.AppointmentManagementCalendarDateUtils.getCalendarDateRange(state.calendar);
	}

	function loadHolidaysData() {
		if (state.cachedHolidays) {
			return $.Deferred().resolve(state.cachedHolidays).promise();
		}

		if (state.holidaysRequestPromise) {
			return state.holidaysRequestPromise;
		}

		const deferred = $.Deferred();
		state.holidaysRequestPromise = deferred.promise();

		$.ajax({
			url: '/holidays/',
			method: 'GET',
			success: function (holidays) {
				state.cachedHolidays = Array.isArray(holidays) ? holidays : [];
				deferred.resolve(state.cachedHolidays);
			},
			error: function () {
				state.cachedHolidays = [];
				deferred.resolve(state.cachedHolidays);
			},
			complete: function () {
				state.holidaysRequestPromise = null;
			}
		});

		return deferred.promise();
	}

	// Hàm load ngày lễ
	function loadHolidays(callback) {
		return loadHolidaysData().done(function (holidays) {
			if (typeof callback === 'function') callback(holidays);
		});
	}

	function loadDoctorBusySchedulesData(dateFrom, dateTo, options = {}) {
		const deferred = $.Deferred();
		const shouldAbortPrevious = options.abortPrevious !== false;

		if (shouldAbortPrevious) {
			abortActiveRequest(state.busySchedulesRequest);
		}

		let url = '/api/doctor-busy-schedules?status=active';
		const rangeStart = toRangeStartDateTime(dateFrom);
		const rangeEnd = toRangeEndDateTime(dateTo);
		url = appendDateRangeParams(url, rangeStart, rangeEnd);

		state.busySchedulesRequest = $.ajax({
			url: url,
			method: 'GET',
			success: function (res) {
				if (res.success && res.data) {
					deferred.resolve(res.data);
				} else {
					deferred.resolve([]);
				}
			},
			error: function (xhr, status) {
				if (status === 'abort') {
					deferred.reject(status);
					return;
				}
				deferred.resolve([]);
			}
		});

		return deferred.promise();
	}

	// Hàm load lịch bận của bác sĩ
	function loadDoctorBusySchedules(callback, dateFrom, dateTo) {
		return loadDoctorBusySchedulesData(dateFrom, dateTo).done(function (busySchedules) {
			if (typeof callback === 'function') callback(busySchedules);
		});
	}

	// Hàm lấy text hiển thị cho lý do bận
	function getReasonText(reason) {
		return window.AppointmentManagementBusyScheduleUtils.getReasonText(reason);
	}

	Object.assign(page, {
		loadDoctors,
		buildDoctorLegend,
		setupDoctorFilterForCurrentUser,
		applyDoctorFilterSettings,
		loadServices,
		initServiceAutocomplete,
		loadServicePrices,
		updatePriceDisplay,
		formatPrice,
		updateEditPriceDisplay,
		loadPackages,
		abortActiveRequest,
		appendDateRangeParams,
		toRangeStartDateTime,
		toRangeEndDateTime,
		loadAppointmentsData,
		loadAllAppointments,
		getCalendarDateRange,
		loadHolidaysData,
		loadHolidays,
		loadDoctorBusySchedulesData,
		loadDoctorBusySchedules,
		getReasonText
	});
})(window);
