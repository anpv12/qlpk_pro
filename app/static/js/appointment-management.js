$(function () {

	let doctors = [];
	let services = [];
	let packages = [];
	let allAppointments = [];
	let viewAppointments = [];
	let selectedDoctor = '';
	let selectedRoleFilter = ''; // 'DOCTOR', 'PSYCHOLOGIST', or '' (all)
	let searchKeyword = '';
	let statusFilter = '';
	let typeFilter = '';
	let fromDate = '';
	let toDate = '';
	let calendar;
	let calendarResizeObserver = null;
	let calendarResizeFrame = null;
	let calendarDataRequestSeq = 0;
	let appointmentsRequest = null;
	let busySchedulesRequest = null;
	let cachedHolidays = null;
	let holidaysRequestPromise = null;
	let currentCalendarHolidays = [];
	let currentCalendarBusySchedules = [];
	let currentCalendarDateFrom = '';
	let currentCalendarDateTo = '';

	// Modal state variables - Đồng bộ cho cả Add và Edit
	let editCurrentAppointment = null;
	const APPOINTMENT_STATUS_VALUES = ['SCHEDULED', 'CONFIRMED', 'NO_SHOW', 'CANCELLED'];

	// Load danh sách bác sĩ
	function loadDoctors() {
		$.ajax({
			url: '/users/doctors',
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
			},
			success: function (res) {
				doctors = res;
				window.AppointmentManagementDoctorControlsUtils.populateMainDoctorControls($, doctors);

				// Lấy thông tin user hiện tại và set filter tự động
				setupDoctorFilterForCurrentUser();

				// Build legend bác sĩ — màu
				buildDoctorLegend();
				if (calendar && allAppointments.length) {
					refreshView();
				}
			},
			error: function (xhr, status, error) {

				// Handle authentication error
				if (xhr.status === 401) {
					autoLogin().then(() => {
						loadDoctors(); // Retry after login
					}).catch(() => {
						showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
					});
				} else {
					showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	// Build legend bác sĩ — màu trong sidebar
	function buildDoctorLegend() {
		window.AppointmentManagementDoctorLegendUtils.buildDoctorLegend({
			document,
			$,
			doctors,
			getSelectedRoleFilter: () => selectedRoleFilter,
			setSelectedRoleFilter: value => { selectedRoleFilter = value; },
			setSelectedDoctor: value => { selectedDoctor = value; },
			refreshView
		});
	}

	// Setup doctorFilter theo role của user hiện tại
	function setupDoctorFilterForCurrentUser() {
		// Lấy user info từ localStorage hoặc API
		let currentUser = null;
		try {
			const userStr = localStorage.getItem('qlpk_user');
			if (userStr) {
				currentUser = JSON.parse(userStr);
			}
		} catch (e) {
			console.warn('Could not parse user from localStorage:', e);
		}

		// Nếu không có trong localStorage, gọi API
		if (!currentUser || !currentUser.id) {
			$.ajax({
				url: '/users/me',
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
				},
				success: function (userData) {
					currentUser = userData;
					if (currentUser) {
						localStorage.setItem('qlpk_user', JSON.stringify(currentUser));
					}
					applyDoctorFilterSettings(currentUser);
				},
				error: function () {
					console.warn('Could not get current user info');
				}
			});
		} else {
			applyDoctorFilterSettings(currentUser);
		}
	}

	// Áp dụng cài đặt filter theo user role
	function applyDoctorFilterSettings(currentUser) {
		window.AppointmentManagementDoctorControlsUtils.applyDoctorFilterSettings({
			$,
			currentUser,
			setSelectedDoctor: value => { selectedDoctor = value; }
		});
	}

	// Load danh sách dịch vụ
	function loadServices() {
		return $.get('/services/', function (res) {
			services = res;
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
			getServices: () => services
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
			error: function (xhr) {
			}
		});
	}

	// Update price display based on selected target type
	function updatePriceDisplay() {
		window.AppointmentManagementServicePackageControlsUtils.updatePriceDisplay({
			$,
			services,
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
			services
		});
	}

	// Load danh sách gói dịch vụ
	function loadPackages() {
		return $.get('/packages/', function (res) {
			packages = res;
			window.AppointmentManagementServicePackageControlsUtils.populatePackageSelects($, packages);
		}).fail(function (xhr, status, error) {
			window.AppointmentManagementServicePackageControlsUtils.renderPackageSelectError($);
		});
	}

	function getAuthHeaders() {
		return {
			'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
		};
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
			abortActiveRequest(appointmentsRequest);
		}

		let url = '/api/?per_page=10000';
		url = appendDateRangeParams(url, dateFrom, dateTo);

		appointmentsRequest = $.ajax({
			url: url,
			method: 'GET',
			headers: getAuthHeaders(),
			success: function (res) {
				deferred.resolve(res.appointments || []);
			},
			error: function (xhr, status, error) {
				if (status === 'abort') {
					deferred.reject(status);
					return;
				}

				// Handle authentication error
				if (xhr.status === 401) {
					autoLogin().then(() => {
						loadAppointmentsData(dateFrom, dateTo, { abortPrevious: false })
							.done(function (appointments) {
								deferred.resolve(appointments);
							})
							.fail(function (retryStatus) {
								deferred.reject(retryStatus);
							});
					}).catch(() => {
						showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
						deferred.resolve([]);
					});
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
				allAppointments = appointments;
				if (typeof callback === 'function') callback();
			})
			.fail(function (status) {
				if (status === 'abort') return;
				allAppointments = [];
				if (typeof callback === 'function') callback();
			});
	}

	// Helper: lấy date range từ FullCalendar view hiện tại
	function getCalendarDateRange() {
		return window.AppointmentManagementCalendarDateUtils.getCalendarDateRange(calendar);
	}

	function loadHolidaysData() {
		if (cachedHolidays) {
			return $.Deferred().resolve(cachedHolidays).promise();
		}

		if (holidaysRequestPromise) {
			return holidaysRequestPromise;
		}

		const deferred = $.Deferred();
		holidaysRequestPromise = deferred.promise();

		$.ajax({
			url: '/holidays/',
			method: 'GET',
			headers: getAuthHeaders(),
			success: function (holidays) {
				cachedHolidays = Array.isArray(holidays) ? holidays : [];
				deferred.resolve(cachedHolidays);
			},
			error: function (xhr, status, error) {
				cachedHolidays = [];
				deferred.resolve(cachedHolidays);
			},
			complete: function () {
				holidaysRequestPromise = null;
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
			abortActiveRequest(busySchedulesRequest);
		}

		let url = '/api/doctor-busy-schedules?status=active';
		const rangeStart = toRangeStartDateTime(dateFrom);
		const rangeEnd = toRangeEndDateTime(dateTo);
		url = appendDateRangeParams(url, rangeStart, rangeEnd);

		busySchedulesRequest = $.ajax({
			url: url,
			method: 'GET',
			headers: getAuthHeaders(),
			success: function (res) {
				if (res.success && res.data) {
					deferred.resolve(res.data);
				} else {
					deferred.resolve([]);
				}
			},
			error: function (xhr, status, error) {
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

	// Hàm kiểm tra bác sĩ có rảnh không cho drag & drop
	function checkDoctorAvailabilityForDragDrop(appointmentId, newDate, info) {
		//   appointmentId: appointmentId,
		//   newDate: newDate,
		//   newDateISO: newDate.toISOString(),
		//   newDateLocal: newDate.toLocaleString('vi-VN')
		// });

		// Xử lý ID format - calendar events sử dụng appt-{id}
		let numericId = appointmentId;
		if (appointmentId.startsWith('appt-')) {
			numericId = appointmentId.replace('appt-', '');
		}

		const appointment = allAppointments.find(a => a.id == numericId);
		if (!appointment) {
			//   numericId: numericId,
			//   availableIds: allAppointments.map(a => a.id)
			// });
			showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			info.revert();
			return;
		}

		//   id: appointment.id,
		//   doctor_id: appointment.doctor_id,
		//   duration_minutes: appointment.duration_minutes,
		//   original_date: appointment.appointment_date
		// });

		// Tạo appointment data để kiểm tra
		const appointmentData = {
			appointment_date: toLocalISOString(newDate),
			doctor_id: appointment.doctor_id,
			duration_minutes: appointment.duration_minutes,
			appointment_id: numericId
		}

		//   appointment_date: appointmentData.appointment_date,
		//   doctor_id: appointmentData.doctor_id,
		//   duration_minutes: appointmentData.duration_minutes
		// });

		// Kiểm tra lịch bận
		checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {
			//   isAvailable: isAvailable,
			//   conflictInfo: conflictInfo,
			//   appointmentData: appointmentData
			// });

			if (isAvailable) {
				// Bác sĩ rảnh, cập nhật lịch hẹn
				showCustomToast('info', 'Đang cập nhật...');

				// Debounce để tránh gọi API quá nhiều
				clearTimeout(window.updateTimeout);
				window.updateTimeout = setTimeout(() => {
					updateAppointmentTime(appointmentId, newDate, info);
				}, 300);
			} else {
				// Bác sĩ bận, hiển thị cảnh báo và revert
				showConflictWarning(conflictInfo, appointmentData, true);
				info.revert(); // Revert the drag
			}
		});
	}

	// Hàm kiểm tra bác sĩ có rảnh không trước khi tạo lịch hẹn
	function checkDoctorAvailabilityBeforeCreate(appointmentData, callback) {
		const appointmentDateTime = appointmentData.appointment_date;
		const durationMinutes = parseInt(appointmentData.duration_minutes) || 30;

		//   doctor_id: appointmentData.doctor_id,
		//   appointment_datetime: appointmentDateTime,
		//   duration_minutes: durationMinutes,
		//   url: '/api/check-doctor-availability'
		// });

		$.ajax({
			url: '/api/check-doctor-availability',
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`,
				'Content-Type': 'application/json'
			},
			data: JSON.stringify({
				doctor_id: appointmentData.doctor_id,
				appointment_datetime: appointmentDateTime,
				duration_minutes: durationMinutes,
				appointment_id: appointmentData.appointment_id || null
			}),
			success: function (response) {
				//   response: response,
				//   available: response.available,
				//   conflict_info: response.conflict_info
				// });

				if (response.available === true) {
					callback(true, null);
				} else {
					// Merge conflict_type vào conflict_info để có đầy đủ thông tin
					const conflictInfo = response.conflict_info || {};
					if (response.conflict_type) {
						conflictInfo.conflict_type = response.conflict_type;
					}
					callback(false, conflictInfo);
				}
			},
			error: function (xhr) {
				// Nếu API lỗi, log chi tiết và fallback
				//   status: xhr.status,
				//   statusText: xhr.statusText,
				//   responseText: xhr.responseText,
				//   appointmentData: appointmentData
				// });
				callback(true, null);
			}
		});
	}

	// Hàm hiển thị cảnh báo xung đột
	function showConflictWarning(conflictInfo, appointmentData, isEdit = false) {
		window.AppointmentManagementConflictWarningUtils.showConflictWarning(conflictInfo, appointmentData, {
			$,
			appointments: allAppointments,
			isEdit
		});
	}

	// Helper function để lấy user role từ localStorage
	function getCurrentUserRole() {
		try {
			const userStr = localStorage.getItem('qlpk_user');
			if (userStr) {
				const currentUser = JSON.parse(userStr);
				return (currentUser.role || '').toUpperCase();
			}
		} catch (e) {
			console.warn('Could not parse user from localStorage:', e);
		}
		return '';
	}

	// Hàm cập nhật viewAppointments theo filter hiện tại
	function updateViewAppointments() {
		const userRole = getCurrentUserRole();
		viewAppointments = window.AppointmentManagementFilterUtils.filterAppointments(allAppointments, {
			selectedDoctor,
			selectedRoleFilter,
			doctors,
			userRole,
			statusFilter,
			typeFilter,
			fromDate,
			toDate,
			searchKeyword
		}, { includeRoleFilter: true });
	}

	// Hàm refresh view (cập nhật viewAppointments, stats, render)
	function refreshView() {
		updateViewAppointments();
		updateStats();
		updateCalendarEvents();
	}

	function loadCalendarRangeData(dateFrom, dateTo) {
		const requestSeq = ++calendarDataRequestSeq;
		currentCalendarDateFrom = dateFrom || '';
		currentCalendarDateTo = dateTo || '';

		$.when(
			loadAppointmentsData(dateFrom, dateTo),
			loadHolidaysData(),
			loadDoctorBusySchedulesData(dateFrom, dateTo)
		).done(function (appointments, holidays, busySchedules) {
			if (requestSeq !== calendarDataRequestSeq) return;

			allAppointments = appointments || [];
			currentCalendarHolidays = holidays || [];
			currentCalendarBusySchedules = busySchedules || [];
			refreshView();
		}).fail(function (status) {
			if (status === 'abort' || requestSeq !== calendarDataRequestSeq) return;

			allAppointments = [];
			currentCalendarBusySchedules = [];
			refreshView();
		});
	}

	// Hàm reload data sau khi thêm/sửa/xóa
	function afterDataChanged() {
		const { dateFrom, dateTo } = getCalendarDateRange();
		loadCalendarRangeData(dateFrom, dateTo);
	}

	// Hàm hiển thị cảnh báo patient trùng với thay đổi quan trọng
	function showPatientDuplicateWarning(response, appointmentData) {
		window.AppointmentManagementPatientDuplicateWarningUtils.showPatientDuplicateWarning({
			$,
			response,
			appointmentData,
			formatDateDisplay: window.formatDateDisplay,
			onConfirm: function () {
				appointmentData.confirm_update_patient = true;

				const $submitBtn = $('#submitForm');
				$submitBtn.prop('disabled', true).addClass('btn-loading');

				checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {
					if (!isAvailable) {
						showConflictWarning(conflictInfo, appointmentData, false);
						$submitBtn.removeClass('btn-loading').prop('disabled', false);
						return;
					}

					$.ajax({
						url: '/api/',
						method: 'POST',
						contentType: 'application/json',
						data: JSON.stringify(appointmentData),
						timeout: 10000,
						success: function () {
							showCustomToast('success', 'Thêm lịch hẹn thành công!');
							$('#addAppointmentModal').modal('hide');
							afterDataChanged();
						},
						error: function (xhr, status) {
							let errorMsg = 'Không thể thêm lịch hẹn. Vui lòng kiểm tra lại.';
							if (status === 'timeout') {
								errorMsg = 'Thao tác mất quá nhiều thời gian. Vui lòng thử lại.';
							}
							showCustomToast('error', errorMsg);
						},
						complete: function () {
							$submitBtn.removeClass('btn-loading').prop('disabled', false);
						}
					});
				});
			}
		});
	}

	// Khi load trang lần đầu
	$(document).ready(function () {
		// Initialize tooltips với cấu hình rõ ràng
		var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
		var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
			return new bootstrap.Tooltip(tooltipTriggerEl, {
				trigger: 'hover focus',
				delay: { show: 500, hide: 100 }
			});
		});

		// Mặc định hiển thị calendar view
		$('#calendarViewContainer').show();

		// Khởi tạo calendar ngay lập tức
		initializeCalendar();

		// Load data và kiểm tra
		// datesSet callback sẽ tự động load data khi calendar render lần đầu

		// Load doctors, services và packages để kiểm tra
		loadDoctors();
		loadServices();
		loadPackages();
		bindAppointmentEditorSummaries();

		// Hiển thị thông báo nếu không có data
		setTimeout(function () {
			if ((!services || services.length === 0) && (!packages || packages.length === 0)) {
				showCustomToast('warning', 'Chưa có dịch vụ/gói nào. Vui lòng thêm từ quản trị → Dịch vụ/Gói dịch vụ!');
			}
		}, 2000);
	});

	// Định dạng ngày và giờ
	function formatDate(dateStr) {
		return window.AppointmentManagementStatusFormatUtils.formatDate(dateStr);
	}
	function formatTime(dtStr) {
		return window.AppointmentManagementStatusFormatUtils.formatTime(dtStr);
	}

	// Cập nhật badge thống kê
	function updateStats() {
		// Đếm trên allAppointments với các filter khác (không filter theo status)
		// để hiển thị tổng số chính xác cho tất cả các status
		const userRole = getCurrentUserRole();
		const filteredAppointments = window.AppointmentManagementFilterUtils.filterAppointments(allAppointments, {
			selectedDoctor,
			userRole,
			typeFilter,
			fromDate,
			toDate,
			searchKeyword
		}, {
			includeRoleFilter: false,
			includeStatusFilter: false
		});

		// Đếm trên filteredAppointments (đã filter theo các tiêu chí khác, không filter theo status)
		const statusCounts = window.AppointmentManagementFilterUtils.countByStatus(filteredAppointments);

		// Cập nhật số lượng cho các badge
		$('#pendingCount').text(statusCounts.SCHEDULED);
		$('#confirmedCount').text(statusCounts.CONFIRMED);
		$('#overdueCount').text(statusCounts.NO_SHOW);
		$('#cancelledCount').text(statusCounts.CANCELLED);
	}

	// Sự kiện filter - date picker đã được xóa khỏi UI
	$(document).off('change.appointmentManagement', '#doctorFilter').on('change.appointmentManagement', '#doctorFilter', function () {
		selectedDoctor = $(this).val();
		// Clear role filter when specific doctor is selected
		selectedRoleFilter = '';
		document.querySelectorAll('.appt-panel-label.active').forEach(el => el.classList.remove('active'));
		refreshView();
	});

	// Load XLSX library
	window.AppointmentManagementPageActionsUtils.ensureXlsxLibrary(document);

	// Hàm xuất Excel — gọi backend API với openpyxl format
	function exportToExcel() {
		window.AppointmentManagementPageActionsUtils.exportToExcel({
			$,
			document,
			selectedDoctor,
			selectedRoleFilter,
			getToken: () => localStorage.getItem('qlpk_token'),
			showCustomToast
		});
	}

	// Sự kiện xuất dữ liệu
	$(document).off('click.appointmentManagement', '#exportDataBtn').on('click.appointmentManagement', '#exportDataBtn', function (e) {
		e.preventDefault();
		exportToExcel();
	});

	// Hàm mở modal tạo mới lịch hẹn với ngày tuỳ chỉnh (global để gọi từ mini calendar)
	window.QLPKAppointmentManagementReadyForHeaderModal = false;
	window.openAddAppointmentWithDate = function (dateStr) {
		window.AppointmentManagementAddModalUiUtils.openAddAppointmentWithDate({
			$,
			dateStr,
			loadDoctorsForAdd,
			loadServices,
			loadPackages
		});
	};

	function consumeHeaderAppointmentModalRequest() {
		let attempts = 0;
		const maxAttempts = 20;
		const openWhenReady = () => {
			attempts += 1;
			try {
				if (sessionStorage.getItem('qlpk_open_add_appointment_modal') !== '1') return;
				const modal = document.getElementById('addAppointmentModal');
				if (!modal || !window.$ || typeof $('#addAppointmentModal').modal !== 'function') {
					if (attempts < maxAttempts) setTimeout(openWhenReady, 150);
					return;
				}
				window.openAddAppointmentWithDate();
				setTimeout(() => {
					if (modal.classList.contains('show')) {
						sessionStorage.removeItem('qlpk_open_add_appointment_modal');
						return;
					}
					if (attempts < maxAttempts) setTimeout(openWhenReady, 150);
				}, 80);
			} catch (error) {
				if (attempts < maxAttempts) setTimeout(openWhenReady, 150);
			}
		};

		setTimeout(openWhenReady, 2500);
	}

	// Sự kiện thêm lịch hẹn (nút header)
	$(document).off('click.appointmentManagement', '[data-bs-target="#addAppointmentModal"]').on('click.appointmentManagement', '[data-bs-target="#addAppointmentModal"]', function () {
		window.openAddAppointmentWithDate();
	});

	// Load danh sách bác sĩ cho modal add
	function loadDoctorsForAdd() {
		$.ajax({
			url: '/users/doctors',
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
			},
			success: function (res) {
				window.AppointmentManagementDoctorControlsUtils.populateDoctorSelect($, '#addDoctor', res, 'Chọn bác sĩ');
			},
			error: function (xhr, status, error) {

				// Handle authentication error
				if (xhr.status === 401) {
					autoLogin().then(() => {
						loadDoctorsForAdd(); // Retry after login
					}).catch(() => {
						showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
					});
				} else {
					showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	// Sự kiện đóng modal add
	$(document).off('hidden.bs.modal.appointmentManagement', '#addAppointmentModal').on('hidden.bs.modal.appointmentManagement', '#addAppointmentModal', function () {
		window.AppointmentManagementAddModalUiUtils.resetAddAppointmentForm($);
		updateAppointmentEditorSummary('add');
	});

	// Khi load trang lần đầu, $(document).ready sẽ khởi tạo calendar và loadAllAppointments

	// Khởi tạo FullCalendar
	function scheduleCalendarSizeUpdate() {
		if (!calendar || calendarResizeFrame) return;
		calendarResizeFrame = window.requestAnimationFrame(function () {
			calendarResizeFrame = null;
			if (calendar && typeof calendar.updateSize === 'function') {
				calendar.updateSize();
			}
		});
	}

	function bindCalendarResizeObserver(calendarEl) {
		if (calendarResizeObserver) {
			calendarResizeObserver.disconnect();
			calendarResizeObserver = null;
		}

		const calendarHost = calendarEl.closest('.appt-main') || calendarEl.parentElement || calendarEl;
		if (typeof ResizeObserver !== 'undefined') {
			calendarResizeObserver = new ResizeObserver(scheduleCalendarSizeUpdate);
			calendarResizeObserver.observe(calendarHost);
		}

		window.removeEventListener('resize', scheduleCalendarSizeUpdate);
		window.addEventListener('resize', scheduleCalendarSizeUpdate);
	}

	function initializeCalendar() {
		const calendarEl = document.getElementById('calendar');
		if (!calendarEl) return;

		calendar = new FullCalendar.Calendar(calendarEl, {
			initialView: 'dayGridMonth',
			locale: 'vi',
			dayHeaderFormat: { weekday: 'short' },
			timeZone: 'local', // Đảm bảo sử dụng timezone local
			headerToolbar: {
				left: 'today prev,next title',
				center: '',
				right: 'timeGridWeek,dayGridMonth'
			},
			buttonText: {
				today: 'Hôm nay',
				day: 'Ngày',
				week: 'Tuần',
				month: 'Tháng'
			},
			// Title sẽ được format lại trong datesSet callback
			height: '100%',
			expandRows: true,
			allDaySlot: false, // Bỏ all-day slot
			slotDuration: '01:00:00', // Slot 1 giờ match doctor
			slotLabelInterval: '01:00', // Vẫn hiển thị label mỗi giờ
			slotMinTime: '07:00:00', // Bắt đầu từ 7:00 match doctor
			slotMaxTime: '24:00:00', // Exclusive — hiện đến 23:00
			scrollTime: '07:00:00', // Scroll đến 7h khi load
			slotLabelFormat: {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			},
			dayHeaderContent: function (arg) {
				const viewType = arg.view.type;
				if (viewType === 'timeGridWeek') {
					const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
					const dayName = dayNames[arg.date.getDay()];
					const dayNum = String(arg.date.getDate()).padStart(2, '0');
					const container = document.createElement('div');
					container.className = 'appointment-week-day-header';
					const nameEl = document.createElement('span');
					nameEl.textContent = dayName;
					nameEl.className = 'appointment-week-day-name';
					const numEl = document.createElement('span');
					numEl.textContent = dayNum;
					numEl.className = 'appointment-week-day-number';
					container.appendChild(nameEl);
					container.appendChild(numEl);
					return { domNodes: [container] };
				}
				return arg.text;
			},

			editable: true,
			selectable: true,
			selectMirror: true,
			dayMaxEvents: true, // Tự tính dựa trên chiều cao ô
			moreLinkClick: 'popover', // Hiển thị popover khi có quá nhiều events
			weekends: true,
			fixedWeekCount: true,
			datesSet: function (info) {
				// Toolbar chỉ giữ phạm vi tháng để giảm nhiễu trong vùng calendar.
				const d = info.view.currentStart;
				const titleEl = calendarEl.querySelector('.fc-toolbar-title');
				if (titleEl) {
					titleEl.textContent = `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
				}

				// Load appointments theo range của view hiện tại
				const start = info.start || info.view.activeStart;
				const end = info.end || info.view.activeEnd;
				const dateFrom = start.toISOString().split('T')[0];
				const dateTo = end.toISOString().split('T')[0];
				loadCalendarRangeData(dateFrom, dateTo);
			},
			events: [],
			eventDisplay: 'block', // Đảm bảo hiển thị
			eventTimeFormat: {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			},
			eventOverlap: false, // Tránh overlap events
			slotEventOverlap: false, // Tránh overlap trong slot
			eventConstraint: {
				startTime: '08:00',
				endTime: '24:00',
				dows: [0, 1, 2, 3, 4, 5, 6] // Tất cả các ngày trong tuần
			},

			// Đảm bảo không bị cắt theo business hours
			businessHours: false,
			// Set ngày bắt đầu hiển thị là tuần hiện tại
			initialDate: new Date(), // Hiển thị tuần hiện tại
			// Không giới hạn phạm vi thời gian - cho phép xem tất cả các tháng/năm
			// Tối ưu drag & drop
			eventDrop: function (info) {
				const event = info.event;
				const newDate = event.start;
				const appointmentId = event.id;

				//   eventId: appointmentId,
				//   newDate: newDate,
				//   event: event
				// });

				// Kiểm tra ID format
				if (!appointmentId || appointmentId === '') {
					showCustomToast('error', 'Lỗi: Không tìm thấy ID lịch hẹn!');
					info.revert(); // Revert the drag
					return;
				}

				// Kiểm tra lịch bận trước khi cập nhật
				checkDoctorAvailabilityForDragDrop(appointmentId, newDate, info);
			},
			eventResize: function (info) {
				const event = info.event;
				const newStart = event.start;
				const newEnd = event.end;
				const appointmentId = event.id;
				let numericId = appointmentId;
				if (appointmentId.startsWith('appt-')) {
					numericId = appointmentId.replace('appt-', '');
				}
				const appointment = allAppointments.find(item => item.id == numericId);
				if (!appointment) {
					showCustomToast('error', 'Không tìm thấy lịch hẹn!');
					info.revert();
					return;
				}
				const duration = Math.round((newEnd - newStart) / (1000 * 60));
				const appointmentData = {
					appointment_date: toLocalISOString(newStart),
					doctor_id: appointment.doctor_id,
					duration_minutes: duration,
					appointment_id: numericId
				};

				// Thêm visual feedback ngay lập tức
				showCustomToast('info', 'Đang cập nhật thời lượng...');

				// Debounce để tránh gọi API quá nhiều
				clearTimeout(window.resizeTimeout);
				window.resizeTimeout = setTimeout(() => {
					checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {
						if (!isAvailable) {
							showConflictWarning(conflictInfo, appointmentData, true);
							info.revert();
							return;
						}
						updateAppointmentDuration(appointmentId, newStart, newEnd, info);
					});
				}, 300);
			},
			eventClick: function (info) {
				// Không cho phép click vào ngày lễ
				if (info.event.extendedProps.type === 'holiday') {
					return false;
				}

				// Xử lý click vào busy schedule indicator
				if (info.event.extendedProps.type === 'busy_schedule') {
					showBusySchedulePopup(info.event);
					return false; // Ngăn không cho mở modal appointment
				}

				const appointmentId = info.event.id;
				openEditModal(appointmentId);
			},
			dateClick: function (info) {
				openAddModal(info.dateStr);
			},
			eventContent: function (arg) {
				return window.AppointmentManagementCalendarEventContentUtils.buildEventContent(arg, { doctors });
			}
		});

		calendar.render();
		bindCalendarResizeObserver(calendarEl);
		scheduleCalendarSizeUpdate();
		window.setTimeout(scheduleCalendarSizeUpdate, 120);
		window.calendar = calendar; // Expose for mini calendar sync
	}

	// Hàm format ISO string đơn giản (không có offset)
	function toLocalISOString(date) {
		return window.AppointmentManagementCalendarDateUtils.toLocalISOString(date);
	}

	// Cập nhật thời gian lịch hẹn
	function updateAppointmentTime(appointmentId, newDate, info = null) {
		//   appointmentId: appointmentId,
		//   newDate: newDate,
		//   allAppointments: allAppointments.length
		// });

		// Xử lý ID format - calendar events sử dụng appt-{id}
		let numericId = appointmentId;
		if (appointmentId.startsWith('appt-')) {
			numericId = appointmentId.replace('appt-', '');
		}

		const appointment = allAppointments.find(a => a.id == numericId);
		if (!appointment) {
			//   originalId: appointmentId,
			//   numericId: numericId,
			//   availableIds: allAppointments.map(a => a.id)
			// });
			showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			if (info) {
				info.revert(); // Revert the drag
			} else {
				calendar.refetchEvents(); // Revert calendar
			}
			return;
		}

		const formattedDate = toLocalISOString(newDate);

		// Kéo-thả chỉ đổi lịch: chỉ gửi field scheduling, KHÔNG gửi field hồ sơ bệnh nhân
		// (tránh ghi đè dữ liệu patient bằng snapshot list có thể cũ/thiếu)
		const updateData = {
			patient_id: appointment.patient_id,
			appointment_date: formattedDate, // BẮT BUỘC
			doctor_id: appointment.doctor_id,
			duration_minutes: appointment.duration_minutes,
			status: appointment.status,
			notes: appointment.notes
		}

		$.ajax({
			url: `/api/${numericId}`,
			method: 'PUT',
			contentType: 'application/json',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
			},
			data: JSON.stringify(updateData),
			success: function (response) {
				showCustomToast('success', 'Đã cập nhật giờ hẹn thành công!');

				// Cập nhật allAppointments
				const index = allAppointments.findIndex(a => a.id == numericId);
				if (index !== -1) {
					allAppointments[index].appointment_date = formattedDate;
				}

				// Không reload toàn bộ, chỉ cập nhật event hiện tại
				const event = calendar.getEventById(appointmentId);
				if (event) {
					event.setStart(newDate);
				}
			},
			error: function (xhr, status, error) {
				//   status: status,
				//   error: error,
				//   responseText: xhr.responseText
				// });

				const errorMessage = 'Không thể cập nhật giờ hẹn. Vui lòng thử lại.';

				showCustomToast('error', errorMessage);

				if (info) {
					info.revert(); // Revert the drag
				} else {
					calendar.refetchEvents(); // Revert calendar
				}
			}
		});
	}

	// Cập nhật thời lượng lịch hẹn
	function updateAppointmentDuration(appointmentId, newStart, newEnd, info = null) {
		// Xử lý ID format - calendar events sử dụng appt-{id}
		let numericId = appointmentId;
		if (appointmentId.startsWith('appt-')) {
			numericId = appointmentId.replace('appt-', '');
		}

		const appointment = allAppointments.find(a => a.id == numericId);
		if (!appointment) {
			showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			if (info) {
				info.revert();
			} else {
				calendar.refetchEvents(); // Revert calendar
			}
			return;
		}
		const duration = Math.round((newEnd - newStart) / (1000 * 60)); // Tính phút
		// Resize chỉ đổi thời lượng: chỉ gửi field scheduling, KHÔNG gửi field hồ sơ bệnh nhân
		const updateData = {
			patient_id: appointment.patient_id,
			appointment_date: appointment.appointment_date, // BẮT BUỘC
			doctor_id: appointment.doctor_id,
			duration_minutes: duration,
			status: appointment.status,
			notes: appointment.notes
		}
		$.ajax({
			url: `/api/${numericId}`,
			method: 'PUT',
			contentType: 'application/json',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
			},
			data: JSON.stringify(updateData),
			success: function (response) {
				showCustomToast('success', 'Đã cập nhật thời gian lịch hẹn!');
				const index = allAppointments.findIndex(a => a.id == numericId);
				if (index !== -1) {
					allAppointments[index].duration_minutes = duration;
				}
				// Không reload toàn bộ, chỉ cập nhật event hiện tại
				const event = calendar.getEventById(appointmentId);
				if (event) {
					event.setStart(newStart);
					event.setEnd(newEnd);
				}
			},
			error: function (xhr) {
				showCustomToast('error', 'Không thể cập nhật thời gian. Vui lòng thử lại.');
				if (info) {
					info.revert();
				} else {
					calendar.refetchEvents();
				}
			}
		});
	}

	// Mở modal edit
	function openEditModal(appointmentId) {

		// Try different ID formats to find the appointment
		let appointment = allAppointments.find(a => a.id == appointmentId);

		// If not found, try without "appt-" prefix (calendar events use appt-{id} format)
		if (!appointment && appointmentId.startsWith('appt-')) {
			const numericId = appointmentId.replace('appt-', '');
			appointment = allAppointments.find(a => a.id == numericId);
		}

		// If still not found, try string comparison
		if (!appointment) {
			appointment = allAppointments.find(a => String(a.id) === String(appointmentId));
		}

		// If still not found, try with "appt-" prefix
		if (!appointment) {
			appointment = allAppointments.find(a => `appt-${a.id}` === appointmentId);
		}

		if (!appointment) {
			showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			return;
		}

		// Thêm cấp 3 "CHI TIẾT" vào breadcrumb
		updateBreadcrumb('CHI TIẾT');

		editCurrentAppointment = appointment;

		// Show modal first
		$('#editAppointmentModal').modal('show');
		// Store the actual numeric appointment ID for API calls
		$('#editAppointmentModal').data('appointmentId', appointment.id);
		// Store linked patient ID (no #editPatientId input exists in the template)
		$('#editAppointmentModal').data('patientId', appointment.patient_id);

		// Xóa dữ liệu của bệnh nhân trước đó ngay khi mở (chống rò rỉ A -> B trong lúc
		// chờ API /edit trả về; form.reset() không xóa tag ICD render bằng JS)
		$('#editAppointmentForm')[0].reset();
		window.AppointmentManagementIcdMultiselectUtils.clearSelectedICDs($, 'edit');

		// Ensure submit button is always visible for single form
		$('#editSubmitBtn').show();

		// Load data for edit modal - đồng bộ hóa việc tải dropdown trước khi populate form
		$.when(
			loadDoctorsForEdit(),
			loadServices(),
			loadPackages()
		).done(function () {
			// Initialize edit modal features
			initializeEditModalFeatures();

			// Populate form fields: ưu tiên gọi API chi tiết để có patient_info đầy đủ
			// Use the actual appointment ID (not the calendar event ID with appt- prefix)
			const actualAppointmentId = appointment.id;
			$.ajax({
				url: `/api/${actualAppointmentId}/edit`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
				},
				success: async function (detailed) {
					// Bỏ qua response cũ nếu user đã đóng modal hoặc mở lịch hẹn khác
					if ($('#editAppointmentModal').data('appointmentId') !== actualAppointmentId) return;
					await populateEditForm(detailed);
					// Đảm bảo status flag được cập nhật sau khi modal đã hiển thị
					setTimeout(() => {
						updateEditStatusFlag(detailed.status);
					}, 100);
				},
				error: async function (xhr, status, error) {
					// Bỏ qua response cũ nếu user đã đóng modal hoặc mở lịch hẹn khác
					if ($('#editAppointmentModal').data('appointmentId') !== actualAppointmentId) return;
					// Fallback: dùng dữ liệu sẵn có nếu API lỗi
					await populateEditForm(appointment);
					// Đảm bảo status flag được cập nhật sau khi modal đã hiển thị
					setTimeout(() => {
						updateEditStatusFlag(appointment.status);
					}, 100);
				}
			});
		}).fail(function () {
			showCustomToast('error', 'Lỗi tải dữ liệu dropdown. Vui lòng thử lại.');
		});
	}

	// Load danh sách bác sĩ cho edit modal
	function loadDoctorsForEdit() {
		return $.ajax({
			url: '/users/doctors',
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
			},
			success: function (res) {
				doctors = res;
				window.AppointmentManagementDoctorControlsUtils.populateDoctorSelect($, '#editDoctor', doctors, 'Chọn bác sĩ');
			},
			error: function (xhr, status, error) {

				// Handle authentication error
				if (xhr.status === 401) {
					autoLogin().then(() => {
						loadDoctorsForEdit(); // Retry after login
					}).catch(() => {
						showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
					});
				} else {
					showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	// Initialize edit modal features
	function initializeEditModalFeatures() {
		// Initialize form validation
		initializeEditFormValidation();
	}

	// Show edit field error
	function showEditFieldError(selector, message) {
		window.AppointmentManagementEditModalUiUtils.showEditFieldError($, selector, message);
	}

	// Clear edit field error
	function clearEditFieldError(selector) {
		window.AppointmentManagementEditModalUiUtils.clearEditFieldError($, selector);
	}

	// Clear all edit field errors
	function clearAllEditFieldErrors() {
		window.AppointmentManagementEditModalUiUtils.clearAllEditFieldErrors($);
	}

	// Populate edit form
	async function populateEditForm(appointment) {

		// Patient information
		$('#editPatientName').val(appointment.patient_full_name || appointment.full_name || '');

		// Appointment details - set this EARLY to avoid async blocking issues
		if (appointment.appointment_date) {
			const appointmentDate = new Date(appointment.appointment_date);
			const dateStr = appointmentDate.toISOString().split('T')[0];
			const timeStr = appointmentDate.toTimeString().slice(0, 5);

			// Cập nhật ngày hẹn sử dụng hàm chuẩn
			const dateInput = document.getElementById('editAppointmentDate');
			window.setDatepickerValue(dateInput, dateStr, true);

			$('#editAppointmentTime').val(timeStr);
		}

		$('#editPatientPhone').val(appointment.patient_info?.phone || appointment.patient_phone || appointment.phone || '');
		const cccdValue = appointment.patient_id_number || appointment.id_number || (appointment.patient_info ? appointment.patient_info.id_number : '') || '';
		$('#editPatientCCCD').val(cccdValue);
		$('#editPatientEmail').val(appointment.patient_email || appointment.patient_info?.email || '');

		// Cập nhật ngày sinh sử dụng hàm chuẩn
		const dobValue = appointment.patient_date_of_birth || appointment.patient_info?.date_of_birth || '';
		const dobInput = document.getElementById('editPatientDOB');
		window.setDatepickerValue(dobInput, dobValue, true);

		const historyPatient = appointment.medical_history?.patient || {};
		await setSelectedICDsFromString(historyPatient.physical_history || [], 'edit');
		const allergies = historyPatient.allergies || [];
		window.AppointmentManagementAllergyFormatUtils.setFieldValue($('#editAllergies'), allergies);
		$('#editCurrentMedication').val(appointment.patient_info?.current_medication || '');

		// Set doctor value - dropdown đã được tải xong
		$('#editDoctor').val(appointment.doctor_id || '');

		$('#editStatus').val(appointment.status || 'SCHEDULED');

		// Set service autocomplete: tìm tên dịch vụ từ ID
		if (appointment.service_id && services && services.length > 0) {
			const svc = services.find(s => s.id == appointment.service_id);
			$('#editService').val(svc ? svc.name : '');
			$('#editServiceId').val(appointment.service_id);
		} else {
			$('#editService').val('');
			$('#editServiceId').val('');
		}
		$('#editPackage').val(appointment.package_id || '');

		if (appointment.service_id) {
			$('#editTypeService').prop('checked', true);
			$('#editServiceSelection').show();
			$('#editPackageSelection').hide();
			// Update price display immediately
			updateEditPriceDisplay();
		} else if (appointment.package_id) {
			$('#editTypePackage').prop('checked', true);
			$('#editServiceSelection').hide();
			$('#editPackageSelection').show();
		} else {
			$('#editTypeService').prop('checked', true);
			$('#editServiceSelection').show();
			$('#editPackageSelection').hide();
		}

		// Appointment category - sử dụng giá trị từ appointment
		const appointmentCategory = appointment.appointment_category || 'NEW';
		if (appointmentCategory === 'RE_EXAMINATION') {
			$('#editCategoryReExam').prop('checked', true);
			$('#editCategoryNew').prop('checked', false);
		} else {
			$('#editCategoryNew').prop('checked', true);
			$('#editCategoryReExam').prop('checked', false);
		}

		// Intake reason and symptoms are examination-owned fields.
		$('#editMainReason').val(appointment.examination_info?.main_reason || '');
		$('#editSymptoms').val(appointment.examination_info?.main_symptoms || '');

		// Set duration_minutes từ service/package đang được chọn, fallback về appointment.duration_minutes
		let durationFromSelection = null;
		if (appointment.service_id) {
			const selectedService = services.find(service => service.id == appointment.service_id);
			durationFromSelection = selectedService?.duration_minutes;
		} else if (appointment.package_id) {
			const selectedPackageOption = $('#editPackage option:selected');
			durationFromSelection = selectedPackageOption.data('duration');
		}
		// Ưu tiên: duration từ service/package > appointment.duration_minutes > mặc định 60
		$('#editDuration').val(durationFromSelection || appointment.duration_minutes || 60);

		// Update status flag
		updateEditStatusFlag(appointment.status);
		updateAppointmentEditorSummary('edit');
	}

	// Function to update status flag
	function updateEditStatusFlag(status) {
		const normalizedStatus = normalizeAppointmentStatus(status);
		$('#editStatus').val(normalizedStatus);
		window.AppointmentManagementEditModalUiUtils.updateEditStatusFlag({
			$,
			status: normalizedStatus,
			getStatusText,
			getStatusIcon
		});
		refreshEditStatusDropdown(normalizedStatus);
	}

	function normalizeAppointmentStatus(status) {
		const normalized = String(status || '').toUpperCase();
		return APPOINTMENT_STATUS_VALUES.includes(normalized) ? normalized : 'SCHEDULED';
	}

	function getCurrentEditAppointmentStatus() {
		return normalizeAppointmentStatus(
			(editCurrentAppointment && editCurrentAppointment.status) || $('#editStatus').val()
		);
	}

	function getEditStatusTransitionBlockMessage(currentStatus, newStatus) {
		if (!APPOINTMENT_STATUS_VALUES.includes(newStatus)) {
			return 'Trạng thái lịch hẹn không hợp lệ.';
		}
		if (newStatus === currentStatus) {
			return 'Lịch hẹn đang ở trạng thái này.';
		}
		if (currentStatus === 'CONFIRMED' && newStatus === 'SCHEDULED') {
			return 'Không thể chuyển lịch đã xác nhận về chờ xác nhận từ màn lịch hẹn.';
		}
		return '';
	}

	function refreshEditStatusDropdown(currentStatus) {
		const normalizedCurrentStatus = normalizeAppointmentStatus(currentStatus);
		$('[data-edit-appointment-status]').each(function () {
			const $item = $(this);
			const targetStatus = normalizeAppointmentStatus($item.data('editAppointmentStatus'));
			const blockedMessage = getEditStatusTransitionBlockMessage(normalizedCurrentStatus, targetStatus);
			const isBlocked = Boolean(blockedMessage);

			$item
				.toggleClass('disabled', isBlocked)
				.attr('aria-disabled', isBlocked ? 'true' : 'false')
				.attr('tabindex', isBlocked ? '-1' : '0')
				.attr('title', isBlocked ? blockedMessage : '');
		});
	}

	// Initialize edit form validation
	function initializeEditFormValidation() {
		window.AppointmentManagementEditModalUiUtils.initializeEditFormValidation({
			$,
			clearEditFieldError,
			showCustomToast,
			updateEditPriceDisplay,
			updatePriceDisplay
		});
	}

	// Submit edit appointment form
	function submitEditAppointmentForm() {
		const $submitBtn = $('#editSubmitBtn');
		$submitBtn.prop('disabled', true).addClass('btn-loading');

		// Lấy ID lịch hẹn từ data của modal
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (!appointmentId) {
			showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
			$submitBtn.prop('disabled', false).removeClass('btn-loading');
			return;
		}

			const appointmentDateTime = $('#editAppointmentDate').val() + 'T' + $('#editAppointmentTime').val();
			const editAppointmentType = $('input[name="editAppointmentType"]:checked').val();

			const formData = {
			patient_id: $('#editAppointmentModal').data('patientId') || null,
			full_name: $('#editPatientName').val(),
			phone: $('#editPatientPhone').val(),
			id_number: $('#editPatientCCCD').val(),
			email: $('#editPatientEmail').val(),
			date_of_birth: $('#editPatientDOB').val(),
			physical_history: getSelectedICDsString('edit'),
			allergies: window.AppointmentManagementAllergyFormatUtils.getSubmitValue($('#editAllergies')),
			current_medication: $('#editCurrentMedication').val(),
			appointment_date: appointmentDateTime,
			doctor_id: $('#editDoctor').val(),
			status: $('#editStatus').val(),
			appointment_category: $('input[name="editAppointmentCategory"]:checked').val(),
				appointment_type: editAppointmentType,
				service_id: editAppointmentType === 'service' ? ($('#editServiceId').val() || null) : null,
				package_id: editAppointmentType === 'package' ? ($('#editPackage').val() || null) : null,
			main_reason: $('#editMainReason').val(),
			main_symptoms: $('#editSymptoms').val(),
			duration_minutes: $('#editDuration').val() || 30,
			// Đánh dấu nguồn lưu là màn lịch hẹn để backend không ghi đè lý do/triệu chứng
			// đã được bác sĩ nhập khi phiếu khám đã bắt đầu (xem update_service guard)
			is_appointment_edit: true
		}

		// Kiểm tra lịch bận trước khi cập nhật lịch hẹn
		const availabilityPayload = Object.assign({}, formData, { appointment_id: appointmentId });
		checkDoctorAvailabilityBeforeCreate(availabilityPayload, function (isAvailable, conflictInfo) {
			if (!isAvailable) {
				// Hiển thị cảnh báo xung đột
				showConflictWarning(conflictInfo, formData, true);
				$submitBtn.prop('disabled', false).removeClass('btn-loading');
				return;
			}

			// Nếu bác sĩ rảnh, tiếp tục cập nhật lịch hẹn
			$.ajax({
				url: `/api/${appointmentId}`,
				method: 'PUT',
				contentType: 'application/json',
				headers: {
					'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
				},
				data: JSON.stringify(formData),
				timeout: 30000,
				success: function (response) {
					showCustomToast('success', 'Cập nhật lịch hẹn thành công!');
					$('#editAppointmentModal').modal('hide');
					afterDataChanged();
				},
				error: function (xhr) {
					const errorMessage = 'Không thể cập nhật lịch hẹn. Vui lòng kiểm tra lại.';
					showCustomToast('error', errorMessage);
				},
				complete: function () {
					$submitBtn.prop('disabled', false).removeClass('btn-loading');
				}
			});
		});
	}

	// Mở modal add với ngày đã chọn
	function openAddModal(dateStr) {
		window.AppointmentManagementAddModalUiUtils.resetAddModalForOpen({
			$,
			dateStr,
			clearSelectedICDs,
			loadDoctorsForAdd,
			loadServices,
			loadPackages
		});
	}

	// Cập nhật events cho calendar
	function updateCalendarEvents() {

		if (!calendar) {
			initializeCalendar();
			if (!calendar) {
				return;
			}
		}

		// Sử dụng viewAppointments đã được filter để hiển thị lịch hẹn trên calendar
		const appointmentsToShow = viewAppointments;

		updateCalendarWithHolidaysAndBusySchedules(
			appointmentsToShow,
			currentCalendarHolidays,
			currentCalendarBusySchedules
		);
	}

	// Hàm cập nhật calendar với cả appointments, holidays và busy schedules
	function updateCalendarWithHolidaysAndBusySchedules(appointmentsToShow, holidays, busySchedules) {
		const eventSourceUtils = window.AppointmentManagementCalendarEventSourceUtils;
		const appointmentEvents = eventSourceUtils.buildCurrentAppointmentEvents(appointmentsToShow);

		// Không hiển thị busy schedules trên calendar nữa
		// Thay vào đó sẽ hiển thị trong panel riêng

		// Kết hợp tất cả events (chỉ appointments)
		const allEvents = [...appointmentEvents];

		// Cập nhật panel hiển thị bác sĩ bận
		updateBusyDoctorsPanel(busySchedules);

		// Setup realtime update cho busy schedules
		setupRealtimeBusyScheduleUpdate();

		// Cập nhật calendar
		if (calendar) {
			const renderEvents = function () {
				calendar.removeAllEvents();
				calendar.addEventSource(allEvents);
			};

			if (typeof calendar.batchRendering === 'function') {
				calendar.batchRendering(renderEvents);
			} else {
				renderEvents();
			}
		}
	}

	// Sử dụng utility functions cho status
	function getStatusText(status) {
		return window.AppointmentManagementStatusFormatUtils.getStatusText(status);
	}

	function getStatusIcon(status) {
		return window.AppointmentManagementStatusFormatUtils.getStatusIcon(status);
	}

	function parseAppointmentEditorDate(value) {
		const rawValue = String(value || '').trim();
		if (!rawValue) return null;

		let parts = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (parts) {
			return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
		}

		parts = rawValue.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
		if (parts) {
			return new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
		}

		const parsedDate = new Date(rawValue);
		return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
	}

	function formatAppointmentEditorDate(value) {
		const date = parseAppointmentEditorDate(value);
		if (!date) return '';

		const day = String(date.getDate()).padStart(2, '0');
		const month = String(date.getMonth() + 1).padStart(2, '0');
		return `${day}/${month}/${date.getFullYear()}`;
	}

	function calculateAppointmentEditorAge(value) {
		const date = parseAppointmentEditorDate(value);
		if (!date) return null;

		const today = new Date();
		let age = today.getFullYear() - date.getFullYear();
		const monthDiff = today.getMonth() - date.getMonth();
		if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
			age -= 1;
		}
		return age >= 0 ? age : null;
	}

	function getAppointmentEditorModeConfig(mode) {
		const isEdit = mode === 'edit';
		return {
			mode,
			prefix: isEdit ? 'edit' : 'add',
			formSelector: isEdit ? '#editAppointmentForm' : '#addAppointmentForm',
			categoryName: isEdit ? 'editAppointmentCategory' : 'appointmentCategory',
			defaultName: isEdit ? 'Bệnh nhân' : 'Bệnh nhân mới'
		};
	}

	function getAppointmentEditorSelectText(selector, fallback) {
		const value = $(selector).val();
		const text = $(`${selector} option:selected`).text().trim();
		return value && text ? text : fallback;
	}

	function updateAppointmentSummaryStatus(mode, status) {
		const config = getAppointmentEditorModeConfig(mode);
		const statusClassMap = {
			SCHEDULED: 'appointment-status-scheduled',
			CONFIRMED: 'appointment-status-confirmed',
			NO_SHOW: 'appointment-status-no-show',
			CANCELLED: 'appointment-status-cancelled'
		};
		const summarySelector = `#${config.prefix}SummaryStatus`;
		const statusClass = statusClassMap[status] || 'appointment-status-scheduled';

		$(summarySelector)
			.removeClass('appointment-status-scheduled appointment-status-confirmed appointment-status-no-show appointment-status-cancelled')
			.addClass(statusClass)
			.text(getStatusText(status || 'SCHEDULED'));
	}

	function updateAppointmentEditorSummary(mode) {
		const config = getAppointmentEditorModeConfig(mode);
		const prefix = config.prefix;
		const name = $(`#${prefix}PatientName`).val().trim() || config.defaultName;
		const dobValue = $(`#${prefix}PatientDOB`).val();
		const dobText = formatAppointmentEditorDate(dobValue);
		const age = calculateAppointmentEditorAge(dobValue);
		const dobAgeText = dobText
			? `${dobText}${age !== null ? ` · ${age} tuổi` : ''}`
			: 'Chưa có ngày sinh';
		const appointmentDate = formatAppointmentEditorDate($(`#${prefix}AppointmentDate`).val()) || 'Chưa chọn';
		const appointmentTime = $(`#${prefix}AppointmentTime`).val() || 'Chưa chọn';
		const doctorText = getAppointmentEditorSelectText(`#${prefix}Doctor`, 'Chưa chọn');
		const categoryValue = $(`input[name="${config.categoryName}"]:checked`).val();
		const categoryText = categoryValue === 'RE_EXAMINATION' ? 'Tái khám' : 'Khám mới';
		const status = $(`#${prefix}Status`).val() || 'SCHEDULED';

		$(`#${prefix}SummaryName`).text(name);
		$(`#${prefix}SummaryDobAge`).text(dobAgeText);
		$(`#${prefix}SummaryDate`).text(appointmentDate);
		$(`#${prefix}SummaryTime`).text(appointmentTime);
		$(`#${prefix}SummaryDoctor`).text(doctorText);
		$(`#${prefix}SummaryCategory`).text(categoryText);
		updateAppointmentSummaryStatus(mode, status);
	}

	function bindAppointmentEditorSummaries() {
		$(document)
			.off('input.appointmentEditorSummary change.appointmentEditorSummary', '#addAppointmentForm input, #addAppointmentForm select')
			.on('input.appointmentEditorSummary change.appointmentEditorSummary', '#addAppointmentForm input, #addAppointmentForm select', function () {
				updateAppointmentEditorSummary('add');
			});

		$(document)
			.off('input.appointmentEditorSummary change.appointmentEditorSummary', '#editAppointmentForm input, #editAppointmentForm select')
			.on('input.appointmentEditorSummary change.appointmentEditorSummary', '#editAppointmentForm input, #editAppointmentForm select', function () {
				updateAppointmentEditorSummary('edit');
			});

		$(document)
			.off('shown.bs.modal.appointmentEditorSummary', '#addAppointmentModal')
			.on('shown.bs.modal.appointmentEditorSummary', '#addAppointmentModal', function () {
				updateAppointmentEditorSummary('add');
			});

		$(document)
			.off('shown.bs.modal.appointmentEditorSummary', '#editAppointmentModal')
			.on('shown.bs.modal.appointmentEditorSummary', '#editAppointmentModal', function () {
				updateAppointmentEditorSummary('edit');
			});
	}

	// Hàm cập nhật breadcrumb
	function updateBreadcrumb(thirdLevel = null) {
		window.AppointmentManagementPageActionsUtils.updateBreadcrumb($, thirdLevel);
	}

	// Hàm đóng modal và reset breadcrumb
	function closeModalAndResetBreadcrumb() {
		window.AppointmentManagementPageActionsUtils.closeModalAndResetBreadcrumb({
			$,
			updateBreadcrumb
		});
	}

	// Hàm gọi API xóa appointment (hỗ trợ force param cho lifecycle guard)
	function doDeleteAppointment(appointmentId, force = false) {
		$.ajax({
			url: `/api/appointments/${appointmentId}/cancel`,
			type: 'DELETE',
			contentType: 'application/json',
			headers: {
				'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
			},
			data: force ? JSON.stringify({ force: true }) : undefined,
			success: function (response) {
				showCustomToast('success', 'Đã xóa lịch hẹn thành công!');
				afterDataChanged();
			},
			error: function (xhr) {
				const data = xhr.responseJSON || {};
				if (xhr.status === 409 && data.requires_force) {
					// Đang trong quá trình khám — hỏi xác nhận lần 2
					CustomModal.confirm('Lịch hẹn đang được sử dụng trong ca khám. Bạn có chắc muốn xóa?', 'Xác nhận xóa/ẩn').then(function (confirmed) {
						if (confirmed) {
							doDeleteAppointment(appointmentId, true);
						}
					});
				} else {
					// 400 blocked hoặc lỗi khác — hiển thị thông báo
					showCustomToast('error', 'Không thể xóa lịch hẹn. Vui lòng kiểm tra lại.');
				}
			}
		});
	}

	function showCustomToast(type, message) {
		window.AppointmentManagementFeedbackUtils.showToast({
			bootstrap,
			document,
			message,
			type
		});
	}

	// Event handlers for edit modal
	$(document).off('shown.bs.modal.appointmentManagement', '#editAppointmentModal').on('shown.bs.modal.appointmentManagement', '#editAppointmentModal', function () {
		// Ensure submit button is always visible when modal is shown
		$('#editSubmitBtn').show();

		// Init ICD multi-select
		setupICDMultiSelect('editMedicalHistory', 'edit');

		// Đảm bảo status flag được cập nhật khi modal hiển thị
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (appointmentId && editCurrentAppointment) {
			setTimeout(() => {
				updateEditStatusFlag(editCurrentAppointment.status);
			}, 50);
		}

		// Đảm bảo tooltip không tự động show
		setTimeout(() => {
			$('[data-bs-toggle="tooltip"]').each(function () {
				const tooltip = bootstrap.Tooltip.getInstance(this);
				if (tooltip) {
					tooltip.hide();
				}
			});
		}, 100);
	});

	// Xóa lịch hẹn từ modal chỉnh sửa
	$(document).off('click.appointmentManagement', '#editDeleteAppointmentBtn').on('click.appointmentManagement', '#editDeleteAppointmentBtn', function () {
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		if (!appointmentId) return;

		CustomModal.confirm('Lịch hẹn sẽ bị ẩn khỏi danh sách và đánh dấu đã hủy. Bạn chắc chắn muốn tiếp tục?', 'Xác nhận xóa/ẩn').then(function (confirmed) {
			if (!confirmed) return;
			$('#editAppointmentModal').modal('hide');
			doDeleteAppointment(appointmentId);
		});
	});

	$(document).off('click.appointmentManagement', '#sendEmailReminderBtn').on('click.appointmentManagement', '#sendEmailReminderBtn', function () {
		window.AppointmentManagementPageActionsUtils.sendEmailReminder(getPageActionsOptions());
	});

	$(document).off('click.appointmentManagement', '[data-edit-appointment-status]').on('click.appointmentManagement', '[data-edit-appointment-status]', function (event) {
		event.preventDefault();
		const newStatus = $(this).data('editAppointmentStatus');
		if (newStatus) {
			updateEditAppointmentStatus(newStatus);
		}
	});

	$(document).off('click.appointmentManagement', '[data-appointment-action="close-edit-modal"]').on('click.appointmentManagement', '[data-appointment-action="close-edit-modal"]', function (event) {
		event.preventDefault();
		closeModalAndResetBreadcrumb();
	});

	$(document).off('hidden.bs.modal.appointmentManagement', '#editAppointmentModal').on('hidden.bs.modal.appointmentManagement', '#editAppointmentModal', function () {
		// Reset form
		$('#editAppointmentForm')[0].reset();
		$('#editAppointmentModal').removeData('appointmentId');
		$('#editAppointmentModal').removeData('patientId');

		// Clear errors
		clearAllEditFieldErrors();

		// Enable all fields (use the real template ids)
		$('#editPatientName, #editPatientPhone, #editPatientCCCD, #editPatientEmail, #editPatientDOB, #editMedicalHistorySearch, #editAllergies, #editCurrentMedication').prop('disabled', false).removeClass('bg-light');

		// Ensure submit button is always visible for single form
		$('#editSubmitBtn').show();

		// Xóa cấp 3 "CHI TIẾT" khỏi breadcrumb
		updateBreadcrumb();
	});

	// ===== CÁC HÀM GỬI THÔNG BÁO =====
	function getPageActionsOptions() {
		return {
			$,
			CustomModal,
			showCustomToast
		};
	}

	// ===== ADD APPOINTMENT MODAL SETUP =====

	function initializePhase3Features() {

		try {
			// Khởi tạo form validation
			initializeFormValidation();

		} catch (error) {
		}
	}

	// Khởi tạo form validation
	function initializeFormValidation() {
		window.AppointmentManagementAddModalUiUtils.initializeFormValidation({ $ });
	}

	// Khởi tạo modal events khi document ready
	$(document).ready(function () {
		// Khởi tạo modal khi shown
		$('#addAppointmentModal').off('shown.bs.modal.appointmentAddPrepare').on('shown.bs.modal.appointmentAddPrepare', function () {

			try {
				window.AppointmentManagementAddModalUiUtils.prepareAddModalShown({
					$,
					document,
					setDatepickerValue: window.setDatepickerValue,
					setupICDMultiSelect,
					initializePhase3Features
				});
				updateAppointmentEditorSummary('add');

			} catch (error) {
			}
		});

		setTimeout(() => {
			window.QLPKAppointmentManagementReadyForHeaderModal = true;
			consumeHeaderAppointmentModalRequest();
		}, 2500);

	});

	// Submit form với loading state
	function submitAppointmentForm() {
		const $submitBtn = $('#submitForm');

		$submitBtn.addClass('btn-loading').prop('disabled', true);

		const formData = window.AppointmentManagementAddModalUiUtils.buildAddAppointmentFormData({
			$,
			getSelectedICDsString
		});

		// Kiểm tra lịch bận trước khi tạo lịch hẹn
		checkDoctorAvailabilityBeforeCreate(formData, function (isAvailable, conflictInfo) {
			if (!isAvailable) {
				// Hiển thị cảnh báo xung đột
				showConflictWarning(conflictInfo, formData, false);
				$submitBtn.removeClass('btn-loading').prop('disabled', false);
				return;
			}

			// Nếu bác sĩ rảnh, tiếp tục tạo lịch hẹn
			$.ajax({
				url: '/api/',
				method: 'POST',
				contentType: 'application/json',
				data: JSON.stringify(formData),
				timeout: 10000, // 10 seconds timeout
				success: function (response) {
					// Kiểm tra xem có yêu cầu confirm không (patient trùng với thay đổi quan trọng)
					if (response.requires_confirmation) {
						// Hiển thị popup cảnh báo và yêu cầu confirm
						showPatientDuplicateWarning(response, formData);
						$submitBtn.removeClass('btn-loading').prop('disabled', false);
						return;
					}

					showCustomToast('success', 'Thêm lịch hẹn thành công!');
					$('#addAppointmentModal').modal('hide');
					afterDataChanged();
				},
				error: function (xhr, status, error) {

					let errorMsg = 'Không thể thêm lịch hẹn. Vui lòng kiểm tra lại.';
					if (status === 'timeout') {
						errorMsg = 'Thao tác mất quá nhiều thời gian. Vui lòng thử lại.';
					}

					showCustomToast('error', errorMsg);
				},
				complete: function () {
					$submitBtn.removeClass('btn-loading').prop('disabled', false);
				}
			});
		});
	}

	// Simple form validation for Add Appointment modal (bỏ logic step cũ)
	function isAddFormValid() {
		return window.AppointmentManagementAddModalUiUtils.isAddFormValid($);
	}

	// Submit button click handler
	$(document).off('click.appointmentManagement', '#submitForm').on('click.appointmentManagement', '#submitForm', function (e) {

		// Prevent double click
		const $submitBtn = $(this);
		if ($submitBtn.prop('disabled')) {
			return;
		}

		// Set submitting state
		$submitBtn.prop('disabled', true);

		// Validate tối thiểu các field bắt buộc
		if (!isAddFormValid()) {
			$submitBtn.prop('disabled', false); // Re-enable nếu validation fail
			return;
		}

		// Nếu tất cả valid, submit form
		submitAppointmentForm();
	});

	$(document).off('serviceSelected.appointmentManagement', '#addService').on('serviceSelected.appointmentManagement', '#addService', function (event, selectedService) {
		if (selectedService?.duration_minutes) {
			$('#addDuration').val(selectedService.duration_minutes);
		}
		if (selectedService?.id) {
			loadServicePrices(selectedService.id);
		}
	});

	$(document).off('serviceSelected.appointmentManagement', '#editService').on('serviceSelected.appointmentManagement', '#editService', function (event, selectedService) {
		if (selectedService?.duration_minutes) {
			$('#editDuration').val(selectedService.duration_minutes);
		}
		if (selectedService?.id) {
			loadServicePrices(selectedService.id);
		}
	});

	// Auto-fill duration khi chọn gói
	$(document).off('change.appointmentManagement', '#addPackage').on('change.appointmentManagement', '#addPackage', function () {
		window.AppointmentManagementAddModalUiUtils.applySelectedDuration($, this, false);
	});

	// Toggle service/package selection
	$('input[name="appointmentType"]').off('change.appointmentManagement').on('change.appointmentManagement', function () {
		window.AppointmentManagementAddModalUiUtils.applyAppointmentTypeSelection($, $(this).val(), true);
	});

	// Function to update appointment status from edit modal
	function updateEditAppointmentStatus(newStatus) {
		const appointmentId = $('#editAppointmentModal').data('appointmentId');
		const normalizedStatus = normalizeAppointmentStatus(newStatus);
		const currentStatus = getCurrentEditAppointmentStatus();
		const blockMessage = getEditStatusTransitionBlockMessage(currentStatus, normalizedStatus);
		if (blockMessage) {
			showCustomToast('warning', blockMessage);
			refreshEditStatusDropdown(currentStatus);
			return;
		}

		if (!appointmentId) {
			showCustomToast('error', 'Không tìm thấy ID lịch hẹn!');
			return;
		}

		const statusText = getStatusText(normalizedStatus);

		// Sử dụng custom modal thay vì confirm
		CustomModal.confirm(`Bạn có chắc chắn muốn thay đổi trạng thái thành "${statusText}"?`, 'Xác nhận thay đổi trạng thái').then((confirmed) => {
			if (confirmed) {
				$.ajax({
					url: `/api/${appointmentId}`,
					method: 'PUT',
					contentType: 'application/json',
					headers: {
						'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
					},
						data: JSON.stringify({
							status: normalizedStatus
						}),
						success: function () {
							showCustomToast('success', `Đã cập nhật trạng thái thành "${statusText}" thành công!`);
							if (editCurrentAppointment) {
								editCurrentAppointment.status = normalizedStatus;
							}
							updateEditStatusFlag(normalizedStatus);
							updateAppointmentEditorSummary('edit');
							afterDataChanged();
						},
					error: function (xhr) {
						showCustomToast('error', 'Không thể cập nhật trạng thái. Vui lòng thử lại.');
					}
				});
			}
		});
	}

	function initializeICDMultiSelect() {
		window.AppointmentManagementIcdMultiselectUtils.initializeICDMultiSelect($);
	}

	function setupICDMultiSelect(fieldId, mode) {
		window.AppointmentManagementIcdMultiselectUtils.setupICDMultiSelect($, fieldId, mode);
	}

	function getSelectedICDsString(mode) {
		return window.AppointmentManagementIcdMultiselectUtils.getSelectedICDsString(mode);
	}

	async function setSelectedICDsFromString(icdString, mode) {
		return window.AppointmentManagementIcdMultiselectUtils.setSelectedICDsFromString($, icdString, mode);
	}

	function clearSelectedICDs(mode) {
		window.AppointmentManagementIcdMultiselectUtils.clearSelectedICDs($, mode);
	}

	// Initialize ICD multi-select when page loads
	initializeICDMultiSelect();

	// Đảm bảo event handler cho nút submit edit được khởi tạo
	$(document).off('click.appointmentManagement', '#editSubmitBtn').on('click.appointmentManagement', '#editSubmitBtn', function (e) {
		e.preventDefault();
		e.stopPropagation();

		// Validate các trường bắt buộc
		const fullName = $('#editPatientName').val().trim();
		const appointmentDate = $('#editAppointmentDate').val();
		const appointmentTime = $('#editAppointmentTime').val();
		const doctor = $('#editDoctor').val();

		if (!fullName) {
			showCustomToast('error', 'Vui lòng nhập họ và tên bệnh nhân');
			return;
		}

		if (!appointmentDate) {
			showCustomToast('error', 'Vui lòng chọn ngày hẹn');
			return;
		}

		if (!appointmentTime) {
			showCustomToast('error', 'Vui lòng chọn giờ hẹn');
			return;
		}

		if (!doctor) {
			showCustomToast('error', 'Vui lòng chọn bác sĩ khám');
			return;
		}

		submitEditAppointmentForm();
	});

	function showBusySchedulePopup(event) {
		window.AppointmentManagementBusySchedulePopupUtils.showBusySchedulePopup($, event);
	}

	$(document).off('click.appointmentManagement', '[data-busy-schedule-action="close"]').on('click.appointmentManagement', '[data-busy-schedule-action="close"]', function () {
		window.AppointmentManagementBusySchedulePopupUtils.closeBusySchedulePopup($);
	});

	// Biến lưu trữ busy schedules hiện tại
	let currentBusySchedules = [];

	// Function kiểm tra xem bác sĩ có đang bận trong thời gian hiện tại không
	function isDoctorCurrentlyBusy(busySchedules) {
		return window.AppointmentManagementBusyScheduleUtils.isDoctorCurrentlyBusy(busySchedules);
	}

	// Function kiểm tra xem bác sĩ có lịch bận trong tương lai không (chưa bắt đầu)
	function isDoctorFutureBusy(busySchedules) {
		return window.AppointmentManagementBusyScheduleUtils.isDoctorFutureBusy(busySchedules);
	}

	// Function lọc các lịch bận chưa kết thúc
	function filterActiveBusySchedules(busySchedules) {
		return window.AppointmentManagementBusyScheduleUtils.filterActiveBusySchedules(busySchedules);
	}

	// Lưu dữ liệu lịch bận hiện tại cho popup và các callback realtime.
	function updateBusyDoctorsPanel(busySchedules) {
		currentBusySchedules = busySchedules || [];
	}

		// Setup local cross-tab update cho busy schedules bằng BroadcastChannel
	function setupRealtimeBusyScheduleUpdate() {
		// Hàm này được gọi mỗi lần render calendar; chỉ thiết lập listener realtime MỘT lần
		// để tránh gắn chồng listener 'storage' (leak) và gọi AJAX refresh thừa mỗi lần render.
		if (window.busyScheduleRealtimeInitialized) {
			return;
		}
		window.busyScheduleRealtimeInitialized = true;

		// Sử dụng BroadcastChannel để lắng nghe thay đổi từ các tab/component khác
		if ('BroadcastChannel' in window) {
			// Close existing channel nếu có
			if (window.busyScheduleChannel) {
				window.busyScheduleChannel.close();
			}

			window.busyScheduleChannel = new BroadcastChannel('busy_schedule_updates');

		window.busyScheduleChannel.onmessage = function (event) {
			if (event.data && event.data.type === 'BUSY_SCHEDULE_CHANGED') {
				refreshBusySchedulesOnce();
			}
		};
	} else {
		// Fallback: sử dụng storage event cho các browsers cũ
		window.addEventListener('storage', function (event) {
			if (event.key === 'busy_schedule_version') {
				refreshBusySchedulesOnce();
			}
		});
	}

	}

	// Hàm refresh busy schedules 1 lần (không loop)
	function refreshBusySchedulesOnce() {
		loadDoctorBusySchedulesData(currentCalendarDateFrom, currentCalendarDateTo)
			.done(function (response) {
				// Đảm bảo response là array (giống như loadDoctorBusySchedules)
				let busySchedules = [];
				if (response && response.success && response.data && Array.isArray(response.data)) {
					busySchedules = response.data;
				} else if (Array.isArray(response)) {
					busySchedules = response;
				} else if (response && response.items && Array.isArray(response.items)) {
					busySchedules = response.items;
				}

				// Cập nhật panel với dữ liệu mới (bao gồm status text)
				updateBusyDoctorsPanel(busySchedules);
			});
	}

	// Helper function để broadcast busy schedule changes (gọi từ các nơi tạo/xóa/update)
	window.notifyBusyScheduleChanged = function () {
		if ('BroadcastChannel' in window) {
			const channel = new BroadcastChannel('busy_schedule_updates');
			channel.postMessage({ type: 'BUSY_SCHEDULE_CHANGED', timestamp: Date.now() });
			channel.close();
		}
		// Fallback: cập nhật localStorage để trigger storage event ở các tab khác
		localStorage.setItem('busy_schedule_version', Date.now().toString());

		// Cũng refresh local panel
		refreshBusySchedulesOnce();
	};

	$(document).off('click.appointmentManagement', '[data-doctor-busy-action="open"]').on('click.appointmentManagement', '[data-doctor-busy-action="open"]', function () {
		const doctorId = $(this).data('doctorId');
		const doctorName = $(this).data('doctorName');
		window.AppointmentManagementBusySchedulePopupUtils.showDoctorBusySchedules(
			$,
			window.AppointmentManagementBusySchedulePanelUtils,
			doctorId,
			doctorName,
			currentBusySchedules
		);
	});

	$(document).off('click.appointmentManagement', '[data-doctor-busy-action="close"]').on('click.appointmentManagement', '[data-doctor-busy-action="close"]', function () {
		window.AppointmentManagementBusySchedulePopupUtils.closeDoctorBusyPopup($);
	});

	// Cleanup khi rời khỏi trang
	$(window).off('beforeunload.appointmentManagement').on('beforeunload.appointmentManagement', function () {
		if (window.updateTimeout) {
			clearTimeout(window.updateTimeout);
		}
	});

	// ========== Google Calendar Integration ==========

	// Load trạng thái kết nối Google Calendar
	function loadCalendarStatus() {
		return window.AppointmentManagementCalendarConnectionUtils.loadCalendarStatus({
			$,
			getToken: () => localStorage.getItem('qlpk_token')
		});
	}

	window.AppointmentManagementCalendarConnectionUtils.initializeCalendarConnection({
		$,
		getToken: () => localStorage.getItem('qlpk_token'),
		loadCalendarStatus,
		onReady: initSyncCalendarModal,
		showCustomToast,
		window
	});

	// =====================================================
	// CALENDAR SYNC DASHBOARD
	// =====================================================

	function initSyncCalendarModal() {
		window.AppointmentManagementCalendarSyncModalUtils.initializeSyncCalendarModal({
			$,
			abortCalendarSyncRequests: () => window.AppointmentManagementCalendarSyncRuntimeUtils.abortCalendarSyncRequests(),
			customModal: CustomModal,
			filterSyncTable,
			flatpickrInstance: typeof flatpickr !== 'undefined' ? flatpickr : null,
			getToken: () => localStorage.getItem('qlpk_token'),
			loadSyncData,
			showCustomToast,
			syncAppointments,
			syncControlsUtils: window.AppointmentManagementCalendarSyncControlsUtils,
			syncDateUtils: window.AppointmentManagementCalendarSyncDateUtils,
			updateSyncButtonStates,
			validateCalendarConnections
		});
	}

	function getCalendarSyncRuntimeOptions() {
		return {
			$,
			controlsUtils: window.AppointmentManagementCalendarSyncControlsUtils,
			filterUtils: window.AppointmentManagementCalendarSyncFilterUtils,
			getToken: () => localStorage.getItem('qlpk_token'),
			renderSyncTable,
			showCustomToast,
			statusUtils: window.AppointmentManagementCalendarSyncStatusUtils,
			syncAppointments,
			syncDateUtils: window.AppointmentManagementCalendarSyncDateUtils,
			tableUtils: window.AppointmentManagementCalendarSyncTableUtils,
			updateSyncBadgesAfterVerify,
			updateSyncButtonStates,
			updateSyncCounters,
			verifyCalendarEvents
		};
	}

	// Validate tất cả connections để đảm bảo data integrity
	function validateCalendarConnections() {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.validateCalendarConnections(getCalendarSyncRuntimeOptions());
	}

	function loadSyncData() {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.loadSyncData(getCalendarSyncRuntimeOptions());
	}

	function renderSyncTable(data) {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.renderSyncTable(getCalendarSyncRuntimeOptions(), data);
	}

	function updateSyncButtonStates() {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.updateSyncButtonStates(getCalendarSyncRuntimeOptions());
	}

	// Verify calendar events thực tế trên Google Calendar
	function verifyCalendarEvents(appointmentIds) {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.verifyCalendarEvents(getCalendarSyncRuntimeOptions(), appointmentIds);
	}

	// Cập nhật badges count sau khi verify
	function updateSyncBadgesAfterVerify() {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.updateSyncBadgesAfterVerify(getCalendarSyncRuntimeOptions());
	}

	function syncAppointments(appointmentIds) {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.syncAppointments(getCalendarSyncRuntimeOptions(), appointmentIds);
	}

	// Cập nhật các counter trên header sau khi sync
	function updateSyncCounters() {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.updateSyncCounters(getCalendarSyncRuntimeOptions());
	}

	// Filter bảng sync theo search text và status
	function filterSyncTable() {
		return window.AppointmentManagementCalendarSyncRuntimeUtils.filterSyncTable(getCalendarSyncRuntimeOptions());
	}

	window.AppointmentManagementPageInteractionsUtils.initializePageInteractions({
		$,
		document,
		refreshView,
		setSearchKeyword: function (value) {
			searchKeyword = value;
		}
	});

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'catalog.changed', 'busy_schedule.changed'],
			debounceMs: 500,
			handler: function (event) {
				if (event.type === 'busy_schedule.changed') {
					refreshBusySchedulesOnce();
					return;
				}
				if (event.type === 'catalog.changed') {
					loadDoctors();
					loadServices();
					loadPackages();
				}
				afterDataChanged();
			}
		});
	}
});
