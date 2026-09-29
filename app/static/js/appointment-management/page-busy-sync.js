// Lịch bận realtime và đồng bộ Google Calendar.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	function showBusySchedulePopup(event) {
		window.AppointmentManagementBusySchedulePopupUtils.showBusySchedulePopup($, event);
	}

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
		state.currentBusySchedules = busySchedules || [];
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
		page.loadDoctorBusySchedulesData(state.currentCalendarDateFrom, state.currentCalendarDateTo)
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

	// ========== Google Calendar Integration ==========

	// Load trạng thái kết nối Google Calendar
	function loadCalendarStatus() {
		return window.AppointmentManagementCalendarConnectionUtils.loadCalendarStatus({
			$,
			hasSession: () => window.QLPKApiTransport.hasSession()
		});
	}

	// =====================================================
	// CALENDAR SYNC DASHBOARD
	// =====================================================

	function initSyncCalendarModal() {
		window.AppointmentManagementCalendarSyncModalUtils.initializeSyncCalendarModal({
			$,
			abortCalendarSyncRequests: () => window.AppointmentManagementCalendarSyncRuntimeUtils.abortCalendarSyncRequests(),
			customModal: window.CustomModal,
			filterSyncTable,
			flatpickrInstance: typeof flatpickr !== 'undefined' ? flatpickr : null,
			loadSyncData,
			showCustomToast: page.showCustomToast,
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
			hasSession: () => window.QLPKApiTransport.hasSession(),
			renderSyncTable,
			showCustomToast: page.showCustomToast,
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

	Object.assign(page, {
		showBusySchedulePopup,
		isDoctorCurrentlyBusy,
		isDoctorFutureBusy,
		filterActiveBusySchedules,
		updateBusyDoctorsPanel,
		setupRealtimeBusyScheduleUpdate,
		refreshBusySchedulesOnce,
		loadCalendarStatus,
		initSyncCalendarModal,
		getCalendarSyncRuntimeOptions,
		validateCalendarConnections,
		loadSyncData,
		renderSyncTable,
		updateSyncButtonStates,
		verifyCalendarEvents,
		updateSyncBadgesAfterVerify,
		syncAppointments,
		updateSyncCounters,
		filterSyncTable
	});
})(window);
