(function (window) {
	'use strict';

	function buildConnectedStatusHtml() {
		return '<span class="qlpk-status qlpk-status--success appointment-calendar-connected-badge"><i class="bi bi-check-circle-fill"></i> Google Calendar đã kết nối</span>';
	}

	function buildCheckingStatusHtml() {
		return '<span class="qlpk-status qlpk-status--info appointment-calendar-status-badge appointment-calendar-status-badge--checking"><i class="bi bi-arrow-repeat"></i> Đang kiểm tra Calendar</span>';
	}

	function buildUnknownStatusHtml() {
		return '<span class="qlpk-status qlpk-status--warning appointment-calendar-status-badge appointment-calendar-status-badge--unknown"><i class="bi bi-exclamation-triangle"></i> Chưa xác định Calendar</span>';
	}

	function applyCalendarStatusPendingUi($, html) {
		$('#calendarStatus').html(html);
		$('#connectGoogleCalendarBtn').hide();
		$('#disconnectGoogleCalendarBtn').hide();
	}

	function applyCalendarStatusUi($, isConnected) {
		if (isConnected) {
			$('#calendarStatus').html(buildConnectedStatusHtml());
			$('#connectGoogleCalendarBtn').hide();
			$('#disconnectGoogleCalendarBtn').show();
			return;
		}

		$('#calendarStatus').html('');
		$('#connectGoogleCalendarBtn').show();
		$('#disconnectGoogleCalendarBtn').hide();
	}

	function showCalendarToast(options, type, message) {
		if (typeof options.showCustomToast === 'function') {
			options.showCustomToast(type, message);
			return;
		}
		window.AppointmentManagementFeedbackUtils?.showToast({
			type,
			message,
			window: options.window
		});
	}

	function loadCalendarStatus(options) {
		if (!options.hasSession()) {
			applyCalendarStatusPendingUi(options.$, buildUnknownStatusHtml());
			return null;
		}

		applyCalendarStatusPendingUi(options.$, buildCheckingStatusHtml());

		return options.$.ajax({
			url: '/api/calendar/status',
			method: 'GET',
			success: function (data) {
				applyCalendarStatusUi(options.$, Boolean(data.connected && data.is_active));
			},
			error: function (xhr) {
				if (xhr && xhr.status === 401) return;
				applyCalendarStatusPendingUi(options.$, buildUnknownStatusHtml());
			}
		});
	}

	function connectGoogleCalendar(options) {
		if (!options.hasSession()) {
			showCalendarToast(options, 'warning', 'Vui lòng đăng nhập để kết nối Google Calendar');
			return;
		}

		options.$.ajax({
			url: '/api/calendar/connect/google/init',
			method: 'GET',
			success: function (data) {
				if (data.url) {
					const targetWindow = options.window.top || options.window;
					targetWindow.location.href = data.url;
				} else {
					showCalendarToast(options, 'error', 'Không thể lấy authorization URL');
				}
			},
			error: function (xhr) {
				if (xhr.status === 401) {
					showCalendarToast(options, 'warning', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
					options.window.location.href = '/login.html';
				} else {
					showCalendarToast(options, 'error', 'Không thể kết nối Google Calendar. Vui lòng thử lại.');
				}
			}
		});
	}

	function disconnectGoogleCalendar(options) {
		if (!options.hasSession()) return;

		options.$.ajax({
			url: '/api/calendar/disconnect',
			method: 'POST',
			success: function () {
				options.loadCalendarStatus();
				options.showCustomToast('success', 'Đã ngắt kết nối Google Calendar');
			},
			error: function () {
				options.showCustomToast('error', 'Có lỗi xảy ra khi ngắt kết nối');
			}
		});
	}

	function getCalendarConnectionQueryEvent(search) {
		const urlParams = new URLSearchParams(search || '');
		if (urlParams.get('calendar_connected') === 'google') {
			return {
				message: 'Đã kết nối Google Calendar thành công!',
				type: 'success'
			};
		}
		if (urlParams.get('calendar_error')) {
			return {
				message: 'Không thể kết nối Google Calendar. Vui lòng thử lại.',
				type: 'error'
			};
		}
		return null;
	}

	function handleCalendarConnectionQuery(options) {
		const queryEvent = getCalendarConnectionQueryEvent(options.window.location.search);
		if (!queryEvent) return;

		options.window.history.replaceState({}, options.window.document.title, options.window.location.pathname);
		options.showCustomToast(queryEvent.type, queryEvent.message);
		if (queryEvent.type === 'success') {
			options.loadCalendarStatus();
		}
	}

	function bindCalendarConnectionButtons(options) {
		options.$('#connectGoogleCalendarBtn').off('click.appointmentCalendarConnection').on('click.appointmentCalendarConnection', function () {
			connectGoogleCalendar(options);
		});

		options.$('#disconnectGoogleCalendarBtn').off('click.appointmentCalendarConnection').on('click.appointmentCalendarConnection', function () {
			disconnectGoogleCalendar(options);
		});
	}

	function initializeCalendarConnection(options) {
		bindCalendarConnectionButtons(options);

		options.$(options.window.document).ready(function () {
			handleCalendarConnectionQuery(options);
			options.loadCalendarStatus();
			options.onReady();
		});
	}

	window.AppointmentManagementCalendarConnectionUtils = {
		applyCalendarStatusUi,
		bindCalendarConnectionButtons,
		buildCheckingStatusHtml,
		buildConnectedStatusHtml,
		buildUnknownStatusHtml,
		connectGoogleCalendar,
		disconnectGoogleCalendar,
		getCalendarConnectionQueryEvent,
		handleCalendarConnectionQuery,
		initializeCalendarConnection,
		loadCalendarStatus
	};
})(window);
